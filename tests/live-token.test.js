import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {liveTokenHandler} from '../server/live-token.js';
const origin='https://wasterecast.web.app';
function call(handler,{headers={},body={consent:true,language:'en'},method='POST'}={}){
  return new Promise(resolve=>{const req=Readable.from([JSON.stringify(body)]);req.headers={origin,'content-type':'application/json','x-firebase-appcheck':'test-attestation',...headers};req.method=method;req.socket={remoteAddress:'test'};const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(text){resolve({status:this.statusCode,headers:this.headers,body:text?JSON.parse(text):null});}};handler(req,res);});
}
test('public live token requires attestation, explicit consent and a permitted origin',async()=>{
  let minted=0;const handler=liveTokenHandler({apiKey:'private-test-key',verify:async token=>{if(token!=='test-attestation')throw Error('Invalid');},clientFactory:()=>({authTokens:{create:async()=>{minted++;return{name:'auth_tokens/one-use'};}}})});
  assert.equal((await call(handler,{headers:{origin:'https://unrelated.example'}})).status,403);
  assert.equal((await call(handler,{headers:{'x-firebase-appcheck':''}})).status,401);
  assert.equal((await call(handler,{body:{consent:false,language:'en'}})).status,400);
  assert.equal((await call(handler,{body:{consent:true,language:'en',config:{}}})).status,400);
  assert.equal(minted,0);
});
test('live token is one use, short lived, config locked and key never returned',async()=>{
  let args;const handler=liveTokenHandler({apiKey:'private-test-key',verify:async()=>{},now:()=>100000,clientFactory:()=>({authTokens:{create:async value=>{args=value;return{name:'auth_tokens/one-use'};}}})});
  const result=await call(handler);assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(args.config.uses,1);
  assert.equal(Date.parse(args.config.expireTime)-100000,300000);assert.equal(Date.parse(args.config.newSessionExpireTime)-100000,60000);
  assert.equal(args.config.liveConnectConstraints.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Aoede');
  assert.equal(JSON.stringify(result).includes('private-test-key'),false);
  for(let i=0;i<5;i++)await call(handler);assert.equal((await call(handler)).status,429);
});
test('private local voice rejects missing header and provider errors are redacted',async()=>{
  const handler=liveTokenHandler({apiKey:'private-test-key',local:true,clientFactory:()=>({authTokens:{create:async()=>{throw Error('private-test-key');}}})});
  const headers={origin:'http://127.0.0.1:4173'};assert.equal((await call(handler,{headers})).status,403);
  const result=await call(handler,{headers:{...headers,'x-wasterecast-local':'1'}});assert.equal(result.status,502);assert.equal(JSON.stringify(result).includes('private-test-key'),false);
});
