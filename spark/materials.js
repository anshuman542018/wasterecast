export const MATERIAL_FAMILIES = ['spent_solvent','used_oil','waste_oil','cooking_oil','plastic','metal','paper','glass','textile','wood','organic','electronic','construction','rubber','battery','other'];

const patterns = [
  ['battery', /\bbatter(?:y|ies)\b|lithium[- ]ion|lead[- ]acid|\bli[- ]ion\b/i],
  ['electronic', /\be[- ]?waste\b|electronic|circuit board|\bpcb\b|discarded computer|discarded laptop|mobile phone/i],
  ['spent_solvent', /solvent|toluene|xylene|isopropyl alcohol|\bipa\b|acetone/i],
  ['cooking_oil', /cooking oil|frying oil|vegetable oil|edible oil/i],
  ['waste_oil', /waste oil|oil sludge|oily sludge/i],
  ['used_oil', /used oil|lubricant|engine oil|hydraulic oil/i],
  ['plastic', /plastic|polymer|polypropylene|polyethylene|polystyrene|\bpet\b|\bhdpe\b|\bldpe\b|\bpvc\b|\bpp\b/i],
  ['metal', /metal|aluminium|aluminum|copper|steel|iron scrap|brass|zinc scrap/i],
  ['paper', /paper|cardboard|carton|corrugated|office documents/i],
  ['glass', /glass|cullet|bottles|window pane/i],
  ['textile', /textile|fabric|garment|cotton|polyester cloth|denim|clothing/i],
  ['wood', /wood|timber|sawdust|pallets|plywood/i],
  ['organic', /food waste|food scraps|organic|agricultural residue|crop residue|coffee grounds|compost|spent (?:brewery )?grain/i],
  ['construction', /construction|demolition|concrete|brick rubble|asphalt|gypsum|ceramic tile/i],
  ['rubber', /rubber|tyres|tires|elastomer/i]
];

export function classifyMaterial(description) {
  return patterns.find(([,pattern]) => pattern.test(description))?.[0] || 'other';
}

const pathways = {
  spent_solvent:['Solvent recovery by distillation','Industrial reuse after purity testing'],
  used_oil:['Re-refining into base oil','Approved industrial lubricant recovery'],
  waste_oil:['Oil separation and recovery','Approved re-refining after characterization'],
  cooking_oil:['Collection for approved biofuel feedstock','Industrial oleochemical recovery after quality testing'],
  plastic:['Sorting and mechanical reprocessing','Product feedstock after polymer and contamination testing'],
  metal:['Grade-specific scrap remelting','Direct component reuse where condition permits'],
  paper:['Fiber recovery for new paper products','Direct packaging reuse where condition permits'],
  glass:['Cullet for new glass','Direct container reuse where safe and permitted'],
  textile:['Repair or remanufacture','Fiber-to-fiber or nonwoven feedstock'],
  wood:['Pallet or timber repair','Clean wood into board or engineered products'],
  organic:['Anaerobic digestion for biogas','Composting or soil input where permitted'],
  electronic:['Component refurbishment','Specialist metals recovery after safe dismantling'],
  construction:['Aggregate after crushing and testing','Component salvage and direct reuse'],
  rubber:['Rubber crumb for approved products','Retreading or material recovery'],
  battery:['Certified battery refurbishment where safe','Specialist material recovery'],
  other:['Characterize the stream before selecting a recovery process']
};

export function possiblePathways(family) { return pathways[family] || pathways.other; }
