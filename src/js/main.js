/************************************************************
 * SAFEplus – main.js (com Supabase + Sync + Restore)
 * Requisitos:
 *  - index.html com <script type="module" src="./src/js/main.js">
 *  - src/js/crypto.js  -> deriveKey, randSalt, encryptJson, decryptJson, bufToB64, b64ToBuf
 *  - src/js/store.js   -> load(), save(), exportVault(), importVault()
 ************************************************************/

/* =========================
 * 4) Supabase (via ESM CDN)
 * ========================= */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ► URL e Publishable (anon) do seu projeto
const SUPABASE_URL = 'https://bybkuxxwypobqzksnphi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3LmwQqEruve0tSkQ_oH5wQ_SzMBNv6Z';

// Cliente Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =======================
 * Imports do próprio app
 * ======================= */
import {
  deriveKey, randSalt, encryptJson, decryptJson,
  bufToB64, b64ToBuf
} from './crypto.js';

import {
  load, save, exportVault, importVault
} from './store.js';

/* =======================
 * Estado de sessão local
 * ======================= */
let session = { key: null, items: [] };

/* ==============================
 * Referências de elementos (DOM)
 * ============================== */
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

/* ================
 * Utilitários UI
 * ================ */
function gen(len = 16) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  let o = '';
  for (let i = 0; i < len; i++) o += c[Math.floor(Math.random() * c.length)];
  return o;
}

function toggleDark() {
  document.documentElement.classList.toggle('dark');
}

/* ======================
 * Core do cofre (local)
 * ====================== */
async function lock() {
  session = { key: null, items: [] };
  els.mode.textContent  = 'Bloqueado';
  els.count.textContent = '0';
  els.panel.classList.remove('hidden');
  els.list.classList.add('hidden');
}

async function unlock(pwd) {
  // meta = objeto cifrado do localStorage: { salt, iter, data: { iv, ct } }
  let meta = load();
  if (!meta) {
    // Primeiro uso: cria meta vazio cifrado
    const salt = randSalt();
    const key  = await deriveKey(pwd, salt);
    const data = await encryptJson(key, []); // começa sem itens
    meta = { salt: bufToB64(salt), iter: 200000, data };
    save(meta);
  }

  const salt = b64ToBuf(meta.salt);
  const key  = await deriveKey(pwd, salt, meta.iter || 200000);

  try {
    const items = await decryptJson(key, meta.data);
    session.key   = key;
    session.items = items || [];
    render();
    els.mode.textContent  = 'Desbloqueado';
    els.count.textContent = String(session.items.length);
    els.panel.classList.add('hidden');
    els.list.classList.remove('hidden');
  } catch {
    alert('Senha mestre incorreta.');
  }
}

/* =========================================
 * 4.2) Persistência local + Sync Supabase
 * ========================================= */
async function syncVaultToSupabase() {
  const userId = await getCurrentUserId();
  if (!userId) return;                 // precisa estar logado (RLS)

  const meta = load();                 // pega o objeto cifrado salvo localmente
  if (!meta) return;

  // upsert no schema safeplus
  const { error } = await supabase
    .from('safeplus.vaults')
    .upsert({ user_id: userId, ciphertext: meta })
    .eq('user_id', userId);

  if (error) console.error('Erro ao sincronizar vault:', error);
}

async function persist() {
  const meta = load();
  if (!session.key) return;

  const data = await encryptJson(session.key, session.items);
  save({ ...(meta || {}), data });
  els.count.textContent = String(session.items.length);

  // ► SINCRONIZAÇÃO (4.2)
  await syncVaultToSupabase();
}

/* ==========================
 * Renderização da lista (UI)
 * ========================== */
function render() {
  const q = (els.filter.value || '').toLowerCase();
  els.list.innerHTML = '';

  const items = session.items.filter(
    i => i.name?.toLowerCase().includes(q) || i.user?.toLowerCase().includes(q)
  );

  for (const it of items) {
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

  // Ações dos cards
  els.list.querySelectorAll('.btn-copy').forEach(b => b.addEventListener('click', async e => {
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    if (!it) return;
    try {
      await navigator.clipboard.writeText(it.pass || '');
      e.currentTarget.textContent = 'Copiado!';
      setTimeout(() => e.currentTarget.textContent = 'Copiar Senha', 1200);
    } catch {
      alert('Seu navegador bloqueou a cópia.');
    }
  }));

  els.list.querySelectorAll('.btn-reveal').forEach(b => b.addEventListener('click', e => {
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    if (!it) return;
    alert(`Senha de ${it.name}:\n\n${it.pass}`);
  }));

  els.list.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', e => {
    const id = e.currentTarget.getAttribute('data-id');
    const it = session.items.find(x => x.id === id);
    openModal(it);
  }));
}

/* ======================
 * Modal (novo/editar)
 * ====================== */
function openModal(it) {
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
function closeModal() { modal.close(); }

/* ==========================
 * 4.3) Restore do servidor
 * ========================== */
async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

async function pullVaultFromSupabase() {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('safeplus.vaults')
    .select('ciphertext')
    .single();

  if (error) { console.error('Erro ao ler vault:', error); return null; }
  return data?.ciphertext || null;
}

async function restoreFromServerAndUnlock() {
  const remoteMeta = await pullVaultFromSupabase();
  if (!remoteMeta) return alert('Não há cofre no servidor para este usuário.');

  // Substitui o meta local e volta para tela de desbloqueio
  save(remoteMeta);
  alert('Cofre baixado! Agora desbloqueie com a sua senha mestre.');
  await lock();
}

/* ======================
 * Event Listeners (UI)
 * ====================== */
els.unlock?.addEventListener('click', () => {
  const p = els.master.value.trim();
  if (!p) return alert('Informe a senha mestre.');
  unlock(p);
});

els.add?.addEventListener('click', () => openModal(null));
m.gen?.addEventListener('click', () => m.pass.value = gen());

m.save?.addEventListener('click', async () => {
  const payload = {
    id:   editingId || crypto.randomUUID(),
    name: m.name.value.trim(),
    user: m.user.value.trim(),
    pass: m.pass.value,
    url:  m.url.value.trim(),
    icon: m.icon.value.trim(),
    fav:  m.fav.checked
  };

  if (editingId) {
    const i = session.items.findIndex(x => x.id === editingId);
    if (i >= 0) session.items[i] = payload;
  } else {
    session.items.unshift(payload);
  }

  await persist();
  render();
  closeModal();
});

m.del?.addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Excluir este item?')) return;
  session.items = session.items.filter(x => x.id !== editingId);
  await persist();
  render();
  closeModal();
});

els.lock?.addEventListener('click', lock);

els.exp?.addEventListener('click', () => {
  const blob = new Blob([exportVault()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'safeplus_export.json'; a.click();
  URL.revokeObjectURL(url);
});

els.imp?.addEventListener('click', async () => {
  const [h] = await window.showOpenFilePicker({
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
  });
  const data = await (await h.getFile()).text();
  importVault(data);
  await lock();
  alert('Importado! Desbloqueie novamente.');
});

els.filter?.addEventListener('input', render);
els.dark?.addEventListener('click', toggleDark);

// ► Botão "Restaurar do servidor"
els.restore?.addEventListener('click', restoreFromServerAndUnlock);

/* ===============================
 * 2) Autenticação (email/senha)
 * =============================== */
const authEmail    = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const btnSignUp    = document.getElementById('btnSignUp');
const btnSignIn    = document.getElementById('btnSignIn');

btnSignUp?.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  const pass  = authPassword.value.trim();
  if (!email || !pass) return alert('Preencha email e senha.');

  const { error } = await supabase.auth.signUp({ email, password: pass });
  if (error) return alert('Falha ao criar conta: ' + error.message);
  alert('Conta criada! Verifique seu email (se o projeto exigir confirmação).');
});

btnSignIn?.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  const pass  = authPassword.value.trim();
  if (!email || !pass) return alert('Preencha email e senha.');

  const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) return alert('Falha ao entrar: ' + error.message);
  alert('Autenticado com sucesso!');
});

/* =======================
 * Inicialização da tela
 * ======================= */
lock();

/* ==========================================================
 * 5) OPCIONAL – Itens no Supabase (sync granular por item)
 *    Obs: os itens devem ser enviados cifrados (mesmo padrão)
 * ========================================================== */

// Gerar hash/keyword (nunca texto puro) para campo auxiliar de busca
async function makeSearchTag(text) {
  const norm = (text || '').toLowerCase().trim();
  const buf  = new TextEncoder().encode(norm);
  const dig  = await crypto.subtle.digest('SHA-256', buf);
  return btoa(String.fromCharCode(...new Uint8Array(dig))); // base64 do hash
}

async function saveItemCipher(itemCipher, searchText = null) {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const search_tag = searchText ? await makeSearchTag(searchText) : null;

  const { error } = await supabase
    .from('safeplus.vault_items')
    .insert({ user_id: userId, ciphertext: itemCipher, search_tag });
  if (error) console.error('saveItemCipher:', error);
}

async function listItemCiphers() {
  const { data, error } = await supabase
    .from('safeplus.vault_items')
    .select('id, ciphertext, updated_at')
    .order('updated_at', { ascending: false });
  if (error) { console.error('listItemCiphers:', error); return []; }
  return data || [];
}

async function updateItemCipher(id, itemCipher, searchText = null) {
  const search_tag = searchText ? await makeSearchTag(searchText) : null;
  const { error } = await supabase
    .from('safeplus.vault_items')
    .update({ ciphertext: itemCipher, search_tag })
    .eq('id', id);
  if (error) console.error('updateItemCipher:', error);
}

async function deleteItemCipher(id) {
  const { error } = await supabase
    .from('safeplus.vault_items')
    .delete()
    .eq('id', id);
  if (error) console.error('deleteItemCipher:', error);
}
