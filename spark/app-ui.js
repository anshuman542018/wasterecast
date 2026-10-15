import {MATERIAL_FAMILIES, classifyMaterial, possiblePathways} from './materials.js';
import {t,initPreferences,applyLanguage,setTheme,getLanguage,familyName} from './preferences.js';
import {publicContacts,safeWebUrl,workspaceKey,VERIFICATION_ITEMS,verificationProgress,enquiryText} from './lead-tools.js';
import {initAssistant} from './assistant-controller.js';
const $ = (selector) => document.querySelector(selector);
const state = { profile: null, result: null, facilities: [], visibleLeads:5 };
let saved=[];
try{const data=JSON.parse(localStorage.getItem('wr-saved-leads') || '[]');if(Array.isArray(data))saved=data.filter(x=>x && x.key && x.candidate?.facility && x.profile).slice(0,30);}catch{}
let activePreparation=null;
const L=key=>escapeHtml(t(key));

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
function formatMoney(value) { return new Intl.NumberFormat(getLanguage(),{style:'currency',currency:state.profile?.currency || 'INR',maximumFractionDigits:0}).format(value); }
function formSignature(){return JSON.stringify(Array.from(new FormData($('#profile-form'))).map(([key,value])=>[key,value instanceof File?(value.size?[value.name,value.size,value.lastModified]:null):value]));}
function assessmentSummary(assessment) {
  return /unknown from source/i.test(assessment.route_hypothesis)
    ? `Gemini asks: ${assessment.key_unknown || 'Confirm the accepted material specifications.'}`
    : `Gemini suggests: ${assessment.route_hypothesis}`;
}
function field(label, value) { return `<div class="field-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 'Not provided')}</strong></div>`; }
function renderProfile(profile,reset=true) {
  if(reset){
  state.result = null;
  $('#results').classList.add('hidden');
  $('#cost-fields').classList.add('hidden');
  $('#cost-empty').classList.remove('hidden');
  $('#quoted-facility').value = '';
  for (const selector of ['#buyer-quote','#transport-quote','#pretreatment-quote']) $(selector).value='';
  }
  $('#empty-state').classList.add('hidden');
  $('#profile-output').classList.remove('hidden');
  const evidence = profile.evidence?.length ? profile.evidence.map(item => `<div class="evidence-item"><small>${escapeHtml(item.field)} · ${escapeHtml(item.source_name)}${item.page ? ` · p.${item.page}` : ''}</small>“${escapeHtml(item.quote)}”</div>`).join('') : '<p>No document quote was supplied. Check the profile against the source before acting.</p>';
  $('#profile-output').innerHTML = `
    <div class="profile-summary"><span>${profile.source_mode === 'gemini' ? 'EXTRACTED BY GEMINI · REVIEW BEFORE SCREENING' : 'MANUAL PROFILE · NO AI EXTRACTION'}</span><h4>${escapeHtml(familyName(profile.family))}</h4><p>${escapeHtml(profile.material_names?.length ? profile.material_names.join(', ') : 'Material identity needs confirmation.')}</p></div>
    ${field(t('quantity'), profile.quantity_tonnes_per_month == null ? 'Not provided' : profile.quantity_tonnes_per_month + ' tonnes/month')}
    ${field(t('city'), [profile.origin_city, profile.origin_state, window.wasteRecast.countries[profile.origin_country]?.name].filter(Boolean).join(', ') || null)}
    <div class="profile-next"><strong>${L('next')}</strong><ul>${(profile.missing_facts?.length ? profile.missing_facts : ['Accepted composition, capacity and terms']).slice(0,3).map(fact=>`<li>${escapeHtml(fact)}</li>`).join('')}</ul></div>
    <details class="profile-details"><summary>${L('evidence')}</summary>
    ${field('Contaminants', profile.contaminants?.length ? profile.contaminants.join(', ') : 'Not established')}
    ${field('Hazard status', profile.hazard_indicated === null ? 'Not established' : profile.hazard_indicated ? 'Indicated in supplied evidence' : 'Not indicated in supplied evidence')}
    ${profile.flash_point_c == null ? '' : field('Flash point', profile.flash_point_c + '°C')}
    <div class="evidence-list"><strong>${L('route')}</strong><p>${possiblePathways(profile.family).map(escapeHtml).join(' · ')}</p><small>These are process ideas for this material family, not verified buyers or claims that your stream is suitable.</small></div>
    <div class="evidence-list"><strong>Source evidence</strong>${evidence}</div>
    <div id="chemical-references" class="evidence-list hidden"><strong>Live PubChem identity references</strong><div id="chemical-reference-list"></div><small>Compound identity does not verify the composition of this waste stream.</small></div>
    <div class="evidence-list"><strong>All missing facts</strong><p>${escapeHtml(profile.missing_facts?.join(' · ') || 'Current permit, accepted chemistry, available capacity, and commercial terms.')}</p></div>
    ${profile.source_mode === 'gemini' ? `<small>Gemini reports ${Math.round(profile.confidence * 100)}% extraction confidence. This is a model estimate, not a verified accuracy or compatibility score.</small>` : ''}</details>
    <button id="find-matches" class="primary-btn" type="button">${L('find')} <span>↗</span></button>`;
  $('#find-matches').addEventListener('click', runMatches);
  if (profile.source_mode === 'gemini' && profile.material_names?.length) loadChemicals(profile.material_names.slice(0,3));
}
async function loadChemicals(names) {
  const profile=state.profile;
  const results = await Promise.allSettled(names.map(name => request('/api/chemicals?name=' + encodeURIComponent(name))));
  const found = results.filter(item => item.status === 'fulfilled' && item.value.result).map(item => item.value.result);
  if (!found.length || state.profile!==profile) return;
  $('#chemical-reference-list').innerHTML = found.map(item => `<div class="evidence-item"><a href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.query)} · PubChem CID ${item.cid} ↗</a><br>${escapeHtml(item.molecular_formula || '')} · ${escapeHtml(item.molecular_weight || '')} g/mol</div>`).join('');
  $('#chemical-references').classList.remove('hidden');
}
function economics() {
  const number = selector => { const raw = $(selector).value.trim(); return raw === '' ? null : Number(raw); };
  return { quote_facility_id: $('#quoted-facility').value || null, disposal_cost_inr_per_tonne: number('#disposal-cost'), buyer_quote_inr_per_tonne: number('#buyer-quote'), transport_quote_inr_per_tonne: number('#transport-quote'), pretreatment_quote_inr_per_tonne: number('#pretreatment-quote') };
}
async function runMatches() {
  if (!state.profile || state.searching) return false;
  if(state.profileForm!==formSignature()){toast('Your material or location changed. Run a new material profile before searching.',true);return false;}
  state.searching=true;
  const profile=state.profile;
  const matchButton=$('#find-matches');if(matchButton)matchButton.disabled=true;
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
    if(state.profile!==profile)return false;
    state.result = result;
    state.visibleLeads = 5;
    renderMatches(result);
    $('#results').classList.remove('hidden');
    $('#results').scrollIntoView({behavior:'smooth'});
    return true;
  } catch (error) { toast(error.message, true);return false; }
  finally{state.searching=false;if(matchButton?.isConnected)matchButton.disabled=false;}
}
function contactMarkup(facility){
  const c=publicContacts(facility);
  const links=[c.phone ? `<a href="tel:${escapeHtml(c.phone.replace(/[^+\d]/g,''))}">${L('phone')}: ${escapeHtml(c.phone)}</a>`:'',c.email ? `<a href="mailto:${escapeHtml(c.email)}">${L('email')}: ${escapeHtml(c.email)}</a>`:'',c.website ? `<a href="${escapeHtml(c.website)}" target="_blank" rel="noopener noreferrer">${L('website')} ↗</a>`:''].filter(Boolean).join('');
  return `<div class="public-contact"><strong>${L('contact')}</strong>${c.address?`<p>${escapeHtml(c.address)}</p>`:''}<div class="contact-links">${links}</div>${!c.phone&&!c.email?`<p class="contact-missing">${L('noContact')}</p>`:''}${c.address?`<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([facility.name,c.address,facility.city_or_district,facility.state].join(', '))}">${L('directions')} ↗</a>`:''}${c.source_url?`<a href="${escapeHtml(c.source_url)}" target="_blank" rel="noopener noreferrer">${L('contactSource')}${facility.public_contact?.source_page ? ' · PDF p.'+Number(facility.public_contact.source_page):''} ↗</a>`:''}<small>Public record · ${escapeHtml(c.checked_at || 'date not stated')} · confirm before use</small></div>`;
}
function renderMatches(result) {
  const filter = $('#results-filter').value;
  const filtered = result.candidates.map((candidate,index)=>({candidate,index})).filter(({candidate})=>filter === 'all' || (filter === 'rejected' ? candidate.status === 'rejected' : candidate.status !== 'rejected'));
  const visible = filtered.slice(0,state.visibleLeads);
  $('#results-count').textContent = `${filtered.length} ${filter === 'rejected' ? t('excluded') : t('leads')} · showing ${visible.length}`;
  $('#show-more-leads').classList.toggle('hidden',visible.length === filtered.length);
  const selected = $('#quoted-facility').value;
  $('#quoted-facility').innerHTML = '<option value="">Select a screened facility</option>' + result.candidates.filter(item => item.status !== 'rejected').map(item => `<option value="${escapeHtml(item.facility.id)}">${escapeHtml(item.facility.name)} · ${escapeHtml(item.facility.city_or_district)}</option>`).join('');
  $('#quoted-facility').value = selected;
  const selectedCandidate = result.candidates.find(item => item.facility.id === selected);
  $('#value-total').textContent = selectedCandidate?.economics.annual_net_inr == null ? t('pending') : formatMoney(selectedCandidate.economics.annual_net_inr);
  $('#candidate-list').innerHTML = visible.length ? visible.map(({candidate,index}) => {
    const facility = candidate.facility;
    const rejected = candidate.status === 'rejected';
    const assessment = candidate.ai_assessment;
    const process = facility.process || 'Process not specified';
    const sourceLabel = facility.listing_type === 'public_dropoff' ? t('dropoff') : facility.source_type === 'osm' ? t('map') : t('board');
    const record=saved.find(x=>x.key===workspaceKey(state.profile,facility));
    const next=rejected ? t('conflict') : facility.listing_type==='public_dropoff' ? t('askPublic') : t('askAcceptance');
    return `<article class="candidate ${rejected ? 'rejected' : ''}" data-index="${index}"><div class="candidate-heading"><span class="rank">${String(candidate.rank).padStart(2,'0')}</span><div><h3>${escapeHtml(facility.name)}</h3><div class="meta">${escapeHtml(facility.city_or_district)}, ${escapeHtml(facility.state)}</div></div><span class="source-pill">${escapeHtml(sourceLabel)}</span></div>
      <div class="lead-route"><span>${L('process')}</span><p>${escapeHtml(process.length>145?process.slice(0,142)+'…':process)}</p></div>
      <div class="lead-next"><strong>${L('next')}</strong><p>${escapeHtml(next)}</p>${record?`<small>${verificationProgress(record.checks)}/4 ${L('progress')}</small>`:''}</div>
      <p class="ai-summary ${assessment ? '' : 'hidden'}">${assessment ? escapeHtml(assessmentSummary(assessment)) : ''}</p>
      <div class="candidate-actions">${rejected?'':`<button class="compare-btn" data-action="prepare" data-index="${index}">${L('prepare')} ↗</button><button data-action="cost" data-index="${index}">${L('compare')}</button><button data-action="save" data-index="${index}" aria-pressed="${Boolean(record)}">${record?'✓ ':''}${L('save')}</button>`}</div>
      <details class="lead-details"><summary>${L('evidence')}</summary><strong>${L('why')}</strong><p>${escapeHtml(candidate.reasons.join(' '))}</p><p>${L('capacityLabel')}: ${escapeHtml(facility.capacity_value?`${facility.capacity_value.toLocaleString('en-IN')} ${facility.capacity_unit || ''}`:t('notStated'))}</p><ol>${candidate.questions_for_buyer.map(question=>`<li>${escapeHtml(question)}</li>`).join('')}</ol><a href="${escapeHtml(safeWebUrl(facility.source_url) || '#')}" target="_blank" rel="noopener noreferrer">${facility.source_type==='osm'?'Open map record':`Open board source · PDF p.${facility.source_page}`} ↗</a><div class="ai-assessment ${assessment?'':'hidden'}">${assessment?`<p>${escapeHtml(assessment.source_basis)}</p><p>${escapeHtml(assessment.key_unknown)}</p>`:''}</div><p class="explanation ${candidate.fit_note?'':'hidden'}">${escapeHtml(candidate.fit_note || '')}</p><div class="candidate-actions"><button data-action="explain" data-index="${index}">${L('fit')}</button><button data-action="dossier" data-index="${index}">${L('report')} ↗</button></div></details>
      <details class="lead-details"><summary>${L('contact')}</summary>${contactMarkup(facility)}</details></article>`;
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
  state.profileForm=formSignature();
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
    const signature=formSignature();
    const form = new FormData($('#profile-form'));
    if (!$('#document').files.length) form.delete('document');
    if (!$('#quantity').value.trim()) form.delete('quantity_tonnes_per_month');
    if (!$('#flash-point').value.trim()) form.delete('flash_point_c');
    const profile = await request('/api/profile', {method:'POST', body:form});
    if(signature!==formSignature())throw new Error('Your inputs changed while Gemini was working. Please run the profile again.');
    state.profile=profile;state.profileForm=signature;
    renderProfile(state.profile);
    connection.textContent = 'Gemini profile ready · review the extracted facts and evidence.';
    toast('Gemini profile is ready. Check the evidence before screening.');
    return true;
  } catch (error) { connection.textContent = error.message; toast(error.message, true);return false; }
  finally { button.disabled = false; button.textContent = t('profile'); }
}
async function candidateAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !state.result) return;
  const candidate = state.result.candidates[Number(button.dataset.index)];
  if (button.dataset.action === 'cost') { openCosts(candidate); return; }
  if (button.dataset.action === 'save') { saveLead(candidate);renderMatches(state.result);return; }
  if (button.dataset.action === 'prepare') { openPreparation(state.profile,candidate);return; }
  const body = JSON.stringify({profile:state.profile,facility_id:candidate.facility.id,economics:economics()});
  if (button.dataset.action === 'explain') {
    button.disabled = true;
    button.textContent = 'Gemini is reasoning…';
    try {
      const data = await request('/api/explain', {method:'POST',headers:{'Content-Type':'application/json'},body});
      candidate.fit_note = data.text;
      if(!state.result?.candidates.includes(candidate))return;
      const card=document.querySelector(`.candidate[data-index="${state.result.candidates.indexOf(candidate)}"]`);
      const box = card?.querySelector('.explanation');
      if(!box)return;
      box.textContent = data.text;
      box.classList.remove('hidden');
      card.querySelector('.lead-details').open = true;
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = t('fit'); }
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
    const current=state.result;
    const response = await request('/api/prioritize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:state.profile,candidates:current.candidates})});
    if(state.result!==current)return;
    for (const assessment of response.assessments) {
      const index = state.result.candidates.findIndex(item=>item.facility.id === assessment.facility_id);
      if (index >= 0) state.result.candidates[index].ai_assessment = assessment;
    }
    renderMatches(state.result);
    toast('Gemini route summaries are ready. Open Evidence & checks for the reasoning.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled=false; button.textContent=t('assess'); }
}
function persistSaved(){
  try{localStorage.setItem('wr-saved-leads',JSON.stringify(saved));}catch{toast('This browser could not save locally. Export your enquiry before closing.',true);}
  $('#saved-count').textContent=String(saved.length);
}
function saveLead(candidate,profile=state.profile){
  const key=workspaceKey(profile,candidate.facility);
  let record=saved.find(item=>item.key===key);
  if(!record){
    if(saved.length>=30)throw new Error('You have 30 saved leads. Remove one before saving another.');
    record={key,profile:structuredClone(profile),candidate:structuredClone(candidate),checks:{},saved_at:new Date().toISOString()};
    saved.push(record);persistSaved();
  }
  return record;
}
function openPreparation(profile,candidate){
  activePreparation={profile,candidate};
  const record=saved.find(x=>x.key===workspaceKey(profile,candidate.facility));
  $('#lead-dialog-body').innerHTML=`<h3>${escapeHtml(candidate.facility.name)}</h3><p data-i18n="draftNote">${L('draftNote')}</p>${contactMarkup(candidate.facility)}<section class="verification-list"><h3>${L('progress')} · <span id="check-progress">${verificationProgress(record?.checks)}/4</span></h3><p>${L('verifyNote')}</p>${VERIFICATION_ITEMS.map(key=>`<label><input type="checkbox" data-check="${key}" ${record?.checks?.[key]?'checked':''}> ${L(key)}</label>`).join('')}</section><label for="enquiry-draft">${L('prepare')}</label><textarea id="enquiry-draft" rows="10"></textarea><div class="candidate-actions"><button id="copy-enquiry" class="secondary-btn" type="button">${L('copy')}</button><button id="save-enquiry" class="utility-btn" type="button">${L('save')}</button><button id="print-enquiry" class="utility-btn" type="button">${L('print')}</button></div>`;
  $('#enquiry-draft').value=record?.draft || enquiryText(profile,candidate);
  if($('#assistant-dialog').open)$('#assistant-dialog').close();
  if(!$('#lead-dialog').open)$('#lead-dialog').showModal();
}
function renderSaved(){
  $('#saved-list').innerHTML=saved.length?saved.map((record,i)=>`<article class="saved-item"><h3>${escapeHtml(record.candidate.facility.name)}</h3><p>${escapeHtml(record.profile.family.replaceAll('_',' '))} · ${escapeHtml(record.profile.origin_city || '')}</p><small>${verificationProgress(record.checks)}/4 ${L('progress')}</small><div class="candidate-actions"><button data-saved-open="${i}" class="secondary-btn" type="button">${L('prepare')}</button><button data-saved-remove="${i}" class="utility-btn" type="button">${L('remove')}</button></div></article>`).join(''):`<p>${L('noSaved')}</p>`;
}
function openSaved(){renderSaved();$('#saved-dialog').showModal();}
function resultsSummary(){
  const leads=state.result?.candidates.filter(x=>x.status!=='rejected') || [];
  if(!leads.length)return 'No recovery leads are available yet. Describe your material and choose a city, then find leads.';
  return `${leads.length} ${t('leads')}. ${leads.slice(0,3).map((x,i)=>`${i+1}. ${x.facility.name}, ${x.facility.city_or_district}`).join('. ')}. ${t('askAcceptance')}`;
}
async function executeAssistant(command){
  const {action}=command;
  if(action==='help')return t('voiceHelp');
  if(action==='set_theme'){setTheme(command.theme);return command.theme==='light'?t('theme'):t('dark');}
  if(action==='set_language'){applyLanguage(command.language);return t('voiceHelp');}
  if(['search','profile','set_location','set_quantity'].includes(action)){
    if(action==='search'){
      // A newly spoken stream must not inherit another stream's quantity, assay or file.
      $('#quantity').value='';$('#flash-point').value='';$('#document').value='';$('#file-name').textContent='No file selected';$('#material-family').value='auto';
      if(command.city && !command.state)$('#origin-state').value='';
      if(command.country && command.country!==$('#origin-country').value){$('#origin-city').value='';$('#origin-state').value='';}
    }
    if(command.description)$('#description').value=command.description;
    if(command.country){if(!window.wasteRecast.countries[command.country])throw new Error('Country is not recognized.');$('#origin-country').value=command.country;$('#origin-country').dispatchEvent(new Event('change'));}
    if(command.city)$('#origin-city').value=command.city;
    if(command.state)$('#origin-state').value=command.state;
    if(command.quantity!=null)$('#quantity').value=command.quantity;
    if(action==='set_location'||action==='set_quantity')return 'Updated. Run a new material profile to apply the change to your leads.';
    if(!$('#description').value.trim()&&!$('#document').files.length)throw new Error('Describe the material first.');
    if(!(await submitProfile({preventDefault(){}})))throw new Error($('#ai-connection-status').textContent);
    if(action==='profile')return $('#profile-output').innerText;
    if(!(await runMatches()))throw new Error('Could not retrieve recovery leads. Check the connection message and location.');
    return resultsSummary();
  }
  if(action==='find_leads'){
    if(!state.profile)throw new Error('Profile your material first, or say “Find leads for polypropylene in Pune, India”.');
    if(!(await runMatches()))throw new Error('The lead search could not finish. Check your location or try again.');
    return resultsSummary();
  }
  if(action==='read_results')return resultsSummary();
  if(action==='show_more'){state.visibleLeads+=5;if(state.result)renderMatches(state.result);return resultsSummary();}
  if(action==='filter'){if(command.filter)$('#results-filter').value=command.filter;if(state.result)renderMatches(state.result);return resultsSummary();}
  if(action==='set_quotes'){
    if(!$('#quoted-facility').value)throw new Error('Choose a lead with Compare costs first.');
    for(const [key,id] of Object.entries({disposal:'disposal-cost',buyer:'buyer-quote',transport:'transport-quote',pretreatment:'pretreatment-quote'}))if(command[key]!=null)$('#'+id).value=command[key];
    return 'Entered only the quote amounts you supplied. Say calculate when you are ready.';
  }
  if(action==='calculate'){if(!$('#quoted-facility').value)throw new Error('Choose Compare costs on a lead first.');await recalculateQuotes();return `${t('annual')}: ${$('#value-total').textContent}`;}
  const filter=$('#results-filter').value;
  const visible=(state.result?.candidates || []).filter(x=>filter==='all'||(filter==='rejected'?x.status==='rejected':x.status!=='rejected')).slice(0,state.visibleLeads);
  const candidate=visible[(command.lead_number || 1)-1];
  if(!candidate)throw new Error('That lead number is not available in the current list.');
  if(candidate.status==='rejected'&&['save_lead','prepare_enquiry','compare'].includes(action))throw new Error(t('conflict'));
  if(action==='compare'){openCosts(candidate);return `${t('compare')}: ${candidate.facility.name}. ${t('pending')}`;}
  if(action==='save_lead'){saveLead(candidate);renderMatches(state.result);return `${t('saved')}: ${candidate.facility.name}`;}
  if(action==='prepare_enquiry'){openPreparation(state.profile,candidate);return t('draftNote');}
  if(action==='explain'){
    const profile=state.profile;
    const response=await request('/api/explain',{method:'POST',body:JSON.stringify({profile,facility_id:candidate.facility.id,economics:economics()})});
    if(state.profile===profile){candidate.fit_note=response.text;renderMatches(state.result);}
    return response.text;
  }
  return t('voiceHelp');
}
async function start() {
  document.querySelectorAll('[data-boot-disabled]').forEach(button=>{button.disabled=false;delete button.dataset.bootDisabled;});
  // Mark the primary controls for translation without changing source text.
  const labels={'#ai-shortlist':'assess','#show-more-leads':'more','.value-panel h3':'costTitle','#cost-empty p:first-child':'costIntro','#recalculate':'calculate','.value-total>span':'annual'};
  for(const [selector,key] of Object.entries(labels))$(selector)?.setAttribute('data-i18n',key);
  const inputLabels={'#material-family':'family','#flash-point':'flash','#disposal-cost':'disposal','#buyer-quote':'buyer','#transport-quote':'transport','#pretreatment-quote':'pretreatment'};
  for(const [id,key] of Object.entries(inputLabels)){
    const label=document.querySelector(`label[for="${id.slice(1)}"]`);
    if(label?.firstChild?.nodeType===Node.TEXT_NODE){const span=document.createElement('span');span.dataset.i18n=key;label.replaceChild(span,label.firstChild);}
  }
  for(const [i,key] of ['potential','excluded','all'].entries())$('#results-filter').options[i].dataset.i18n=key;
  initPreferences();persistSaved();
  document.addEventListener('wr-language',()=>{for(const option of $('#material-family').options){if(option.value!=='auto')option.textContent=familyName(option.value);}const display=new Intl.DisplayNames([getLanguage()],{type:'region'});for(const option of $('#origin-country').options)option.textContent=display.of(option.value);if(state.profile)renderProfile(state.profile,false);if(state.result)renderMatches(state.result);if($('#saved-dialog').open)renderSaved();});
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$('#'+button.dataset.close).close()));
  $('#saved-open').addEventListener('click',openSaved);$('#saved-banner').addEventListener('click',openSaved);
  $('#saved-list').addEventListener('click',event=>{
    const open=event.target.closest('[data-saved-open]'),remove=event.target.closest('[data-saved-remove]');
    if(open){const record=saved[Number(open.dataset.savedOpen)];$('#saved-dialog').close();openPreparation(record.profile,record.candidate);}
    if(remove){saved.splice(Number(remove.dataset.savedRemove),1);persistSaved();renderSaved();if(state.result)renderMatches(state.result);}
  });
  $('#lead-dialog-body').addEventListener('change',event=>{
    if(!event.target.matches('[data-check]')||!activePreparation)return;
    const record=saveLead(activePreparation.candidate,activePreparation.profile);
    record.checks[event.target.dataset.check]=event.target.checked;persistSaved();$('#check-progress').textContent=verificationProgress(record.checks)+'/4';
    if(state.result)renderMatches(state.result);
  });
  $('#lead-dialog-body').addEventListener('click',async event=>{
    try{
      if(event.target.closest('#copy-enquiry')){await navigator.clipboard.writeText($('#enquiry-draft').value);toast(t('copied'));}
      if(event.target.closest('#save-enquiry')&&activePreparation){const record=saveLead(activePreparation.candidate,activePreparation.profile);record.draft=$('#enquiry-draft').value;persistSaved();toast(t('saved'));if(state.result)renderMatches(state.result);}
      if(event.target.closest('#print-enquiry')){
        const printable=window.open('','_blank');if(!printable)throw new Error('Allow the report window to open, then retry.');
        printable.opener=null;
        printable.document.write(`<!doctype html><title>WasteRecast acceptance enquiry</title><style>body{font:12pt/1.6 Arial;max-width:760px;margin:40px auto;white-space:pre-wrap;color:#151719}button{display:block;margin-bottom:25px}@media print{button{display:none}}</style><button onclick="window.print()">Print / Save PDF</button><h1>WasteRecast acceptance enquiry</h1>${escapeHtml($('#enquiry-draft').value)}<p>Unverified screening enquiry. Review before sending.</p>`);printable.document.close();
      }
    }catch(error){toast(error.message,true);}
  });
  initAssistant({request,execute:executeAssistant});
  const countryNames = window.wasteRecast.countries;
  window.addEventListener('gemini-status',event=>{
    $('#ai-connection-status').classList.remove('hidden');
    $('#ai-connection-status').textContent = event.detail;
    toast(event.detail);
  });
  $('#material-family').innerHTML = '<option value="auto">Auto detect from description</option>' + MATERIAL_FAMILIES.map(family=>`<option value="${family}">${escapeHtml(familyName(family))}</option>`).join('');
  const countryDisplay=new Intl.DisplayNames([getLanguage()],{type:'region'});
  $('#origin-country').innerHTML = Object.entries(countryNames).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([code,item])=>`<option value="${escapeHtml(code)}">${escapeHtml(countryDisplay.of(code) || item.name)}</option>`).join('');
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
  document.body.setAttribute('aria-busy','false');
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
