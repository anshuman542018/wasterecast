"""Seed the public, source-attributed catalog into the Firebase Spark database."""
import json
import subprocess
from pathlib import Path
from urllib.parse import quote
import requests

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'parallax-waste-2026-91129'
GCLOUD = ROOT / '.tools' / 'google-cloud-sdk' / 'bin' / 'gcloud.cmd'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'

def field(value):
    if value is None: return {'nullValue': None}
    if isinstance(value, bool): return {'booleanValue': value}
    if isinstance(value, int): return {'integerValue': str(value)}
    if isinstance(value, float): return {'doubleValue': value}
    if isinstance(value, str): return {'stringValue': value}
    if isinstance(value, list): return {'arrayValue': {'values': [field(v) for v in value]}}
    if isinstance(value, dict): return {'mapValue': {'fields': {k: field(v) for k,v in value.items()}}}
    raise TypeError(type(value))

def main():
    token = subprocess.check_output([str(GCLOUD),'auth','print-access-token'],text=True).strip().splitlines()[-1]
    data = json.loads((ROOT/'spark'/'public'/'catalog.json').read_text(encoding='utf-8'))
    headers = {'Authorization': f'Bearer {token}','Content-Type':'application/json'}
    chunks = [data['facilities'][i:i+40] for i in range(0,len(data['facilities']),40)]
    for index, facilities in enumerate(chunks):
        document = {'fields': {'facilities': field(facilities)}}
        uri = f'{BASE}/publicCatalog/india-v1/chunks/{index:03d}'
        response = requests.patch(uri,headers=headers,json=document,timeout=30)
        response.raise_for_status()
        print(f'Wrote chunk {index+1}/{len(chunks)} ({len(facilities)} records)')
    manifest = {'fields': {k:field(v) for k,v in {'count':len(data['facilities']),'sources':data['sources'],'created_at':data['created_at']}.items()}}
    response=requests.patch(f'{BASE}/publicCatalog/india-v1',headers=headers,json=manifest,timeout=30)
    response.raise_for_status()
    print(f'Seeded {len(data["facilities"])} public records in {len(chunks)} Firestore documents.')

if __name__ == '__main__': main()
