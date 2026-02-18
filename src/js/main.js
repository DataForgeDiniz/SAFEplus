/************************************************************
 * SAFEplus – main.js (Auth Gate + Logout forte + Sync + Status + Toasts + Reset de senha)
 ************************************************************/

/* Supabase */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = 'https://bybkuxxwypobqzksnphi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3LmwQqEruve0tSkQ_oH5wQ_SzMBNv6Z';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* App imports */
import { deriveKey, randSalt, encryptJson, decryptJson, bufToB64, b64ToBuf } from './crypto.js';
import { load, save, exportVault, importVault } from './store.js';

/* Estado do cofre (em memória) */
let session = { key: null, items: [] };

/* DOM */
const els = {
  // telas
  authScreen: document.getElementById('authScreen'),
  appMain:    document.getElementById('appMain'),

  // header
  dark:       document.getElementById('btn-dark'),
  signOut:    document.getElementById('btnSignOut'),
  userBadge:  document.getElementById('userEmailBadge'),

  // auth form (tela inicial)
  authEmail:    document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  btnSignUp:    document.getElementById('btnSignUp'),
  btnSignIn:    document.getElementById('btnSignIn'),
  btnForgot:    document.getElementById('btnForgot'),

  // status
  mode:    document.getElementById('vaultMode'),
  count:   document.getElementById('vaultCount'),
  connDot: document.getElementById('connDot'),
  connTxt: document.getElementById('connText'),

  // cofre UI
  panel:   document.getElementById('panel-locked'),
  list:    document.getElementById('vaultList'),
  unlock:  document.getElementById('btn-unlock'),
  master:  document.getElementById('masterPassword'),
  add:     document.getElementById('btn-add'),
  lock:    document.getElementById('btn-lock'),
  exp:     document.getElementById('btn-export'),
  imp:     document.getElementById('btn-import'),
  filter:  document.getElementById('filterQuery'),
  restore: document.getElementById('btn-restore'),

  // reset password modal
  modalReset:  document.getElementById('modalReset'),
  resetPass1:  document.getElementById('resetNewPass'),
  resetPass2:  document.getElementById('resetNewPass2'),
  btnDoReset:  document.getElementById('btnDoReset'),
};

/* Modal Item */
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

/* ======= Toasts ======= */
function toast(msg, type='info', ms=3000) {
  const stack = document.getElementById('toastStack');
  if (!stack) return alert(msg); // fallback
  const base = 'rounded-lg px-4 py-2 text-sm shadow border';
  const colors = {
    success: 'bg-emerald-600/20 text-emerald-100 border-emerald-500/30',
    error:   'bg-red-600/20 text-red-100 border-red-500/30',
    info:    'bg-slate-700/60 text-slate-100 border-white/10',
  };
  const el = document.createElement('div');
  el.className = `${base} ${colors[type] || colors.info} backdrop-blur`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('opacity-0', 'translate-y-1', 'transition');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

/* ======= Helpers Supabase ======= */
async function getSession() {
  return (await supabase.auth.getSession()).data.session;
}
async function getUser() {
  return (await supabase.auth.getUser()).data.user ?? null;
}
async function getUserId() {
  const u = await getUser(); return u?.id ?? null;
}

/* ======= Auth Gate (mostra/oculta telas) ======= */
function applyAuthGate(isAuthed, email=null) {
  els.authScreen.classList.toggle('hidden', isAuthed);
  els.appMain.classList.toggle('hidden', !isAuthed);
  els.signOut.classList.toggle('hidden', !isAuthed);
  els.signOut.disabled = !isAuthed;
  if (els.userBadge) {
    els.userBadge.classList.toggle('hidden', !isAuthed);
    els.userBadge.textContent = isAuthed && email ? email : '';
  }
}

/* ======= Status de Conexão ======= */
function setConnectedUI(isConnected, email=null) {
  if (els.connDot) {
    els.connDot.classList.toggle('bg-green-500', isConnected);
    els.connDot.classList.toggle('bg-red-500',   !isConnected);
  }
  if (els.connTxt) {
    els.connTxt.textContent = isConnected ? `Conectado${email ? ` (${email})` : ''}` : 'Desconectado';
  }
  if (els.restore) els.restore.disabled = !isConnected;
}

/* ======= Core do Cofre ======= */
async function lock(){
  session = { key:null, items:[] };
  els.mode.textContent  = 'Bloqueado';
  els.count.textContent = '0';
  els.panel.classList.remove('hidden');
  els.list.classList.add('hidden');
}

async function unlock(pwd){
  // Exige sessão autenticada
  const s = await getSession();
  if (!s?.user) {
    applyAuthGate(false);
    toast('Faça login para desbloquear o cofre.', 'info');
    return;
  }

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

    await syncVaultToSupabase();
    toast('Cofre desbloqueado com sucesso.', 'success');
  }catch{
    toast('Senha mestre incorreta.', 'error');
  }
}

/* ======= Sync Supabase ======= */
async function syncVaultToSupabase(){
  const userId = await getUserId();
  if(!userId) return;
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
  await syncVaultToSupabase();
  toast('Alterações salvas.', 'success', 1800);
}

/* ======= Render ======= */
function render(){
  const q = (els.filter?.value||'').toLowerCase();
  els.list.innerHTML = '';

  const items = session.items.filter(i =>
    i.name?.toLowerCase().includes(q) || i.user?.toLowerCase().includes(q)
  );

  for(const it of items){
    const card = document.createElement('div');
    card.className = 'card rounded-xl p-4 space-y-3 bg-white/5 border border-white/10';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="text-2xl">${it.icon || '🔑'}</div>
        <div class="flex-1">
          <div class="font-semibold">${it.name || '—'}</div>
          ${it.url ? `<a href="${it.url}" target="_blank" rel="noopener" class="text-xs opacity-70 hover:opacity-100 underline underline-offset-2">${it.url}</a>` : ''}
        </div>
        <button data-id="${it.id}" class="btn-edit px-2 py-1 bg-white/10 hover:bg-white/15 rounded-md text-xs">Editar</button>
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
      const old = e.currentTarget.textContent;
      e.currentTarget.textContent = 'Copiado!';
      setTimeout(()=> e.currentTarget.textContent=old, 1200);
    }catch{ toast('Seu navegador bloqueou a cópia.', 'error'); }
  }));
  els.list.querySelectorAll('.btn-reveal').forEach(b => b.addEventListener('click', e=>{
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    if(!it) return;
    toast(`Senha de ${it.name}: ${it.pass}`, 'info', 4500);
  }));
  els.list.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', e=>{
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    openModal(it);
  }));
}

/* ======= Modal Item ======= */
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

/* ======= Restore ======= */
async function pullVaultFromSupabase(){
  const userId = await getUserId();
  if(!userId) return null;
  const { data, error } = await supabase
    .from('safeplus.vaults')
    .select('ciphertext')
    .eq('user_id', userId)
    .single();
  if(error){ console.error('Erro ao ler vault:', error); return null; }
  return data?.ciphertext || null;
}
async function restoreFromServerAndUnlock(){
  const remoteMeta = await pullVaultFromSupabase();
  if(!remoteMeta) return toast('Não há cofre no servidor para este usuário.', 'info');
  save(remoteMeta);
  toast('Cofre baixado! Agora desbloqueie com a sua senha mestre.', 'success');
  await lock();
}

/* ======= Eventos UI ======= */
els.dark?.addEventListener('click', () => document.documentElement.classList.toggle('dark'));

els.unlock?.addEventListener('click', ()=>{
  const p = els.master.value.trim();
  if(!p) return toast('Informe a senha mestre.', 'info');
  unlock(p);
});
els.add?.addEventListener('click', () => openModal(null));
m.gen?.addEventListener('click', () => m.pass.value = gen());
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
els.lock?.addEventListener('click', async () => { await lock(); toast('Cofre bloqueado.', 'info'); });
els.exp?.addEventListener('click', ()=>{
  const blob = new Blob([exportVault()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'safeplus_export.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Exportado como safeplus_export.json', 'success');
});
els.imp?.addEventListener('click', async ()=>{
  const [h] = await window.showOpenFilePicker({
    types:[{ description:'JSON', accept:{ 'application/json':['.json'] } }]
  });
  const data = await (await h.getFile()).text();
  importVault(data);
  await lock();
  toast('Importado! Desbloqueie novamente.', 'success');
});
els.filter?.addEventListener('input', render);
els.restore?.addEventListener('click', restoreFromServerAndUnlock);

/* ======= Auth (tela inicial) ======= */
els.btnSignUp?.addEventListener('click', async ()=>{
  const email = els.authEmail.value.trim();
  const pass  = els.authPassword.value.trim();
  if(!email || !pass) return toast('Preencha email e senha.', 'info');
  const { error } = await supabase.auth.signUp({ email, password: pass });
  if(error) return toast('Falha ao criar conta: ' + error.message, 'error', 5000);
  toast('Conta criada! Verifique seu e-mail para confirmar.', 'success', 5000);
});

els.btnSignIn?.addEventListener('click', async ()=>{
  const email = els.authEmail.value.trim();
  const pass  = els.authPassword.value.trim();
  if(!email || !pass) return toast('Preencha email e senha.', 'info');
  const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if(error) return toast('Falha ao entrar: ' + error.message, 'error', 5000);
  // onAuthStateChange lida com UI
});

els.btnForgot?.addEventListener('click', async () => {
  const email = els.authEmail.value.trim();
  if (!email) return toast('Digite seu e-mail e depois clique em “Esqueci minha senha”.', 'info', 4500);
  // Define redirect para o seu domínio configurado no Supabase (Site URL / Redirect URLs)
  const redirectTo = window.location.origin; // ex.: https://safeplus.vercel.app
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return toast('Não foi possível enviar o e-mail de redefinição: ' + error.message, 'error', 6000);
  toast('Enviamos um link para redefinir sua senha.', 'success', 5000);
});

/* ======= Reset de senha: modal e fluxo ======= */
els.btnDoReset?.addEventListener('click', async (e) => {
  e.preventDefault();
  const p1 = els.resetPass1.value.trim();
  const p2 = els.resetPass2.value.trim();
  if (!p1 || !p2) return toast('Preencha os dois campos de senha.', 'info');
  if (p1 !== p2) return toast('As senhas não conferem.', 'error');
  const { error } = await supabase.auth.updateUser({ password: p1 });
  if (error) return toast('Não foi possível atualizar sua senha: ' + error.message, 'error', 6000);
  els.modalReset.close();
  toast('Senha atualizada! Você já está autenticado.', 'success', 4000);
});

/* ======= Logout forte ======= */
els.signOut?.addEventListener('click', async (e)=>{
  e.preventDefault();
  els.signOut.disabled = true;
  const { error } = await supabase.auth.signOut();
  if (error) {
    toast('Erro ao sair: ' + error.message, 'error', 6000);
    els.signOut.disabled = false;
    return;
  }
  // Bloqueia/limpa UI de cofre
  await lock();
  // Limpa campos de login
  if (els.authEmail) els.authEmail.value = '';
  if (els.authPassword) els.authPassword.value = '';
  // Gate e status
  applyAuthGate(false);
  setConnectedUI(false);
  toast('Sessão encerrada.', 'success');
});

/* ======= Listener de Auth (reflete tudo em tempo real) ======= */
supabase.auth.onAuthStateChange(async (event, authSession) => {
  const user = authSession?.user ?? null;

  // Fluxo de reset de senha (quando o usuário vem do e-mail)
  if (event === 'PASSWORD_RECOVERY') {
    els.modalReset.showModal();
  }

  // Gate e status
  applyAuthGate(!!user, user?.email ?? null);
  setConnectedUI(!!user, user?.email ?? null);

  // se logou e o cofre já estava desbloqueado, sincroniza
  if (user && session.key) {
    await syncVaultToSupabase();
  }
});

/* ======= Inicialização ======= */
(async function init(){
  applyAuthGate(false);
  await lock();

  const s = await getSession();
  const user = s?.user ?? null;
  applyAuthGate(!!user, user?.email ?? null);
  setConnectedUI(!!user, user?.email ?? null);
})();
