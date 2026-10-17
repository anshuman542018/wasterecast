"""Live authorization smoke test using disposable, explicitly labelled QA records.

Creates two reserved example.com accounts, verifies only these QA accounts using
project-admin access, tests user-token access (not admin bypass), and removes all
records/accounts it creates in finally. Never prints credentials or tokens.
Run manually with --run-live; never part of CI.
"""
import datetime as dt
import json
import pathlib
import re
import secrets
import subprocess
import sys
import uuid
import requests

ROOT=pathlib.Path(__file__).resolve().parents[1]
PROJECT='parallax-waste-2026-91129'
DB=f'projects/{PROJECT}/databases/(default)/documents'
BASE=f'https://firestore.googleapis.com/v1/{DB}'
AUTH='https://identitytoolkit.googleapis.com/v1'

def main():
    if '--run-live' not in sys.argv:
        raise SystemExit('Pass --run-live to create and clean up disposable QA data.')
    key=re.search(r'"apiKey":\s*"([^"]+)"',(ROOT/'spark/firebase-config.js').read_text()).group(1)
    admin=subprocess.check_output([str(ROOT/'.tools/google-cloud-sdk/bin/gcloud.cmd'),'auth','print-access-token'],text=True).strip().splitlines()[-1]
    admin_headers={'Authorization':f'Bearer {admin}','x-goog-user-project':PROJECT}
    users=[];docs=[];passed=[]
    def check(name,response,codes=(200,)):
        if response.status_code not in codes:
            msg=response.json().get('error',{}).get('message','')[:350]
            raise RuntimeError(f'{name}: HTTP {response.status_code}: {msg}')
        passed.append(name)
    def token_headers(user):return {'Authorization':f'Bearer {user["idToken"]}'}
    def encode(value):
        if value is None:return {'nullValue':None}
        if isinstance(value,bool):return {'booleanValue':value}
        if isinstance(value,int):return {'integerValue':str(value)}
        if isinstance(value,float):return {'doubleValue':value}
        return {'stringValue':value}
    def write(path,data,user=None,create=False):
        fields={k:encode(v) for k,v in data.items() if k not in ['createdAt','updatedAt','expiresAt']}
        fields['expiresAt']={'timestampValue':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=29)).isoformat()}
        transforms=[{'fieldPath':'updatedAt','setToServerValue':'REQUEST_TIME'}]
        if create:transforms.append({'fieldPath':'createdAt','setToServerValue':'REQUEST_TIME'})
        else:fields['createdAt']=data['createdAt']
        return requests.post(BASE+':commit',json={'writes':[{'update':{'name':DB+'/'+path,'fields':fields},'updateTransforms':transforms}]},headers=token_headers(user) if user else {},timeout=30)
    try:
        for index in range(2):
            email=f'wasterecast-qa-{uuid.uuid4().hex}@example.com';password=secrets.token_urlsafe(28)
            r=requests.post(AUTH+'/accounts:signUp',params={'key':key},json={'email':email,'password':password,'returnSecureToken':True},timeout=30);check('QA account creation '+str(index+1),r)
            user=r.json();user['qaPassword']=password;user['qaEmail']=email;users.append(user)
        a,b=users
        path=f'exchangeListings/{a["localId"]}_0';docs.append(path)
        data={'ownerId':a['localId'],'slot':0,'role':'buyer','organization':'QA TEMPORARY — not a real business','title':'QA TEMPORARY — PP acceptance test','family':'plastic','country':'DE','city':'Berlin','description':'Temporary automated QA fixture. Not a real purchase request.','specifications':'PP offcuts; lab analysis required.','exclusions':'PVC','hazard':'no','tradeScope':'international','quantity':5,'price':None,'currency':'EUR','publicContact':'qa@example.com','contactConsent':True,'status':'published'}
        check('Unauthenticated write denied',write(path,data,create=True),(401,403))
        check('Unverified account publication denied',write(path,data,a,True),(403,))
        r=requests.post(f'{AUTH}/projects/{PROJECT}/accounts:update',headers=admin_headers,json={'localId':a['localId'],'emailVerified':True},timeout=30);check('Verify QA account only',r)
        r=requests.post(AUTH+'/accounts:signInWithPassword',params={'key':key},json={'email':a['qaEmail'],'password':a['qaPassword'],'returnSecureToken':True},timeout=30);check('Verified QA sign-in',r);a.update(r.json())
        check('Verified owner publication',write(path,data,a,True))
        r=requests.get(BASE+'/'+path,headers=token_headers(a),timeout=30);check('Owner read',r);data['createdAt']=r.json()['fields']['createdAt']
        check('Public published listing read',requests.get(BASE+'/'+path,timeout=30))
        check('Different account edit denied',write(path,{**data,'title':'Hijacked'},b),(403,))
        check('Forged verification field denied',write(path,{**data,'businessVerified':True},a),(403,))
        badpath=f'exchangeListings/{a["localId"]}_10';docs.append(badpath)
        check('Eleventh listing slot denied',write(badpath,{**data,'slot':10},a,True),(403,))
        check('Wrong owner denied',write(path,{**data,'ownerId':b['localId']},a),(403,))
        check('Owner pause',write(path,{**data,'status':'paused'},a))
        check('Paused listing hidden from public get',requests.get(BASE+'/'+path,timeout=30),(403,))
        check('Paused listing visible to owner',requests.get(BASE+'/'+path,headers=token_headers(a),timeout=30))
        check('Owner renew',write(path,data,a))
        member=f'exchangeMembers/{a["localId"]}';docs.append(member)
        member_write={'writes':[{'update':{'name':DB+'/'+member,'fields':{'organization':encode('QA TEMPORARY'),'country':encode('DE')}},'updateTransforms':[{'fieldPath':'updatedAt','setToServerValue':'REQUEST_TIME'}]}]}
        check('Owner private member save',requests.post(BASE+':commit',headers=token_headers(a),json=member_write,timeout=30))
        check('Private member hidden publicly',requests.get(BASE+'/'+member,timeout=30),(403,))
        check('Private member hidden from another account',requests.get(BASE+'/'+member,headers=token_headers(b),timeout=30),(403,))
        check('Private member owner read',requests.get(BASE+'/'+member,headers=token_headers(a),timeout=30))
        if '--sdk' in sys.argv:
            # Slot zero is already occupied; SDK creates slot one, then edits/pauses it.
            docs.append(f'exchangeListings/{a["localId"]}_1')
            subprocess.run(['node','scripts/check_exchange_store.mjs'],input=json.dumps({'email':a['qaEmail'],'password':a['qaPassword']}),text=True,cwd=ROOT,check=True,timeout=120)
        print(json.dumps({'passed':len(passed),'checks':passed},indent=2))
    finally:
        failures=[]
        for path in docs:
            r=requests.delete(BASE+'/'+path,headers=admin_headers,timeout=30)
            if r.status_code not in [200,404]:failures.append('document cleanup')
        for user in users:
            r=requests.post(f'{AUTH}/projects/{PROJECT}/accounts:delete',headers=admin_headers,json={'localId':user['localId']},timeout=30)
            if not r.ok:failures.append('QA account cleanup')
        if failures:raise RuntimeError(', '.join(failures))
        print('All temporary QA records and accounts removed.')

if __name__=='__main__':main()
