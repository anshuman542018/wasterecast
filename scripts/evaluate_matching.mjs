import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {runEvaluation} from '../spark/evaluation.js';
import {EVALUATION_CASES,RETRIEVAL_CASES} from '../spark/evaluation-cases.js';
import {semanticPrompt,exchangeSchema,reconcileAssessments} from '../spark/exchange-core.js';
import {hybridRank,retrievalText} from '../spark/hybrid-retrieval.js';
const report=runEvaluation();
if(process.argv.includes('--live')){
  if(existsSync('.env'))process.loadEnvFile('.env');
  if(!process.env.GEMINI_API_KEY)throw new Error('Configure the private local GEMINI_API_KEY; never paste a key in this script.');
  const {GoogleGenAI}=await import('@google/genai');
  const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{timeout:45000}});
  const fixture=EVALUATION_CASES.find(x=>x.id==='drying-needed');const trials=[];
  for(let i=0;i<3;i++){
    const response=await client.models.generateContent({model:'gemini-3.5-flash',contents:semanticPrompt(fixture.seller,[fixture.buyer]),config:{responseMimeType:'application/json',responseSchema:exchangeSchema,thinkingConfig:{thinkingLevel:'low'}}});
    const parsed=JSON.parse(response.text);const result=reconcileAssessments(fixture.seller,[fixture.buyer],parsed)[0];
    trials.push({model:response.modelVersion || 'gemini-3.5-flash',decision:result.plan.status,score:result.score,blockerCount:result.blockers.length});
  }
  report.liveModelRepeatability={scope:'Three repeated requests on one authored scenario; not a general accuracy estimate',trials,decisionAgreement:Math.max(...Object.values(trials.reduce((counts,t)=>(counts[t.decision]=(counts[t.decision]||0)+1,counts),{})))/trials.length};
  report.liveVectorRetrieval=[];
  for(const test of RETRIEVAL_CASES){const texts=[test.query,...test.items].map(item=>retrievalText(item).slice(0,800));const response=await client.models.embedContent({model:'gemini-embedding-001',contents:texts,config:{taskType:'SEMANTIC_SIMILARITY',outputDimensionality:768}});const [queryVector,...embeddings]=response.embeddings.map(x=>x.values),vectors=new Map(test.items.map((item,i)=>[item.id,embeddings[i]]));const ranked=hybridRank(test.query,test.items,{queryVector,vectors});report.liveVectorRetrieval.push({id:test.id,model:'gemini-embedding-001',dimensions:queryVector.length,recallAt20:ranked.slice(0,20).filter(x=>test.relevant.includes(x.item.id)).length/test.relevant.length,precisionAt1:test.relevant.includes(ranked[0]?.item.id)?1:0,candidateCount:test.items.length});}
}
mkdirSync('output',{recursive:true});writeFileSync('output/matching-evaluation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,decisions:report.decisions.filter(x=>!x.passed)},null,2));
if(report.correctDecisions!==report.decisionCases||report.unsafeFalsePositives)process.exitCode=1;
