"""Public PubChem identity lookup; never used as proof of waste composition."""
from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote

import httpx


@lru_cache(maxsize=256)
def lookup(name: str) -> dict | None:
    clean = name.strip()
    if not clean or len(clean) > 80:
        return None
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{quote(clean, safe='')}/property/MolecularFormula,MolecularWeight,IUPACName/JSON"
    response = httpx.get(url, timeout=12, follow_redirects=False, headers={"User-Agent": "WasteRecast/0.1"})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    properties = response.json().get("PropertyTable", {}).get("Properties", [])
    if not properties:
        return None
    item = properties[0]
    cid = int(item["CID"])
    return {
        "query": clean,
        "cid": cid,
        "iupac_name": item.get("IUPACName"),
        "molecular_formula": item.get("MolecularFormula"),
        "molecular_weight": item.get("MolecularWeight"),
        "source_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
        "notice": "Identity lookup only. It does not establish this waste stream's composition, concentration, hazard classification, or buyer acceptance.",
    }
