import {deriveKey, randSalt, encryptJson, decryptJson, bufToB64, b64ToBuf} from './crypto.js';
import {load, save, exportVault, importVault} from './store.js';

let session={key:null, items:[]};
const els={
  list:document.getElementById('vaultList'),
  panel:document.getElementById('panel-locked'),
  mode:document.getElementById('vaultMode'),
  count:document.getElementById('vaultCount'),
  unlock:document.getElementById('btn-unlock'),
  master:document.getElementById('masterPassword'),
  add:document.getElementById('btn-add'),
  lock:document.getElementById('btn-lock'),
  exp:document.getElementById('btn-export'),
  imp:document.getElementById('btn-import'),
  filter:document.getElementById('filterQuery'),
  dark:document.getElementById('btn-dark'),
};

const modal=document.getElementById('modalItem');
const m={
  title:document.getElementById('modalTitle'),
  name:document.getElementById('itemName'),
  user:document.getElementById('itemUser'),
  pass:document.getElementById('itemPass'),
  url: document.getElementById('itemUrl'),
  icon:document.getElementById('itemIcon'),
  fav: document.getElementById('itemFav'),
  gen: document.getElementById('btnGen'),
  save:document.getElementById('btnSave'),
  del: document.getElementById('btnDelete'),
};

let editingId=null;
function gen(len=16){const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';let o='';for(let i=0;i<len;i++)o+=c[Math.floor(Math.random()*c.length)];return o}
function toggleDark(){document.documentElement.classList.toggle('dark')}

async function lock(){
  session={key:null,items:[]};
  els.mode.textContent='Bloqueado';
  els.count.textContent='0';
  els.panel.classList.remove('hidden');
  els.list.classList.add('hidden');
}
async function unlock(pwd){
  let meta=load();
  if(!meta){
    const salt=randSalt();
    const key=await deriveKey(pwd,salt);
    const data=await encryptJson(key,[]);
    meta={salt:bufToB64(salt),iter:200000,data};
    save(meta);
  }
  const salt=b64ToBuf(meta.salt);
  const key=await deriveKey(pwd,salt,meta.iter||200000);
  try{
    const items=await decryptJson(key,meta.data);
    session.key=key; session.items=items||[];
    render();
    els.mode.textContent='Desbloqueado';
    els.count.textContent=String(session.items.length);
    els.panel.classList.add('hidden');
    els.list.classList.remove('hidden');
  }catch{
    alert('Senha mestre incorreta.');
  }
}
async function persist(){
  const meta=load();
  if(!session.key) return;
  const data=await encryptJson(session.key,session.items);
  save({...meta,data});
  els.count.textContent=String(session.items.length);
}

function render(){
  const q=(els.filter.value||'').toLowerCase();
  els.list.innerHTML='';
  for(const it of session.items.filter(i=> i.name?.toLowerCase().includes(q) || i.user?.toLowerCase().includes(q))){
    const card=document.createElement('div');
    card.className='card rounded-xl p-4 space-y-3';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="text-2xl">${it.icon||'🔑'}</div>
        <div class="flex-1">
          <div class="font-semibold">${it.name||'—'}</div>
          ${it.url?`<a href="${it.url}" target="_blank" class="text-xs opacity-70 hover:opacity-100">${it.url}</a>`:''}
        </div>
        <button data-id="${it.id}" class="btn-edit px-2 py-1 bg-white/10 rounded-md text-xs">Editar</button>
      </div>
      <div class="text-sm">${it.user||''}</div>
      <div class="flex gap-2">
        <button data-id="${it.id}" class="btn-copy px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm">Copiar Senha</button>
        <button data-id="${it.id}" class="btn-reveal px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-sm">Mostrar</button>
      </div>
    `;
    els.list.appendChild(card);
  }
  els.list.querySelectorAll('.btn-copy').forEach(b=>b.addEventListener('click',async e=>{
    const id=e.currentTarget.getAttribute('data-id');
    const it=session.items.find(x=>x.id===id);
    if(!it) return;
    try{
      await navigator.clipboard.writeText(it.pass||'');
      e.currentTarget.textContent='Copiado!';
      setTimeout(()=>e.currentTarget.textContent='Copiar Senha',1200);
    }catch{ alert('Seu navegador bloqueou a cópia.'); }
  }));
  els.list.querySelectorAll('.btn-reveal').forEach(b=>b.addEventListener('click',e=>{
    const id=e.currentTarget.getAttribute('data-id');
    const it=session.items.find(x=>x.id===id);
    if(!it) return;
    alert(`Senha de ${it.name}:\n\n${it.pass}`);
  }));
  els.list.querySelectorAll('.btn-edit').forEach(b=>b.addEventListener('click',e=>{
    const id=e.currentTarget.getAttribute('data-id');
    const it=session.items.find(x=>x.id===id);
    openModal(it);
  }));
}

function openModal(it){
  editingId=it?.id||null;
  m.title.textContent=editingId?'Editar Item':'Novo Item';
  m.name.value=it?.name||''; m.user.value=it?.user||''; m.pass.value=it?.pass||'';
  m.url.value=it?.url||''; m.icon.value=it?.icon||''; m.fav.checked=!!it?.fav;
  m.del.classList.toggle('hidden',!editingId);
  modal.showModal();
}
function closeModal(){ modal.close(); }

els.unlock?.addEventListener('click',()=>{
  const p=els.master.value.trim();
  if(!p) return alert('Informe a senha mestre.');
  unlock(p);
});
els.add?.addEventListener('click',()=> openModal(null));
m.gen?.addEventListener('click',()=> m.pass.value = gen());
m.save?.addEventListener('click',async()=>{
  const payload={id:editingId||crypto.randomUUID(),name:m.name.value.trim(),user:m.user.value.trim(),pass:m.pass.value,url:m.url.value.trim(),icon:m.icon.value.trim(),fav:m.fav.checked};
  if(editingId){
    const i=session.items.findIndex(x=>x.id===editingId);
    if(i>=0) session.items[i]=payload;
  } else {
    session.items.unshift(payload);
  }
  await persist(); render(); closeModal();
});
m.del?.addEventListener('click',async()=>{
  if(!editingId) return;
  if(!confirm('Excluir este item?')) return;
  session.items=session.items.filter(x=>x.id!==editingId);
  await persist(); render(); closeModal();
});
els.lock?.addEventListener('click',lock);
els.exp?.addEventListener('click',()=>{
  const blob=new Blob([exportVault()],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='safeplus_export.json'; a.click();
  URL.revokeObjectURL(url);
});
els.imp?.addEventListener('click',async()=>{
  const [h]=await window.showOpenFilePicker({types:[{description:'JSON',accept:{'application/json':['.json']}}]});
  const data=await (await h.getFile()).text();
  importVault(data); await lock(); alert('Importado! Desbloqueie novamente.');
});
els.filter?.addEventListener('input',render);
els.dark?.addEventListener('click',toggleDark);

lock();