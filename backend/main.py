from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .ai import Document, explain_candidate, profile_material
from .bq import candidate_ids, configured as bigquery_configured, sync_facilities
from .catalog import build_catalog, load_catalog, save_catalog
from .chemistry import lookup
from .matching import match
from .models import EconomicsInput, Facility, MatchRequest, MatchResponse, MaterialFamily, MaterialProfile
from .persistence import persist_analysis, store_upload


app = FastAPI(title="WasteRecast Waste-to-Value", version="0.1.0")
root = Path(__file__).resolve().parent.parent
catalog_path = root / os.getenv("CATALOG_PATH", "data/catalog.json")
facilities: list[Facility] = []
sources: list[dict] = []
if catalog_path.exists():
    facilities, sources = load_catalog(catalog_path)

app.mount("/assets", StaticFiles(directory=root / "frontend"), name="assets")


@app.get("/", response_class=HTMLResponse)
def index() -> FileResponse:
    return FileResponse(root / "frontend" / "index.html")


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok", "catalog_facilities": len(facilities),
        "gemini_configured": bool(os.getenv("GCP_PROJECT_ID")),
        "bigquery_configured": bigquery_configured(),
        "firestore_configured": bool(os.getenv("GCP_PROJECT_ID")),
    }


@app.get("/api/catalog")
def get_catalog(family: MaterialFamily | None = None, state: str | None = None, limit: int = 100) -> dict:
    filtered = [item for item in facilities if (family is None or family in item.families) and (not state or item.state.lower() == state.lower())]
    return {"facilities": filtered[: min(max(limit, 1), 500)], "total": len(filtered), "sources": sources}


@app.get("/api/chemicals")
def chemicals(name: str) -> dict:
    if len(name) > 80:
        raise HTTPException(status_code=422, detail="Chemical name is too long")
    try:
        result = lookup(name)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="PubChem is temporarily unavailable") from exc
    return {"result": result}


@app.post("/api/catalog/refresh")
def refresh_catalog(x_catalog_refresh_token: str | None = Header(default=None)) -> dict:
    global facilities, sources
    token = os.getenv("CATALOG_REFRESH_TOKEN")
    if not token or x_catalog_refresh_token != token:
        raise HTTPException(status_code=403, detail="Catalog refresh is disabled or unauthorized")
    import json
    previous = json.loads(catalog_path.read_text(encoding="utf-8")) if catalog_path.exists() else None
    payload = build_catalog(previous)
    save_catalog(payload, catalog_path)
    facilities, sources = load_catalog(catalog_path)
    synced = sync_facilities(facilities) if bigquery_configured() else None
    return {"facilities": len(facilities), "sources": sources, "bigquery": synced}


@app.post("/api/profile", response_model=MaterialProfile)
async def create_profile(
    description: str = Form(default=""),
    origin_city: str = Form(default=""),
    origin_state: str = Form(default=""),
    quantity_tonnes_per_month: float | None = Form(default=None),
    flash_point_c: float | None = Form(default=None),
    retain_document: bool = Form(default=False),
    document: UploadFile | None = File(default=None),
) -> MaterialProfile:
    run_id = uuid.uuid4().hex
    doc = None
    if document is not None:
        content = await document.read(15_000_001)
        if len(content) > 15_000_000:
            raise HTTPException(status_code=413, detail="Document exceeds 15 MB")
        doc = Document(name=document.filename or "upload", mime_type=document.content_type or "application/octet-stream", data=content)
    try:
        profile = profile_material(description, origin_city or None, origin_state or None, quantity_tonnes_per_month, flash_point_c, doc)
        if doc and retain_document:
            store_upload(run_id, doc.name, doc.data, doc.mime_type)
        persist_analysis(run_id, {"profile": profile.model_dump(mode="json"), "kind": "profile"})
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/matches", response_model=MatchResponse)
def create_matches(request: MatchRequest) -> MatchResponse:
    selected = facilities
    if bigquery_configured():
        try:
            ids = set(candidate_ids(request.profile.family, request.profile.origin_state, limit=500))
            selected = [facility for facility in facilities if facility.id in ids]
        except Exception as exc:
            raise HTTPException(status_code=503, detail="BigQuery catalog is unavailable or has not been synced") from exc
    response = match(request, selected, sources)
    persist_analysis(uuid.uuid4().hex, {"kind": "match", "response": response.model_dump(mode="json")})
    return response


class CandidateRequest(BaseModel):
    profile: MaterialProfile
    facility_id: str
    economics: EconomicsInput = Field(default_factory=EconomicsInput)


def screened_candidate(request: CandidateRequest):
    facility = next((item for item in facilities if item.id == request.facility_id), None)
    if facility is None:
        raise HTTPException(status_code=404, detail="Facility is not in the public catalog")
    response = match(MatchRequest(profile=request.profile, economics=request.economics, max_results=1), [facility], sources)
    if not response.candidates:
        raise HTTPException(status_code=422, detail="Facility does not match the material family")
    return response.candidates[0]


@app.post("/api/explain")
def explain(request: CandidateRequest) -> dict:
    candidate = screened_candidate(request)
    try:
        return {"text": explain_candidate(request.profile, candidate.facility.name, candidate.facility.process), "source": "gemini"}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/dossier", response_class=HTMLResponse)
def dossier(request: CandidateRequest) -> str:
    from html import escape

    candidate = screened_candidate(request)
    facility = candidate.facility
    profile = request.profile
    questions = "".join(f"<li>{escape(question)}</li>" for question in candidate.questions_for_buyer)
    economics = (
        f"₹{candidate.economics.annual_net_inr:,.0f} annual scenario value"
        if candidate.economics.annual_net_inr is not None else
        "Annual value pending real disposal cost and written buyer/transport quotes"
    )
    return f"""<!doctype html><html lang="en"><meta charset="utf-8"><title>Screening dossier — {escape(facility.name)}</title>
    <style>body{{font:16px/1.55 Arial,sans-serif;max-width:760px;margin:55px auto;color:#152026}}h1{{font-size:36px;line-height:1.1}}small{{color:#52616b}}section{{border-top:1px solid #ccd4d6;margin-top:24px;padding-top:12px}}a{{color:#087867}}@media print{{body{{margin:20mm}}}}</style>
    <small>WASTERECAST / PRELIMINARY MATERIAL SCREENING</small><h1>{escape(profile.family.value.replace('_',' ').title())} → {escape(facility.name)}</h1>
    <p><strong>{escape(facility.city_or_district)}, {escape(facility.state)}</strong> · {escape(facility.process or 'Directory-listed process')}</p>
    <section><h2>Material</h2><p>{escape(profile.description)}</p><p>Quantity: {profile.quantity_tonnes_per_month or 'Unknown'} tonnes/month · Origin: {escape(profile.origin_city or 'Unknown')}, {escape(profile.origin_state or 'Unknown')}</p></section>
    <section><h2>Commercial screening</h2><p>{economics}</p><p>{escape(candidate.economics.formula)}</p></section>
    <section><h2>Verification before any movement</h2><ol>{questions}</ol><p>This listing does not certify current authorization, accepted chemistry, capacity or price. An environmental professional must review the applicable requirements.</p></section>
    <section><h2>Source</h2><p><a href="{escape(facility.source_url)}">{escape(facility.source_title)}</a>, PDF page {facility.source_page}. Directory record last published {escape(facility.source_as_of or 'date not stated')}.</p></section></html>"""
