import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signOut,reload,GoogleAuthProvider,signInWithPopup} from 'firebase/auth';
import {collection,doc,getDoc,getDocs,setDoc,writeBatch,query,where,orderBy,limit,startAfter,serverTimestamp,Timestamp} from 'firebase/firestore';
import {normalizeListing,MAX_OWN_LISTINGS,LISTING_DAYS,EXCHANGE_PAGE_SIZE} from './exchange-core.js';

export function exchangeStore(app,db) {
  const auth=getAuth(app);
  const memberRef=()=>doc(db,'exchangeMembers',auth.currentUser.uid);
  const requireUser=()=>{if(!auth.currentUser)throw new Error('Sign in to manage your listings.');return auth.currentUser;};
  return {
    get user(){return auth.currentUser;},
    observe:callback=>onAuthStateChanged(auth,callback),
    async register(email,password){const {user}=await createUserWithEmailAndPassword(auth,email,password);await sendEmailVerification(user);return user;},
    async login(email,password){return signInWithEmailAndPassword(auth,email,password);},
    google:()=>signInWithPopup(auth,new GoogleAuthProvider()),
    logout:()=>signOut(auth),
    async verify(){requireUser();await sendEmailVerification(auth.currentUser);},
    async refresh(){requireUser();await reload(auth.currentUser);await auth.currentUser.getIdToken(true);return auth.currentUser;},
    reset:email=>sendPasswordResetEmail(auth,email),
    async member(){if(!auth.currentUser)return null;const snap=await getDoc(memberRef());return snap.exists()?snap.data():null;},
    async mine(){const user=requireUser();const snap=await getDocs(query(collection(db,'exchangeListings'),where('ownerId','==',user.uid),limit(MAX_OWN_LISTINGS)));return snap.docs.map(d=>({id:d.id,...d.data()}));},
    async save(input,id=null){
      const user=requireUser();await reload(user);await user.getIdToken(true);
      if(!user.emailVerified)throw new Error('Verify your email, then click “I have verified my email” before publishing.');
      const item=normalizeListing(input);
      if(!id){const own=await this.mine();const used=new Set(own.map(d=>d.id));id=Array.from({length:MAX_OWN_LISTINGS},(_,i)=>`${user.uid}_${i}`).find(x=>!used.has(x));if(!id)throw new Error('You have 10 listing slots. Edit an existing listing.');}
      const ref=doc(db,'exchangeListings',id),previous=await getDoc(ref);
      if(previous.exists() && previous.data().ownerId!==user.uid)throw new Error('Only the owner can edit this listing.');
      const now=Date.now();
      const batch=writeBatch(db);
      batch.set(memberRef(),{organization:item.organization,country:item.country,updatedAt:serverTimestamp()});
      batch.set(ref,{...item,ownerId:user.uid,slot:Number(id.split('_').at(-1)),status:'published',createdAt:previous.exists()?previous.data().createdAt:serverTimestamp(),updatedAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(now+LISTING_DAYS*86400000-60000)});
      await batch.commit();
      return id;
    },
    async pause(id){const user=requireUser();const ref=doc(db,'exchangeListings',id);const snap=await getDoc(ref);if(!snap.exists()||snap.data().ownerId!==user.uid)throw new Error('Only the owner can pause this listing.');await setDoc(ref,{...snap.data(),status:'paused',updatedAt:serverTimestamp()});},
    async browse({role,country='',family='',cursor=null}){
      const filters=[where('role','==',role),where('status','==','published'),where('expiresAt','>',Timestamp.now())];
      if(country)filters.push(where('country','==',country));if(family)filters.push(where('family','==',family));
      filters.push(orderBy('expiresAt','desc'),limit(EXCHANGE_PAGE_SIZE+1));if(cursor)filters.push(startAfter(cursor));
      const snap=await getDocs(query(collection(db,'exchangeListings'),...filters));
      const visible=snap.docs.slice(0,EXCHANGE_PAGE_SIZE);
      return {items:visible.map(d=>({id:d.id,...d.data()})),cursor:visible.at(-1) || null,hasMore:snap.docs.length>EXCHANGE_PAGE_SIZE};
    }
  };
}
