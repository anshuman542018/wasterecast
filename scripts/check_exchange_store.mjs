// Receives disposable QA account credentials on stdin from check_exchange_live.py.
// Exercises the actual browser data adapter against real Firebase services.
import {initializeApp,deleteApp} from 'firebase/app';
import {firebaseConfig} from '../spark/firebase-config.js';
import {exchangeStore} from '../spark/exchange-store.js';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const {email,password}=JSON.parse(raw);
const app=initializeApp(firebaseConfig,'exchange-qa');
const {getFirestore}=await import('firebase/firestore');
const store=exchangeStore(app,getFirestore(app));
try{
  await store.login(email,password);
  const input={role:'buyer',organization:'QA TEMPORARY — not a real business',title:'QA TEMPORARY SDK acceptance test',family:'plastic',country:'NL',city:'Rotterdam',description:'Temporary automated integration fixture, not an actual buyer.',specifications:'Rigid polypropylene, PVC excluded.',exclusions:'PVC',hazard:'no',tradeScope:'international',quantity:8,price:null,currency:'EUR',publicContact:'qa@example.com',contactConsent:true};
  const id=await store.save(input);
  const mine=await store.mine();if(!mine.some(x=>x.id===id))throw new Error('Saved record missing from owner listing query');
  const member=await store.member();if(member.organization!==input.organization)throw new Error('Private profile not persisted');
  // Exercise all four production composite query shapes and both directions.
  for(const filters of [{role:'buyer'},{role:'buyer',family:'plastic'},{role:'buyer',country:'NL'},{role:'buyer',country:'NL',family:'plastic'}]){
    const page=await store.browse(filters);if(!page.items.some(x=>x.id===id))throw new Error('Global/country/family lookup missing saved record');
  }
  await store.save({...input,title:'QA TEMPORARY updated request'},id);
  await store.pause(id);
  if((await store.browse({role:'buyer',country:'NL',family:'plastic'})).items.some(x=>x.id===id))throw new Error('Paused record still searchable');
  await store.save({...input,role:'seller'},id);
  if(!(await store.browse({role:'seller',country:'NL',family:'plastic'})).items.some(x=>x.id===id))throw new Error('Seller search missing record');
  console.log(JSON.stringify({stage:'real_exchange_store',passed:true,checks:['SDK sign-in','atomic profile + listing publication','owner query','global search','country filter','family filter','combined filters','owner edit','pause hides listing','renew listing','reverse-side seller search']}));
}finally{await store.logout();await deleteApp(app);}
