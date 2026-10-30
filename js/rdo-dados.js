'use strict';
/* =========================================================
   Diário de obra: dados no aparelho, login e sincronização com
   o projeto Supabase do RDO (separado do projeto principal) e a
   fila de fotos: a cópia reduzida vai para o Storage do Supabase
   e a original vai para o Google Drive pela ponte do Apps Script.
   Tudo funciona sem internet e sobe quando a conexão volta.
   ========================================================= */
window.RDOB = (function () {
  const TAB = ['obras', 'diarios', 'aprovacoes'];
  const BUCKET = 'rdo-fotos';
  const ID_CONFIG = 'config';

  /* ---------------- IndexedDB próprio ---------------- */
  let _db;
  function idb() {
    if (!_db) {
      _db = new Promise((res, rej) => {
        const r = indexedDB.open('souza-rdo', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          db.createObjectStore('kv');
          db.createObjectStore('reg', { keyPath: 'k' });
          db.createObjectStore('pend', { keyPath: 'k' });
          db.createObjectStore('fotos', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return _db;
  }
  async function op(store, modo, fn) {
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
    get: (k) => op('kv', 'readonly', (s) => s.get(k)).catch(() => undefined),
    set: (k, v) => op('kv', 'readwrite', (s) => { s.put(v, k); }).catch(() => {}),
    del: (k) => op('kv', 'readwrite', (s) => { s.delete(k); }).catch(() => {}),
  };

  /* ---------------- registros ---------------- */
  const mapas = {};
  TAB.forEach((t) => { mapas[t] = new Map(); });
  const pend = new Map();
  const ouvintes = new Set();
  let fila = Promise.resolve();
  const avisar = (origem) => ouvintes.forEach((fn) => { try { fn(origem); } catch (e) { console.error(e); } });

  const store = {
    get(t, id) { const r = mapas[t].get(id); return r && !r.excluido ? r : null; },
    lista(t, tipo) { const out = []; for (const r of mapas[t].values()) if (!r.excluido && (!tipo || r.tipo === tipo)) out.push(r); return out; },
    dados(t, tipo) { return store.lista(t, tipo).map((r) => Object.assign({ id: r.id }, r.dados)); },
    gravar(t, linhas, { silencioso = false } = {}) {
      if (!linhas.length) return;
      const agora = new Date().toISOString();
      const regs = [];
      for (const l of linhas) {
        const row = { id: String(l.id), tipo: l.tipo, grupo: l.grupo ?? null, dados: l.dados || {}, atualizado_em: l.atualizado_em || agora, excluido: !!l.excluido };
        mapas[t].set(row.id, row);
        pend.set(t + '|' + row.id, row.atualizado_em);
        regs.push(Object.assign({ k: t + '|' + row.id, t }, row));
      }
      fila = fila.then(() => op('reg', 'readwrite', (s) => { regs.forEach((r) => s.put(r)); }))
        .then(() => op('pend', 'readwrite', (s) => { regs.forEach((r) => s.put({ k: r.k, em: r.atualizado_em })); }))
        .catch((e) => Sis.ui.toast('Não foi possível gravar no aparelho: ' + e.message, 'erro'));
      if (!silencioso) avisar('local');
      sync.agendar();
    },
    salvar(t, id, tipo, dados, grupo = null) { store.gravar(t, [{ id, tipo, grupo, dados }]); },
    excluir(t, id) { const r = mapas[t].get(id); if (r) store.gravar(t, [Object.assign({}, r, { excluido: true, atualizado_em: null })]); },
    async carregar() {
      const [regs, pends] = await Promise.all([op('reg', 'readonly', (s) => s.getAll()), op('pend', 'readonly', (s) => s.getAll())]);
      TAB.forEach((t) => mapas[t].clear());
      (regs || []).forEach((r) => { if (mapas[r.t]) mapas[r.t].set(r.id, { id: r.id, tipo: r.tipo, grupo: r.grupo, dados: r.dados, atualizado_em: r.atualizado_em, excluido: r.excluido }); });
      pend.clear();
      (pends || []).forEach((p) => pend.set(p.k, p.em));
    },
    async limpar() {
      TAB.forEach((t) => mapas[t].clear());
      pend.clear();
      await op('reg', 'readwrite', (s) => { s.clear(); });
      await op('pend', 'readwrite', (s) => { s.clear(); });
      for (const t of TAB) await kv.del('cursor:' + t);
    },
    ouvir(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
  };

  /* ---------------- conexão com o projeto do RDO ---------------- */
  const S = { sb: null, sessao: null, expirada: false, online: navigator.onLine, sincronizando: false, deNovo: false, ultima: null, erro: null, ausente: false, iniciado: null };
  class ErroSb extends Error { constructor(m, status) { super(m); this.status = status; } }
  const semConexao = (e) => e instanceof TypeError || (e && /Failed to fetch|NetworkError|Load failed/i.test(e.message || ''));
  const url = (p) => S.sb.url.replace(/\/+$/, '') + p;

  async function req(caminho, { method = 'GET', json, body, headers = {}, auth = true, tentativa = 0 } = {}) {
    const h = Object.assign({ apikey: S.sb.chave }, json !== undefined ? { 'Content-Type': 'application/json' } : {}, headers);
    if (auth) { await renovar(false); h.Authorization = 'Bearer ' + S.sessao.access_token; }
    const res = await fetch(url(caminho), { method, headers: h, body: json !== undefined ? JSON.stringify(json) : body });
    if (res.status === 401 && auth && tentativa === 0) { await renovar(true); return req(caminho, { method, json, body, headers, auth, tentativa: 1 }); }
    if (!res.ok) {
      let msg = res.statusText || 'Erro ' + res.status;
      try { const j = await res.json(); msg = j.msg || j.message || j.error_description || j.error || msg; } catch { /* sem corpo */ }
      throw new ErroSb(msg, res.status);
    }
    const txt = await res.text();
    try { return txt ? JSON.parse(txt) : null; } catch { return txt; }
  }
  const sessaoDe = (j, ant) => ({
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user: j.user ? { id: j.user.id, email: j.user.email } : (ant && ant.user) || null,
  });
  let _renovando = null;
  async function renovar(forcar) {
    if (!S.sessao) throw new ErroSb('Sessão encerrada.', 401);
    if (!forcar && S.sessao.expires_at - 90 > Date.now() / 1000) return;
    if (_renovando) return _renovando;
    _renovando = (async () => {
      try {
        const j = await req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', json: { refresh_token: S.sessao.refresh_token }, auth: false });
        S.sessao = sessaoDe(j, S.sessao); S.expirada = false;
        await kv.set('sessao', S.sessao);
      } catch (e) {
        if (!semConexao(e) && [400, 401, 403].includes(e.status)) S.expirada = true;
        throw e;
      } finally { _renovando = null; }
    })();
    return _renovando;
  }
  const projetoFixo = () => { const c = window.SOUZA_CONFIG || {}; return c.rdoUrl && c.rdoChave ? { url: c.rdoUrl.replace(/\/+$/, ''), chave: c.rdoChave } : null; };

  async function conectar({ url: u, chave, email, senha }) {
    const fixo = projetoFixo();
    const sb = fixo || { url: String(u || '').trim().replace(/\/+$/, ''), chave: String(chave || '').trim() };
    if (!/^https?:\/\//.test(sb.url) || !sb.chave) throw new Error('Informe o endereço do projeto do RDO e a chave pública.');
    const antes = S.sb;
    S.sb = sb;
    let j;
    try { j = await req('/auth/v1/token?grant_type=password', { method: 'POST', json: { email: String(email || '').trim(), password: senha }, auth: false }); }
    catch (e) {
      S.sb = antes;
      if (semConexao(e)) throw new Error('Sem conexão com a internet. A primeira conexão precisa de internet.');
      if (/invalid login credentials/i.test(e.message)) throw new Error('E-mail ou senha incorretos neste projeto.');
      throw e;
    }
    const sessao = sessaoDe(j);
    const anterior = await kv.get('usuario');
    if (anterior && sessao.user && anterior !== sessao.user.id) await store.limpar();
    S.sessao = sessao; S.expirada = false;
    if (!fixo) await kv.set('supabase', sb);
    await kv.set('sessao', sessao);
    if (sessao.user) await kv.set('usuario', sessao.user.id);
    await store.carregar();
    avisar('remoto');
    sync.agora();
  }
  async function desconectar() {
    try { if (navigator.onLine && S.sessao) await req('/auth/v1/logout', { method: 'POST' }); } catch { /* ignora */ }
    S.sessao = null;
    await kv.del('sessao'); await kv.del('usuario');
    await store.limpar();
    avisar('remoto');
  }

  /* ---------------- sincronização ---------------- */
  let _timer = null;
  const sync = {
    agendar(ms = 1200) { clearTimeout(_timer); _timer = setTimeout(sync.agora, ms); avisarEstado(); },
    async agora() {
      if (!S.sessao || !S.sb) return;
      if (S.sincronizando) { S.deNovo = true; return; }
      if (!navigator.onLine) { S.online = false; avisarEstado(); return; }
      S.sincronizando = true; avisarEstado();
      try {
        await fila;
        await enviar();
        const mudou = await baixar();
        S.ultima = new Date(); S.erro = null; S.online = true; S.ausente = false;
        if (mudou) avisar('remoto');
      } catch (e) {
        if (semConexao(e)) { S.online = false; S.erro = null; }
        else if (e.status === 404 || /does not exist|Could not find|schema cache|Tabela inv/i.test(e.message || '')) { S.ausente = true; S.erro = null; }
        else S.erro = e.message || String(e);
      } finally {
        S.sincronizando = false;
        avisarEstado();
        if (S.deNovo) { S.deNovo = false; sync.agendar(300); }
      }
      fotos.processar();
    },
  };
  async function enviar() {
    for (const t of TAB) {
      const ids = [...pend.keys()].filter((k) => k.startsWith(t + '|')).map((k) => k.slice(t.length + 1));
      for (let i = 0; i < ids.length; i += 100) {
        const lote = ids.slice(i, i + 100).map((id) => mapas[t].get(id)).filter(Boolean)
          .map((r) => ({ id: r.id, tipo: r.tipo, grupo: r.grupo, dados: r.dados, atualizado_em: r.atualizado_em, excluido: !!r.excluido }));
        if (!lote.length) continue;
        await req('/rest/v1/rpc/sincronizar_lote', { method: 'POST', json: { p_tabela: t, p_lote: lote } });
        const ok = [];
        for (const x of lote) { const k = t + '|' + x.id; if (pend.get(k) === x.atualizado_em) { pend.delete(k); ok.push(k); } }
        await op('pend', 'readwrite', (s) => { ok.forEach((k) => s.delete(k)); });
      }
    }
  }
  async function baixar() {
    let mudou = false;
    for (const t of TAB) {
      const cursor = (await kv.get('cursor:' + t)) || null;
      let desde = cursor ? new Date(Date.parse(cursor) - 120000).toISOString() : '1970-01-01T00:00:00Z';
      let maior = cursor;
      for (let pag = 0; pag < 100; pag++) {
        const lista = await req(`/rest/v1/${t}?select=id,tipo,grupo,dados,atualizado_em,excluido,servidor_em&servidor_em=gt.${encodeURIComponent(desde)}&order=servidor_em.asc,id.asc&limit=1000`);
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
          mudou = true;
        }
        if (salvar.length) await op('reg', 'readwrite', (s) => { salvar.forEach((r) => s.put(r)); });
        if (limpos.length) await op('pend', 'readwrite', (s) => { limpos.forEach((k) => s.delete(k)); });
        if (lista.length < 1000) break;
        desde = lista[lista.length - 1].servidor_em;
      }
      if (maior && maior !== cursor) await kv.set('cursor:' + t, maior);
    }
    return mudou;
  }
  window.addEventListener('online', () => { S.online = true; sync.agora(); });
  window.addEventListener('offline', () => { S.online = false; avisarEstado(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.iniciado) sync.agora(); });
  setInterval(() => { if (document.visibilityState === 'visible' && S.iniciado) sync.agora(); }, 60000);

  const estadoOuvintes = new Set();
  function avisarEstado() { estadoOuvintes.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
  function estado() {
    const n = pend.size, f = fotos.contagem();
    const parts = [];
    if (f.enviar) parts.push(`${f.enviar} ${f.enviar === 1 ? 'foto enviando' : 'fotos enviando'}`);
    if (f.ponte) parts.push(`${f.ponte} ${f.ponte === 1 ? 'foto aguardando' : 'fotos aguardando'} a ponte do Drive`);
    const extra = parts.length ? ' · ' + parts.join(' · ') : '';
    if (S.expirada) return { cls: 'erro', txt: 'Sessão do diário expirada, entre de novo', acao: 'relogin' };
    if (!S.online || !navigator.onLine) return { cls: 'offline', txt: (n ? `Sem internet, ${n} ${n === 1 ? 'alteração' : 'alterações'} no aparelho` : 'Sem internet, dados salvos no aparelho') + extra };
    if (S.ausente) return { cls: 'erro', txt: 'Falta rodar o SQL do RDO no Supabase', title: 'Rode o arquivo rdo_estrutura.sql no SQL Editor do projeto do RDO.' };
    if (S.sincronizando) return { cls: 'pendente', txt: 'Sincronizando…' + extra };
    if (S.erro) return { cls: 'erro', txt: 'Erro ao sincronizar' + extra, title: S.erro, acao: 'sync' };
    if (f.erro) return { cls: 'erro', txt: 'Erro ao enviar fotos' + extra, title: f.erro, acao: 'sync' };
    if (n) return { cls: 'pendente', txt: `${n} ${n === 1 ? 'alteração aguardando' : 'alterações aguardando'} envio` + extra, acao: 'sync' };
    const h = S.ultima ? S.ultima.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return { cls: f.enviar || f.ponte ? 'pendente' : 'ok', txt: (h ? `Sincronizado às ${h}` : 'Sincronizado') + extra, acao: 'sync' };
  }

  /* ---------------- configuração do RDO (registro "config") ---------------- */
  const CONFIG_PADRAO = {
    empresa: { nome: 'Souza Engenharia', telefone: '(71) 99723-7168', email: 'obras@souzaengenharia.com', site: 'www.souzaengenharia.com' },
    responsavel: { nome: 'Eng. Breno Rocha Souza', email: 'obras@souzaengenharia.com', cargo: 'Engenheiro Responsável', registro: 'CREA-BA 052098151-0' },
    assinatura: '',
    ponte: { url: '', senha: '' },
  };
  function config() {
    const r = store.get('obras', ID_CONFIG);
    const c = (r && r.dados) || {};
    return {
      empresa: Object.assign({}, CONFIG_PADRAO.empresa, c.empresa || {}),
      responsavel: Object.assign({}, CONFIG_PADRAO.responsavel, c.responsavel || {}),
      assinatura: c.assinatura || '',
      ponte: Object.assign({}, CONFIG_PADRAO.ponte, c.ponte || {}),
    };
  }
  function salvarConfig(c) { store.salvar('obras', ID_CONFIG, 'config', c); }

  /* ---------------- arquivos no Storage ---------------- */
  const urlPublica = (path) => (S.sb ? url(`/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`) : '');
  async function enviarArquivo(path, blob, tipo) {
    await req(`/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', body: blob, headers: { 'Content-Type': tipo || blob.type || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': '31536000' } });
    return urlPublica(path);
  }
  async function apagarArquivos(paths) {
    if (!paths.length) return;
    await req(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', json: { prefixes: paths } });
  }
  const rpc = (fn, body = {}) => req('/rest/v1/rpc/' + fn, { method: 'POST', json: body });

  /* ---------------- ponte do Google Drive ---------------- */
  async function ponte(payload, cfg = config()) {
    if (!cfg.ponte.url) throw new Error('A ponte do Google Drive ainda não foi configurada.');
    let res;
    try { res = await fetch(cfg.ponte.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ senha: cfg.ponte.senha }, payload)) }); }
    catch (e) { throw new Error('Não foi possível falar com a ponte do Drive. Confira o endereço e a internet.'); }
    const txt = await res.text();
    let j;
    try { j = JSON.parse(txt); } catch { throw new Error('A ponte do Drive não respondeu como esperado. Confira se ela foi implantada como "App da Web" com acesso "Qualquer pessoa".'); }
    if (!j.ok) throw new Error(j.erro || 'A ponte do Drive recusou o envio.');
    return j;
  }
  const blobBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

  /* ---------------- fila de fotos ---------------- */
  const locais = new Map(); // id da foto -> URL local da cópia reduzida
  const F = { recs: new Map(), rodando: false, erro: null };
  const pasta = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  const p3 = (n) => String(n || 0).padStart(3, '0');
  const fotos = {
    async carregar() {
      const recs = (await op('fotos', 'readonly', (s) => s.getAll())) || [];
      F.recs.clear();
      recs.forEach((r) => { F.recs.set(r.id, { id: r.id, obraId: r.obraId, diarioId: r.diarioId, path: r.path, printOk: r.printOk, driveOk: r.driveOk, apagar: r.apagar }); if (r.print && !locais.has(r.id)) locais.set(r.id, URL.createObjectURL(r.print)); });
    },
    contagem() {
      let enviar = 0, ponteN = 0;
      const temPonte = !!config().ponte.url;
      F.recs.forEach((r) => { if (r.apagar) return; if (!r.printOk || (temPonte && !r.driveOk)) enviar++; else if (!r.driveOk) ponteN++; });
      return { enviar, ponte: ponteN, erro: F.erro };
    },
    /** Guarda a foto no aparelho e coloca na fila de envio. */
    async adicionar({ id, obraId, diarioId, path, print, original, tipo }) {
      const rec = { id, obraId, diarioId, path, print, original, tipo: tipo || original.type || 'image/jpeg', printOk: false, driveOk: false, criadoEm: Date.now() };
      await op('fotos', 'readwrite', (s) => { s.put(rec); });
      F.recs.set(id, { id, obraId, diarioId, path, printOk: false, driveOk: false });
      locais.set(id, URL.createObjectURL(print));
      avisarEstado();
      setTimeout(() => fotos.processar(), 300);
    },
    src(f) { return locais.get(f.id) || (f.path ? urlPublica(f.path) : ''); },
    pendente(f) { const r = F.recs.get(f.id); return r ? { print: !r.printOk, drive: !r.driveOk } : null; },
    /** Tira a foto do diário: apaga a cópia do Storage e manda a original para a lixeira do Drive. */
    async apagar(f) {
      const r = F.recs.get(f.id);
      if (r && !r.printOk && !r.driveOk) {
        await op('fotos', 'readwrite', (s) => { s.delete(f.id); });
        F.recs.delete(f.id);
      } else {
        const rec = { id: f.id, path: f.path, driveId: f.drive && f.drive.id, apagar: true, printOk: true, driveOk: true };
        await op('fotos', 'readwrite', (s) => { s.put(rec); });
        F.recs.set(f.id, rec);
      }
      if (locais.has(f.id)) { URL.revokeObjectURL(locais.get(f.id)); locais.delete(f.id); }
      avisarEstado();
      setTimeout(() => fotos.processar(), 300);
    },
    async processar() {
      if (F.rodando || !S.sessao || !S.sb || !navigator.onLine || !F.recs.size) return;
      F.rodando = true;
      const inicio = new Set(F.recs.keys());
      try {
        const cfg = config();
        for (const meta of [...F.recs.values()]) {
          const rec = await op('fotos', 'readonly', (s) => s.get(meta.id));
          if (!rec) { F.recs.delete(meta.id); continue; }
          if (rec.apagar) {
            try { if (rec.path) await apagarArquivos([rec.path]); } catch (e) { if (e.status !== 404 && e.status !== 400) throw e; }
            if (rec.driveId && cfg.ponte.url) { try { await ponte({ acao: 'apagar', ids: [rec.driveId] }, cfg); } catch { /* fica no Drive */ } }
            await op('fotos', 'readwrite', (s) => { s.delete(rec.id); });
            F.recs.delete(rec.id);
            continue;
          }
          const dRec = store.get('diarios', rec.diarioId);
          if (!dRec) { await op('fotos', 'readwrite', (s) => { s.delete(rec.id); }); F.recs.delete(rec.id); continue; }
          if (!rec.printOk) {
            await enviarArquivo(rec.path, rec.print, 'image/jpeg');
            rec.printOk = true;
            await op('fotos', 'readwrite', (s) => { s.put(rec); });
            meta.printOk = true;
            avisarEstado();
          }
          if (!rec.driveOk && cfg.ponte.url) {
            const d = dRec.dados, oRec = store.get('obras', rec.obraId);
            const obra = (oRec && oRec.dados) || {};
            const lista = window.RDO.servicos(obra);
            const f = (d.fotos || []).find((x) => x.id === rec.id);
            if (!f) { await op('fotos', 'readwrite', (s) => { s.delete(rec.id); }); F.recs.delete(rec.id); continue; }
            const s = lista.find((x) => x.id === f.servicoId);
            const seq = (d.fotos || []).indexOf(f) + 1;
            const ext = /png/i.test(rec.tipo) ? 'png' : /heic|heif/i.test(rec.tipo) ? 'heic' : 'jpg';
            const resp = await ponte({
              acao: 'foto',
              obra: pasta(`${obra.contrato ? obra.contrato + ' - ' : ''}${obra.nome || 'Obra'}`),
              dia: pasta(`${d.data} - RDO nº ${p3(d.numero)}`),
              nome: pasta(`RDO ${p3(d.numero)} - ${s ? `${s.num ? s.num + ' ' : ''}${s.desc}` : 'Geral da obra'} - ${String(seq).padStart(2, '0')} (${rec.id.slice(0, 6)})`) + '.' + ext,
              tipo: rec.tipo,
              base64: await blobBase64(rec.original),
            }, cfg);
            marcarDrive(rec.diarioId, rec.obraId, rec.id, resp);
            rec.driveOk = true;
          }
          if (rec.printOk && rec.driveOk) {
            await op('fotos', 'readwrite', (s) => { s.delete(rec.id); });
            F.recs.delete(rec.id);
          } else {
            rec.original = rec.original || null;
            await op('fotos', 'readwrite', (s) => { s.put(rec); });
            F.recs.set(rec.id, { id: rec.id, obraId: rec.obraId, diarioId: rec.diarioId, path: rec.path, printOk: rec.printOk, driveOk: rec.driveOk });
          }
          avisarEstado();
        }
        F.erro = null;
      } catch (e) {
        F.erro = semConexao(e) ? null : e.message || String(e);
      } finally {
        F.rodando = false;
        avisarEstado();
        // fotos que entraram na fila durante o envio (importação, várias fotos de uma vez)
        if (!F.erro && navigator.onLine && [...F.recs.keys()].some((k) => !inicio.has(k))) setTimeout(() => fotos.processar(), 500);
      }
    },
  };
  /** Grava no diário o endereço da original no Drive (sem mexer no resto do diário). */
  function marcarDrive(diarioId, obraId, fotoId, resp) {
    const r = store.get('diarios', diarioId);
    if (r) {
      const d = Object.assign({}, r.dados);
      d.fotos = (d.fotos || []).map((f) => (f.id === fotoId ? Object.assign({}, f, { drive: { id: resp.id, url: resp.url } }) : f));
      if (resp.pasta) d.drivePasta = resp.pasta;
      store.gravar('diarios', [{ id: r.id, tipo: r.tipo, grupo: r.grupo, dados: d }]);
    }
    const o = store.get('obras', obraId);
    if (o && resp.pastaObra && o.dados.drivePasta !== resp.pastaObra) store.gravar('obras', [{ id: o.id, tipo: o.tipo, grupo: o.grupo, dados: Object.assign({}, o.dados, { drivePasta: resp.pastaObra }) }]);
  }

  /* ---------------- início ---------------- */
  function iniciar() {
    if (S.iniciado) return S.iniciado;
    S.iniciado = (async () => {
      S.sb = projetoFixo() || (await kv.get('supabase')) || null;
      S.sessao = (await kv.get('sessao')) || null;
      await store.carregar();
      await fotos.carregar();
      S.pronto = true;
      if (S.sessao) setTimeout(sync.agora, 200);
    })();
    return S.iniciado;
  }

  return {
    TAB, store, sync, estado, iniciar, conectar, desconectar, config, salvarConfig, fotos, ponte, enviarArquivo, apagarArquivos, urlPublica, rpc,
    conectado: () => !!(S.sb && S.sessao),
    pronto: () => !!S.pronto,
    projeto: () => S.sb,
    projetoFixo,
    conta: () => (S.sessao && S.sessao.user ? S.sessao.user.email : ''),
    ultima: () => S.ultima,
    ouvirEstado: (fn) => { estadoOuvintes.add(fn); return () => estadoOuvintes.delete(fn); },
    pendentes: () => pend.size,
  };
})();
