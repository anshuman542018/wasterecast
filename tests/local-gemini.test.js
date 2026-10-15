import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {localGeminiMiddleware} from '../server/local-gemini.js';

async function fixture(t,options={}) {
  const middleware=localGeminiMiddleware({apiKey:'test-private-key',...options});
  const server=createServer((req,res)=>middleware(req,res,()=>{res.writeHead(404);res.end();}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return (payload,headers={})=>new Promise((resolve,reject)=>{
    const outgoing=request(`http://127.0.0.1:${server.address().port}/private-api/gemini`,{
      method:'POST',headers:{Host:'127.0.0.1:5173',Origin:'http://127.0.0.1:5173','Content-Type':'application/json','X-WasteRecast-Local':'1',...headers}
    },incoming=>{
      const chunks=[];
      incoming.on('data',chunk=>chunks.push(chunk));
      incoming.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:incoming.statusCode})));
    });
    outgoing.on('error',reject);
    outgoing.end(JSON.stringify(payload));
  });
}
const result = text=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}));

test('local endpoint keeps the key server-side and controls profile schema',async t=>{
  const call=await fixture(t,{fetchImpl:async(url,options)=>{
    assert.match(url,/generativelanguage.googleapis.com/);
    assert.equal(options.headers['x-goog-api-key'],'test-private-key');
    const body=JSON.parse(options.body);
    assert.ok(body.generationConfig.responseSchema.properties.family);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
    return result('{"family":"plastic"}');
  }});
  const response=await call({kind:'profile',content:['profile unit fixture'],schema:{arbitrary:'ignored'}});
  assert.equal(response.status,200);
  const text=await response.text();
  assert.doesNotMatch(text,/test-private-key/);
  assert.equal(JSON.parse(text).text,'{"family":"plastic"}');
});
test('foreign origins, host rebinding and missing local header cannot spend quota',async t=>{
  let calls=0;
  const call=await fixture(t,{fetchImpl:async()=>{calls++;return result('unexpected');}});
  for (const headers of [{Origin:'https://malicious.example'},{Host:'malicious.example:5173'},{'X-WasteRecast-Local':''}]) {
    assert.equal((await call({kind:'explain',content:['blocked origin']},headers)).status,403);
  }
  assert.equal(calls,0);
});
test('unsupported documents and operations are rejected before provider access',async t=>{
  let calls=0;
  const call=await fixture(t,{fetchImpl:async()=>{calls++;return result('unexpected');}});
  for (const payload of [null,{kind:'arbitrary',content:['anything']},{kind:'profile',content:[{inlineData:{mimeType:'text/html',data:'YWJj'}}]}]) {
    assert.equal((await call(payload)).status,400);
  }
  assert.equal(calls,0);
});
test('local quota cap and provider errors do not disclose secrets',async t=>{
  const call=await fixture(t,{maxRequests:1,fetchImpl:async()=>new Response(JSON.stringify({error:{message:'Denied test-private-key'}}),{status:400})});
  const response=await call({kind:'explain',content:['provider error fixture']});
  assert.equal(response.status,502);
  assert.doesNotMatch(await response.text(),/test-private-key/);
  assert.equal((await call({kind:'explain',content:['second fixture']})).status,429);
});
test('audio uses the private transcription schema and is rejected for unrelated operations',async t=>{
  let calls=0;
  const call=await fixture(t,{fetchImpl:async(url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    assert.equal(options.headers['x-goog-api-key'],'test-private-key');
    assert.deepEqual(body.generationConfig.responseSchema.required,['transcript']);
    assert.equal(body.contents[0].parts[1].inlineData.mimeType,'audio/webm');
    return result('{"transcript":"show more leads"}');
  }});
  const content=['Transcribe the recording',{inlineData:{mimeType:'audio/webm',data:'AA=='}}];
  assert.equal((await call({kind:'profile',content})).status,400);
  const response=await call({kind:'transcribe',content});
  assert.equal(response.status,200);assert.match(await response.text(),/show more leads/);assert.equal(calls,1);
});
