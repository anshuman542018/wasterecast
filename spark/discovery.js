const globalEndpoints = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];
const regionalEndpoints = {
  GB:['https://overpass.atownsend.org.uk/api/interpreter'],
  IE:['https://overpass.atownsend.org.uk/api/interpreter'],
  CH:['https://overpass.osm.ch/api/interpreter'],
  ET:['https://ethiopia.overpass.openplaceguide.org/api/interpreter']
};
const cache = new Map();
const mapKeys = {
  plastic:['plastic','plastic_bottles'],metal:['metal','scrap_metal'],paper:['paper','cardboard'],glass:['glass','glass_bottles'],cooking_oil:['cooking_oil'],
  textile:['clothes','textiles'],wood:['wood'],organic:['green_waste','organic'],electronic:['electrical_appliances','electronics'],
  construction:['rubble','concrete'],rubber:['tyres'],battery:['batteries','car_batteries']
};
function withTimeout(ms) { return AbortSignal.timeout(ms); }
function families(tags) {
  const marked = Object.entries(tags).filter(([key,value])=>key.startsWith('recycling:') && value === 'yes').map(([key])=>key).join(' ').toLowerCase();
  return [
    ...(/plastic|pet|polymer/.test(marked) ? ['plastic'] : []),
    ...(/metal|aluminium|steel|copper/.test(marked) ? ['metal'] : []),
    ...(/cooking_oil/.test(marked) ? ['cooking_oil'] : /oil/.test(marked) ? ['used_oil','waste_oil'] : []),
    ...(/paper|cardboard|carton/.test(marked) ? ['paper'] : []),
    ...(/glass/.test(marked) ? ['glass'] : []),
    ...(/cloth|clothes|textile|shoes/.test(marked) ? ['textile'] : []),
    ...(/wood/.test(marked) ? ['wood'] : []),
    ...(/organic|green_waste|compost|food/.test(marked) ? ['organic'] : []),
    ...(/electronic|electrical|e-waste/.test(marked) ? ['electronic'] : []),
    ...(/construction|rubble|concrete/.test(marked) ? ['construction'] : []),
    ...(/rubber|tyre|tire/.test(marked) ? ['rubber'] : []),
    ...(/battery|batteries/.test(marked) ? ['battery'] : [])
  ];
}
export async function discover(country, city, family = 'other') {
  if (!/^[A-Z]{2}$/.test(country) || city.trim().length < 2) throw new Error('Choose a country and enter a city.');
  const key = `${country}:${city.trim().toLowerCase()}:${family}`;
  const existing = cache.get(key);
  if (existing && Date.now()-existing.time < 6*3600*1000) return existing.data;
  const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geoUrl.search = new URLSearchParams({name:city.trim(),countryCode:country,count:'5',language:'en',format:'json'}).toString();
  const geoResponse = await fetch(geoUrl,{signal:withTimeout(8000)});
  if (!geoResponse.ok) throw new Error('The public city lookup is unavailable.');
  const places = (await geoResponse.json()).results || [];
  const place = places.find(item=>item.country_code===country && item.name.toLowerCase()===city.trim().toLowerCase()) || places.find(item=>item.country_code===country);
  if (!place) throw new Error('City not found in the selected country. Try a nearby major city.');
  const near = `(around:30000,${place.latitude},${place.longitude})`;
  const tagged = (mapKeys[family] || []).map(key=>`nwr["amenity"="recycling"]["recycling:${key}"="yes"]${near};`).join('');
  const queries = [
    `[out:json][timeout:20];(nwr["industrial"="recycling"]${near};${tagged});out center 80;`,
    `[out:json][timeout:20];nwr["industrial"="recycling"]${near};out center 60;`
  ];
  const endpoints = [...(regionalEndpoints[country] || []),...globalEndpoints];
  let data;
  for (const query of queries) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:withTimeout(12000)});
        if (!response.ok) continue;
        const result = await response.json();
        if (Array.isArray(result.elements)) { data=result; break; }
      } catch { /* Public servers can be busy; try another. */ }
    }
    if (data) break;
  }
  if (!data) throw new Error('Public map servers are busy. Retry later; no facility records were invented.');
  const facilities = data.elements.filter(item=>item.tags?.name).map(item=>({
    id:`osm-${item.type}-${item.id}`,name:item.tags.name,city_or_district:place.name,state:place.admin1 || place.country,
    country_code:country,families:families(item.tags),listing_type:item.tags.amenity === 'recycling' ? 'public_dropoff' : 'industrial_recycling',process:item.tags.description || item.tags['recycling:description'] || (item.tags.amenity === 'recycling' ? 'Mapped recycling centre; material acceptance and commercial service unverified' : 'Tagged industrial recycling site; accepted material not confirmed'),
    capacity_value:null,capacity_unit:null,source_type:'osm',source_title:'OpenStreetMap contributors',source_url:`https://www.openstreetmap.org/${item.type}/${item.id}`,
    source_page:null,source_as_of:data.osm3s?.timestamp_osm_base || null
  }));
  const result = {facilities,place:{name:place.name,country:place.country,admin1:place.admin1},source:{title:'OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright',retrieved_at:new Date().toISOString(),facility_count:facilities.length},attribution:'Location search by Open-Meteo (CC BY 4.0); map records © OpenStreetMap contributors (ODbL). Map tags are discovery leads, including public drop-off centres, not verified buyers or proof of acceptance.'};
  cache.set(key,{time:Date.now(),data:result});
  return result;
}
