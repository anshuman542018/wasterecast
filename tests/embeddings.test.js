import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddingsHandler,reserveEmbeddingBudget} from '../server/embeddings.js';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body?JSON.parse(body):null;}};}
const payload={texts:[{id:'q',text:'Polypropylene offcuts'},{id:'d',text:'PP regrind buyer'}]};
const request=(body=payload)=>({method:'POST',headers:{origin:'https://wasterecast.web.app','content-type':'application/json',authorization:'Bearer private-test-user','x-firebase-appcheck':'test-attestation'},body});
test('public embedding endpoint requires app verification, verified sign-in and valid bounded inputs',async()=>{
  const denied=embeddingsHandler({apiKey:'private-key',attest:async()=>{throw Error();}});let res=response();await denied(request(),res);assert.equal(res.statusCode,401);
  const noUser=embeddingsHandler({apiKey:'private-key',attest:async()=>{},authenticate:async()=>{throw Error();}});res=response();await noUser(request(),res);assert.equal(res.statusCode,401);
  const handler=embeddingsHandler({apiKey:'private-key',attest:async()=>{},authenticate:async()=> 'uid',reserve:async()=>{throw Error('Should not reserve invalid input');}});res=response();await handler(request({texts:Array.from({length:34},(_,i)=>({id:'v'+i,text:'x'}))}),res);assert.equal(res.statusCode,400);
});
test('budget is reserved before provider access; vectors preserve IDs and never disclose the key',async()=>{
  const order=[];const handler=embeddingsHandler({apiKey:'private-key',attest:async()=>{},authenticate:async()=> 'uid',reserve:async args=>{assert.equal(args.count,2);order.push('budget');},clientFactory:key=>{assert.equal(key,'private-key');return {models:{embedContent:async args=>{order.push('provider');assert.equal(args.model,'gemini-embedding-001');return {embeddings:args.contents.map(()=>({values:Array(768).fill(0.1)}))};}}};}});const res=response();await handler(request(),res);assert.equal(res.statusCode,200);assert.deepEqual(order,['budget','provider']);assert.deepEqual(res.body.vectors.map(x=>x.id),['q','d']);assert.doesNotMatch(JSON.stringify(res),/private-key/);
});
test('durable quota rejects exhaustion and uses update-time preconditions to prevent concurrent reuse',async()=>{
  const current={fields:{count:{integerValue:'239'},windowStart:{timestampValue:new Date().toISOString()}},updateTime:new Date().toISOString()};
  await assert.rejects(reserveEmbeddingBudget({uid:'uid',token:'token',count:2,fetchImpl:async()=>new Response(JSON.stringify(current))}),error=>error.status===429);
  let writes=0;await reserveEmbeddingBudget({uid:'uid',token:'token',count:1,fetchImpl:async(url,options)=>{if(!options.method)return new Response(JSON.stringify(current));const body=JSON.parse(options.body);assert.equal(body.writes[0].currentDocument.updateTime,current.updateTime);assert.equal(body.writes[0].update.fields.count.integerValue,'240');writes++;return new Response('{}');}});assert.equal(writes,1);
});
test('provider failures and malformed vectors are reported without provider diagnostics',async()=>{
  const handler=embeddingsHandler({apiKey:'secret',attest:async()=>{},authenticate:async()=> 'uid',reserve:async()=>{},clientFactory:()=>({models:{embedContent:async()=>{throw Error('secret provider diagnostic');}}})});const res=response();await handler(request(),res);assert.equal(res.statusCode,502);assert.doesNotMatch(JSON.stringify(res.body),/secret|diagnostic/);
});
