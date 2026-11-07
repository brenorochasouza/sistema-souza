'use strict';
/* =========================================================
   Visão do cliente: diários de obra aprovados (só consulta).
   Dois jeitos de entrar:
   - /rdo com usuário e senha (Portal.iniciarSessao): funções
     rdo_cliente_obras e rdo_cliente_obra, uma ou várias obras;
   - /clientesobras com o código antigo da obra: portal_entrar.
   O banco só devolve o que é das obras liberadas.
   ========================================================= */
(function () {
  const R = window.RDO;
  const { esc, dataBR } = R;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const cfg = window.SOUZA_CONFIG || {};
  const BASE = String(cfg.rdoUrl || '').replace(/\/+$/, '');
  const CHAVE = cfg.rdoChave || '';
  const LOGO = '../img/logo.png?v=1.4.3';
  const est = { codigo: '', dados: null, aba: 'diarios', aberto: null, sessao: null, obras: null };
  const guardar = { get() { try { return localStorage.getItem('rdo.portal.codigo') || ''; } catch { return ''; } }, set(v) { try { if (v) localStorage.setItem('rdo.portal.codigo', v); else localStorage.removeItem('rdo.portal.codigo'); } catch { /* sem armazenamento */ } } };

  const icone = (path) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const IC = {
    esq: '<path d="m15 6-6 6 6 6"/>',
    imprimir: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    galeria: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    aprovar: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    obras: '<path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/>',
  };

  function toast(msg, erro) {
    let w = $('.toast-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; w.setAttribute('aria-live', 'polite'); document.body.appendChild(w); }
    const t = document.createElement('div'); t.className = 'toast ' + (erro ? 'erro' : ''); t.textContent = msg; w.appendChild(t);
    setTimeout(() => t.remove(), erro ? 7000 : 3800);
  }
  function confirmar(titulo, msg, ok) {
    return new Promise((res) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div><h2>${esc(titulo)}</h2></div></div><div class="mb"><p class="msg">${esc(msg)}</p></div>
        <div class="mf"><button class="btn" data-r="0">Cancelar</button><button class="btn primary" data-r="1">${esc(ok)}</button></div></div>`;
      document.body.appendChild(bg);
      bg.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b || e.target === bg) { bg.remove(); res(!!(b && b.dataset.r === '1')); } });
    });
  }

  async function rpc(fn, corpo) {
    if (est.sessao) { const j = await est.sessao.rpc(fn, corpo); if (j && j.erro) throw new Error(j.erro); return j; }
    if (!BASE || !CHAVE) throw new Error('O portal ainda não foi configurado.');
    let res;
    try { res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: CHAVE, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); }
    catch { throw new Error('Sem conexão. Confira a internet e tente de novo.'); }
    const txt = await res.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* sem json */ }
    if (!res.ok) throw new Error((j && (j.message || j.msg)) || 'Não foi possível acessar agora. Tente de novo em instantes.');
    if (j && j.erro) throw new Error(j.erro);
    return j;
  }
  const fotoSrc = (f) => (f.path ? `${BASE}/storage/v1/object/public/rdo-fotos/${f.path.split('/').map(encodeURIComponent).join('/')}` : '');
  const fmtCod = (v) => { const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return s.length > 4 ? s.slice(0, 4) + '-' + s.slice(4) : s; };

  /* ---------------- entrada ---------------- */
  function telaEntrada(msg = '') {
    $('#app').innerHTML = `<div class="login pt-login"><div class="login-box">
      <img src="${LOGO}" alt="Souza Engenharia" class="login-logo">
      <form class="card" id="pt-form" onsubmit="return false"><div class="bd">
        <h1>Diários de obra</h1>
        <p class="muted small">Digite o código da obra que a Souza Engenharia enviou para você.</p>
        <label class="f"><span>Código da obra</span><input class="inp pt-cod" id="pt-cod" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" maxlength="9" value="${esc(est.codigo)}" autofocus></label>
        ${msg ? `<p class="aviso-campo">${esc(msg)}</p>` : ''}
        <button class="btn primary grande" type="submit" id="pt-entrar">Ver os diários</button>
        <p class="small muted pt-alt">Recebeu usuário e senha? <a href="../rdo/">Entre por aqui</a>.</p>
      </div></form>
      <p class="tiny muted" style="text-align:center">Souza Engenharia · obras@souzaengenharia.com</p>
    </div></div>`;
    const inp = $('#pt-cod');
    inp.addEventListener('input', () => { const p = inp.selectionStart, a = inp.value.length; inp.value = fmtCod(inp.value); const d = inp.value.length - a; inp.setSelectionRange(p + d, p + d); });
    $('#pt-form').addEventListener('submit', () => entrar(inp.value));
  }
  async function entrar(codigo, silencioso) {
    const cod = fmtCod(codigo);
    if (cod.replace('-', '').length < 8) { if (!silencioso) telaEntrada('O código tem 8 letras e números, como ABCD-2345.'); else telaEntrada(); return; }
    const b = $('#pt-entrar'); if (b) b.disabled = true;
    try {
      const j = await rpc('portal_entrar', { p_codigo: cod });
      est.codigo = cod; est.dados = j; guardar.set(cod);
      const h = location.hash.match(/^#\/d\/(.+)$/);
      est.aberto = h ? decodeURIComponent(h[1]) : null;
      desenhar();
    } catch (e) {
      if (silencioso) guardar.set('');
      est.codigo = cod;
      telaEntrada(e.message);
    }
  }
  function sair() {
    if (est.sessao) { est.sessao.sair(); return; }
    guardar.set(''); est.dados = null; est.codigo = ''; history.replaceState(null, '', location.pathname); telaEntrada();
  }

  /* ---------------- entrada com usuário e senha (/rdo) ---------------- */
  const topo = (o) => `<header class="pt-topo"><img src="${LOGO}" alt="Souza Engenharia">${o && o.logoCliente && o.logoCliente.url ? `<img src="${esc(o.logoCliente.url)}" alt="">` : ''}
    <span class="pt-topo-a">${est.sessao ? `<button class="btn ghost sm" data-p="senha">${icone(IC.chave)}<span>Senha</span></button>` : ''}<button class="btn ghost sm" data-p="sair">${icone(IC.sair)}Sair</button></span></header>`;
  async function iniciarSessao(sessao) {
    est.sessao = sessao;
    $('#app').innerHTML = '<div class="pt-carregando">Carregando…</div>';
    try { est.obras = (await rpc('rdo_cliente_obras')) || []; }
    catch (e) { telaErro(e.message); return; }
    const h = location.hash.match(/^#\/o\/([^/]+)(?:\/d\/(.+))?$/);
    if (h && est.obras.some((o) => o.id === decodeURIComponent(h[1]))) { await abrirObra(decodeURIComponent(h[1]), h[2] ? decodeURIComponent(h[2]) : null); return; }
    if (est.obras.length === 1) { await abrirObra(est.obras[0].id); return; }
    telaObras();
  }
  function telaErro(msg) {
    $('#app').innerHTML = `<div class="pt">${topo()}<div class="card"><div class="empty"><b>Não foi possível abrir as obras</b>${esc(msg)}<div class="actions" style="justify-content:center;margin-top:12px"><button class="btn" data-p="recarregar">Tentar de novo</button></div></div></div></div>`;
  }
  function telaObras() {
    est.dados = null; est.aberto = null;
    const nome = est.sessao.nome || '';
    const lista = est.obras || [];
    $('#app').innerHTML = `<div class="pt">${topo()}
      <div class="pagehead"><div><h1>Diários de obra</h1><p>${nome ? `Olá, ${esc(nome.split(/\s+/)[0])}. ` : ''}${lista.length ? `${lista.length} ${lista.length === 1 ? 'obra liberada' : 'obras liberadas'} para você.` : ''}</p></div></div>
      ${lista.length ? `<div class="r-obras">${lista.map((o) => `<a class="card r-obra pt-obra" href="#/o/${encodeURIComponent(o.id)}" data-p="obra" data-id="${esc(o.id)}"><div class="r-obra-l">
          <div class="r-obra-t"><b>${esc(o.nome || 'Obra')}</b>${o.contrato ? `<span class="chip neutro">${esc(o.contrato)}</span>` : ''}</div>
          <small>${esc([o.contratante, o.local].filter(Boolean).join(' · ') || ' ')}</small>
          <div class="r-obra-m"><span>${o.diarios} ${Number(o.diarios) === 1 ? 'diário aprovado' : 'diários aprovados'}</span><span>${o.ultimo ? `Último em ${dataBR(o.ultimo)}` : 'Nenhum ainda'}</span></div></div></a>`).join('')}</div>`
        : '<div class="card"><div class="empty"><b>Nenhuma obra liberada ainda</b>Quando a Souza Engenharia liberar uma obra para você, ela aparece aqui.</div></div>'}
    </div>`;
  }
  async function abrirObra(id, diario) {
    $('#app').innerHTML = '<div class="pt-carregando">Carregando…</div>';
    try {
      est.dados = await rpc('rdo_cliente_obra', { p_obra: id });
      est.aba = 'diarios';
      est.aberto = diario || null;
      if (!diario) history.replaceState(null, '', '#/o/' + encodeURIComponent(id));
      desenhar();
    } catch (e) { toast(e.message, true); telaObras(); }
  }
  function modalSenha() {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div><h2>Trocar a senha</h2><p>Use pelo menos 8 caracteres.</p></div></div>
      <div class="mb"><label class="f"><span>Senha nova</span><input class="inp" type="password" name="s1" autocomplete="new-password"></label>
        <label class="f" style="margin-top:10px"><span>Repita a senha nova</span><input class="inp" type="password" name="s2" autocomplete="new-password"></label></div>
      <div class="mf"><button class="btn" data-r="0">Cancelar</button><button class="btn primary" data-r="1">Trocar a senha</button></div></div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== bg) return;
      if (!b || b.dataset.r === '0') { bg.remove(); return; }
      const s1 = $('[name=s1]', bg).value, s2 = $('[name=s2]', bg).value;
      if (s1 !== s2) { toast('As duas senhas não são iguais.', true); return; }
      b.disabled = true;
      try { await est.sessao.trocarSenha(s1); bg.remove(); toast('Senha trocada.'); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    });
    setTimeout(() => { const i = $('[name=s1]', bg); if (i) i.focus(); }, 50);
  }

  /* ---------------- obra ---------------- */
  function desenhar() {
    const j = est.dados; if (!j) { if (est.sessao) telaObras(); else telaEntrada(); return; }
    if (est.aberto) { telaDiario(est.aberto); return; }
    const o = j.obra, ds = (j.diarios || []).slice().sort(R.ordemDiario);
    const prog = R.progresso(o, ds), pz = R.prazo(o, ds, R.dataRef(o, ds));
    const clima = (d) => R.PERIODOS.map(([k]) => (d.clima && d.clima[k] && d.clima[k].tempo ? `<span title="${esc(R.nomeDe(R.TEMPOS, d.clima[k].tempo))}">${R.iconeTempo(d.clima[k].tempo)}</span>` : '<span class="r-sem">-</span>')).join('');
    const barra = (p, cls = '') => `<div class="r-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, p || 0)).toFixed(1)}%"></i></div>`;
    const variasObras = est.sessao && (est.obras || []).length > 1;
    $('#app').innerHTML = `<div class="pt">${topo(o)}
      ${variasObras ? `<a class="btn ghost sm pt-voltar" href="#/" data-p="obras">${icone(IC.esq)}Todas as obras</a>` : ''}
      <div class="pagehead"><div><h1>${esc(o.nome)}</h1><p>${esc([o.contrato && 'Contrato ' + o.contrato, o.contratante, o.local].filter(Boolean).join(' · '))}</p></div></div>
      <div class="r-kpis">
        <div><span>Avanço da obra</span><b>${R.fmtPct(prog.geral, 1)}</b>${barra(prog.geral)}</div>
        <div><span>Prazo</span><b>${pz.decorrido !== null && pz.atual ? `Dia ${pz.decorrido} de ${pz.atual}` : '-'}</b><small>${pz.termino ? `Término previsto ${dataBR(pz.termino)}` : ''}</small></div>
        <div><span>Diários</span><b>${ds.length}</b><small>aprovados pela Souza</small></div>
        <div><span>Último diário</span><b>${ds.length ? `nº ${esc(ds[ds.length - 1].numero)}` : '-'}</b><small>${ds.length ? dataBR(ds[ds.length - 1].data) : ''}</small></div>
      </div>
      <nav class="ob-abas"><a href="#" data-p="aba" data-v="diarios" class="${est.aba === 'diarios' ? 'ativo' : ''}">Diários</a><a href="#" data-p="aba" data-v="avanco" class="${est.aba === 'avanco' ? 'ativo' : ''}">Avanço dos serviços</a>${o.drivePasta ? `<a href="${esc(o.drivePasta)}" target="_blank" rel="noopener">${icone(IC.galeria)}Fotos em alta qualidade</a>` : ''}</nav>
      ${est.aba === 'avanco' ? (prog.servicos.length ? `<div class="card"><div class="bd flush tblwrap"><table class="tbl r-tsv"><thead><tr><th>Item</th><th>Serviço</th><th>Executado</th></tr></thead><tbody>
          ${(o.etapas || []).map((e) => `<tr class="r-et"><td class="r-num">${esc(e.num || '')}</td><td>${esc(e.titulo || 'Etapa')}</td><td class="r-pc"><span>${R.fmtPct(prog.etapas.get(e.id), 1)}</span>${barra(prog.etapas.get(e.id))}</td></tr>
            ${(e.servicos || []).map((s) => { const x = prog.por.get(s.id); return `<tr class="r-svp"><td class="r-num">${esc(s.num || '')}</td><td>${esc(s.desc)}</td><td class="r-pc"><span>${R.fmtPct(x.pct)}</span>${barra(x.pct, x.pct >= 100 ? 'ok' : x.pct > 0 ? 'and' : '')}</td></tr>`; }).join('')}`).join('')}
          </tbody></table></div></div>` : '<div class="card"><div class="empty">Sem serviços cadastrados.</div></div>')
        : ds.length ? `<div class="card r-dlist">${ds.slice().reverse().map((d) => `<a class="r-dl pt-dl" href="#/d/${encodeURIComponent(d.id)}" data-p="abrir" data-id="${esc(d.id)}">
            <span class="r-dl-n">nº ${esc(d.numero)}</span><span class="r-dl-d"><b>${dataBR(d.data)}</b><small>${R.diaSemana(d.data)}</small></span><span class="r-dl-c">${clima(d)}</span>
            <span class="r-dl-i"><span>${(d.atividades || []).length} ${(d.atividades || []).length === 1 ? 'atividade' : 'atividades'}</span><span>${(d.fotos || []).length} ${(d.fotos || []).length === 1 ? 'foto' : 'fotos'}</span></span>
            <span class="chip ok">Aprovado</span></a>`).join('')}</div>`
          : '<div class="card"><div class="empty"><b>Nenhum diário aprovado ainda</b>Os diários aparecem aqui assim que forem aprovados pela Souza Engenharia.</div></div>'}
    </div>`;
  }

  /* ---------------- diário ---------------- */
  function telaDiario(id) {
    const j = est.dados;
    const ds = (j.diarios || []).slice().sort(R.ordemDiario);
    const d = ds.find((x) => x.id === id);
    if (!d) { est.aberto = null; history.replaceState(null, '', location.pathname); desenhar(); return; }
    const o = j.obra;
    const i = ds.indexOf(d);
    $('#app').innerHTML = `<div class="pt">${topo(o)}
      <div class="ob-topo"><a class="btn icon" href="#" data-p="voltar" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>RDO nº ${esc(d.numero)}</b><span>${R.diaSemana(d.data)}, ${dataBR(d.data)} · ${esc(o.nome)}</span></div>
        <div class="actions">${d.drivePasta ? `<a class="btn" href="${esc(d.drivePasta)}" target="_blank" rel="noopener">${icone(IC.galeria)}<span>Fotos em alta</span></a>` : ''}<button class="btn" data-p="pdf">${icone(IC.imprimir)}<span>Baixar PDF</span></button></div></div>
      <div class="r-papel" data-papel>${R.diarioHTML({ obra: o, diario: d, diarios: ds, aprovacoes: j.aprovacoes, empresa: j.empresa, logoSouza: LOGO, fotoSrc })}</div>
      <div class="pt-nav">${i > 0 ? `<a class="btn" href="#/d/${encodeURIComponent(ds[i - 1].id)}" data-p="abrir" data-id="${esc(ds[i - 1].id)}">${icone(IC.esq)}nº ${esc(ds[i - 1].numero)}</a>` : '<span></span>'}${i < ds.length - 1 ? `<a class="btn" href="#/d/${encodeURIComponent(ds[i + 1].id)}" data-p="abrir" data-id="${esc(ds[i + 1].id)}">nº ${esc(ds[i + 1].numero)} ›</a>` : ''}</div>
    </div>`;
    R.ajustarZoom($('[data-papel]'));
    window.scrollTo(0, 0);
  }
  function pdf() {
    const j = est.dados, d = (j.diarios || []).find((x) => x.id === est.aberto); if (!d) return;
    const ds = (j.diarios || []).slice().sort(R.ordemDiario);
    $('#print-root').innerHTML = R.diarioHTML({ obra: j.obra, diario: d, diarios: ds, aprovacoes: j.aprovacoes, empresa: j.empresa, logoSouza: LOGO, fotoSrc });
    let st = $('#estilo-pagina');
    if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
    const rod = `Relatório ${dataBR(d.data)} nº ${d.numero} · ${j.obra.nome}`.replace(/"/g, "'");
    st.textContent = `@page{size:A4 portrait;margin:10mm 10mm 12mm 10mm;@bottom-left{content:"${rod}";font-family:Arial,sans-serif;font-size:7.5pt;color:#777}@bottom-right{content:"Página " counter(page) " de " counter(pages);font-family:Arial,sans-serif;font-size:7.5pt;color:#777}}`;
    const ant = document.title;
    document.title = `${j.obra.contrato ? j.obra.contrato + ' - ' : ''}RDO nº ${String(d.numero).padStart(3, '0')} - ${dataBR(d.data).replace(/\//g, '-')}`;
    document.body.classList.add('imprimindo');
    const fim = () => { document.body.classList.remove('imprimindo'); document.title = ant; $('#print-root').innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    const imgs = $$('#print-root img');
    Promise.race([Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))), new Promise((r) => setTimeout(r, 15000))])
      .then(() => setTimeout(() => window.print(), 80));
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const a = b.dataset.p;
    if (a === 'sair') { e.preventDefault(); sair(); }
    if (a === 'aba') { e.preventDefault(); est.aba = b.dataset.v; desenhar(); }
    const base = () => (est.sessao && est.dados ? '#/o/' + encodeURIComponent(est.dados.obra.id) : '');
    if (a === 'abrir') { e.preventDefault(); est.aberto = b.dataset.id; history.pushState(null, '', (base() || '#') + '/d/' + encodeURIComponent(b.dataset.id)); telaDiario(b.dataset.id); }
    if (a === 'voltar') { e.preventDefault(); est.aberto = null; history.pushState(null, '', base() || location.pathname); desenhar(); }
    if (a === 'pdf') { e.preventDefault(); pdf(); }
    if (a === 'obra') { e.preventDefault(); history.pushState(null, '', '#/o/' + encodeURIComponent(b.dataset.id)); abrirObra(b.dataset.id); }
    if (a === 'obras') { e.preventDefault(); history.pushState(null, '', location.pathname); telaObras(); }
    if (a === 'senha') { e.preventDefault(); modalSenha(); }
    if (a === 'recarregar') { e.preventDefault(); iniciarSessao(est.sessao); }
  });
  window.addEventListener('popstate', () => {
    if (est.sessao) {
      const h = location.hash.match(/^#\/o\/([^/]+)(?:\/d\/(.+))?$/);
      if (!h) { if ((est.obras || []).length > 1) telaObras(); else if (est.dados) { est.aberto = null; desenhar(); } return; }
      const id = decodeURIComponent(h[1]);
      if (!est.dados || est.dados.obra.id !== id) { abrirObra(id, h[2] ? decodeURIComponent(h[2]) : null); return; }
      est.aberto = h[2] ? decodeURIComponent(h[2]) : null;
      desenhar();
      return;
    }
    if (!est.dados) return;
    const h = location.hash.match(/^#\/d\/(.+)$/);
    est.aberto = h ? decodeURIComponent(h[1]) : null;
    desenhar();
  });

  window.Portal = { iniciarSessao };
  if (!window.PORTAL_SESSAO) {
    const salvo = guardar.get();
    if (salvo) entrar(salvo, true); else telaEntrada();
  }

  /* Foto que ainda não está disponível: um aviso no lugar da imagem quebrada. */
  document.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.semfoto || !/\/storage\/v1\/object\/public\/rdo-fotos\//.test(img.src)) return;
    img.dataset.semfoto = '1';
    const ph = document.createElement('div');
    ph.className = 'r-semfoto';
    ph.innerHTML = '<b>Foto indisponível no momento</b><span>Tente de novo mais tarde</span>';
    img.replaceWith(ph);
  }, true);
})();
