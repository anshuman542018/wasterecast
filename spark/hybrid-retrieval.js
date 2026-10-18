import {contractOf,canonical} from './material-contract.js';
import {routeRelevance} from './process-routes.js';
const aliases={pp:'polypropylene',pet:'polyethylene terephthalate',hdpe:'high density polyethylene',ldpe:'low density polyethylene',pvc:'polyvinyl chloride',fog:'fats oils grease',cullet:'glass fragments',swarf:'metal machining chips',occ:'old corrugated cardboard'};
export function retrievalText(item){
  const p=contractOf(item);
  return [item.family,item.title,...p.facts.map(f=>`${f.attribute} ${f.op} ${f.value} ${f.unit}`),...p.processes,item.specifications,item.description].filter(Boolean).join(' ').slice(0,1800);
}
function tokens(item){return retrievalText(item).toLowerCase().replace(/\b(pp|pet|hdpe|ldpe|pvc|fog|cullet|swarf|occ)\b/g,x=>aliases[x]).match(/[a-z0-9]+/g)?.filter(x=>x.length>1) || [];}
export function cosine(a,b){if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length||a.some(x=>!Number.isFinite(x))||b.some(x=>!Number.isFinite(x)))return null;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?Math.max(-1,Math.min(1,dot/Math.sqrt(aa*bb))):null;}
export function hybridRank(query,items,{queryVector=null,vectors=new Map()}={}){
  const qt=new Set(tokens(query)),sets=items.map(item=>new Set(tokens(item)));
  const lexical=items.map((item,i)=>({id:item.id,score:[...qt].reduce((sum,token)=>sum+(sets[i].has(token)?Math.log(1+(items.length+1)/(1+sets.filter(s=>s.has(token)).length)):0),0)/Math.sqrt(Math.max(1,sets[i].size))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const semantic=items.map(item=>({id:item.id,score:cosine(queryVector,vectors.get(item.id))})).filter(x=>x.score!==null).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const routes=items.map(item=>({id:item.id,score:routeRelevance(query,item)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const methods=[['aliases',lexical],['embeddings',semantic],['process',routes]],scores=new Map(items.map(item=>[item.id,{item,rrf:0,reasons:[],similarity:null}]));
  for(const [method,ranked] of methods)ranked.forEach((row,index)=>{const entry=scores.get(row.id);entry.rrf+=1/(60+index+1);entry.reasons.push(`${method} rank ${index+1}`);if(method==='embeddings')entry.similarity=row.score;});
  return [...scores.values()].sort((a,b)=>b.rrf-a.rrf||a.item.id.localeCompare(b.item.id));
}
