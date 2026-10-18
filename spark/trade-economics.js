const fields=['purchaseTotal','transportTotal','processingTotal','testingTotal','inputTonnes','yieldPct'];
export function landedCost(input){
  const missing=fields.filter(key=>input[key]===''||input[key]==null||!Number.isFinite(Number(input[key])));
  if(missing.length)return {status:'pending',missing};
  const values=Object.fromEntries(fields.map(key=>[key,Number(input[key])]));
  if(fields.some(key=>values[key]<0)||values.inputTonnes<=0||values.yieldPct<=0||values.yieldPct>100)throw new Error('Costs must be non-negative; tonnes and yield must be positive, and yield cannot exceed 100%.');
  if(!/^[A-Z]{3}$/.test(input.currency || ''))throw new Error('Choose one three-letter currency for all entered costs.');
  const references=input.references || {};
  const undocumented=['purchaseTotal','transportTotal','processingTotal','testingTotal'].filter(key=>!String(references[key] || '').trim());
  if(undocumented.length)return {status:'pending',missing:undocumented.map(x=>x+' quote/source reference')};
  if(!String(input.yieldReference || '').trim())return {status:'pending',missing:['usable yield measurement / explicitly labelled assumption reference']};
  const usableTonnes=values.inputTonnes*values.yieldPct/100,total=values.purchaseTotal+values.transportTotal+values.processingTotal+values.testingTotal,costPerUsableTonne=total/usableTonnes;
  const budget=input.budgetPerTonne===''||input.budgetPerTonne==null?null:Number(input.budgetPerTonne);
  if(budget!==null&&(!Number.isFinite(budget)||budget<0))throw new Error('Buyer budget must be non-negative.');
  return {status:'calculated',usableTonnes,total,costPerUsableTonne,currency:input.currency,budgetPerTonne:budget,budgetGap:budget===null?null:costPerUsableTonne-budget,withinBudget:budget===null?null:costPerUsableTonne<=budget,caveat:'Based on entered quotes and assumed/observed yield, not an offer or guaranteed outcome. Technical and legal acceptance are separate.'};
}
