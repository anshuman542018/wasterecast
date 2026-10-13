import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateEconomics, matchProfile, screenFacility} from '../spark/core.js';
import {classifyMaterial, possiblePathways} from '../spark/materials.js';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('static catalog preserves multiple states and source provenance', () => {
  assert.equal(catalog.facilities.length, 912);
  assert.deepEqual(new Set(catalog.facilities.map(row => row.state)), new Set(['Maharashtra','Tamil Nadu','West Bengal']));
  assert.ok(catalog.facilities.every(row => row.source_url.startsWith('https://') && row.source_page > 0));
});

test('economics never fills absent quotes', () => {
  assert.equal(calculateEconomics(12).annual_net_inr, null);
  assert.equal(calculateEconomics(12,{disposal_cost_inr_per_tonne:450,buyer_quote_inr_per_tonne:300,transport_quote_inr_per_tonne:480}).annual_net_inr,38880);
});

test('static matcher rejects a documented flash-point conflict', () => {
  const restricted = catalog.facilities.filter(row => row.process?.includes('above 93°C'));
  assert.ok(restricted.length);
  const profile = {family:'spent_solvent',description:'Measured 20°C flash-point solvent',material_names:[],contaminants:[],flash_point_c:20};
  const result = matchProfile(profile,{},restricted,catalog.sources,30);
  assert.ok(result.candidates.length);
  assert.ok(result.candidates.every(row => row.status === 'rejected'));
});

test('static dossier lookup only accepts a catalog facility', () => {
  const profile = {family:'spent_solvent',description:'Spent solvent scenario',material_names:[],contaminants:[]};
  const facility = catalog.facilities.find(row => row.families.includes('spent_solvent'));
  assert.equal(screenFacility(profile,facility.id,{},catalog.facilities,catalog.sources).facility.id,facility.id);
  assert.throws(() => screenFacility(profile,'invented',{},catalog.facilities,catalog.sources));
});

test('worldwide map leads stay unverified and biological route is rejected for plastic', () => {
  const profile = {family:'plastic',description:'Polypropylene offcuts',material_names:['PP'],contaminants:[],origin_country:'GB'};
  const base = {city_or_district:'London',state:'England',source_type:'osm',families:[],process:'Tagged industrial recycling site',source_url:'https://www.openstreetmap.org/way/1'};
  const facilities = [
    {...base,id:'osm-1',name:'Generic Recycling Works'},
    {...base,id:'osm-2',name:'Farm Anaerobic Digestion Plant'}
  ];
  const result = matchProfile(profile,{},facilities,[],10);
  assert.equal(result.candidates.find(item=>item.facility.id==='osm-1').status,'candidate_requires_verification');
  assert.equal(result.candidates.find(item=>item.facility.id==='osm-2').status,'rejected');
  assert.match(result.candidates.find(item=>item.facility.id==='osm-1').reasons.join(' '),/does not establish/);
});

test('solid and organic streams classify into useful families and map conflicts remain rejected', () => {
  assert.equal(classifyMaterial('cotton garment cutting scraps'), 'textile');
  assert.equal(classifyMaterial('demolition concrete rubble'), 'construction');
  assert.equal(classifyMaterial('spent brewery grain'), 'organic');
  assert.equal(classifyMaterial('used cooking oil from a restaurant'), 'cooking_oil');
  assert.match(possiblePathways('textile')[0], /remanu/);
  const profile = {family:'textile',description:'Cotton garment scraps',material_names:[],contaminants:[]};
  const facilities = [
    {id:'osm-textile',name:'Textile centre',city_or_district:'London',state:'England',source_type:'osm',listing_type:'public_dropoff',families:['textile'],process:'Mapped recycling centre'},
    {id:'osm-glass',name:'Glass centre',city_or_district:'London',state:'England',source_type:'osm',families:['glass'],process:'Mapped recycling centre'}
  ];
  const result = matchProfile(profile,{},facilities,[],10);
  assert.equal(result.candidates.find(item=>item.facility.id==='osm-textile').status,'candidate_requires_verification');
  assert.equal(result.candidates.find(item=>item.facility.id==='osm-glass').status,'rejected');
});
