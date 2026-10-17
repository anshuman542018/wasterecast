"""Create only the four bounded, paginated exchange query indexes (no billing changes)."""
import itertools
import json
import subprocess
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'parallax-waste-2026-91129'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/collectionGroups/exchangeListings/indexes'

def main():
    token = subprocess.check_output([str(ROOT / '.tools/google-cloud-sdk/bin/gcloud.cmd'),'auth','print-access-token'],text=True).strip().splitlines()[-1]
    headers = {'Authorization':f'Bearer {token}','x-goog-user-project':PROJECT}
    existing = requests.get(BASE,headers=headers,timeout=30)
    existing.raise_for_status()
    indexes = existing.json().get('indexes',[])
    def signature(fields):
        return [(field['fieldPath'],field.get('order')) for field in fields if field['fieldPath']!='__name__']
    for country,family in itertools.product([False,True],repeat=2):
        fields = [{'fieldPath':key,'order':'ASCENDING'} for key in ['status','role'] + (['country'] if country else []) + (['family'] if family else [])]
        fields.append({'fieldPath':'expiresAt','order':'DESCENDING'})
        found = next((item for item in indexes if signature(item['fields'])==signature(fields)),None)
        if found:
            print(json.dumps({'fields':signature(fields),'state':found['state']}))
            continue
        response = requests.post(BASE,headers=headers,json={'queryScope':'COLLECTION','fields':fields},timeout=30)
        response.raise_for_status()
        print(json.dumps({'fields':signature(fields),'operation':response.json().get('name')}))

if __name__ == '__main__':
    main()
