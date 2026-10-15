export const VERIFICATION_ITEMS = ['composition','authorization','capacity','quote'];
export function safeWebUrl(value) {
  try { const url=new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function publicContacts(facility) {
  const data=facility.public_contact || {};
  const email=String(data.email || '').trim();
  const phone=String(data.phone || '').trim();
  return {address:String(data.address || facility.address || '').slice(0,800),
    email:/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\r\n]/.test(email) ? email : null,
    phone:/^[+\d() .\-;]{6,70}$/.test(phone) ? phone : null,
    website:safeWebUrl(data.website),source_url:safeWebUrl(data.source_url || facility.source_url),
    checked_at:data.checked_at || facility.source_as_of || null};
}
// Verification belongs to the exact material brief, location and facility.
export function workspaceKey(profile,facility) {
  return JSON.stringify([facility.id,profile.description,profile.family,profile.origin_country,profile.origin_city,profile.origin_state,profile.quantity_tonnes_per_month,profile.contaminants,profile.flash_point_c]);
}
export function verificationProgress(checks={}) {
  return VERIFICATION_ITEMS.filter(key=>checks[key] === true).length;
}
export function enquiryText(profile,candidate) {
  const f=candidate.facility;
  return `Subject: Material recovery acceptance enquiry - ${f.name}\n\nHello ${f.name},\n\nWe are evaluating a possible recovery route for the following material. Your public listing is a discovery lead; we have not established acceptance.\n\nMaterial: ${profile.material_names?.join(', ') || profile.family.replaceAll('_',' ')}\nDescription: ${profile.description}\nOrigin: ${[profile.origin_city,profile.origin_state,profile.origin_country].filter(Boolean).join(', ') || 'Not supplied'}\nQuantity: ${profile.quantity_tonnes_per_month == null ? 'Not supplied' : profile.quantity_tonnes_per_month + ' tonnes/month'}\nKnown contaminants: ${profile.contaminants?.join(', ') || 'Not established'}\n\nCould you confirm:\n${candidate.questions_for_buyer.map((q,i)=>`${i+1}. ${q}`).join('\n')}\n4. Required sample, test reports and pre-treatment.\n5. A written buyer/processing quote, collection terms and validity period.\n\nListing source: ${f.source_url}\n\nPlease do not schedule a collection until technical, legal and commercial checks are complete.\n\nThank you.`;
}
