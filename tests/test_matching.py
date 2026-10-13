from pathlib import Path

from fastapi.testclient import TestClient

from backend.catalog import load_catalog
from backend.main import app
from backend.matching import calculate_economics, match
from backend.models import EconomicsInput, MatchRequest, MaterialFamily, MaterialProfile


ROOT = Path(__file__).resolve().parents[1]


def test_real_catalog_has_provenance_and_multiple_families():
    facilities, sources = load_catalog(ROOT / "data/catalog.json")
    assert len(facilities) > 100
    assert {family for facility in facilities for family in facility.families} >= {
        MaterialFamily.spent_solvent, MaterialFamily.used_oil, MaterialFamily.plastic, MaterialFamily.metal
    }
    assert all(f.source_url.startswith("https://") and f.source_page > 0 for f in facilities)
    assert all(f.verification_status != "listed_not_verified" for f in facilities)
    assert len(sources) >= 2


def test_economics_requires_real_values_and_calculates_in_code():
    empty = calculate_economics(12, EconomicsInput())
    assert empty.annual_net_inr is None
    assert "buyer_quote_inr_per_tonne" in empty.missing_inputs
    quoted = calculate_economics(12, EconomicsInput(
        quote_facility_id="facility-1",
        disposal_cost_inr_per_tonne=450,
        buyer_quote_inr_per_tonne=300,
        transport_quote_inr_per_tonne=480,
    ))
    assert quoted.annual_net_inr == 38880  # 12 t/month, no invented costs


def test_match_never_claims_authorization_or_technical_acceptance():
    facilities, sources = load_catalog(ROOT / "data/catalog.json")
    request = MatchRequest(profile=MaterialProfile(
        description="Spent mixed solvent containing toluene and IPA",
        family=MaterialFamily.spent_solvent,
        origin_state="Maharashtra",
        quantity_tonnes_per_month=12,
        source_mode="manual",
    ), max_results=5)
    response = match(request, facilities, sources)
    assert len(response.candidates) == 5
    assert all(candidate.status == "candidate_requires_verification" for candidate in response.candidates)
    assert all(candidate.economics.annual_net_inr is None for candidate in response.candidates)
    assert all(candidate.facility.source_page > 0 for candidate in response.candidates)


def test_source_flash_point_condition_rejects_low_flash_point_stream():
    facilities, sources = load_catalog(ROOT / "data/catalog.json")
    restricted = [item for item in facilities if item.process and "above 93°C" in item.process]
    assert restricted, "Expected a visually checked 93°C restriction in the public PDF"
    request = MatchRequest(profile=MaterialProfile(
        description="Documented solvent with measured flash point 20°C",
        family=MaterialFamily.spent_solvent,
        flash_point_c=20,
        source_mode="manual",
    ))
    response = match(request, restricted, sources)
    assert response.candidates
    assert all(item.status == "rejected" for item in response.candidates)
    assert all("93°C" in item.reasons[0] for item in response.candidates)


def test_named_polymer_mismatch_is_rejected_without_guessing_generic_plastic():
    facilities, sources = load_catalog(ROOT / "data/catalog.json")
    pet_facilities = [item for item in facilities if item.process and "PET" in item.process and MaterialFamily.plastic in item.families]
    assert pet_facilities
    request = MatchRequest(profile=MaterialProfile(
        description="HDPE manufacturing offcuts",
        family=MaterialFamily.plastic,
        source_mode="manual",
    ))
    response = match(request, pet_facilities, sources)
    assert response.candidates
    assert all(item.status == "rejected" for item in response.candidates)


def test_public_api_serves_catalog_and_blocks_unauthorized_refresh():
    client = TestClient(app)
    assert client.get("/api/health").status_code == 200
    response = client.get("/api/catalog?family=spent_solvent&limit=2")
    assert response.status_code == 200
    assert response.json()["total"] > 2
    assert client.post("/api/catalog/refresh").status_code == 403
    assert client.get("/").status_code == 200


def test_dossier_uses_catalog_facility_and_recalculates_candidate():
    client = TestClient(app)
    facilities, _ = load_catalog(ROOT / "data/catalog.json")
    facility = next(item for item in facilities if MaterialFamily.spent_solvent in item.families)
    profile = MaterialProfile(description="Spent solvent scenario", family=MaterialFamily.spent_solvent, source_mode="manual")
    response = client.post("/api/dossier", json={"profile": profile.model_dump(mode="json"), "facility_id": facility.id})
    assert response.status_code == 200
    assert facility.name in response.text
    assert "pending real disposal cost" in response.text
    assert client.post("/api/dossier", json={"profile": profile.model_dump(mode="json"), "facility_id": "fabricated"}).status_code == 404
