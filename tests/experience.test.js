import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicContacts,safeWebUrl,workspaceKey,verificationProgress,enquiryText} from '../spark/lead-tools.js';
import {validateAssistantCommand,localAssistantCommand} from '../spark/assistant-core.js';
import {dictionaries} from '../spark/preferences.js';

test('public contacts cannot inject executable URLs, mail headers or phone commands',()=>{
  assert.equal(safeWebUrl('javascript:alert(1)'),null);
  assert.equal(safeWebUrl('https://user:password@example.com'),null);
  const data=publicContacts({source_url:'https://board.example/record',address:'Public industrial estate',public_contact:{email:'help@example.com\r\nBcc:other@example.com',phone:'123;alert(1)',website:'data:text/html,unsafe'}});
  assert.equal(data.email,null);assert.equal(data.phone,null);assert.equal(data.website,null);
  assert.equal(data.source_url,'https://board.example/record');
});
test('TNPCB contact overlay corresponds to the exact sourced catalog entities',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../spark/public/catalog.json',import.meta.url)));
  const contacts=JSON.parse(readFileSync(new URL('../spark/public/contacts.json',import.meta.url)));
  assert.equal(Object.keys(contacts).length,12);
  for(const [id,contact] of Object.entries(contacts)){
    const facility=catalog.facilities.find(x=>x.id===id);
    assert.ok(facility);assert.equal(facility.source_url,contact.source_url);
    assert.ok([1,2,3].includes(contact.source_page));
    assert.ok(publicContacts({...facility,public_contact:contact}).email);
  }
});
test('verification is explicit and material-specific; it never certifies compatibility',()=>{
  const profile={description:'PP offcuts',family:'plastic',origin_city:'Pune',quantity_tonnes_per_month:5};
  const facility={id:'one'};
  assert.notEqual(workspaceKey(profile,facility),workspaceKey({...profile,description:'PVC offcuts'},facility));
  assert.notEqual(workspaceKey(profile,facility),workspaceKey({...profile,quantity_tonnes_per_month:8},facility));
  assert.equal(verificationProgress(),0);
  assert.equal(verificationProgress({composition:true,authorization:'true',capacity:true,quote:false}),2);
  const text=enquiryText(profile,{facility:{name:'A recycler',source_url:'https://board.example'},questions_for_buyer:['Confirm acceptance.']});
  assert.match(text,/have not established acceptance/);assert.match(text,/5 tonnes\/month/);assert.match(text,/written buyer\/processing quote/);
});
test('assistant cannot execute arbitrary actions or insert invalid amounts',()=>{
  assert.throws(()=>validateAssistantCommand({action:'eval',script:'anything'}),/not supported/);
  assert.throws(()=>validateAssistantCommand({action:'set_quotes',transport:-1}),/valid quantity/);
  assert.throws(()=>validateAssistantCommand({action:'search',quantity:Infinity}),/valid quantity/);
  assert.throws(()=>validateAssistantCommand({action:'search',quantity:5}),/did not identify the material/);
  assert.throws(()=>validateAssistantCommand({action:'explain',lead_number:0}),/1 to 30/);
  assert.deepEqual(validateAssistantCommand({action:'set_quotes',buyer:-50,transport:300,unknown:'ignored'}),{action:'set_quotes',buyer:-50,transport:300});
  assert.deepEqual(localAssistantCommand('Explain lead 2'),{action:'explain',lead_number:2});
  assert.equal(localAssistantCommand('Find leads for polypropylene in Pune'),null);
});
test('all supported languages cover the same interface keys and meaningful core labels',()=>{
  const keys=Object.keys(dictionaries.en);
  for(const locale of ['hi','mr','es']){
    assert.deepEqual(Object.keys(dictionaries[locale]),keys);
    assert.notEqual(dictionaries[locale].prepare,dictionaries.en.prepare);
    assert.notEqual(dictionaries[locale].voicePrivacy,dictionaries.en.voicePrivacy);
    assert.notEqual(dictionaries[locale].readinessIntro,dictionaries.en.readinessIntro);
  }
});
