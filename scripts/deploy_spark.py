"""Deploy the built static app to Firebase Hosting with the official REST API.

Uses the active gcloud login. It never creates or links a billing account.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import quote

import requests


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
PROJECT = "parallax-waste-2026-91129"
SITE = os.environ.get("FIREBASE_HOSTING_SITE", "wasterecast")
GCLOUD = ROOT / ".tools" / "google-cloud-sdk" / "bin" / "gcloud.cmd"
BASE = f"https://firebasehosting.googleapis.com/v1beta1/sites/{SITE}"


def call(method: str, url: str, token: str, **kwargs):
    headers = {"Authorization": f"Bearer {token}", "x-goog-user-project": PROJECT}
    headers.update(kwargs.pop("headers", {}))
    response = requests.request(method, url, headers=headers, timeout=90, **kwargs)
    if not response.ok:
        raise RuntimeError(f"Hosting API {response.status_code}: {response.text[:1000]}")
    return response.json() if response.content else {}


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("Run `npm run build` first.")
    token = subprocess.check_output([str(GCLOUD), "auth", "print-access-token"], text=True).strip().splitlines()[-1]
    files = {}
    blobs = {}
    for path in DIST.rglob("*"):
        if not path.is_file():
            continue
        compressed = gzip.compress(path.read_bytes(), mtime=0)
        digest = hashlib.sha256(compressed).hexdigest()
        files["/" + path.relative_to(DIST).as_posix()] = digest
        blobs[digest] = compressed

    version = call("POST", f"{BASE}/versions", token, json={"config": {"headers": [
        {"glob": "**", "headers": {"Cache-Control": "no-cache"}},
    ]}})
    name = version["name"]
    populated = call("POST", f"https://firebasehosting.googleapis.com/v1beta1/{name}:populateFiles", token, json={"files": files})
    for digest in populated.get("uploadRequiredHashes", []):
        call("POST", populated["uploadUrl"] + "/" + digest, token, data=blobs[digest], headers={"Content-Type": "application/octet-stream"})
    finalized = call("PATCH", f"https://firebasehosting.googleapis.com/v1beta1/{name}?update_mask=status", token, json={"status": "FINALIZED"})
    if finalized.get("status") != "FINALIZED":
        raise RuntimeError("Hosting version did not finalize")
    release = call("POST", f"{BASE}/releases?versionName={quote(name, safe='/')}", token)
    print(json.dumps({"url": f"https://{SITE}.web.app", "files": len(files), "release": release["name"]}))


if __name__ == "__main__":
    main()
