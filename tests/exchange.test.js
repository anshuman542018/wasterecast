import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeListing,hardConflicts,commercialGaps,reconcileAssessments,semanticPrompt,isCurrent,negotiationBrief} from '../spark/exchange-core.js';
const seller={role:'seller',organization:'Test seller',title:'PP offcuts',family:'plastic',country:'DE',city:'Berlin',description:'Polypropylene offcuts, segregated by polymer.',specifications:'Mixed white and natural PP.',exclusions:'',hazard:'no',tradeScope:'international',quantity:5,price:500,currency:'EUR',publicContact:'business@example.com',contactConsent:true};
const buyer={...seller,id:'buyer-1',role:'buyer',country:'NL',city:'Rotterdam',title:'PP for compounds',quantity:8,price:400,specifications:'Rigid PP; no PVC.'};
const ai={id:'buyer-1',score:69,reason:'Polypropylene aligns; colour and analysis require review.',matched:['Both explicitly state polypropylene.'],gaps:['Confirm contamination.'],blockers:[],questions:['Can you accept partial loads?']};

test('registration validates global countries, material and explicit public contact consent',()=>{
  assert.equal(normalizeListing(seller).country,'DE');
  assert.equal(normalizeListing({...seller,country:'BR',quantity:'',price:''}).price,null);
  for(const patch of [{country:'XX'},{contactConsent:false},{publicContact:'a@example.com\r\nBcc:x@y.com'},{quantity:NaN},{price:-1},{family:'invented'},{hazard:'safe'}])assert.throws(()=>normalizeListing({...seller,...patch}));
});
test('hard constraints cannot be overridden by a high semantic score',()=>{
  for(const patch of [{role:'seller'},{family:'metal'},{tradeScope:'domestic'},{hazard:'no'}]){
    const query=patch.hazard?{...seller,hazard:'yes'}:seller;
    const item={...buyer,...patch};
    assert.ok(hardConflicts(query,item).length);
    const [result]=reconcileAssessments(query,[item],{matches:[{...ai,score:99}]});
    assert.equal(result.score,null);assert.ok(result.blockers.length);
  }
});
test('partial fits stay usable, commercial gaps are separate and unknowns cap confidence',()=>{
  let [result]=reconcileAssessments(seller,[buyer],{matches:[ai]});
  assert.equal(result.score,69);assert.equal(result.source,'gemini');
  assert.ok(result.gaps.some(x=>x.includes('partial supply')));assert.ok(result.gaps.some(x=>x.includes('100.00 EUR')));
  [result]=reconcileAssessments({...seller,hazard:'unknown'},[buyer],{matches:[{...ai,score:99}]});assert.equal(result.score,74);
  assert.ok(commercialGaps(seller,{...buyer,currency:'USD'}).some(x=>x.includes('no exchange-rate')));
});
test('unrequested IDs, malformed scores and missing responses never become fabricated matches',()=>{
  for(const matches of [[],[{...ai,id:'invented'}],[{...ai,score:'90'}],[{...ai,score:101}],[{...ai,score:Infinity}]]){
    const results=reconcileAssessments(seller,[buyer],{matches});assert.equal(results.length,1);assert.equal(results[0].item.id,'buyer-1');assert.equal(results[0].score,null);assert.equal(results[0].source,'unassessed');
  }
  const [blocked]=reconcileAssessments(seller,[buyer],{matches:[{...ai,score:98,blockers:['Explicit unacceptable grade.']}]});assert.equal(blocked.score,null);
});
test('matching prompt excludes contact and owner identifiers; expired/paused listings are inactive',()=>{
  const prompt=semanticPrompt({...seller,ownerId:'private-owner-123'},[{...buyer,publicContact:'secret@example.com',ownerId:'private-buyer-321'}]);
  assert.doesNotMatch(prompt,/business@example|secret@example|private-owner|private-buyer/);assert.match(prompt,/untrusted user data/);
  assert.equal(isCurrent({...buyer,status:'published',expiresAt:Date.now()+60000}),true);assert.equal(isCurrent({...buyer,status:'paused',expiresAt:Date.now()+60000}),false);assert.equal(isCurrent({...buyer,status:'published',expiresAt:Date.now()-1}),false);
  const brief=negotiationBrief(seller,reconcileAssessments(seller,[buyer],{matches:[ai]})[0]);assert.match(brief,/69% \(not a probability/);assert.match(brief,/Nothing has been sent/);
});
