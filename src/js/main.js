/************************************************************
 * SAFEplus – main.js (Supabase + Sync + Restore)
 ************************************************************/

/* 4) Supabase */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = 'https://bybkuxxwypobqzksnphi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3LmwQqEruve0tSkQ_oH5wQ_SzMBNv6Z';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* App imports */
import { deriveKey, randSalt, encryptJson, decryptJson, bufToB64, b64ToBuf } from './crypto.js';
import { load, save, exportVault, importVault } from './store.js';

/* Estado */
let session = { key: null, items: [] };

/* DOM */
const els = {
  list:    document.getElementById('vaultList'),
  panel:   document.getElementById('panel-locked'),
  mode:    document.getElementById('vaultMode'),
  count:   document.getElementById('vaultCount'),
  unlock:  document.getElementById('btn-unlock'),
  master:  document.getElementById('masterPassword'),
  add:     document.getElementById('btn-add'),
  lock:    document.getElementById('btn-lock'),
  exp:     document.getElementById('btn-export'),
  imp:     document.getElementById('btn-import'),
  filter:  document.getElementById('filterQuery'),
  dark:    document.getElementById('btn-dark'),
  restore: document.getElementById('btn-restore'),
};

const modal = document.getElementById('modalItem');
const m = {
  title: document.getElementById('modalTitle'),
  name:  document.getElementById('itemName'),
  user:  document.getElementById('itemUser'),
  pass:  document.getElementById('itemPass'),
  url:   document.getElementById('itemUrl'),
  icon:  document.getElementById('itemIcon'),
  fav:   document.getElementById('itemFav'),
  gen:   document.getElementById('btnGen'),
  save:  document.getElementById('btnSave'),
  del:   document.getElementById('btnDelete'),
};

let editingId = null;

/* Utils */
function gen(len=16){
  const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  let o=''; for(let i=0;i<len;i++) o+=c[Math.floor(Math.random()*c.length)];
  return o;
}
function toggleDark(){ document.documentElement.classList.toggle('dark'); }

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/* Core local */
async function lock(){
  session = { key:null, items:[] };
  els.mode.textContent  = 'Bloqueado';
  els.count.textContent = '0';
  els.panel.classList.remove('hidden');
  els.list.classList.add('hidden');
}

async function unlock(pwd){
  let meta = load(); // { salt, iter, data:{iv,ct} }
  if(!meta){
    const salt = randSalt();
    const key  = await deriveKey(pwd, salt);
    const data = await encryptJson(key, []);
    meta = { salt: bufToB64(salt), iter: 200000, data };
    save(meta);
  }
  const salt = b64ToBuf(meta.salt);
  const key  = await deriveKey(pwd, salt, meta.iter||200000);
  try{
    const items = await decryptJson(key, meta.data);
    session.key   = key;
    session.items = items || [];
    render();
    els.mode.textContent  = 'Desbloqueado';
    els.count.textContent = String(session.items.length);
    els.panel.classList.add('hidden');
    els.list.classList.remove('hidden');
  }catch{
    alert('Senha mestre incorreta.');
  }
}

/* 4.2) Sync no Supabase */
async function syncVaultToSupabase(){
  const userId = await getCurrentUserId();
  if(!userId) return;          // requer login
  const meta = load();
  if(!meta) return;
  const { error } = await supabase
    .from('safeplus.vaults')
    .upsert({ user_id: userId, ciphertext: meta })
    .eq('user_id', userId);
  if(error) console.error('Erro ao sincronizar vault:', error);
}

async function persist(){
  const meta = load();
  if(!session.key) return;
  const data = await encryptJson(session.key, session.items);
  save({ ...(meta||{}), data });
  els.count.textContent = String(session.items.length);
  // dispara sync
  await syncVaultToSupabase();
}

/* Render */
function render(){
  const q = (els.filter.value||'').toLowerCase();
  els.list.innerHTML = '';

  const items = session.items.filter(i =>
    i.name?.toLowerCase().includes(q) || i.user?.toLowerCase().includes(q)
  );

  for(const it of items){
    const card = document.createElement('div');
    card.className = 'card rounded-xl p-4 space-y-3';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="text-2xl">${it.icon || '🔑'}</div>
        <div class="flex-1">
          <div class="font-semibold">${it.name || '—'}</div>
          ${it.url ? `<a href="${it.url}" target="_blank" class="text-xs opacity-70 hover:opacity-100">${it.url}</a>` : ''}
        </div>
        <button data-id="${it.id}" class="btn-edit px-2 py-1 bg-white/10 rounded-md text-xs">Editar</button>
      </div>
      <div class="text-sm">${it.user || ''}</div>
      <div class="flex gap-2">
        <button data-id="${it.id}" class="btn-copy px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm">Copiar Senha</button>
        <button data-id="${it.id}" class="btn-reveal px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-sm">Mostrar</button>
      </div>
    `;
    els.list.appendChild(card);
  }

  // ações
  els.list.querySelectorAll('.btn-copy').forEach(b => b.addEventListener('click', async e=>{
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    if(!it) return;
    try{
      await navigator.clipboard.writeText(it.pass || '');
      e.currentTarget.textContent = 'Copiado!';
      setTimeout(()=> e.currentTarget.textContent='Copiar Senha', 1200);
    }catch{ alert('Seu navegador bloqueou a cópia.'); }
  }));
  els.list.querySelectorAll('.btn-reveal').forEach(b => b.addEventListener('click', e=>{
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    if(!it) return;
    alert(`Senha de ${it.name}:\n\n${it.pass}`);
  }));
  els.list.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', e=>{
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    openModal(it);
  }));
}

/* Modal */
function openModal(it){
  editingId = it?.id || null;
  m.title.textContent = editingId ? 'Editar Item' : 'Novo Item';
  m.name.value = it?.name || '';
  m.user.value = it?.user || '';
  m.pass.value = it?.pass || '';
  m.url.value  = it?.url  || '';
  m.icon.value = it?.icon || '';
  m.fav.checked = !!it?.fav;
  m.del.classList.toggle('hidden', !editingId);
  modal.showModal();
}
function closeModal(){ modal.close(); }

/* 4.3) Restaurar do servidor */
async function pullVaultFromSupabase(){
  const userId = await getCurrentUserId();
  if(!userId) return null;
  const { data, error } = await supabase
    .from('safeplus.vaults')
    .select('ciphertext')
    .single();
  if(error){ console.error('Erro ao ler vault:', error); return null; }
  return data?.ciphertext || null;
}
async function restoreFromServerAndUnlock(){
  const remoteMeta = await pullVaultFromSupabase();
  if(!remoteMeta) return alert('Não há cofre no servidor para este usuário.');
  save(remoteMeta);
  alert('Cofre baixado! Agora desbloqueie com a sua senha mestre.');
  await lock();
}

/* Eventos UI */
els.unlock?.addEventListener('click', ()=>{
  const p = els.master.value.trim();
  if(!p) return alert('Informe a senha mestre.');
  unlock(p);
});
els.add?.addEventListener('click', ()=> openModal(null));
m.gen?.addEventListener('click', ()=> m.pass.value = gen());
m.save?.addEventListener('click', async ()=>{
  const payload = {
    id:   editingId || crypto.randomUUID(),
    name: m.name.value.trim(),
    user: m.user.value.trim(),
    pass: m.pass.value,
    url:  m.url.value.trim(),
    icon: m.icon.value.trim(),
    fav:  m.fav.checked
  };
  if(editingId){
    const i = session.items.findIndex(x => x.id === editingId);
    if(i >= 0) session.items[i] = payload;
  } else {
    session.items.unshift(payload);
  }
  await persist();
  render();
  closeModal();
});
m.del?.addEventListener('click', async ()=>{
  if(!editingId) return;
  if(!confirm('Excluir este item?')) return;
  session.items = session.items.filter(x => x.id !== editingId);
  await persist();
  render();
  closeModal();
});
els.lock?.addEventListener('click', lock);
els.exp?.addEventListener('click', ()=>{
  const blob = new Blob([exportVault()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'safeplus_export.json'; a.click();
  URL.revokeObjectURL(url);
});
els.imp?.addEventListener('click', async ()=>{
  const [h] = await window.showOpenFilePicker({
    types:[{ description:'JSON', accept:{ 'application/json':['.json'] } }]
  });
  const data = await (await h.getFile()).text();
  importVault(data);
  await lock();
  alert('Importado! Desbloqueie novamente.');
});
els.filter?.addEventListener('input', render);
els.dark?.addEventListener('click', toggleDark);
els.restore?.addEventListener('click', restoreFromServerAndUnlock);

/* Auth (e‑mail/senha) */
const authEmail    = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const btnSignUp    = document.getElementById('btnSignUp');
const btnSignIn    = document.getElementById('btnSignIn');

btnSignUp?.addEventListener('click', async ()=>{
  const email = authEmail.value.trim();
  const pass  = authPassword.value.trim();
  if(!email || !pass) return alert('Preencha email e senha.');
  const { error } = await supabase.auth.signUp({ email, password: pass });
  if(error) return alert('Falha ao criar conta: ' + error.message);
  alert('Conta criada! Verifique seu email (se exigida confirmação).');
});
btnSignIn?.addEventListener('click', async ()=>{
  const email = authEmail.value.trim();
  const pass  = authPassword.value.trim();
  if(!email || !pass) return alert('Preencha email e senha.');
  const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if(error) return alert('Falha ao entrar: ' + error.message);
  alert('Autenticado com sucesso!');
});

/* Inicialização */
lock();

/* (Opcional) Helpers para itens no Supabase (sync granular) */
// async function makeSearchTag(text) { /* ... */ }
// async function saveItemCipher(itemCipher, searchText=null) { /* ... */ }
// async function listItemCiphers() { /* ... */ }
// async function updateItemCipher(id, itemCipher, searchText=null) { /* ... */ }
// async function deleteItemCipher(id) { /* ... */ }
