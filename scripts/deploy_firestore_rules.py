"""Deploy a read-only public catalog rule set using the Firebase Rules API."""
import subprocess
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'parallax-waste-2026-91129'
GCLOUD = ROOT / '.tools' / 'google-cloud-sdk' / 'bin' / 'gcloud.cmd'
BASE = f'https://firebaserules.googleapis.com/v1/projects/{PROJECT}'

def main():
    token=subprocess.check_output([str(GCLOUD),'auth','print-access-token'],text=True).strip().splitlines()[-1]
    headers={'Authorization':f'Bearer {token}','Content-Type':'application/json','x-goog-user-project':PROJECT}
    source={'source':{'files':[{'name':'firestore.rules','content':(ROOT/'firestore.rules').read_text(encoding='utf8')}]}}
    response=requests.post(f'{BASE}/rulesets',headers=headers,json=source,timeout=30)
    response.raise_for_status()
    ruleset=response.json()['name']
    release_name=f'projects/{PROJECT}/releases/cloud.firestore'
    check=requests.get(f'https://firebaserules.googleapis.com/v1/{release_name}',headers=headers,timeout=30)
    if check.status_code == 404:
        response=requests.post(f'{BASE}/releases',headers=headers,json={'name':release_name,'rulesetName':ruleset},timeout=30)
    else:
        check.raise_for_status()
        response=requests.patch(f'https://firebaserules.googleapis.com/v1/{release_name}',headers=headers,json={'release':{'name':release_name,'rulesetName':ruleset},'updateMask':'rulesetName'},timeout=30)
    response.raise_for_status()
    print('Deployed read-only public catalog rules:',response.json()['rulesetName'])

if __name__=='__main__': main()
