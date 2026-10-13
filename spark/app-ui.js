import {MATERIAL_FAMILIES, classifyMaterial, possiblePathways} from './materials.js';
const $ = (selector) => document.querySelector(selector);
const state = { profile: null, result: null, facilities: [], visibleLeads:5 };

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
  return window.wasteRecast.request(url, options);
}
function formatMoney(value) { return new Intl.NumberFormat('en',{style:'currency',currency:state.profile?.currency || 'INR',maximumFractionDigits:0}).format(value); }
function assessmentSummary(assessment) {
  return /unknown from source/i.test(assessment.route_hypothesis)
    ? `Gemini asks: ${assessment.key_unknown || 'Confirm the accepted material specifications.'}`
    : `Gemini suggests: ${assessment.route_hypothesis}`;
}
function field(label, value) { return `<div class="field-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 'Not provided')}</strong></div>`; }
function renderProfile(profile) {
  state.result = null;
  $('#results').classList.add('hidden');
  $('#cost-fields').classList.add('hidden');
  $('#cost-empty').classList.remove('hidden');
  $('#quoted-facility').value = '';
  for (const selector of ['#buyer-quote','#transport-quote','#pretreatment-quote']) $(selector).value='';
  $('#empty-state').classList.add('hidden');
  $('#profile-output').classList.remove('hidden');
  const evidence = profile.evidence?.length ? profile.evidence.map(item => `<div class="evidence-item"><small>${escapeHtml(item.field)} · ${escapeHtml(item.source_name)}${item.page ? ` · p.${item.page}` : ''}</small>“${escapeHtml(item.quote)}”</div>`).join('') : '<p>No document quote was supplied. Check the profile against the source before acting.</p>';
  $('#profile-output').innerHTML = `
    <div class="profile-summary"><span>${profile.source_mode === 'gemini' ? 'EXTRACTED BY GEMINI · REVIEW BEFORE SCREENING' : 'MANUAL PROFILE · NO AI EXTRACTION'}</span><h4>${escapeHtml(profile.family.replaceAll('_',' '))}</h4><p>${escapeHtml(profile.material_names?.length ? profile.material_names.join(', ') : 'Material identity needs confirmation.')}</p></div>
    ${field('Quantity', profile.quantity_tonnes_per_month == null ? 'Not provided' : profile.quantity_tonnes_per_month + ' tonnes/month')}
    ${field('Origin', [profile.origin_city, profile.origin_state, window.wasteRecast.countries[profile.origin_country]?.name].filter(Boolean).join(', ') || null)}
    <div class="profile-next"><strong>Confirm before contacting a facility</strong><ul>${(profile.missing_facts?.length ? profile.missing_facts : ['Accepted composition, capacity and terms']).slice(0,3).map(fact=>`<li>${escapeHtml(fact)}</li>`).join('')}</ul></div>
    <details class="profile-details"><summary>Technical facts &amp; evidence</summary>
    ${field('Contaminants', profile.contaminants?.length ? profile.contaminants.join(', ') : 'Not established')}
    ${field('Hazard status', profile.hazard_indicated === null ? 'Not established' : profile.hazard_indicated ? 'Indicated in supplied evidence' : 'Not indicated in supplied evidence')}
    ${profile.flash_point_c == null ? '' : field('Flash point', profile.flash_point_c + '°C')}
    <div class="evidence-list"><strong>Possible reuse routes · require feasibility testing</strong><p>${possiblePathways(profile.family).map(escapeHtml).join(' · ')}</p><small>These are process ideas for this material family, not verified buyers or claims that your stream is suitable.</small></div>
    <div class="evidence-list"><strong>Source evidence</strong>${evidence}</div>
    <div id="chemical-references" class="evidence-list hidden"><strong>Live PubChem identity references</strong><div id="chemical-reference-list"></div><small>Compound identity does not verify the composition of this waste stream.</small></div>
    <div class="evidence-list"><strong>All missing facts</strong><p>${escapeHtml(profile.missing_facts?.join(' · ') || 'Current permit, accepted chemistry, available capacity, and commercial terms.')}</p></div>
    ${profile.source_mode === 'gemini' ? `<small>Gemini reports ${Math.round(profile.confidence * 100)}% extraction confidence. This is a model estimate, not a verified accuracy or compatibility score.</small>` : ''}</details>
    <button id="find-matches" class="primary-btn" type="button">Find recovery leads <span>↗</span></button>`;
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
    const hasIndiaListings = state.profile.origin_country === 'IN' && ['spent_solvent','used_oil','waste_oil','plastic','metal'].includes(state.profile.family);
    if (!hasIndiaListings) {
      const city = state.profile.origin_city;
      if (!city) throw new Error('Enter an origin city for nearby recycling discovery within 30 km.');
      toast('Searching open map recycling records near ' + city + '…');
      const discovery = await request(`/api/discover?country=${encodeURIComponent(state.profile.origin_country)}&city=${encodeURIComponent(city)}&family=${encodeURIComponent(state.profile.family)}`);
      $('#ranking-description').textContent = `OpenStreetMap discovery within 30 km of ${discovery.place.name}`;
      $('#source-list').innerHTML += `<a class="source-item" target="_blank" rel="noopener noreferrer" href="${escapeHtml(discovery.source.url)}"><h3>OpenStreetMap contributors</h3><p>${discovery.facilities.length} named recycling map records near ${escapeHtml(discovery.place.name)} · ${escapeHtml(discovery.attribution)}</p><span class="arrow">↗</span></a>`;
    } else $('#ranking-description').textContent = 'Ranked by state and district proximity';
    const result = await request('/api/matches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({profile:state.profile, economics:economics(), max_results:30})});
    state.result = result;
    state.visibleLeads = 5;
    renderMatches(result);
    $('#results').classList.remove('hidden');
    $('#results').scrollIntoView({behavior:'smooth'});
  } catch (error) { toast(error.message, true); }
}
function renderMatches(result) {
  const filter = $('#results-filter').value;
  const filtered = result.candidates.map((candidate,index)=>({candidate,index})).filter(({candidate})=>filter === 'all' || (filter === 'rejected' ? candidate.status === 'rejected' : candidate.status !== 'rejected'));
  const visible = filtered.slice(0,state.visibleLeads);
  $('#results-count').textContent = `${filtered.length} ${filter === 'rejected' ? 'excluded listings' : 'leads'} · showing ${visible.length}`;
  $('#show-more-leads').classList.toggle('hidden',visible.length === filtered.length);
  const selected = $('#quoted-facility').value;
  $('#quoted-facility').innerHTML = '<option value="">Select a screened facility</option>' + result.candidates.filter(item => item.status !== 'rejected').map(item => `<option value="${escapeHtml(item.facility.id)}">${escapeHtml(item.facility.name)} · ${escapeHtml(item.facility.city_or_district)}</option>`).join('');
  $('#quoted-facility').value = selected;
  const selectedCandidate = result.candidates.find(item => item.facility.id === selected);
  $('#value-total').textContent = selectedCandidate?.economics.annual_net_inr == null ? 'Pending quotes' : formatMoney(selectedCandidate.economics.annual_net_inr);
  $('#candidate-list').innerHTML = visible.length ? visible.map(({candidate,index}) => {
    const facility = candidate.facility;
    const rejected = candidate.status === 'rejected';
    const assessment = candidate.ai_assessment;
    const process = facility.process || 'Process not specified';
    const sourceLabel = facility.listing_type === 'public_dropoff' ? 'Public drop-off' : facility.source_type === 'osm' ? 'Map lead' : 'Board record';
    return `<article class="candidate ${rejected ? 'rejected' : ''}" data-index="${index}"><div class="candidate-heading"><span class="rank">${String(candidate.rank).padStart(2,'0')}</span><div><h3>${escapeHtml(facility.name)}</h3><div class="meta">${escapeHtml(facility.city_or_district)}, ${escapeHtml(facility.state)}</div></div><span class="source-pill">${sourceLabel}</span></div><div class="lead-facts"><div><span>Listed process</span><strong>${escapeHtml(process.length > 130 ? process.slice(0,127) + '…' : process)}</strong></div><div><span>Listed capacity</span><strong>${escapeHtml(facility.capacity_value ? `${facility.capacity_value.toLocaleString('en-IN')} ${facility.capacity_unit || ''}` : 'Not stated')}</strong></div></div><p class="lead-verdict">${rejected ? 'Excluded: the source specifies a conflicting process or condition.' : facility.source_type === 'osm' ? 'Material fit is not established by this map record.' : 'Listed for this material family · acceptance needs confirmation.'}</p><p class="ai-summary ${assessment ? '' : 'hidden'}">${assessment ? escapeHtml(assessmentSummary(assessment)) : ''}</p><details class="lead-details"><summary>Evidence &amp; checks</summary><p>${escapeHtml(candidate.reasons.join(' '))}</p><p>${escapeHtml(process)}</p><ol>${candidate.questions_for_buyer.map(question=>`<li>${escapeHtml(question)}</li>`).join('')}</ol><a href="${escapeHtml(facility.source_url)}" target="_blank" rel="noopener noreferrer">${facility.source_type === 'osm' ? 'Open map record' : `Open board source · PDF p.${facility.source_page}`} ↗</a><div class="ai-assessment ${assessment ? '' : 'hidden'}">${assessment ? `<p>Source basis: ${escapeHtml(assessment.source_basis)}</p><p>Confirm: ${escapeHtml(assessment.key_unknown)}</p>` : ''}</div><p class="explanation ${candidate.fit_note ? '' : 'hidden'}">${escapeHtml(candidate.fit_note || '')}</p></details><div class="candidate-actions">${rejected ? '' : `<button class="compare-btn" data-action="cost" data-index="${index}">Compare costs</button>`}<button data-action="explain" data-index="${index}">Ask Gemini about fit</button><button data-action="dossier" data-index="${index}">View report ↗</button></div></article>`;
  }).join('') : `<div class="no-leads"><h3>${filter === 'rejected' ? 'No exclusions in this shortlist.' : 'No source-backed leads found.'}</h3><p>${filter === 'rejected' ? 'Switch to potential leads to explore the results.' : 'Try a nearby city or check the material family. No buyer has been verified.'}</p></div>`;
}
function openCosts(candidate) {
  const select = $('#quoted-facility');
  if (select.value !== candidate.facility.id) {
    for (const selector of ['#buyer-quote','#transport-quote','#pretreatment-quote']) $(selector).value = '';
    $('#value-total').textContent = 'Pending quotes';
  }
  select.value = candidate.facility.id;
  $('#cost-selected').textContent = candidate.facility.name;
  $('#cost-empty').classList.add('hidden');
  $('#cost-fields').classList.remove('hidden');
  $('#cost-fields').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function recalculateQuotes() {
  if (!state.profile || !state.result) return;
  const button = $('#recalculate');
  button.disabled = true;
  try {
    const previous = new Map(state.result.candidates.map(item=>[item.facility.id,item]));
    const result = await request('/api/matches',{method:'POST',body:JSON.stringify({profile:state.profile,economics:economics(),max_results:30})});
    for (const candidate of result.candidates) {
      candidate.ai_assessment = previous.get(candidate.facility.id)?.ai_assessment;
      candidate.fit_note = previous.get(candidate.facility.id)?.fit_note;
    }
    state.result = result;
    renderMatches(result);
    toast('Quote calculation updated. Missing quotes keep the value pending.');
  } catch (error) { toast(error.message,true); }
  finally { button.disabled=false; }
}
function manualProfile() {
  const text = $('#description').value.trim();
  if (!text) { toast('Add a material description first.', true); return; }
  const selectedFamily = $('#material-family').value;
  const family = selectedFamily === 'auto' ? classifyMaterial(text) : selectedFamily;
  const quantity = $('#quantity').value.trim();
  const flash = $('#flash-point').value.trim();
  const origin_country = $('#origin-country').value;
  state.profile = {description:text,family,material_names:[],contaminants:[],hazard_indicated:null,quantity_tonnes_per_month:quantity ? Number(quantity) : null,origin_city:$('#origin-city').value.trim() || null,origin_state:$('#origin-state').value.trim() || null,origin_country,currency:window.wasteRecast.countries[origin_country]?.currency?.[0] || 'USD',moisture_pct:null,flash_point_c:flash ? Number(flash) : null,evidence:[],missing_facts:['Composition and contaminants require document analysis','Current authorization and buyer specifications require confirmation'],confidence:0,source_mode:'manual'};
  renderProfile(state.profile);
  toast('Manual screening ready. This profile was not created by Gemini.');
}
async function submitProfile(event) {
  event.preventDefault();
  const button = $('#profile-button');
  button.disabled = true;
  button.innerHTML = 'Reading material…';
  const connection = $('#ai-connection-status');
  connection.classList.remove('hidden');
  connection.textContent = 'Verifying this browser and asking Gemini to extract the material profile…';
  try {
    const form = new FormData($('#profile-form'));
    if (!$('#document').files.length) form.delete('document');
    if (!$('#quantity').value.trim()) form.delete('quantity_tonnes_per_month');
    if (!$('#flash-point').value.trim()) form.delete('flash_point_c');
    state.profile = await request('/api/profile', {method:'POST', body:form});
    renderProfile(state.profile);
    connection.textContent = 'Gemini profile ready · review the extracted facts and evidence.';
    toast('Gemini profile is ready. Check the evidence before screening.');
  } catch (error) { connection.textContent = error.message; toast(error.message, true); }
  finally { button.disabled = false; button.innerHTML = 'Profile with Gemini <span>↗</span>'; }
}
async function candidateAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !state.result) return;
  const candidate = state.result.candidates[Number(button.dataset.index)];
  if (button.dataset.action === 'cost') { openCosts(candidate); return; }
  const body = JSON.stringify({profile:state.profile,facility_id:candidate.facility.id,economics:economics()});
  if (button.dataset.action === 'explain') {
    button.disabled = true;
    button.textContent = 'Gemini is reasoning…';
    try {
      const data = await request('/api/explain', {method:'POST',headers:{'Content-Type':'application/json'},body});
      candidate.fit_note = data.text;
      const box = button.closest('.candidate').querySelector('.explanation');
      box.textContent = data.text;
      box.classList.remove('hidden');
      button.closest('.candidate').querySelector('.lead-details').open = true;
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = 'Ask Gemini about fit'; }
  } else {
    try {
      const response = await request('/api/dossier',{method:'POST',headers:{'Content-Type':'application/json'},body});
      const url = URL.createObjectURL(new Blob([response.html], {type:'text/html'}));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { toast(error.message, true); }
  }
}
async function assessShortlist() {
  if (!state.result?.candidates?.length) return;
  const button = $('#ai-shortlist');
  button.disabled = true;
  button.textContent = 'Gemini assessing evidence…';
  try {
    const response = await request('/api/prioritize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:state.profile,candidates:state.result.candidates})});
    for (const assessment of response.assessments) {
      const index = state.result.candidates.findIndex(item=>item.facility.id === assessment.facility_id);
      if (index >= 0) state.result.candidates[index].ai_assessment = assessment;
    }
    renderMatches(state.result);
    toast('Gemini route summaries are ready. Open Evidence & checks for the reasoning.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled=false; button.textContent='Ask Gemini to assess ↗'; }
}
async function start() {
  const countryNames = window.wasteRecast.countries;
  window.addEventListener('gemini-status',event=>{
    $('#ai-connection-status').classList.remove('hidden');
    $('#ai-connection-status').textContent = event.detail;
    toast(event.detail);
  });
  $('#material-family').innerHTML = '<option value="auto">Auto detect from description</option>' + MATERIAL_FAMILIES.map(family=>`<option value="${family}">${family.replaceAll('_',' ')}</option>`).join('');
  $('#origin-country').innerHTML = Object.entries(countryNames).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([code,item])=>`<option value="${escapeHtml(code)}">${escapeHtml(item.name)}</option>`).join('');
  $('#origin-country').value = 'IN';
  $('#origin-country').addEventListener('change', () => {
    const currency = countryNames[$('#origin-country').value]?.currency?.[0] || 'USD';
    document.querySelectorAll('[data-currency]').forEach(label => { label.textContent = `${currency} / tonne`; });
    $('#origin-city').placeholder = $('#origin-country').value === 'IN' ? 'Pune' : 'Enter a city for nearby discovery';
    $('#origin-state').placeholder = $('#origin-country').value === 'IN' ? 'Maharashtra' : 'Optional province';
  });
  $('#profile-form').addEventListener('submit', submitProfile);
  $('#manual-button').addEventListener('click', manualProfile);
  $('#recalculate').addEventListener('click', recalculateQuotes);
  $('#candidate-list').addEventListener('click', candidateAction);
  $('#results-filter').addEventListener('change',()=>{ state.visibleLeads = 5; if (state.result) renderMatches(state.result); });
  $('#show-more-leads').addEventListener('click',()=>{ state.visibleLeads += 5; if (state.result) renderMatches(state.result); });
  $('#close-costs').addEventListener('click',()=>{ $('#cost-fields').classList.add('hidden'); $('#cost-empty').classList.remove('hidden'); });
  $('#quoted-facility').addEventListener('change',()=>{ const candidate = state.result?.candidates.find(item=>item.facility.id === $('#quoted-facility').value); if (candidate) { for (const selector of ['#buyer-quote','#transport-quote','#pretreatment-quote']) $(selector).value=''; $('#value-total').textContent='Pending quotes'; openCosts(candidate); } });
  $('#ai-shortlist').addEventListener('click', assessShortlist);
  $('#document').addEventListener('change', () => { $('#file-name').textContent = $('#document').files[0]?.name || 'No file selected'; });
  $('#scenario-button').addEventListener('click', () => {
    $('#description').value = 'Illustrative scenario: 12 tonnes per month of spent reactor-wash solvent containing toluene and isopropyl alcohol. Water content, halogen content, and contaminant analysis are not yet available.';
    $('#origin-country').value = 'IN'; $('#origin-country').dispatchEvent(new Event('change'));
    $('#origin-city').value = 'Pune'; $('#origin-state').value = 'Maharashtra'; $('#quantity').value = '12';
    toast('Scenario loaded. These inputs describe no real factory.');
  });
  try {
    const [health, catalog] = await Promise.all([request('/api/health'), request('/api/catalog?limit=1')]);
    $('#facility-count').textContent = catalog.total.toLocaleString('en-IN');
    $('#source-count').textContent = String(catalog.sources.length).padStart(2, '0');
    const status = $('#cloud-status');
    status.innerHTML = `<i></i> ${escapeHtml(window.wasteRecast.getCatalogLocation())}`;
    status.classList.add('online');
    $('#source-list').innerHTML = catalog.sources.map(source => `<a class="source-item" target="_blank" rel="noopener noreferrer" href="${escapeHtml(source.url)}"><h3>${escapeHtml(source.title)}</h3><p>${source.facility_count.toLocaleString('en-IN')} facility records · Retrieved ${escapeHtml(source.retrieved_at.slice(0,10))}.${source.refresh_error ? ' Latest refresh failed; using the prior snapshot.' : ''} Listings require a current authorization check.</p><span class="arrow">↗</span></a>`).join('');
  } catch (error) { toast('Could not load the source catalog: ' + error.message, true); }
}
start();
