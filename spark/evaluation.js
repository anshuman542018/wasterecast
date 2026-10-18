import {reconcileAssessments} from './exchange-core.js';
import {hybridRank} from './hybrid-retrieval.js';
import {EVALUATION_CASES,RETRIEVAL_CASES,EVALUATION_SCOPE} from './evaluation-cases.js';
export function runEvaluation(){
  const decisions=EVALUATION_CASES.map(test=>{const result=reconcileAssessments(test.seller,[test.buyer],{matches:[]})[0];return {id:test.id,name:test.name,expected:test.expected,actual:result.plan.status,passed:result.plan.status===test.expected,trace:result.acceptance.checks.map(c=>({attribute:c.attribute,status:c.status,buyerQuote:c.required.evidence.quote,sellerQuotes:c.observed.map(f=>f.evidence.quote)}))};});
  const retrieval=RETRIEVAL_CASES.map(test=>{const ranked=hybridRank(test.query,test.items);const relevant=new Set(test.relevant),ids=ranked.map(x=>x.item.id);return {id:test.id,recallAt20:ids.slice(0,20).filter(id=>relevant.has(id)).length/relevant.size,precisionAt1:relevant.has(ids[0])?1:0,precisionAt5:ids.slice(0,5).filter(id=>relevant.has(id)).length/Math.min(5,ids.length),top5:ids.slice(0,5),candidateCount:ids.length,relevantCount:relevant.size};});
  const unsafeFalsePositives=decisions.filter(x=>x.expected==='blocked'&&x.actual==='stated_fit').length;
  const tracedChecks=decisions.flatMap(x=>x.trace),traceable=tracedChecks.filter(x=>x.buyerQuote&&x.sellerQuotes.length&&x.sellerQuotes.every(Boolean)).length;
  return {scope:EVALUATION_SCOPE,generatedAt:new Date().toISOString(),expertValidation:'pending',decisionCases:decisions.length,correctDecisions:decisions.filter(x=>x.passed).length,unsafeFalsePositives,traceableChecks:traceable,totalChecks:tracedChecks.length,casesWithoutStructuredConditions:decisions.filter(x=>!x.trace.length).length,retrieval,decisions,modelRepeatability:'Not measured by this deterministic benchmark; use the live evaluation script.'};
}
