"""Test Firebase AI Logic using a temporary App Check development credential.

The secret stays in memory and is revoked in finally. Production attestation and
its enforcement are unchanged. Requires the project's existing gcloud login.
"""
import json
import re
import subprocess
import uuid
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "parallax-waste-2026-91129"
APP = "projects/525628234892/apps/1:525628234892:web:974fd37d6954276ab26fa9"
BASE = "https://firebaseappcheck.googleapis.com/v1"


def main():
    config = (ROOT / "spark/firebase-config.js").read_text()
    api_key = re.search(r'"apiKey": "([^"]+)"', config).group(1)
    token = subprocess.check_output(
        [str(ROOT / ".tools/google-cloud-sdk/bin/gcloud.cmd"), "auth", "print-access-token"], text=True
    ).strip().splitlines()[-1]
    admin_headers = {"Authorization": f"Bearer {token}", "x-goog-user-project": PROJECT}
    secret = str(uuid.uuid4())
    credential = None
    try:
        created = requests.post(f"{BASE}/{APP}/debugTokens", headers=admin_headers,
                                json={"displayName": "Temporary WasteRecast Gemini diagnosis", "token": secret}, timeout=30)
        if not created.ok:
            raise RuntimeError(f"Debug credential setup {created.status_code}: {created.text[:1000]}")
        credential = created.json()["name"]
        exchanged = requests.post(f"{BASE}/{APP}:exchangeDebugToken", headers={"x-goog-api-key": api_key},
                                  json={"debugToken": secret}, timeout=30)
        if not exchanged.ok:
            raise RuntimeError(f"App Check exchange {exchanged.status_code}: {exchanged.text[:1000]}")
        headers = {"x-goog-api-key": api_key, "X-Firebase-AppCheck": exchanged.json()["token"],
                   "X-Firebase-Appid": APP.split('/apps/')[1],
                   "Origin": "https://wasterecast.web.app", "Referer": "https://wasterecast.web.app/"}
        body = {"contents": [{"role": "user", "parts": [{"text": "Respond with OK."}]}]}
        if '--profile' in sys.argv:
            schema = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
                "import {profileSchema} from './spark/gemini-schema.js'; console.log(JSON.stringify(profileSchema));"],cwd=ROOT,text=True))
            body['contents'][0]['parts'][0]['text'] = 'Extract a waste profile using only this labeled scenario: clean polypropylene injection molding offcuts, 5 tonnes per month, no coating reported. List unknown facts; do not invent composition or buyer acceptance.'
            body['generationConfig'] = {'responseMimeType':'application/json','responseSchema':schema}
        response = requests.post(
            f"https://firebasevertexai.googleapis.com/v1beta/projects/{PROJECT}/models/gemini-3.5-flash:generateContent",
            headers=headers, json=body, timeout=60)
        data = response.json()
        text = "".join(part.get("text", "") for candidate in data.get("candidates", [])
                       for part in candidate.get("content", {}).get("parts", []) if not part.get("thought"))
        print(json.dumps({"status": response.status_code, "cors_origin":response.headers.get('Access-Control-Allow-Origin'), "text": text, "model": data.get("modelVersion"),
                          "error": data.get("error")}, ensure_ascii=True)[:2200])
    finally:
        if credential:
            revoked = requests.delete(f"{BASE}/{credential}", headers=admin_headers, timeout=30)
            if not revoked.ok:
                raise RuntimeError(f"Temporary credential cleanup failed: {revoked.status_code}; revoke {credential}")
            print("Temporary development credential revoked.")


if __name__ == "__main__":
    main()
