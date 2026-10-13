import { MATERIAL_FAMILIES } from './materials.js';
const familyNames = new Set(MATERIAL_FAMILIES);

function namedMaterial(text, family) {
  const names = family === 'plastic' ? ['PET', 'HDPE', 'LDPE', 'PVC', 'PP'] : family === 'metal' ? ['aluminium', 'copper', 'brass', 'lead', 'zinc'] : [];
  return names.find(name => new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, 'i').test(text))?.toUpperCase() || null;
}

export function calculateEconomics(quantity, values = {}) {
  const required = ['disposal_cost_inr_per_tonne', 'buyer_quote_inr_per_tonne', 'transport_quote_inr_per_tonne'];
  const missing_inputs = [...(quantity == null ? ['quantity_tonnes_per_month'] : []), ...required.filter(key => values[key] == null)];
  const formula = '12 × tonnes/month × (avoided disposal cost + buyer quote − transport quote − pretreatment quote)';
  if (missing_inputs.length) return {annual_net_inr:null, formula, assumptions_complete:false, missing_inputs};
  const annual_net_inr = Math.round(12 * quantity * (values.disposal_cost_inr_per_tonne + values.buyer_quote_inr_per_tonne - values.transport_quote_inr_per_tonne - (values.pretreatment_quote_inr_per_tonne || 0)) * 100) / 100;
  return {annual_net_inr, formula, assumptions_complete:true, missing_inputs:[]};
}

export function matchProfile(profile, economics = {}, facilities = [], sources = [], maxResults = 30) {
  if (!familyNames.has(profile.family)) throw new Error('Choose a supported material family.');
  if (economics.buyer_quote_inr_per_tonne != null && !economics.quote_facility_id) throw new Error('Select the facility that issued the buyer quote.');
  const results = [];
  for (const facility of facilities) {
    if (!facility.families.includes(profile.family) && facility.source_type !== 'osm') continue;
    const value = calculateEconomics(profile.quantity_tonnes_per_month, facility.id === economics.quote_facility_id ? economics : {});
    const stream = namedMaterial([profile.description, ...(profile.material_names || [])].join(' '), profile.family);
    const facilityMaterial = namedMaterial(facility.process || '', profile.family);
    const restrictedFlash = (facility.process || '').includes('above 93°C');
    const biologicalOnly = facility.source_type === 'osm' && /anaerobic digestion|compost|biogas/i.test(`${facility.name} ${facility.process || ''}`) && profile.family !== 'organic';
    const mapConflict = facility.source_type === 'osm' && facility.families.length > 0 && !facility.families.includes(profile.family);
    let status = 'candidate_requires_verification';
    let reasons;
    if (biologicalOnly || mapConflict) {
      status = 'rejected';
      reasons = [biologicalOnly ? 'Map record names a biological treatment route, which does not establish acceptance of this material.' : `Map tags name ${facility.families.join(', ')} recycling, not ${profile.family.replaceAll('_',' ')}.`];
    } else if (stream && facilityMaterial && stream !== facilityMaterial) {
      status = 'rejected';
      reasons = [`Directory process specifies ${facilityMaterial}, while the supplied stream specifies ${stream}.`];
    } else if (restrictedFlash && profile.flash_point_c != null && profile.flash_point_c <= 93) {
      status = 'rejected';
      reasons = [`Directory limits this process to solvent above 93°C flash point; supplied stream is ${profile.flash_point_c}°C.`];
    } else {
      reasons = facility.source_type === 'osm'
        ? [facility.listing_type === 'public_dropoff' ? 'OpenStreetMap identifies a public recycling centre; it may not accept commercial loads or this material.' : 'OpenStreetMap tags this site as industrial recycling; the map record does not establish that it accepts this material.']
        : [`Official directory lists this facility for ${profile.family.replaceAll('_',' ')}.`];
      if (restrictedFlash) reasons.push('This entry requires flash point above 93°C; verify a measured flash point before contacting.');
      reasons.push('Current authorization, accepted composition, available capacity, and commercial terms require confirmation.');
      if (profile.contaminants?.length) reasons.push(`Listed contaminants need a facility-specific acceptance check: ${profile.contaminants.join(', ')}.`);
    }
    const questions_for_buyer = [
      'Send a current authorization covering this waste category and process.',
      'Confirm the accepted composition, contaminant limits, and required analysis report.',
      'Confirm available monthly capacity, handling format, and price in writing.'
    ];
    if ((facility.capacity_unit || '').toUpperCase().includes('KL')) questions_for_buyer.push('Provide density before comparing a volume capacity with tonnes per month.');
    results.push({facility, status, reasons, questions_for_buyer, economics:value});
  }
  const same = (a,b) => (a || '').toLowerCase() === (b || '').toLowerCase();
  results.sort((a,b) => Number(a.status === 'rejected') - Number(b.status === 'rejected') || Number(!same(a.facility.state, profile.origin_state)) - Number(!same(b.facility.state, profile.origin_state)) || Number(!same(a.facility.city_or_district, profile.origin_city)) - Number(!same(b.facility.city_or_district, profile.origin_city)) || a.facility.name.localeCompare(b.facility.name));
  const viable = results.filter(item => item.status !== 'rejected');
  const rejected = results.filter(item => item.status === 'rejected');
  const keepRejections = Math.min(5, rejected.length, Math.floor(maxResults / 3));
  const chosen = [...viable.slice(0, maxResults - keepRejections), ...rejected.slice(0, keepRejections)];
  if (chosen.length < maxResults) chosen.push(...rejected.slice(keepRejections, keepRejections + maxResults - chosen.length));
  chosen.forEach((item, index) => { item.rank = index + 1; });
  return {generated_at:new Date().toISOString(),profile,candidates:chosen,catalog_count:facilities.length,catalog_sources:sources,disclaimer:'A directory or map listing is not proof of current authorization, technical acceptance, available capacity, or price. Confirm with the facility and regulator before moving waste.'};
}

export function screenFacility(profile, facilityId, economics, facilities, sources) {
  const facility = facilities.find(item => item.id === facilityId);
  if (!facility) throw new Error('Facility is not in the public catalog.');
  const result = matchProfile(profile, economics, [facility], sources, 1);
  if (!result.candidates.length) throw new Error('Facility does not match the material family.');
  return result.candidates[0];
}
