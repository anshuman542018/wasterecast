import {GoogleGenAI} from '@google/genai';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {liveConfig,LIVE_MODEL,LIVE_SESSION_MS} from '../spark/live-config.js';

const jwks=createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'));
export async function verifyAttestation(token){
  const {payload}=await jwtVerify(token,jwks,{algorithms:['RS256'],issuer:'https://firebaseappcheck.googleapis.com/525628234892',audience:'projects/525628234892'});
  if(payload.sub!=='1:525628234892:web:974fd37d6954276ab26fa9')throw new Error('Invalid app');
}
export function liveTokenHandler({apiKey,local=false,verify=verifyAttestation,clientFactory=key=>new GoogleGenAI({apiKey:key,httpOptions:{apiVersion:'v1beta',timeout:15000}}),now=Date.now}={}){
  const limits=new Map();let total=0,reset=0;
  return async(req,res)=>{
    const origin=req.headers.origin;
    const allowed=local?['http://127.0.0.1:4173','http://localhost:4173']:['https://wasterecast.web.app','https://wasterecast.firebaseapp.com'];
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
    const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
    if(!allowed.includes(origin))return reply(403,{error:'Open voice from WasteRecast.'});
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Firebase-AppCheck, X-WasteRecast-Local');
    if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
    if(req.method!=='POST')return reply(405,{error:'Use POST.'});
    if(!apiKey)return reply(503,{error:'The private live voice key has not been configured.'});
    if(!String(req.headers['content-type']).startsWith('application/json'))return reply(415,{error:'JSON required.'});
    if(Number(req.headers['content-length'])>1024)return reply(413,{error:'Request too large.'});
    try{
      if(local){if(req.headers['x-wasterecast-local']!=='1')return reply(403,{error:'Local access only.'});}
      else {try{await verify(req.headers['x-firebase-appcheck'] || '');}catch{return reply(401,{error:'Google could not verify this browser. Reload WasteRecast and try again in Chrome or Edge.'});}}
      let input;
      if(req.body && typeof req.body==='object')input=req.body;
      else {let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024)return reply(413,{error:'Request too large.'});}try{input=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request.'});}}
      if(!input || Buffer.byteLength(JSON.stringify(input))>1024)return reply(413,{error:'Request too large.'});
      if(input?.consent!==true || !['en','hi','mr','es'].includes(input.language) || Object.keys(input).some(k=>!['consent','language'].includes(k)))return reply(400,{error:'Start voice and choose a supported language.'});
      // Best-effort free-pilot limits; Google's free quota is the account-level ceiling.
      const time=now();if(time>=reset){limits.clear();total=0;reset=time+3600000;}
      const ip=String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
      if((limits.get(ip)||0)>=6 || total>=30)return reply(429,{error:'The free voice session limit has been reached. Please try later or use text.'});
      limits.set(ip,(limits.get(ip)||0)+1);total++;
      const config=liveConfig(input.language);
      const token=await clientFactory(apiKey).authTokens.create({config:{uses:1,expireTime:new Date(time+LIVE_SESSION_MS).toISOString(),newSessionExpireTime:new Date(time+60_000).toISOString(),liveConnectConstraints:{model:LIVE_MODEL,config}}});
      if(!token.name)throw new Error('Missing token');
      return reply(200,{token:token.name,model:LIVE_MODEL,config,expiresAt:time+LIVE_SESSION_MS});
    }catch(error){
      const status=Number(error.status || error.code);
      return reply(status===429?429:502,{error:status===429?'Gemini free quota is busy. Please try later.':'Gemini could not open the live session. Check the API key’s free quota and Live model access.'});
    }
  };
}
