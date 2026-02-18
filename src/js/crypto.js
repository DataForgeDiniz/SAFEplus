const enc=new TextEncoder();const dec=new TextDecoder();
export async function deriveKey(password,salt,iterations=200000){
  const base=await crypto.subtle.importKey('raw',enc.encode(password),{name:'PBKDF2'},false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export function randSalt(n=16){const s=new Uint8Array(n);crypto.getRandomValues(s);return s}
export function randIv(){const iv=new Uint8Array(12);crypto.getRandomValues(iv);return iv}
export async function encryptJson(key,data){
  const iv=randIv();const bytes=enc.encode(JSON.stringify(data));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);
  return { iv:bufToB64(iv), ct:bufToB64(new Uint8Array(ct)) };
}
export async function decryptJson(key,payload){
  const iv=b64ToBuf(payload.iv), ct=b64ToBuf(payload.ct);
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);
  return JSON.parse(dec.decode(bytes));
}
export function bufToB64(buf){let s='';buf.forEach(b=>s+=String.fromCharCode(b));return btoa(s)}
export function b64ToBuf(b64){const s=atob(b64);const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out}