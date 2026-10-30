'use strict';
/* =========================================================
   Sistema Souza Engenharia · núcleo
   Utilidades, armazenamento no aparelho, sincronização com o
   Supabase, login, navegação, componentes de tela e o
   cadastro único de clientes usado por todos os módulos.
   ========================================================= */
window.Sis = (function () {
  const VERSAO = '1.2.5';
  const TABELAS = ['clientes', 'comercial', 'agenda', 'obras', 'orcamentos'];

  /* ---------------- utilidades ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const _brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (n) => _brl.format(r2(n)).replace(/ /g, ' ');
  const brl0 = (n) => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  function uid() {
    if (window.crypto && crypto.randomUUID) { try { return crypto.randomUUID(); } catch { /* sem suporte */ } }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  const idCurto = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const p2 = (n) => String(n).padStart(2, '0');
  const isoData = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hojeISO = () => isoData(new Date());
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const somaDias = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const segundaDe = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = x.getDay(); x.setDate(x.getDate() - (w === 0 ? 6 : w - 1)); return x; };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return d && m && a ? `${d}/${m}/${a}` : ''; };
  const dataCurta = (iso) => { if (!iso) return ''; const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
  const dataLonga = (d) => `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()} de ${MESES_LONGOS[d.getMonth()]}`;
  const diasDesde = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const minutos = (t) => { const [h, m] = String(t || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const hhmm = (m) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
  const duracaoTexto = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? p2(m % 60) : ''}`);
  const kvLocal = {
    get(k, padrao = null) { try { const v = localStorage.getItem('souza.' + k); return v === null ? padrao : JSON.parse(v); } catch { return padrao; } },
    set(k, v) { try { localStorage.setItem('souza.' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };

  /* ---------------- ícones (traço) ---------------- */
  const ICONES = {
    inicio: '<path d="M5 12H3l9-9 9 9h-2"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/>',
    agenda: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
    clientes: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"/>',
    obras: '<path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/>',
    sistemas: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    config: '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>',
    busca: '<circle cx="10" cy="10" r="7"/><path d="m21 21-6-6"/>',
    mapa: '<circle cx="12" cy="11" r="3"/><path d="M17.657 16.657 13.414 20.9a2 2 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"/>',
    mic: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M8 21h8M12 17v4"/>',
    ia: '<path d="M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zm0-12a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6z"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    esq: '<path d="m15 6-6 6 6 6"/>',
    dir: '<path d="m9 6 6 6-6 6"/>',
    lista: '<path d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01"/>',
    nuvem: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    lixo: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    copiar: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    compartilhar: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="m8.7 10.7 6.6-3.4M8.7 13.3l6.6 3.4"/>',
    repetir: '<path d="M4 12V9a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M20 12v3a3 3 0 0 1-3 3H4m3 3-3-3 3-3"/>',
    pasta: '<path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"/>',
    nota: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 9h1M9 13h6M9 17h6"/>',
    instalar: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    servico: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 5V3h8v2"/>',
  };
  const icone = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n] || ''}</svg>`;

  /* ---------------- banco local (IndexedDB) ---------------- */
  let _db;
  function idb() {
    if (!_db) {
      _db = new Promise((res, rej) => {
        const r = indexedDB.open('souza-sistema', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          db.createObjectStore('kv');
          db.createObjectStore('reg', { keyPath: 'k' });
          db.createObjectStore('pend', { keyPath: 'k' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return _db;
  }
  async function idbOp(store, modo, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction(store, modo);
      let out;
      const r = fn(t.objectStore(store));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const kv = {
    get: (k) => idbOp('kv', 'readonly', (s) => s.get(k)).catch(() => undefined),
    set: (k, v) => idbOp('kv', 'readwrite', (s) => { s.put(v, k); }).catch(() => {}),
    del: (k) => idbOp('kv', 'readwrite', (s) => { s.delete(k); }).catch(() => {}),
  };

  /* ---------------- armazenamento dos registros ----------------
     Cada registro: { id, tipo, grupo, dados, atualizado_em, excluido }.
     Toda alteração vai primeiro para o aparelho e entra na fila de envio. */
  const mapas = {};
  TABELAS.forEach((t) => { mapas[t] = new Map(); });
  const pend = new Map(); // "tabela|id" -> atualizado_em
  const ouvintes = new Set();
  let versao = 0;
  let _filaIdb = Promise.resolve();

  function avisar(tabelas, origem) {
    versao++;
    ouvintes.forEach((fn) => { try { fn({ tabelas, origem }); } catch (e) { console.error(e); } });
  }
  const store = {
    mapa: (t) => mapas[t],
    get(t, id) { const r = mapas[t].get(id); return r && !r.excluido ? r : null; },
    lista(t, tipo) {
      const out = [];
      for (const r of mapas[t].values()) if (!r.excluido && (!tipo || r.tipo === tipo)) out.push(r);
      return out;
    },
    dados(t, tipo) { return store.lista(t, tipo).map((r) => Object.assign({ id: r.id }, r.dados)); },
    /** Grava uma ou mais linhas na tabela (cria, altera ou marca como excluída). */
    gravar(t, linhas, { silencioso = false } = {}) {
      if (!linhas.length) return;
      const agora = new Date().toISOString();
      const regs = [], pends = [];
      for (const l of linhas) {
        const row = { id: String(l.id), tipo: l.tipo, grupo: l.grupo ?? null, dados: l.dados || {}, atualizado_em: l.atualizado_em || agora, excluido: !!l.excluido };
        mapas[t].set(row.id, row);
        const k = t + '|' + row.id;
        pend.set(k, row.atualizado_em);
        regs.push(Object.assign({ k, t }, row));
        pends.push({ k, em: row.atualizado_em });
      }
      _filaIdb = _filaIdb.then(() => idbOp('reg', 'readwrite', (s) => { regs.forEach((r) => s.put(r)); }))
        .then(() => idbOp('pend', 'readwrite', (s) => { pends.forEach((p) => s.put(p)); }))
        .catch((e) => ui.toast('Não foi possível gravar no aparelho: ' + e.message, 'erro'));
      if (!silencioso) avisar(new Set([t]), 'local');
      sync.agendar();
    },
    salvar(t, id, tipo, dados, grupo = null) { store.gravar(t, [{ id, tipo, grupo, dados }]); },
    excluir(t, id) {
      const r = mapas[t].get(id);
      if (!r) return;
      store.gravar(t, [Object.assign({}, r, { excluido: true, atualizado_em: null })]);
    },
    ouvir(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    pendentes: () => pend.size,
    versao: () => versao,
    async carregar() {
      const [regs, pends] = await Promise.all([idbOp('reg', 'readonly', (s) => s.getAll()), idbOp('pend', 'readonly', (s) => s.getAll())]);
      TABELAS.forEach((t) => mapas[t].clear());
      (regs || []).forEach((r) => { if (mapas[r.t]) mapas[r.t].set(r.id, { id: r.id, tipo: r.tipo, grupo: r.grupo, dados: r.dados, atualizado_em: r.atualizado_em, excluido: r.excluido }); });
      pend.clear();
      (pends || []).forEach((p) => pend.set(p.k, p.em));
    },
    async limpar() {
      TABELAS.forEach((t) => mapas[t].clear());
      pend.clear();
      await idbOp('reg', 'readwrite', (s) => { s.clear(); });
      await idbOp('pend', 'readwrite', (s) => { s.clear(); });
      for (const t of TABELAS) await kv.del('cursor:' + t);
    },
    /** Todos os registros, para backup. */
    exportar() {
      const tabelas = {};
      TABELAS.forEach((t) => { tabelas[t] = Array.from(mapas[t].values()).filter((r) => !r.excluido); });
      return { app: 'sistema-souza', versao: 1, geradoEm: new Date().toISOString(), tabelas };
    },
    /** Restaura um backup: só entram os registros mais novos que os do aparelho. */
    importar(obj) {
      if (!obj || obj.app !== 'sistema-souza' || !obj.tabelas) throw new Error('Este arquivo não é um backup do sistema.');
      let n = 0;
      const mudou = new Set();
      for (const t of TABELAS) {
        const linhas = (obj.tabelas[t] || []).filter((r) => {
          const loc = mapas[t].get(r.id);
          return r && r.id && (!loc || Date.parse(r.atualizado_em) > Date.parse(loc.atualizado_em));
        });
        if (linhas.length) { store.gravar(t, linhas, { silencioso: true }); mudou.add(t); n += linhas.length; }
      }
      if (n) avisar(mudou, 'remoto');
      return n;
    },
  };

  /* ---------------- Supabase: configuração e login ---------------- */
  const S = { sb: null, sessao: null, sessaoExpirada: false, online: navigator.onLine, sincronizando: false, deNovo: false, ultimaSync: null, erroSync: null, ausentes: new Set() };
  const sbUrl = (p) => S.sb.url.replace(/\/+$/, '') + p;
  class ErroSb extends Error { constructor(m, status) { super(m); this.status = status; } }
  const semConexao = (e) => e instanceof TypeError || (e && /Failed to fetch|NetworkError|Load failed/i.test(e.message || ''));
  /* Tabela de um módulo novo que ainda não foi criada no Supabase: os dados ficam no
     aparelho e a sincronização dos outros módulos segue normalmente. */
  const tabelaAusente = (e) => !semConexao(e) && (e.status === 404 || /Tabela inv[aá]lida|Could not find the table|does not exist|schema cache/i.test(e.message || ''));

  async function sbFetch(caminho, { method = 'GET', body, auth = true, tentativa = 0 } = {}) {
    const h = { apikey: S.sb.chave, 'Content-Type': 'application/json' };
    if (auth) { await renovarToken(false); h.Authorization = 'Bearer ' + S.sessao.access_token; }
    const res = await fetch(sbUrl(caminho), { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401 && auth && tentativa === 0) { await renovarToken(true); return sbFetch(caminho, { method, body, auth, tentativa: 1 }); }
    if (!res.ok) {
      let msg = res.statusText || 'Erro ' + res.status;
      try { const j = await res.json(); msg = j.msg || j.message || j.error_description || j.error || msg; } catch { /* sem corpo */ }
      throw new ErroSb(msg, res.status);
    }
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }
  function sessaoDe(j, ant) {
    return {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      user: j.user ? { id: j.user.id, email: j.user.email } : (ant && ant.user) || null,
    };
  }
  let _renovando = null;
  async function renovarToken(forcar) {
    if (!S.sessao) throw new ErroSb('Sessão encerrada.', 401);
    if (!forcar && S.sessao.expires_at - 90 > Date.now() / 1000) return;
    if (_renovando) return _renovando;
    _renovando = (async () => {
      try {
        const j = await sbFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: S.sessao.refresh_token }, auth: false });
        S.sessao = sessaoDe(j, S.sessao);
        S.sessaoExpirada = false;
        await kv.set('sessao', S.sessao);
      } catch (e) {
        if (!semConexao(e) && [400, 401, 403].includes(e.status)) S.sessaoExpirada = true;
        throw e;
      } finally { _renovando = null; }
    })();
    return _renovando;
  }
  async function entrar(email, senha) {
    let j;
    try { j = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password: senha }, auth: false }); }
    catch (e) {
      if (semConexao(e)) throw new Error('Sem conexão com a internet. O primeiro acesso em cada aparelho precisa de internet.');
      if (/invalid login credentials/i.test(e.message)) throw new Error('E-mail ou senha incorretos.');
      throw e;
    }
    const sessao = sessaoDe(j);
    const anterior = await kv.get('usuario');
    if (anterior && sessao.user && anterior !== sessao.user.id) await store.limpar();
    S.sessao = sessao;
    S.sessaoExpirada = false;
    await kv.set('sessao', sessao);
    if (sessao.user) await kv.set('usuario', sessao.user.id);
  }
  async function sair() {
    if (pend.size) {
      const ok = await ui.confirmar({ titulo: 'Sair com alterações não enviadas?', msg: `Há ${pend.size} alteração(ões) que ainda não chegaram ao servidor. Ao sair, elas serão apagadas deste aparelho.\nConecte-se à internet e aguarde a sincronização antes de sair.`, ok: 'Sair mesmo assim', perigo: true });
      if (!ok) return;
    }
    try { if (navigator.onLine) await sbFetch('/auth/v1/logout', { method: 'POST' }); } catch { /* ignora */ }
    S.sessao = null;
    await kv.del('sessao');
    await kv.del('usuario');
    await store.limpar();
    location.hash = '#/inicio';
    iniciar();
  }

  /* ---------------- sincronização ---------------- */
  let _timerSync = null;
  const sync = {
    agendar(ms = 1200) { clearTimeout(_timerSync); _timerSync = setTimeout(sync.agora, ms); atualizarIndicador(); },
    async agora() {
      if (!S.sessao || !S.sb) return;
      if (S.sincronizando) { S.deNovo = true; return; }
      if (!navigator.onLine) { S.online = false; atualizarIndicador(); return; }
      S.sincronizando = true; atualizarIndicador();
      try {
        await _filaIdb;
        await enviarPendentes();
        const mudou = await baixarAlteracoes();
        S.ultimaSync = new Date(); S.erroSync = null; S.online = true;
        if (mudou.size) avisar(mudou, 'remoto');
      } catch (e) {
        if (semConexao(e)) { S.online = false; S.erroSync = null; }
        else S.erroSync = e.message || String(e);
      } finally {
        S.sincronizando = false;
        atualizarIndicador();
        if (S.deNovo) { S.deNovo = false; sync.agendar(300); }
      }
    },
    estado() {
      const n = pend.size;
      const alt = (k) => `${k} alteraç${k === 1 ? 'ão' : 'ões'}`;
      if (S.sessaoExpirada) return { cls: 'erro', txt: 'Sessão expirada, entre de novo', curto: 'Entrar de novo', acao: 'relogin' };
      if (!S.online || !navigator.onLine) return { cls: 'offline', txt: n ? `Sem internet, ${alt(n)} no aparelho` : 'Sem internet, dados salvos no aparelho', curto: 'Sem internet' };
      if (S.sincronizando) return { cls: 'pendente', txt: 'Sincronizando…', curto: 'Sincronizando…' };
      if (S.erroSync) return { cls: 'erro', txt: 'Erro ao sincronizar, tentar de novo', curto: 'Erro', title: S.erroSync, acao: 'sync' };
      if (S.ausentes.size) return { cls: 'pendente', txt: `Falta criar no Supabase: ${[...S.ausentes].join(', ')}`, curto: 'Tabela pendente', title: 'Rode o script da tabela no SQL Editor do Supabase. Os dados estão guardados no aparelho.', acao: 'sync' };
      if (n) return { cls: 'pendente', txt: `${alt(n)} aguardando envio`, curto: `${n} aguardando`, acao: 'sync' };
      const h = S.ultimaSync ? S.ultimaSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      return { cls: 'ok', txt: h ? `Sincronizado às ${h}` : 'Sincronizado', curto: 'Sincronizado', acao: 'sync' };
    },
    info: () => ({ ultima: S.ultimaSync, erro: S.erroSync, pendentes: pend.size, online: S.online, url: S.sb && S.sb.url, email: S.sessao && S.sessao.user && S.sessao.user.email, ausentes: [...S.ausentes] }),
    ausentes: () => S.ausentes,
  };
  async function enviarPendentes() {
    for (const t of TABELAS) {
      const ids = [...pend.keys()].filter((k) => k.startsWith(t + '|')).map((k) => k.slice(t.length + 1));
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200).map((id) => mapas[t].get(id)).filter(Boolean)
          .map((r) => ({ id: r.id, tipo: r.tipo, grupo: r.grupo, dados: r.dados, atualizado_em: r.atualizado_em, excluido: !!r.excluido }));
        if (!lote.length) continue;
        try { await sbFetch('/rest/v1/rpc/sincronizar_lote', { method: 'POST', body: { p_tabela: t, p_lote: lote } }); }
        catch (e) { if (tabelaAusente(e)) { S.ausentes.add(t); break; } throw e; }
        const enviados = [];
        for (const x of lote) { const k = t + '|' + x.id; if (pend.get(k) === x.atualizado_em) { pend.delete(k); enviados.push(k); } }
        await idbOp('pend', 'readwrite', (s) => { enviados.forEach((k) => s.delete(k)); });
      }
    }
  }
  async function baixarAlteracoes() {
    const mudou = new Set();
    for (const t of TABELAS) {
      try { await baixarTabela(t, mudou); S.ausentes.delete(t); }
      catch (e) { if (tabelaAusente(e)) S.ausentes.add(t); else throw e; }
    }
    return mudou;
  }
  async function baixarTabela(t, mudou) {
    {
      let cursor = (await kv.get('cursor:' + t)) || null;
      let desde = cursor ? new Date(Date.parse(cursor) - 120000).toISOString() : '1970-01-01T00:00:00Z';
      let maior = cursor;
      for (let pag = 0; pag < 100; pag++) {
        const lista = await sbFetch(`/rest/v1/${t}?select=id,tipo,grupo,dados,atualizado_em,excluido,servidor_em&servidor_em=gt.${encodeURIComponent(desde)}&order=servidor_em.asc,id.asc&limit=1000`);
        const salvar = [], limpos = [];
        for (const rem of lista) {
          if (!maior || Date.parse(rem.servidor_em) > Date.parse(maior)) maior = rem.servidor_em;
          const k = t + '|' + rem.id;
          const loc = mapas[t].get(rem.id);
          const tRem = Date.parse(rem.atualizado_em);
          if (loc && pend.has(k) && Date.parse(loc.atualizado_em) > tRem) continue;
          if (loc && Date.parse(loc.atualizado_em) === tRem && !!loc.excluido === !!rem.excluido && JSON.stringify(loc.dados) === JSON.stringify(rem.dados || {})) {
            if (pend.has(k)) { pend.delete(k); limpos.push(k); }
            continue;
          }
          const row = { id: rem.id, tipo: rem.tipo, grupo: rem.grupo, dados: rem.dados || {}, atualizado_em: new Date(tRem).toISOString(), excluido: !!rem.excluido };
          mapas[t].set(row.id, row);
          salvar.push(Object.assign({ k, t }, row));
          if (pend.has(k)) { pend.delete(k); limpos.push(k); }
          mudou.add(t);
        }
        if (salvar.length) await idbOp('reg', 'readwrite', (s) => { salvar.forEach((r) => s.put(r)); });
        if (limpos.length) await idbOp('pend', 'readwrite', (s) => { limpos.forEach((k) => s.delete(k)); });
        if (lista.length < 1000) break;
        desde = lista[lista.length - 1].servidor_em;
      }
      if (maior && maior !== cursor) await kv.set('cursor:' + t, maior);
    }
  }
  window.addEventListener('online', () => { S.online = true; sync.agora(); });
  window.addEventListener('offline', () => { S.online = false; atualizarIndicador(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.agora(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync.agora(); }, 60000);

  function atualizarIndicador() {
    const st = S.sessao ? sync.estado() : null;
    $$('[data-sync]').forEach((el) => {
      if (!st) { el.innerHTML = ''; return; }
      el.className = el.dataset.sync === 'ponto' ? `sync-ponto ${st.cls}` : `syncstate ${st.cls}`;
      el.title = st.title || st.txt;
      el.innerHTML = el.dataset.sync === 'ponto' ? '<i></i>' : `<i></i><span>${esc(st.txt)}</span>`;
      el.dataset.acao = st.acao || '';
    });
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-sync]');
    if (!el) return;
    if (el.dataset.sync === 'ponto') { location.hash = '#/configuracoes'; return; }
    if (el.dataset.acao === 'sync') { S.erroSync = null; sync.agora(); }
    else if (el.dataset.acao === 'relogin') modalRelogin();
  });
  function modalRelogin() {
    ui.abrirModal({
      titulo: 'Entrar novamente', sub: 'Sua sessão expirou. O que você lançou neste aparelho continua guardado e será enviado depois do login.',
      corpo: `<div class="grid2"><label class="f span2"><span>E-mail</span><input class="inp" type="email" name="email" value="${esc(S.sessao && S.sessao.user ? S.sessao.user.email : '')}"></label>
        <label class="f span2"><span>Senha</span><input class="inp" type="password" name="senha" autocomplete="current-password"></label></div>`,
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Entrar', classe: 'primary', acao: async (m) => {
          try {
            const j = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: $('[name=email]', m.el).value.trim(), password: $('[name=senha]', m.el).value }, auth: false });
            const nova = sessaoDe(j);
            if (S.sessao && S.sessao.user && nova.user && nova.user.id !== S.sessao.user.id) { ui.toast('Use a mesma conta desta sessão.', 'erro'); return; }
            S.sessao = nova; S.sessaoExpirada = false; await kv.set('sessao', nova);
            m.fechar(); sync.agora();
          } catch (e) { ui.toast(/invalid login/i.test(e.message) ? 'E-mail ou senha incorretos.' : e.message, 'erro'); }
        },
      }],
    });
  }

  /* ---------------- componentes de tela ---------------- */
  const pilha = [];
  const ui = {
    abrirModal({ titulo, sub = '', corpo = '', botoes = [], largo = false, folha = false, aoAbrir, aoCancelar }) {
      const bg = document.createElement('div');
      bg.className = 'modal-bg' + (folha ? ' folha' : '');
      bg.innerHTML = `<div class="modal ${largo ? 'lg' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <div class="mh"><div><h2>${esc(titulo)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
          <button class="btn icon" data-m="x" aria-label="Fechar">${icone('fechar')}</button></div>
        <div class="mb">${corpo}</div>
        ${botoes.length ? `<div class="mf">${botoes.map((b, i) => `<button class="btn ${b.classe || ''} ${b.esq ? 'esq' : ''}" data-mb="${i}">${b.icone ? icone(b.icone) : ''}${esc(b.rot)}</button>`).join('')}</div>` : ''}
      </div>`;
      document.body.appendChild(bg);
      document.body.classList.add('com-modal');
      const m = { el: bg, fechado: false };
      m.fechar = () => {
        if (m.fechado) return;
        m.fechado = true; bg.remove();
        const i = pilha.indexOf(m); if (i >= 0) pilha.splice(i, 1);
        if (!pilha.length) { document.body.classList.remove('com-modal'); redesenharSePendente(); }
      };
      m.cancelar = () => { m.fechar(); if (aoCancelar) aoCancelar(); };
      pilha.push(m);
      $('[data-m="x"]', bg).addEventListener('click', m.cancelar);
      bg.addEventListener('mousedown', (e) => { bg._fora = e.target === bg; });
      bg.addEventListener('mouseup', (e) => { if (e.target === bg && bg._fora) m.cancelar(); bg._fora = false; });
      botoes.forEach((b, i) => $(`[data-mb="${i}"]`, bg).addEventListener('click', () => (b.acao ? b.acao(m) : m.cancelar())));
      if (aoAbrir) aoAbrir($('.modal', bg), m);
      if (!matchMedia('(max-width: 760px)').matches) {
        setTimeout(() => { if (bg.contains(document.activeElement)) return; const f = $('[autofocus]', bg) || $('.mb input:not([type=hidden]):not([type=checkbox]):not([disabled]),.mb select,.mb textarea', bg); if (f) f.focus(); }, 30);
      }
      return m;
    },
    modalAberto: () => pilha.length > 0,
    confirmar({ titulo, msg, ok = 'Confirmar', perigo = false }) {
      return new Promise((res) => {
        ui.abrirModal({ titulo, corpo: `<p class="msg">${esc(msg)}</p>`, botoes: [{ rot: 'Cancelar' }, { rot: ok, classe: perigo ? 'primary perigo' : 'primary', acao: (m) => { m.fechar(); res(true); } }], aoCancelar: () => res(false) });
      });
    },
    alerta({ titulo, msg }) {
      return new Promise((res) => { ui.abrirModal({ titulo, corpo: `<p class="msg">${esc(msg)}</p>`, botoes: [{ rot: 'Entendi', classe: 'primary', acao: (m) => { m.fechar(); res(); } }], aoCancelar: () => res() }); });
    },
    escolher({ titulo, msg, opcoes }) {
      return new Promise((res) => {
        const botoes = [{ rot: 'Cancelar', esq: true }];
        opcoes.slice().reverse().forEach((o) => botoes.push({ rot: o.rot, classe: o.primario ? 'primary' : '', acao: (m) => { m.fechar(); res(o.v); } }));
        ui.abrirModal({ titulo, corpo: `<p class="msg">${esc(msg)}</p>`, botoes, aoCancelar: () => res(null) });
      });
    },
    toast(msg, tipo = '') {
      let w = $('.toast-wrap');
      if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; w.setAttribute('aria-live', 'polite'); document.body.appendChild(w); }
      const t = document.createElement('div');
      t.className = 'toast ' + tipo;
      t.textContent = msg;
      w.appendChild(t);
      setTimeout(() => t.remove(), tipo === 'erro' ? 8000 : 3800);
    },
    realce(texto, t) {
      const alvo = String(texto || '');
      const i = t ? norm(alvo).indexOf(t) : -1;
      if (i < 0) return esc(alvo);
      return esc(alvo.slice(0, i)) + '<mark>' + esc(alvo.slice(i, i + t.length)) + '</mark>' + esc(alvo.slice(i + t.length));
    },
    /** Lista de sugestões própria: abre ao digitar, até 6 itens, setas, Enter e Esc. */
    sugestoes(entrada, caixa, fonte, aoEscolher, { aoFocar = false } = {}) {
      let itens = [], marcado = -1, fechando = null;
      const fechar = () => { caixa.hidden = true; caixa.innerHTML = ''; itens = []; marcado = -1; };
      function abrir() {
        clearTimeout(fechando);
        const t = norm(entrada.value);
        if (!t && !aoFocar) { fechar(); return; }
        itens = fonte(t).slice(0, 6);
        if (!itens.length) { fechar(); return; }
        caixa.innerHTML = itens.map((it, i) => `<button type="button" class="sug ${it.cls || ''}" data-i="${i}" aria-selected="false"><span class="n">${it.html || ui.realce(it.titulo, t)}</span>${it.sub ? `<span class="e">${ui.realce(it.sub, t)}</span>` : ''}</button>`).join('');
        caixa.hidden = false;
        marcado = -1;
      }
      const marcar = () => $$('.sug', caixa).forEach((b, i) => b.setAttribute('aria-selected', String(i === marcado)));
      function escolher(i) { const it = itens[i]; fechar(); if (it) aoEscolher(it); }
      entrada.addEventListener('input', abrir);
      entrada.addEventListener('focus', () => { if (aoFocar || entrada.value.trim()) abrir(); });
      entrada.addEventListener('blur', () => { fechando = setTimeout(fechar, 180); });
      entrada.addEventListener('keydown', (ev) => {
        if (caixa.hidden) return;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          if (marcado < 0) marcado = ev.key === 'ArrowDown' ? 0 : itens.length - 1;
          else marcado = (marcado + (ev.key === 'ArrowDown' ? 1 : itens.length - 1)) % itens.length;
          marcar();
        } else if (ev.key === 'Enter' && marcado >= 0) { ev.preventDefault(); escolher(marcado); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(); }
      });
      caixa.addEventListener('mousedown', (ev) => ev.preventDefault());
      caixa.addEventListener('click', (ev) => { const b = ev.target.closest('.sug'); if (b) escolher(+b.dataset.i); });
      return { fechar, abrir };
    },
    baixarArquivo(nome, conteudo, tipo = 'application/json') {
      const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    escolherArquivo(accept, cb) {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
      inp.addEventListener('change', () => { if (inp.files && inp.files[0]) cb(inp.files[0]); inp.remove(); });
      document.body.appendChild(inp); inp.click();
    },
    abrirMapa(endereco) {
      const q = String(endereco || '').trim();
      if (!q) { ui.toast('Sem endereço para abrir no mapa.'); return; }
      const url = /Android/i.test(navigator.userAgent) ? 'geo:0,0?q=' + encodeURIComponent(q) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
      if (url.startsWith('geo:')) location.href = url; else window.open(url, '_blank', 'noopener');
    },
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pilha.length) { e.preventDefault(); pilha[pilha.length - 1].cancelar(); } });

  /* Ações por clique para os módulos: <button data-a="nome" ...> */
  const acoes = {};
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = acoes[el.dataset.a];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  /* ---------------- cadastro único de clientes ---------------- */
  const clientes = {
    lista: () => store.dados('clientes', 'cliente').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    get(id) { const r = id && store.get('clientes', id); return r ? Object.assign({ id: r.id }, r.dados) : null; },
    nome(id) { const c = clientes.get(id); return c ? c.nome : ''; },
    endereco(id) { const c = clientes.get(id); return c ? c.endereco || '' : ''; },
    porNome(nome) { const k = norm(nome); return clientes.lista().find((c) => norm(c.nome) === k) || null; },
    criar(nome, endereco = '') {
      const id = idCurto();
      store.salvar('clientes', id, 'cliente', { nome: nome.trim(), endereco: endereco.trim(), criadoEm: new Date().toISOString() });
      return id;
    },
    alterar(id, campos) {
      const r = store.get('clientes', id); if (!r) return;
      store.salvar('clientes', id, 'cliente', Object.assign({}, r.dados, campos));
    },
    buscar(t, limite = 6) {
      const out = clientes.lista().filter((c) => !t || norm(c.nome).includes(t) || norm(c.endereco).includes(t));
      out.sort((a, b) => (norm(a.nome).startsWith(t) ? 0 : 1) - (norm(b.nome).startsWith(t) ? 0 : 1) || a.nome.localeCompare(b.nome, 'pt-BR'));
      return out.slice(0, limite);
    },
    /** Quem usa o cliente. Cada módulo registra uma função de contagem. */
    usos(id) { const out = []; usosCli.forEach((fn) => { const u = fn(id); if (u && u.n) out.push(u); }); return out; },
  };
  const usosCli = [];

  /**
   * Seletor de cliente. O compromisso, a obra ou o serviço guardam só o id do cliente;
   * o endereço vem sempre do cadastro. Trocar o cliente troca o endereço junto.
   * Com outroLocal, o compromisso pode ter um local diferente só para ele.
   */
  function seletorCliente(raiz, { clienteId = '', local = '', outroLocal = false, rotulo = 'Cliente', obrigatorio = false, placeholder = 'Digite para buscar no cadastro', aoMudar = null } = {}) {
    let atual = clienteId && clientes.get(clienteId) ? clienteId : '';
    raiz.innerHTML = `<div class="seletor">
      <label class="f ${obrigatorio ? 'req' : ''}"><span>${esc(rotulo)}</span>
        <div class="sugere"><input class="inp" data-s="nome" autocomplete="off" placeholder="${esc(placeholder)}"><div class="lista-sug" hidden></div></div></label>
      <div class="sel-end" data-s="end"></div>
      <div class="sel-novo" data-s="novo" hidden>
        <label class="f"><span>Endereço do novo cliente</span><input class="inp" data-s="novoend" placeholder="Rua, número, bairro, cidade"></label>
        <div class="actions"><button type="button" class="btn sm" data-s="cancelanovo">Cancelar</button><button type="button" class="btn sm primary" data-s="salvanovo">${icone('check')}Cadastrar cliente</button></div>
      </div>
      ${outroLocal ? `<label class="chk" data-s="chkwrap"><input type="checkbox" data-s="chk"> <span>Outro local neste compromisso</span></label>
      <label class="f" data-s="localwrap" hidden><span data-s="localrot">Local</span><input class="inp" data-s="local" placeholder="Endereço ou ponto de encontro"></label>` : ''}
    </div>`;
    const q = (s) => $(`[data-s="${s}"]`, raiz);
    const inp = q('nome'), caixa = $('.lista-sug', raiz);
    const inpLocal = q('local'), chk = q('chk');
    if (atual) inp.value = clientes.nome(atual);
    if (outroLocal && local) { chk.checked = true; inpLocal.value = local; }

    function pintar() {
      const end = q('end');
      const c = atual ? clientes.get(atual) : null;
      if (c) end.innerHTML = c.endereco ? `${icone('mapa')}<span>${esc(c.endereco)}</span>` : `<span class="muted">Sem endereço no cadastro.</span> <button type="button" class="link" data-s="addend">Adicionar endereço</button>`;
      else if (inp.value.trim()) end.innerHTML = '<span class="aviso-campo">Escolha um cliente da lista ou cadastre um novo.</span>';
      else end.innerHTML = '';
      if (outroLocal) {
        q('chkwrap').hidden = !atual;
        const mostrar = !atual || chk.checked;
        q('localwrap').hidden = !mostrar;
        q('localrot').textContent = atual ? 'Local deste compromisso' : 'Local (opcional)';
      }
    }
    function escolher(id) { atual = id; inp.value = clientes.nome(id); q('novo').hidden = true; pintar(); if (aoMudar) aoMudar(id); }
    ui.sugestoes(inp, caixa, (t) => {
      const achados = clientes.buscar(t).map((c) => ({ titulo: c.nome, sub: c.endereco || 'sem endereço no cadastro', id: c.id }));
      const exato = clientes.lista().some((c) => norm(c.nome) === t);
      if (t && !exato) achados.push({ html: `${icone('mais')} Cadastrar “${esc(inp.value.trim())}”`, novo: true, cls: 'novo' });
      return achados;
    }, (it) => {
      if (it.novo) { q('novo').hidden = false; q('novoend').value = ''; q('novoend').focus(); return; }
      escolher(it.id);
    });
    inp.addEventListener('input', () => { if (atual && inp.value !== clientes.nome(atual)) { atual = ''; if (aoMudar) aoMudar(''); } pintar(); });
    raiz.addEventListener('click', (e) => {
      const s = e.target.closest('[data-s]'); if (!s) return;
      if (s.dataset.s === 'cancelanovo') { q('novo').hidden = true; }
      if (s.dataset.s === 'salvanovo') {
        const nome = inp.value.trim();
        if (!nome) { inp.focus(); return; }
        const existe = clientes.porNome(nome);
        escolher(existe ? existe.id : clientes.criar(nome, q('novoend').value));
        ui.toast(existe ? 'Cliente já estava no cadastro.' : 'Cliente cadastrado.');
      }
      if (s.dataset.s === 'addend') editarCliente(atual, () => pintar());
    });
    if (chk) chk.addEventListener('change', () => { pintar(); if (chk.checked) inpLocal.focus(); });
    pintar();
    return {
      valor() { return { clienteId: atual, local: outroLocal && (!atual || chk.checked) ? inpLocal.value.trim() : '' }; },
      /** Retorna mensagem de erro, ou vazio se estiver tudo certo. */
      validar() {
        if (inp.value.trim() && !atual) return 'Escolha um cliente da lista ou cadastre um novo.';
        if (obrigatorio && !atual) return 'Escolha o cliente.';
        return '';
      },
      enderecoEfetivo() { const v = this.valor(); return v.local || (atual ? clientes.endereco(atual) : ''); },
      focar() { inp.focus(); },
    };
  }

  function editarCliente(id, depois) {
    const c = id ? clientes.get(id) : { nome: '', endereco: '' };
    ui.abrirModal({
      titulo: id ? 'Editar cliente' : 'Novo cliente',
      sub: id ? 'A alteração vale para todos os sistemas que usam este cliente.' : '',
      corpo: `<div class="grid2"><label class="f req span2"><span>Nome</span><input class="inp" name="nome" value="${esc(c.nome)}" autofocus></label>
        <label class="f span2"><span>Endereço</span><input class="inp" name="endereco" value="${esc(c.endereco)}" placeholder="Rua, número, bairro, cidade"></label></div>`,
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Salvar', classe: 'primary', acao: (m) => {
          const nome = $('[name=nome]', m.el).value.trim();
          const endereco = $('[name=endereco]', m.el).value.trim();
          if (!nome) { $('[name=nome]', m.el).classList.add('erro'); return; }
          const outro = clientes.porNome(nome);
          if (outro && outro.id !== id) { $('[name=nome]', m.el).classList.add('erro'); ui.toast('Já existe um cliente com esse nome.'); return; }
          let nid = id;
          if (id) clientes.alterar(id, { nome, endereco }); else nid = clientes.criar(nome, endereco);
          m.fechar();
          ui.toast(id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
          if (depois) depois(nid);
        },
      }],
    });
  }

  /* ---------------- módulos, navegação e estrutura ---------------- */
  const modulos = [];
  const buscadores = [];
  function modulo(def) { modulos.push(def); if (def.buscar) buscadores.push(def.buscar); }
  const modPor = (id) => modulos.find((m) => m.id === id);
  const PRINCIPAIS = ['agenda', 'clientes', 'obras'];
  const naBarra = () => (kvLocal.get('barra') || PRINCIPAIS).filter((id) => modPor(id) && modPor(id).sistema);

  let rotaAtual = { mod: 'inicio', partes: [], params: {} };
  function lerRota() {
    const h = location.hash.replace(/^#\/?/, '');
    const [caminho, qs] = h.split('?');
    const partes = caminho.split('/').filter(Boolean).map(decodeURIComponent);
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    const mod = partes.shift() || 'inicio';
    return { mod: modPor(mod) ? mod : 'inicio', partes, params };
  }
  const ir = (rota) => { if (location.hash === rota) desenhar(); else location.hash = rota; };

  function shell() {
    const app = $('#app');
    const sistemas = modulos.filter((m) => m.sistema);
    const barra = naBarra();
    app.innerHTML = `<div class="shell">
      <aside class="lateral">
        <a class="lat-logo" href="#/inicio"><img src="img/logo.png?v=${VERSAO}" alt="Souza Engenharia"></a>
        <nav class="lat-nav" aria-label="Sistemas">
          <a href="#/inicio" data-nav="inicio">${icone('inicio')}<span>Início</span></a>
          ${sistemas.map((m) => `<a href="#/${m.id}" data-nav="${m.id}">${icone(m.icone)}<span>${esc(m.nome)}</span></a>`).join('')}
          <div class="lat-div"></div>
          <a href="#/sistemas" data-nav="sistemas">${icone('sistemas')}<span>Sistemas</span></a>
        </nav>
        <div class="lat-pe">
          <a href="#/configuracoes" data-nav="configuracoes">${icone('config')}<span>Configurações</span></a>
          <button class="syncstate" data-sync="linha" type="button"></button>
        </div>
      </aside>
      <header class="topo-cel">
        <a href="#/inicio" class="topo-logo"><img src="img/logo.png?v=${VERSAO}" alt="Souza Engenharia"></a>
        <div class="topo-acoes"><button class="btn icon" data-a="sis-busca" aria-label="Buscar">${icone('busca')}</button><button data-sync="ponto" type="button" aria-label="Sincronização"></button></div>
      </header>
      <main id="conteudo" tabindex="-1"></main>
      <nav class="barra" aria-label="Sistemas">
        <a href="#/inicio" data-nav="inicio">${icone('inicio')}<span>Início</span></a>
        ${barra.map((id) => `<a href="#/${id}" data-nav="${id}">${icone(modPor(id).icone)}<span>${esc(modPor(id).nome)}</span></a>`).join('')}
        <a href="#/sistemas" data-nav="sistemas">${icone('sistemas')}<span>Sistemas</span></a>
      </nav>
    </div>`;
    atualizarIndicador();
  }

  let _redesenhar = false;
  function digitando() {
    const a = document.activeElement;
    return a && $('#conteudo') && $('#conteudo').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }
  function redesenharSePendente() { if (_redesenhar && !pilha.length && !digitando()) { _redesenhar = false; desenhar(true); } }
  document.addEventListener('focusout', () => setTimeout(redesenharSePendente, 50));

  function desenhar(manterScroll = false) {
    const main = $('#conteudo');
    if (!main) return;
    const nova = lerRota();
    const mudouMod = nova.mod !== rotaAtual.mod;
    rotaAtual = nova;
    $$('[data-nav]').forEach((a) => a.classList.toggle('ativo', a.dataset.nav === nova.mod));
    document.body.dataset.mod = nova.mod;
    const y = window.scrollY;
    const m = modPor(nova.mod);
    try { m.render(main, nova.partes, nova.params); }
    catch (e) { console.error(e); main.innerHTML = `<div class="empty"><b>Não foi possível abrir esta tela</b>${esc(e.message)}</div>`; }
    if (manterScroll && !mudouMod) window.scrollTo(0, y);
    else if (mudouMod) window.scrollTo(0, 0);
    document.title = (m.nome && nova.mod !== 'inicio' ? m.nome + ' · ' : '') + 'Souza Engenharia';
  }
  window.addEventListener('hashchange', () => { _redesenhar = false; desenhar(); });
  store.ouvir(({ origem }) => {
    if (origem !== 'remoto' || !$('#conteudo')) return;
    if (pilha.length || digitando()) { _redesenhar = true; return; }
    desenhar(true);
  });

  /* ---------------- busca geral ---------------- */
  function resultadosBusca(texto) {
    const t = norm(texto);
    if (t.length < 2) return [];
    const out = [];
    buscadores.forEach((fn) => { try { out.push(...fn(t)); } catch (e) { console.error(e); } });
    return out.slice(0, 12);
  }
  function htmlResultados(lista, t) {
    if (!lista.length) return '<div class="busca-vazia">Nada encontrado.</div>';
    return lista.map((r) => `<a class="busca-it" href="${esc(r.rota)}"><span class="busca-tipo">${esc(r.tipo)}</span><span class="busca-txt"><b>${ui.realce(r.titulo, t)}</b>${r.sub ? `<small>${ui.realce(r.sub, t)}</small>` : ''}</span></a>`).join('');
  }
  function ligarBusca(inp, caixa) {
    const atualizar = () => {
      const lista = resultadosBusca(inp.value);
      caixa.hidden = !inp.value.trim() || inp.value.trim().length < 2;
      caixa.innerHTML = htmlResultados(lista, norm(inp.value));
    };
    inp.addEventListener('input', atualizar);
    inp.addEventListener('focus', atualizar);
    inp.addEventListener('blur', () => setTimeout(() => { caixa.hidden = true; }, 200));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = $('.busca-it', caixa); if (a) { location.hash = a.getAttribute('href'); inp.blur(); } } if (e.key === 'Escape') inp.blur(); });
    caixa.addEventListener('mousedown', (e) => e.preventDefault());
    caixa.addEventListener('click', () => { inp.blur(); });
  }
  acoes['sis-busca'] = () => {
    ui.abrirModal({
      titulo: 'Buscar', folha: true,
      corpo: '<input class="inp" data-b="inp" placeholder="Cliente, obra, compromisso ou nota" autocomplete="off" autofocus><div class="busca-res" data-b="res"></div>',
      aoAbrir: (el, m) => {
        const inp = $('[data-b=inp]', el), res = $('[data-b=res]', el);
        inp.addEventListener('input', () => { res.innerHTML = inp.value.trim().length < 2 ? '' : htmlResultados(resultadosBusca(inp.value), norm(inp.value)); });
        res.addEventListener('click', (e) => { if (e.target.closest('.busca-it')) m.fechar(); });
        setTimeout(() => inp.focus(), 60);
      },
    });
  };

  /* ---------------- login ---------------- */
  function telaLogin(msgErro = '') {
    const precisaProjeto = !S.sb;
    $('#app').innerHTML = `<div class="login"><div class="login-box">
      <img src="img/logo.png?v=${VERSAO}" alt="Souza Engenharia" class="login-logo">
      <form class="card" id="form-login" onsubmit="return false"><div class="bd">
        <h1>Entrar</h1>
        <p class="muted small">${precisaProjeto ? 'Primeiro acesso neste aparelho: informe o projeto do Supabase e o seu login.' : 'Use o seu e-mail e senha. Depois do primeiro acesso, o aparelho continua conectado.'}</p>
        ${precisaProjeto ? `<label class="f"><span>Endereço do projeto (Project URL)</span><input class="inp" id="lg-url" placeholder="https://xxxxxxxx.supabase.co" autocapitalize="off" spellcheck="false"></label>
        <label class="f"><span>Chave pública (publishable ou anon)</span><input class="inp" id="lg-chave" autocapitalize="off" spellcheck="false"></label>` : ''}
        <label class="f"><span>E-mail</span><input class="inp" type="email" id="lg-email" autocomplete="username" autocapitalize="off"></label>
        <label class="f"><span>Senha</span><input class="inp" type="password" id="lg-senha" autocomplete="current-password"></label>
        ${msgErro ? `<p class="aviso-campo">${esc(msgErro)}</p>` : ''}
        <button class="btn primary grande" type="submit" id="lg-entrar">Entrar</button>
      </div></form>
      <p class="tiny muted" style="text-align:center">Versão ${VERSAO}</p>
    </div></div>`;
    $('#form-login').addEventListener('submit', async () => {
      const b = $('#lg-entrar'); b.disabled = true;
      try {
        if (precisaProjeto) {
          const url = $('#lg-url').value.trim().replace(/\/+$/, ''), chave = $('#lg-chave').value.trim();
          if (!/^https?:\/\//.test(url) || !chave) throw new Error('Informe o endereço do projeto e a chave pública.');
          S.sb = { url, chave };
          await kv.set('supabase', S.sb);
        }
        await entrar($('#lg-email').value, $('#lg-senha').value);
        await abrirSistema();
      } catch (e) {
        if (precisaProjeto && !S.sessao) { S.sb = null; await kv.del('supabase'); }
        telaLogin(e.message);
      }
    });
  }

  /* ---------------- início ---------------- */
  async function abrirSistema() {
    await store.carregar();
    shell();
    desenhar();
    sync.agora();
    setTimeout(() => { if (window.SisBackup) window.SisBackup.automatico(); }, 4000);
  }
  async function iniciar() {
    const c = window.SOUZA_CONFIG || {};
    S.sb = c.supabaseUrl && c.supabaseChave ? { url: c.supabaseUrl.replace(/\/+$/, ''), chave: c.supabaseChave } : (await kv.get('supabase')) || null;
    S.sessao = (await kv.get('sessao')) || null;
    if (!S.sb || !S.sessao) { telaLogin(); return; }
    await abrirSistema();
  }

  return {
    VERSAO, TABELAS,
    util: { $, $$, esc, norm, r2, brl, brl0, uid, idCurto, p2, isoData, hojeISO, deISO, somaDias, segundaDe, MESES, MESES_LONGOS, DIAS, DIAS_LONGOS, dataBR, dataCurta, dataLonga, diasDesde, minutos, hhmm, duracaoTexto, kvLocal },
    icone, ICONES, kv, store, sync, ui, acoes, clientes, usosCli, seletorCliente, editarCliente,
    modulo, modulos, modPor, naBarra, PRINCIPAIS, ir, desenhar, shell, sair, ligarBusca, iniciar,
    rota: () => rotaAtual,
  };
})();
