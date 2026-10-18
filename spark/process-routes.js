import {contractOf,canonical} from './material-contract.js';

// General process references, not acceptance proofs or local regulatory advice.
export const ROUTES=[
  {id:'plastic-mechanical',name:'Mechanical plastics reprocessing',inputs:['plastic'],buyerFamilies:['plastic','other'],process:'mechanical_recycling',source:'https://www.epa.gov/plastics/advanced-recycling-plastics',publisher:'US EPA',basis:'Mechanical recycling includes sorting, cleaning, shredding and melting.',checks:['Confirm the exact polymer, additives and contamination limits.','Obtain operator acceptance and a sample trial.']},
  {id:'organic-compost',name:'Composting of suitable clean organic feedstock',inputs:['organic','wood','paper'],buyerFamilies:['organic','other'],process:'composting',source:'https://www.epa.gov/recycle/composting-home',publisher:'US EPA',basis:'General guidance includes food scraps, untreated wood chips and suitable paper; industrial acceptance is site-specific.',checks:['Confirm untreated/uncoated feedstock and excluded contaminants.','Verify site-specific feedstock acceptance, permits and process recipe.']},
  {id:'food-ad',name:'Anaerobic digestion feedstock',inputs:['organic','cooking_oil'],buyerFamilies:['organic','other'],process:'anaerobic_digestion',source:'https://www.epa.gov/anaerobic-digestion/frequent-questions-about-anaerobic-digestion',publisher:'US EPA',basis:'Food scraps and fats, oils and grease are examples of digester feedstocks.',checks:['Confirm this operator can accept this specific composition and loading.','Obtain inhibition/contamination tests, permits and a feed trial.']}
];
export const ACTIONS=[
  {id:'resin-drying',name:'Investigate controlled resin drying',attributes:['moisture'],families:['plastic'],source:'https://www.conairgroup.com/products/drying/',publisher:'Conair',basis:'Manufacturer documents resin drying; equipment and settings depend on material.',followUp:'Obtain a material-specific drying trial, measured output moisture, yield and written processing quote.'},
  {id:'surface-moisture-drying',name:'Investigate hot-air surface-moisture removal',attributes:['moisture'],families:['plastic'],materials:['polypropylene','high density polyethylene','low density polyethylene','polyvinyl chloride'],source:'https://www.conairgroup.com/product/had-models-600-5000/',publisher:'Conair',basis:'Manufacturer documents hot-air surface-moisture removal for non-hygroscopic resins including PP and PE.',followUp:'Establish that moisture is surface moisture on the declared resin; obtain an equipment-specific trial, retest and quote. No drying temperature or guaranteed output is inferred.'},
  {id:'plastic-size-reduction',name:'Investigate size reduction',attributes:['particle_size'],families:['plastic'],source:'https://www.epa.gov/plastics/advanced-recycling-plastics',publisher:'US EPA',basis:'Shredding is a documented mechanical recycling operation.',followUp:'Confirm shredding suitability, particle-size distribution, fines, contamination and usable yield after a sample trial.'}
];
export function documentedRoutes(seller,buyer){
  const accepted=contractOf(buyer).processes;
  if(seller.hazard==='yes')return [];
  return ROUTES.filter(r=>r.inputs.includes(seller.family)&&r.buyerFamilies.includes(buyer.family)&&accepted.includes(r.process));
}
export function routeRelevance(query,item){const seller=query.role==='seller'?query:item,buyer=query.role==='buyer'?query:item;return documentedRoutes(seller,buyer).length;}
export function minimumChangePlan(assessment,seller,buyer,actionQuotes={}){
  const failed=assessment.checks.filter(x=>x.status==='fail'&&x.requirement==='must');
  const materialFacts=contractOf(seller).facts.filter(f=>f.attribute==='material'&&f.op==='eq'&&f.reviewed&&f.evidence.kind!=='inferred');
  const candidates=ACTIONS.filter(action=>action.families.includes(seller.family)&&seller.hazard==='no'&&(!action.materials||materialFacts.length===1&&action.materials.includes(canonical(materialFacts[0].value)))&&failed.some(check=>action.attributes.includes(check.attribute)&&check.required.op==='lte'));
  const covers=(action,check)=>action.attributes.includes(check.attribute)&&check.required.op==='lte';
  // Enumerate the small curated action set. No invented treatment can enter this solver.
  const plans=[];
  for(let mask=1;mask<2**candidates.length;mask++){
    const actions=candidates.filter((_,i)=>mask&(1<<i));
    if(!failed.length||!failed.every(check=>actions.some(action=>covers(action,check))))continue;
    const quotes=actions.map(a=>actionQuotes[a.id]);
    const quoted=quotes.every(q=>q&&Number.isFinite(q.amount)&&q.amount>=0&&q.reference&&/^[A-Z]{3}$/.test(q.currency));
    const sameCurrency=quoted&&new Set(quotes.map(q=>q.currency)).size===1;
    plans.push({actions,quoted:sameCurrency,total:sameCurrency?quotes.reduce((sum,q)=>sum+q.amount,0):null,currency:sameCurrency?quotes[0].currency:null});
  }
  const currencies=new Set(plans.filter(p=>p.quoted).map(p=>p.currency));
  const comparable=currencies.size<=1;
  plans.sort((a,b)=>comparable?(Number(b.quoted)-Number(a.quoted)||(a.quoted&&b.quoted?a.total-b.total:0)||a.actions.length-b.actions.length):a.actions.length-b.actions.length);
  const selected=plans[0];
  const rawMaterial=contractOf(seller).facts.find(f=>f.attribute==='material'&&f.op==='eq');
  return {status:failed.length?(selected?'conditional':'blocked'):assessment.unknown||!assessment.requirementsPresent?'needs_evidence':'stated_fit',actions:selected?.actions || [],alternatives:candidates,failed,objective:!comparable?'Quotes use different currencies; financial comparison is pending':selected?.quoted?'Least quoted total among supported action sets in one currency':'Fewest documented operations; financial minimum is unknown',processingTotal:comparable?(selected?.total ?? null):null,currency:comparable?(selected?.currency || null):null,material:rawMaterial?canonical(rawMaterial.value):null,caveat:'A process hypothesis does not prove the required output. Retest the processed sample and obtain buyer acceptance; current material remains non-conforming.'};
}
