// Development-only private endpoint. Never imported by the browser build.
import {generateWithFirebase} from '../spark/gemini.js';
import {profileSchema, shortlistSchema} from '../spark/gemini-schema.js';
import {assistantSchema} from '../spark/assistant-core.js';
import {transcriptionSchema,AUDIO_TYPES} from '../spark/voice.js';
import {exchangeSchema} from '../spark/exchange-core.js';
import {contractSchema} from '../spark/material-contract.js';

const MAX_BODY = 14_000_000;
const kinds = {profile:profileSchema, shortlist:shortlistSchema, explain:null,assistant:assistantSchema,transcribe:transcriptionSchema,exchange:exchangeSchema,contract:contractSchema};
export function localGeminiMiddleware({apiKey, fetchImpl = fetch, maxRequests = 20, port = 5173}) {
  let requests = 0;
  let resetAt = Date.now() + 3600000;
  let busy = false;
  const reply = (res,status,body) => {
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(body));
  };
  return async (req,res,next) => {
    if (req.url !== '/private-api/gemini') return next();
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (![`127.0.0.1:${port}`,`localhost:${port}`].includes(host) ||
      (origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin)) ||
      req.headers['x-wasterecast-local'] !== '1') return reply(res,403,{error:'Local access only.'});
    if (req.method !== 'POST') return reply(res,405,{error:'Use POST.'});
    if (!apiKey) return reply(res,503,{error:'Set GEMINI_API_KEY in the root .env file and restart npm run dev.'});
    if (!String(req.headers['content-type']).startsWith('application/json')) return reply(res,415,{error:'JSON required.'});
    if (Number(req.headers['content-length']) > MAX_BODY) return reply(res,413,{error:'Upload exceeds the local request limit.'});
    if (Date.now() >= resetAt) { requests=0; resetAt=Date.now()+3600000; }
    if (busy) return reply(res,429,{error:'A Gemini request is already running. Please wait.'});
    if (requests >= maxRequests) return reply(res,429,{error:'Local limit reached: 20 requests per hour. The key also has Google free-tier quotas.'});
    busy = true;
    try {
      let size=0;
      const chunks=[];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) return reply(res,413,{error:'Upload exceeds the local request limit.'});
        chunks.push(chunk);
      }
      let payload;
      try { payload=JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return reply(res,400,{error:'Invalid JSON.'}); }
      const {kind,content}=payload || {};
      if (!Object.hasOwn(kinds,kind) || !Array.isArray(content) || content.length < 1 || content.length > 3 ||
        !content.every(part=>typeof part === 'string' ? part.length <= 100000 :
          part && Object.keys(part).length === 1 && part.inlineData &&
          (['application/pdf','image/png','image/jpeg','image/webp'].includes(part.inlineData.mimeType)||(kind==='transcribe'&&AUDIO_TYPES.includes(part.inlineData.mimeType))) &&
          typeof part.inlineData.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(part.inlineData.data))) {
        return reply(res,400,{error:'Invalid Gemini input or unsupported document type.'});
      }
      requests++;
      const text = await generateWithFirebase({projectId:'local-developer-key',model:'gemini-3.5-flash',content,
        schema:kinds[kind],thinkingLevel:['profile','assistant','transcribe'].includes(kind) ? 'minimal' : 'low',
        transport:(model,body)=>fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
          method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)
        })});
      return reply(res,200,{text});
    } catch (error) {
      // Never forward credentials or a provider's complete diagnostic object.
      const message=String(error.message || 'Gemini request failed.').split(apiKey).join('[redacted]').slice(0,1000);
      return reply(res,502,{error:message});
    } finally { busy=false; }
  };
}
