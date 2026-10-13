"""Extract public *directory listings* with source-page provenance.

The lists do not prove a facility's current authorization, available capacity,
accepted chemistry, or price. Those facts remain unverified in the product.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pdfplumber

from .models import Facility, MaterialFamily


MPCB_URL = "https://www.mpcb.gov.in/sites/default/files/whats_new/2025-11/MPCB%20Circular%20Economy%20Directory%202025%20R3_compressed.pdf"
TNPCB_URL = "https://tnpcb.gov.in/PDF/Waste_Mngt/HazardousWaste/SolventRecoveryIndustries.pdf"
WBPCB_URL = "https://www.wbpcb.gov.in/files/Fr-02-2025-02-39-23haz_inventory_2023_24.pdf"

# Zero-based PDF page indexes. Checked against the directory table of contents.
MPCB_SECTIONS = [
    (MaterialFamily.used_oil, range(24, 32)),
    (MaterialFamily.plastic, range(58, 96)),
    (MaterialFamily.metal, range(96, 113)),
    (MaterialFamily.spent_solvent, range(113, 123)),
]


def _clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _number(value: str) -> float | None:
    match = re.search(r"\d[\d,]*(?:\.\d+)?", value)
    return float(match.group().replace(",", "")) if match else None


def _family_from_process(default: MaterialFamily, process: str) -> list[MaterialFamily]:
    low = process.lower()
    if default is MaterialFamily.used_oil:
        values = []
        if "used oil" in low:
            values.append(MaterialFamily.used_oil)
        if "waste oil" in low:
            values.append(MaterialFamily.waste_oil)
        return values or [MaterialFamily.used_oil]
    return [default]


def _download(url: str) -> bytes:
    response = httpx.get(url, timeout=90, follow_redirects=True, headers={"User-Agent": "WasteRecast/0.1 (+source-attributed research)"})
    response.raise_for_status()
    if not response.content.startswith(b"%PDF"):
        raise ValueError(f"Source did not return a PDF: {url}")
    return response.content


def extract_mpcb(pdf_bytes: bytes) -> list[Facility]:
    facilities: list[Facility] = []
    pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    for family, pages in MPCB_SECTIONS:
        district = ""
        for page_index in pages:
            if page_index >= len(pdf.pages):
                continue
            for table in pdf.pages[page_index].extract_tables():
                for row in table:
                    if len(row) < 7:
                        continue
                    first = _clean(row[0])
                    name = _clean(row[1])
                    address = _clean(row[2])
                    if not first.isdigit():
                        if first and not name and len(first) < 80 and first.lower() not in {"sr.", "no.", "sr. no."}:
                            district = first
                        continue
                    # The directory renders 93° as a superscript zero in PDF text extraction.
                    # Visually verified on PDF page 117.
                    process = _clean(row[4]).replace("930 Celsius", "93°C")
                    capacity_raw = _clean(row[5])
                    unit = _clean(row[6])
                    if not name or not address:
                        continue
                    # A process entry is required; this also excludes section titles.
                    if not process:
                        continue
                    key = hashlib.sha256(f"MPCB|{family}|{name}|{address}".lower().encode()).hexdigest()[:16]
                    facilities.append(Facility(
                        id=f"mpcb-{key}", name=name, state="Maharashtra",
                        city_or_district=district or _clean(row[3]), address=address,
                        families=_family_from_process(family, process), process=process,
                        capacity_value=_number(capacity_raw), capacity_unit=unit or None,
                        source_url=MPCB_URL,
                        source_title="MPCB Circular Economy Directory 2025",
                        source_page=page_index + 1, source_as_of="2025-11",
                        verification_status="current_document_required",
                    ))
    return facilities


def extract_tnpcb(pdf_bytes: bytes) -> list[Facility]:
    facilities: list[Facility] = []
    pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    for page_index, page in enumerate(pdf.pages):
        for table in page.extract_tables():
            for row in table:
                if len(row) < 4 or not _clean(row[0]).isdigit():
                    continue
                district, full_address, capacity = _clean(row[1]), _clean(row[2]), _clean(row[3])
                name = full_address.split(",", 1)[0].strip()
                if not name:
                    continue
                key = hashlib.sha256(f"TNPCB|{name}|{full_address}".lower().encode()).hexdigest()[:16]
                facilities.append(Facility(
                    id=f"tnpcb-{key}", name=name, state="Tamil Nadu",
                    city_or_district=district, address=full_address,
                    families=[MaterialFamily.spent_solvent], process="Spent solvent recovery",
                    capacity_value=_number(capacity),
                    capacity_unit="KL/annum" if "KL/" in capacity.upper() else "tonnes/annum" if "T/" in capacity.upper() else None,
                    source_url=TNPCB_URL,
                    source_title="TNPCB List of Registered Spent Solvent Recovery Industries",
                    source_page=page_index + 1,
                    verification_status="current_document_required",
                ))
    return facilities


def extract_wbpcb(pdf_bytes: bytes) -> list[Facility]:
    """Read the 2023–24 facility rows in the board's inventory, pages 15–22."""
    facilities: list[Facility] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_index in range(14, min(22, len(pdf.pages))):
            current: tuple[str, str, str] | None = None
            for table in pdf.pages[page_index].extract_tables():
                for row in table:
                    if len(row) < 6:
                        continue
                    serial, name, address, district, process, capacity = (_clean(cell) for cell in row[:6])
                    if serial.isdigit() and name and address and district:
                        current = (name, address, district)
                    if current is None or not process:
                        continue
                    low = process.lower()
                    family = (
                        MaterialFamily.spent_solvent if "spent solvent" in low else
                        MaterialFamily.waste_oil if "waste oil" in low else
                        MaterialFamily.used_oil if "used oil" in low or "used transformer oil" in low else
                        MaterialFamily.metal if re.search(r"\b(lead|copper|zinc|aluminium|brass|metal)\b", low)
                        and re.search(r"scrap|dross|ash|skimming|alloy|wire|battery plate", low) else
                        None
                    )
                    if family is None:
                        continue
                    name, address, district = current
                    key = hashlib.sha256(f"WBPCB|{name}|{address}|{process}".lower().encode()).hexdigest()[:16]
                    facilities.append(Facility(
                        id=f"wbpcb-{key}", name=name, state="West Bengal",
                        city_or_district=district, address=address,
                        families=[family], process=process,
                        capacity_value=_number(capacity), capacity_unit="MTA" if _number(capacity) is not None else None,
                        source_url=WBPCB_URL, source_title="WBPCB Hazardous Waste Inventory 2023–24",
                        source_page=page_index + 1, source_as_of="2023-24",
                        verification_status="current_document_required",
                    ))
    return facilities


def build_catalog(previous: dict | None = None) -> dict:
    sources = []
    facilities: list[Facility] = []
    for title, url, extractor in [
        ("MPCB Circular Economy Directory 2025", MPCB_URL, extract_mpcb),
        ("TNPCB Spent Solvent Recovery Industries", TNPCB_URL, extract_tnpcb),
        ("WBPCB Hazardous Waste Inventory 2023–24", WBPCB_URL, extract_wbpcb),
    ]:
        try:
            content = _download(url)
            rows = extractor(content)
        except (httpx.HTTPError, ValueError) as exc:
            old_source = next((item for item in (previous or {}).get("sources", []) if item["url"] == url), None)
            old_rows = [Facility.model_validate(item) for item in (previous or {}).get("facilities", []) if item["source_url"] == url]
            if not old_source or not old_rows:
                raise
            facilities.extend(old_rows)
            sources.append({**old_source, "refresh_error": type(exc).__name__})
            continue
        facilities.extend(rows)
        sources.append({
            "title": title, "url": url, "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "sha256": hashlib.sha256(content).hexdigest(), "facility_count": len(rows),
            "notice": "Public directory listing; current authorization and commercial terms require independent confirmation.",
        })
    by_id = {facility.id: facility for facility in facilities}
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "facilities": [facility.model_dump(mode="json") for facility in by_id.values()],
    }


def save_catalog(payload: dict, path: str | Path) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def load_catalog(path: str | Path) -> tuple[list[Facility], list[dict]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return [Facility.model_validate(item) for item in payload["facilities"]], payload["sources"]
