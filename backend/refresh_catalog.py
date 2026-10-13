"""Refresh sources while retaining the last good snapshot on failure."""
import json
from pathlib import Path

from .catalog import build_catalog, save_catalog


if __name__ == "__main__":
    path = Path("data/catalog.json")
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    payload = build_catalog(previous)
    save_catalog(payload, path)
    print(f"Wrote {len(payload['facilities'])} source-attributed facility records")
