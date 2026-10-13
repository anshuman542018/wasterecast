import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWithFirebase} from '../spark/gemini.js';

const params = {projectId:'test-project',apiKey:'public-app-key',appId:'test-app',appCheckToken:'test-attestation',model:'gemini-3.5-flash',content:['Material brief'],useCache:false};

test('Gemini request preserves app attestation and returns only user-facing text', async t => {
  t.mock.method(globalThis,'fetch',async (url,options) => {
    assert.match(url,/firebasevertexai\.googleapis\.com/);
    assert.equal(options.headers['X-Firebase-AppCheck'],'test-attestation');
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'private reasoning',thought:true},{text:'Material profile'}]}}]}),{status:200});
  });
  assert.equal(await generateWithFirebase(params),'Material profile');
});

test('Gemini provider errors and blocked outputs cannot appear as successful profiles', async t => {
  const stub = t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:{message:'Quota exceeded'}}),{status:429}));
  await assert.rejects(generateWithFirebase({...params,projectId:'quota-exhausted-test',retryDelayMs:1}),/free Gemini quota/);
  stub.mock.mockImplementation(async()=>new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}}),{status:200}));
  await assert.rejects(generateWithFirebase(params),/no material profile.*SAFETY/);
});

test('successful repeated inputs reuse the session result without another API call', async t => {
  const stub = t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'Cached profile'}]}}]}),{status:200}));
  const input = {...params,useCache:true,projectId:'cache-test'};
  assert.equal(await generateWithFirebase(input),'Cached profile');
  assert.equal(await generateWithFirebase(input),'Cached profile');
  assert.equal(stub.mock.callCount(),1);
});

test('free quota on one model permits the other model, then avoids the exhausted model', async t => {
  let calls = 0;
  const urls = [];
  t.mock.method(globalThis,'fetch',async(url)=>{
    calls++; urls.push(url);
    return calls === 1 ? new Response(JSON.stringify({error:{message:'Daily quota',details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'3600s'}]}}),{status:429}) : new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'Backup response'}]}}]}),{status:200});
  });
  const input = {...params,projectId:'quota-fallback-test',retryDelayMs:1};
  assert.equal(await generateWithFirebase(input),'Backup response');
  assert.equal(await generateWithFirebase(input),'Backup response');
  assert.match(urls[0],/gemini-3\.5-flash:generateContent$/);
  assert.match(urls[1],/gemini-3\.5-flash-lite:generateContent$/);
  assert.match(urls[2],/gemini-3\.5-flash-lite:generateContent$/);
});

test('a Gemini timeout never submits a duplicate request', async t => {
  const stub = t.mock.method(globalThis,'fetch',()=>new Promise(()=>{}));
  await assert.rejects(generateWithFirebase({...params,timeoutMs:10}),/longer than/);
  assert.equal(stub.mock.callCount(),1);
});

test('a declared temporary service failure retries once while preserving attestation', async t => {
  let calls = 0;
  const statuses = [];
  t.mock.method(globalThis,'fetch',async (url,options) => {
    assert.equal(options.headers['X-Firebase-AppCheck'],'test-attestation');
    calls++;
    assert.match(url,calls === 1 ? /gemini-3\.5-flash:generateContent$/ : /gemini-3\.5-flash-lite:generateContent$/);
    return calls === 1
      ? new Response(JSON.stringify({error:{message:'High demand'}}),{status:503})
      : new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'OK'}]}}]}),{status:200});
  });
  assert.equal(await generateWithFirebase({...params,retryDelayMs:1,onStatus:message=>statuses.push(message)}),'OK');
  assert.equal(calls,2);
  assert.equal(statuses.length,2);
  assert.match(statuses[0],/backup/);
});
