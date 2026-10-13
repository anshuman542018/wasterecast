const $ = (selector) => document.querySelector(selector);
const state = { profile: null, result: null, facilities: [] };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add('hidden'), 6500);
}
async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail;
    try { detail = (await response.json()).detail; } catch { detail = response.statusText; }
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${response.status})`);
  }
  return response.json();
}
function formatRupees(value) { return `₹${Number(value).toLocaleString('en-IN', {maximumFractionDigits:0})}`; }
function field(label, value) { return `<div class="field-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 'Not provided')}</strong></div>`; }
function renderProfile(profile) {
  $('#empty-state').classList.add('hidden');
  $('#profile-output').classList.remove('hidden');
  const evidence = profile.evidence?.length ? profile.evidence.map(item => `<div class="evidence-item"><small>${escapeHtml(item.field)} · ${escapeHtml(item.source_name)}${item.page ? ` · p.${item.page}` : ''}</small>“${escapeHtml(item.quote)}”</div>`).join('') : '<p>No document quote was supplied. Check the profile against the source before acting.</p>';
  $('#profile-output').innerHTML = `
    <div class="confidence"><span>${profile.source_mode === 'gemini' ? 'Gemini extraction confidence' : 'Manual screening · no AI extraction'}</span><strong>${profile.source_mode === 'gemini' ? Math.round(profile.confidence * 100) + '%' : 'MANUAL'}</strong></div>
    ${field('Material family', profile.family.replaceAll('_',' '))}
    ${field('Constituents', profile.material_names?.length ? profile.material_names.join(', ') : null)}
    ${field('Contaminants', profile.contaminants?.length ? profile.contaminants.join(', ') : 'Not established')}
    ${field('Hazard status', profile.hazard_indicated === null ? 'Not established' : profile.hazard_indicated ? 'Indicated in supplied evidence' : 'Not indicated in supplied evidence')}
    ${field('Volume', profile.quantity_tonnes_per_month === null ? null : profile.quantity_tonnes_per_month + ' tonnes/month')}
    ${field('Flash point', profile.flash_point_c === null ? 'Not documented' : profile.flash_point_c + '°C')}
    ${field('Origin', [profile.origin_city, profile.origin_state].filter(Boolean).join(', ') || null)}
    <div class="evidence-list"><strong>Source evidence</strong>${evidence}</div>
    <div id="chemical-references" class="evidence-list hidden"><strong>Live PubChem identity references</strong><div id="chemical-reference-list"></div><small>Compound identity does not verify the composition of this waste stream.</small></div>
    <div class="evidence-list"><strong>Still to confirm</strong><p>${escapeHtml(profile.missing_facts?.join(' · ') || 'Current permit, accepted chemistry, available capacity, and commercial terms.')}</p></div>
    <button id="find-matches" class="primary-btn" type="button">Screen the catalog <span>↗</span></button>`;
  $('#find-matches').addEventListener('click', runMatches);
  if (profile.source_mode === 'gemini' && profile.material_names?.length) loadChemicals(profile.material_names.slice(0,3));
}
async function loadChemicals(names) {
  const results = await Promise.allSettled(names.map(name => request('/api/chemicals?name=' + encodeURIComponent(name))));
  const found = results.filter(item => item.status === 'fulfilled' && item.value.result).map(item => item.value.result);
  if (!found.length) return;
  $('#chemical-reference-list').innerHTML = found.map(item => `<div class="evidence-item"><a href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.query)} · PubChem CID ${item.cid} ↗</a><br>${escapeHtml(item.molecular_formula || '')} · ${escapeHtml(item.molecular_weight || '')} g/mol</div>`).join('');
  $('#chemical-references').classList.remove('hidden');
}
function economics() {
  const number = selector => { const raw = $(selector).value.trim(); return raw === '' ? null : Number(raw); };
  return { quote_facility_id: $('#quoted-facility').value || null, disposal_cost_inr_per_tonne: number('#disposal-cost'), buyer_quote_inr_per_tonne: number('#buyer-quote'), transport_quote_inr_per_tonne: number('#transport-quote'), pretreatment_quote_inr_per_tonne: number('#pretreatment-quote') };
}
async function runMatches() {
  if (!state.profile) return;
  try {
    const result = await request('/api/matches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({profile:state.profile, economics:economics(), max_results:30})});
    state.result = result;
    renderMatches(result);
    $('#results').classList.remove('hidden');
    $('#results').scrollIntoView({behavior:'smooth'});
  } catch (error) { toast(error.message, true); }
}
function renderMatches(result) {
  $('#results-count').textContent = `${result.candidates.length} screening candidates from ${result.catalog_count} public listings`;
  const selected = $('#quoted-facility').value;
  $('#quoted-facility').innerHTML = '<option value="">Select a screened facility</option>' + result.candidates.filter(item => item.status !== 'rejected').map(item => `<option value="${escapeHtml(item.facility.id)}">${escapeHtml(item.facility.name)} · ${escapeHtml(item.facility.city_or_district)}</option>`).join('');
  $('#quoted-facility').value = selected;
  const selectedCandidate = result.candidates.find(item => item.facility.id === selected);
  $('#value-total').textContent = selectedCandidate?.economics.annual_net_inr == null ? 'Pending quotes' : formatRupees(selectedCandidate.economics.annual_net_inr);
  $('#candidate-list').innerHTML = result.candidates.length ? result.candidates.map((candidate, index) => {
    const facility = candidate.facility;
    return `<article class="candidate ${candidate.status === 'rejected' ? 'rejected' : ''}" data-index="${index}"><span class="rank">${String(candidate.rank).padStart(2,'0')}</span><div><h3>${escapeHtml(facility.name)}</h3><div class="meta">${escapeHtml(facility.city_or_district)}, ${escapeHtml(facility.state)} · ${escapeHtml(facility.capacity_value ? `${facility.capacity_value.toLocaleString('en-IN')} ${facility.capacity_unit || ''} listed capacity` : 'Capacity not stated')}</div><p>${escapeHtml(facility.process || 'Process not detailed')} · ${escapeHtml(candidate.reasons.join(' '))}</p><span class="badge">${candidate.status === 'rejected' ? 'REJECTED BY DOCUMENTED CONDITION' : 'CURRENT AUTHORIZATION REQUIRED'}</span><p><a href="${escapeHtml(facility.source_url)}" target="_blank" rel="noopener noreferrer">Board source · PDF p.${facility.source_page} ↗</a></p><p class="explanation hidden"></p></div><div class="candidate-actions"><button data-action="explain" data-index="${index}">Gemini fit note</button><button data-action="dossier" data-index="${index}">Open dossier ↗</button></div></article>`;
  }).join('') : '<p>No facility with this material family appears in the available public catalog. Try another family or wait for a new board source.</p>';
}
function manualProfile() {
  const text = $('#description').value.trim();
  if (!text) { toast('Add a material description first.', true); return; }
  const low = text.toLowerCase();
  const family = /solvent|toluene|xylene|ipa|acetone/.test(low) ? 'spent_solvent' : /waste oil/.test(low) ? 'waste_oil' : /used oil|lubricant/.test(low) ? 'used_oil' : /plastic|polymer|pet|hdpe/.test(low) ? 'plastic' : /metal|aluminium|copper|steel/.test(low) ? 'metal' : 'other';
  const quantity = $('#quantity').value.trim();
  const flash = $('#flash-point').value.trim();
  state.profile = {description:text,family,material_names:[],contaminants:[],hazard_indicated:null,quantity_tonnes_per_month:quantity ? Number(quantity) : null,origin_city:$('#origin-city').value.trim() || null,origin_state:$('#origin-state').value.trim() || null,moisture_pct:null,flash_point_c:flash ? Number(flash) : null,evidence:[],missing_facts:['Composition and contaminants require document analysis','Current authorization and buyer specifications require confirmation'],confidence:0,source_mode:'manual'};
  renderProfile(state.profile);
  toast('Manual screening ready. This profile was not created by Gemini.');
}
async function submitProfile(event) {
  event.preventDefault();
  const button = $('#profile-button');
  button.disabled = true;
  button.innerHTML = 'Reading material…';
  try {
    const form = new FormData($('#profile-form'));
    if (!$('#document').files.length) form.delete('document');
    if (!$('#quantity').value.trim()) form.delete('quantity_tonnes_per_month');
    if (!$('#flash-point').value.trim()) form.delete('flash_point_c');
    state.profile = await request('/api/profile', {method:'POST', body:form});
    renderProfile(state.profile);
    toast('Gemini profile is ready. Check the evidence before screening.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.innerHTML = 'Profile with Gemini <span>↗</span>'; }
}
async function candidateAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !state.result) return;
  const candidate = state.result.candidates[Number(button.dataset.index)];
  const body = JSON.stringify({profile:state.profile,facility_id:candidate.facility.id,economics:economics()});
  if (button.dataset.action === 'explain') {
    button.disabled = true;
    button.textContent = 'Gemini is reasoning…';
    try {
      const data = await request('/api/explain', {method:'POST',headers:{'Content-Type':'application/json'},body});
      const box = button.closest('.candidate').querySelector('.explanation');
      box.textContent = data.text;
      box.classList.remove('hidden');
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = 'Gemini fit note'; }
  } else {
    try {
      const response = await fetch('/api/dossier',{method:'POST',headers:{'Content-Type':'application/json'},body});
      if (!response.ok) throw new Error('Could not prepare dossier');
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { toast(error.message, true); }
  }
}
async function start() {
  $('#profile-form').addEventListener('submit', submitProfile);
  $('#manual-button').addEventListener('click', manualProfile);
  $('#recalculate').addEventListener('click', runMatches);
  $('#candidate-list').addEventListener('click', candidateAction);
  $('#document').addEventListener('change', () => { $('#file-name').textContent = $('#document').files[0]?.name || 'No file selected'; });
  $('#scenario-button').addEventListener('click', () => {
    $('#description').value = 'Illustrative scenario: 12 tonnes per month of spent reactor-wash solvent containing toluene and isopropyl alcohol. Water content, halogen content, and contaminant analysis are not yet available.';
    $('#origin-city').value = 'Pune'; $('#origin-state').value = 'Maharashtra'; $('#quantity').value = '12';
    toast('Scenario loaded. These inputs describe no real factory.');
  });
  try {
    const [health, catalog] = await Promise.all([request('/api/health'), request('/api/catalog?limit=1')]);
    $('#facility-count').textContent = catalog.total.toLocaleString('en-IN');
    $('#source-count').textContent = String(catalog.sources.length).padStart(2, '0');
    const status = $('#cloud-status');
    status.innerHTML = `<i></i> ${health.gemini_configured ? 'Gemini configured' : 'Catalog preview'}`;
    status.classList.toggle('online', health.gemini_configured);
    $('#source-list').innerHTML = catalog.sources.map(source => `<a class="source-item" target="_blank" rel="noopener noreferrer" href="${escapeHtml(source.url)}"><h3>${escapeHtml(source.title)}</h3><p>${source.facility_count.toLocaleString('en-IN')} facility records · Retrieved ${escapeHtml(source.retrieved_at.slice(0,10))}.${source.refresh_error ? ' Latest refresh failed; using the prior snapshot.' : ''} Listings require a current authorization check.</p><span class="arrow">↗</span></a>`).join('');
  } catch (error) { toast('Could not load the source catalog: ' + error.message, true); }
}
start();
