import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFact,normalizeContract,compareFacts,assessContract,validateExtraction} from '../spark/material-contract.js';
import {minimumChangePlan,documentedRoutes} from '../spark/process-routes.js';
import {landedCost} from '../spark/trade-economics.js';
import {cosine,hybridRank} from '../spark/hybrid-retrieval.js';
import {EVALUATION_CASES,RETRIEVAL_CASES,fact,passport} from '../spark/evaluation-cases.js';
import {runEvaluation} from '../spark/evaluation.js';
import {reconcileAssessments} from '../spark/exchange-core.js';

test('authored acceptance cases cover failures, missing facts and unit boundaries',()=>{const report=runEvaluation();assert.equal(report.decisionCases,24);assert.deepEqual(report.decisions.filter(x=>!x.passed),[]);assert.equal(report.unsafeFalsePositives,0);assert.equal(report.expertValidation,'pending');});
test('normalization rejects whitespace-as-zero, missing range bounds and incompatible units',()=>{
  for(const input of [{...fact('moisture',' ',{unit:'%'})},{...fact('moisture',0,{op:'range',unit:'%'}),max:null},fact('moisture',200,{unit:'%'}),fact('particle_size',3,{unit:'C'}),fact('material','PP',{op:'lte'})])assert.throws(()=>normalizeFact(input));
  assert.throws(()=>normalizeContract({facts:Array.from({length:13},()=>fact('material','PP'))}));
});
test('three-state interval comparison does not turn overlap or absent source into a pass',()=>{
  assert.equal(compareFacts(fact('moisture',0.2,{op:'range',max:0.8,unit:'%'}),fact('moisture',0.5,{op:'lte',unit:'%'})).status,'unknown');
  assert.equal(compareFacts(null,fact('moisture',0.5,{op:'lte',unit:'%'})).status,'unknown');
  assert.equal(compareFacts(fact('moisture',5000,{unit:'ppm'}),fact('moisture',0.5,{op:'lte',unit:'%'})).status,'pass');
});
test('a high semantic score cannot override typed material mismatch or unsupported processing',()=>{
  const fixture=EVALUATION_CASES.find(x=>x.id==='polymer-conflict');
  const ai={id:fixture.buyer.id,score:100,reason:'Invented perfect fit',matched:[],gaps:[],blockers:[],questions:[]};
  const result=reconcileAssessments(fixture.seller,[fixture.buyer],{matches:[ai]})[0];assert.equal(result.score,null);assert.equal(result.plan.status,'blocked');assert.equal(result.plan.actions.length,0);
});
test('minimum-change solver uses documented operations, preserves current failure and waits for quotes',()=>{
  const fixture=EVALUATION_CASES.find(x=>x.id==='drying-needed'),assessment=assessContract(fixture.seller,fixture.buyer);
  let plan=minimumChangePlan(assessment,fixture.seller,fixture.buyer);assert.equal(plan.status,'conditional');assert.equal(plan.actions[0].id,'resin-drying');assert.equal(plan.processingTotal,null);assert.match(plan.caveat,/Retest/);
  plan=minimumChangePlan(assessment,fixture.seller,fixture.buyer,{'resin-drying':{amount:150,currency:'EUR',reference:'Illustrative quote fixture'}});assert.equal(plan.processingTotal,150);
  plan=minimumChangePlan(assessment,fixture.seller,fixture.buyer,{'resin-drying':{amount:150,currency:'EUR',reference:'Q1'},'surface-moisture-drying':{amount:80,currency:'EUR',reference:'Q2'}});assert.equal(plan.processingTotal,80);assert.equal(plan.actions[0].id,'surface-moisture-drying');
  plan=minimumChangePlan(assessment,fixture.seller,fixture.buyer,{'resin-drying':{amount:150,currency:'EUR',reference:'Q1'},'surface-moisture-drying':{amount:80,currency:'USD',reference:'Q2'}});assert.equal(plan.processingTotal,null);assert.match(plan.objective,/different currencies/);
  const incompatible=EVALUATION_CASES.find(x=>x.id==='polymer-conflict');assert.equal(minimumChangePlan(assessContract(incompatible.seller,incompatible.buyer),incompatible.seller,incompatible.buyer).status,'blocked');
});
test('cross-family discovery needs a declared supported process, and never asserts facility acceptance',()=>{
  const fixture=EVALUATION_CASES.find(x=>x.id==='wood-compost');assert.ok(documentedRoutes(fixture.seller,fixture.buyer).length);assert.equal(documentedRoutes(fixture.seller,{...fixture.buyer,passport:passport([])}).length,0);
  assert.equal(reconcileAssessments(fixture.seller,[fixture.buyer],{matches:[]})[0].plan.status,'needs_evidence');
});
test('aliases and process retrieval find relevant records beyond the old first-eight cut-off',()=>{
  for(const fixture of RETRIEVAL_CASES){const ranked=hybridRank(fixture.query,fixture.items);assert.ok(fixture.relevant.includes(ranked[0].item.id));assert.ok(fixture.items.findIndex(x=>x.id===ranked[0].item.id)>8);}
  assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([0,0],[1,0]),null);assert.equal(cosine([NaN],[1]),null);
});
test('extraction drops invented quotes, retains unreviewed document claims and never invents absent facts',()=>{
  const row={attribute:'moisture',op:'eq',value:'2',max:'',unit:'%',requirement:'must',quote:'Moisture 2%',reference:'model invented',page:'1'};
  assert.equal(validateExtraction({facts:[row]}, {description:'No measurements supplied'}).facts.length,0);
  const result=validateExtraction({facts:[row]},{description:'No measurements supplied'},{documentName:'User-provided report.pdf'});assert.equal(result.facts[0].reviewed,false);assert.equal(result.facts[0].evidence.kind,'document');assert.equal(result.facts[0].evidence.reference,'User-provided report.pdf');
});
test('landed cost separates usable yield, explicit zero quotes, missing inputs and budget gaps',()=>{
  const input={purchaseTotal:1000,transportTotal:100,processingTotal:200,testingTotal:50,inputTonnes:5,yieldPct:90,yieldReference:'Explicitly assumed QA yield, not a measured trial',currency:'EUR',budgetPerTonne:280,references:{purchaseTotal:'Q1',transportTotal:'Q2',processingTotal:'Q3',testingTotal:'Q4'}};
  const result=landedCost(input);assert.equal(result.usableTonnes,4.5);assert.equal(result.costPerUsableTonne,300);assert.equal(result.withinBudget,false);assert.equal(result.budgetGap,20);
  assert.equal(landedCost({...input,transportTotal:''}).status,'pending');assert.equal(landedCost({...input,transportTotal:0,references:{...input.references,transportTotal:''}}).status,'pending');assert.throws(()=>landedCost({...input,yieldPct:0}));
});
