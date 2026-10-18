import {GoogleGenAI} from '@google/genai';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {verifyAttestation} from './live-token.js';
const PROJECT='parallax-waste-2026-91129';
export const EMBEDDING_MODEL='gemini-embedding-001';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyUser(token){
  const {payload}=await jwtVerify(token,keys,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${PROJECT}`,audience:PROJECT});
  if(typeof payload.sub!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub) || payload.email_verified!==true)throw new Error('Verified sign-in required');
  return payload.sub;
}
export async function reserveEmbeddingBudget({uid,token,count,fetchImpl=fetch}){
  const root=`projects/${PROJECT}/databases/(default)/documents`,name=`${root}/exchangeMembers/${uid}/embeddingBudget/daily`;
  const headers={'Authorization':`Bearer ${token}`,'Content-Type':'application/json'};
  const response=await fetchImpl(`https://firestore.googleapis.com/v1/${name}`,{headers});
  if(!response.ok && response.status!==404)throw Object.assign(new Error('Budget unavailable'),{status:503});
  const current=response.ok?await response.json():null;
  const start=Date.parse(current?.fields?.windowStart?.timestampValue || ''),reset=!current || Date.now()-start>=86400000;
  const next=(reset?0:Number(current.fields.count.integerValue))+count;
  if(next>240)throw Object.assign(new Error('Daily free embedding allowance reached'),{status:429});
  const update={name,fields:{count:{integerValue:String(next)}}};
  if(!reset)update.fields.windowStart=current.fields.windowStart;
  const write={update,currentDocument:current?{updateTime:current.updateTime}:{exists:false},...(reset?{updateTransforms:[{fieldPath:'windowStart',setToServerValue:'REQUEST_TIME'}]}:{})};
  const reserved=await fetchImpl(`https://firestore.googleapis.com/v1/${root}:commit`,{method:'POST',headers,body:JSON.stringify({writes:[write]})});
  if(!reserved.ok)throw Object.assign(new Error('Budget reservation failed'),{status:reserved.status===409?429:503});
}
export function embeddingsHandler({apiKey,local=false,attest=verifyAttestation,authenticate=verifyUser,reserve=reserveEmbeddingBudget,clientFactory=key=>new GoogleGenAI({apiKey:key,httpOptions:{timeout:25000}})}={}){
  return async(req,res)=>{
    const origin=req.headers.origin,allowed=local?['http://127.0.0.1:4173','http://localhost:4173']:['https://wasterecast.web.app','https://wasterecast.firebaseapp.com'];
    res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');res.setHeader('X-Content-Type-Options','nosniff');
    const reply=(code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
    if(!allowed.includes(origin))return reply(403,{error:'Use WasteRecast to search.'});
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Firebase-AppCheck, X-WasteRecast-Local');
    if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
    if(req.method!=='POST')return reply(405,{error:'Use POST.'});
    if(!apiKey)return reply(503,{error:'Embedding service is not configured.'});
    if(!String(req.headers['content-type']).startsWith('application/json'))return reply(415,{error:'JSON required.'});
    if(Number(req.headers['content-length'])>120000)return reply(413,{error:'Embedding input is too large.'});
    try{
      let token='',uid='';
      if(local){if(req.headers['x-wasterecast-local']!=='1'||!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host))return reply(403,{error:'Local access only.'});}
      else{
        try{await attest(req.headers['x-firebase-appcheck'] || '');}catch{return reply(401,{error:'App verification failed. Refresh the site.'});}
        token=String(req.headers.authorization || '').replace(/^Bearer /,'');
        try{uid=await authenticate(token);}catch{return reply(401,{error:'Sign in with a verified email to enable vector retrieval. Alias and process search remain available.'});}
      }
      let body=req.body;
      if(!body || typeof body!=='object'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>120000)return reply(413,{error:'Input too large.'});}try{body=JSON.parse(raw);}catch{return reply(400,{error:'Invalid JSON.'});}}
      if(Buffer.byteLength(JSON.stringify(body))>120000||!body||Object.keys(body).some(k=>k!=='texts')||!Array.isArray(body.texts)||body.texts.length<1||body.texts.length>33||!body.texts.every(x=>x&&Object.keys(x).every(k=>['id','text'].includes(k))&&typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x.id)&&typeof x.text==='string'&&x.text.trim().length>0&&x.text.length<=800)||new Set(body.texts.map(x=>x.id)).size!==body.texts.length)return reply(400,{error:'Use 1–33 short, uniquely identified material texts.'});
      if(!local)await reserve({uid,token,count:body.texts.length});
      const output=await clientFactory(apiKey).models.embedContent({model:EMBEDDING_MODEL,contents:body.texts.map(x=>x.text),config:{taskType:'SEMANTIC_SIMILARITY',outputDimensionality:768}});
      if(output.embeddings?.length!==body.texts.length||output.embeddings.some(x=>!Array.isArray(x.values)||x.values.length!==768||x.values.some(v=>!Number.isFinite(v))))throw new Error('Malformed embeddings');
      return reply(200,{model:EMBEDDING_MODEL,dimensions:768,vectors:body.texts.map((x,i)=>({id:x.id,values:output.embeddings[i].values}))});
    }catch(error){const status=Number(error.status || error.code);return reply(status===429?429:502,{error:status===429?'The free embedding allowance is reached. Alias/process retrieval remains available.':'Embedding retrieval is temporarily unavailable. Alias/process retrieval remains available.'});}
  };
}
