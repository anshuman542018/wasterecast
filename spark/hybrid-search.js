import {hybridRank,retrievalText} from './hybrid-retrieval.js';
const cache=new Map();
export async function retrieveRanked(query,items,{embed,onStatus=()=>{},isCurrent=()=>true}={}){
  if(!items.length)return {ranked:[],embeddingCount:0,total:0,embeddingError:null,method:'No active candidates to rank'};
  const vectors=new Map(),queryText=retrievalText(query).slice(0,800),documents=items.map((item,i)=>({id:'d'+i,text:retrievalText(item).slice(0,800),item}));
  const unique=[...new Set([queryText,...documents.map(d=>d.text)])].filter(Boolean);
  let embeddingError=null;
  if(embed){
    const missing=unique.filter(text=>!cache.has(text));
    for(let offset=0;offset<missing.length;offset+=33){
      if(!isCurrent())return null;
      const batch=missing.slice(offset,offset+33).map((text,i)=>({id:'v'+i,text}));onStatus(`Embedding ${Math.min(offset+batch.length,missing.length)} of ${missing.length} material texts…`);
      try{const result=await embed(batch);for(const row of result.vectors || []){const input=batch.find(x=>x.id===row.id);if(input&&Array.isArray(row.values)&&row.values.length===768&&row.values.every(Number.isFinite)){cache.set(input.text,row.values);if(cache.size>512)cache.delete(cache.keys().next().value);}}}catch(error){embeddingError=error.message;break;}
    }
  }
  for(const doc of documents)if(cache.has(doc.text))vectors.set(doc.item.id,cache.get(doc.text));
  return {ranked:hybridRank(query,items,{queryVector:cache.get(queryText),vectors}),embeddingCount:vectors.size,total:items.length,embeddingError,method:vectors.size?'Alias + vector + process reciprocal-rank fusion':'Alias + documented process retrieval (vectors unavailable)'};
}
