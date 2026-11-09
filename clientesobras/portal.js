'use strict';
/* =========================================================
   Visão do cliente: diários de obra aprovados (só consulta).
   Dois jeitos de entrar:
   - clientes.souzaengenharia.com (ou /rdo) com usuário e senha
     (Portal.iniciarSessao): área do cliente com os serviços, os
     documentos do Drive (rdo_area), as obras (rdo_cliente_obras e
     rdo_cliente_obra), os vencimentos e as ofertas;
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
  const LOGO = `${window.SOUZA_RAIZ || '../'}img/logo.png?v=1.4.11`;
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
    dir: '<path d="m9 6 6 6-6 6"/>',
    nota: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    pasta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    baixar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    externo: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const _brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (n) => _brl.format(Number(n) || 0).replace(/\u00a0/g, ' ');

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

  /* ---------------- área do cliente (usuário e senha) ---------------- */
  // Rotas: #/ início · #/c/<cliente> · #/c/<cliente>/s/<serviço> · …/s/<serviço>/p/<pasta> · …/s/<serviço>/v/<documento|contrato>
  //        #/o/<obra> · #/o/<obra>/d/<diário>
  const topo = (o) => `<header class="pt-topo"><img class="pt-logo" src="${LOGO}" alt="Souza Engenharia">${o && o.logoCliente && o.logoCliente.url ? `<img class="pt-logo-cli" src="${esc(o.logoCliente.url)}" alt="">` : ''}
    <span class="pt-topo-a">${est.sessao ? `<button class="btn ghost sm" data-p="senha">${icone(IC.chave)}<span>Senha</span></button>` : ''}<button class="btn ghost sm" data-p="sair">${icone(IC.sair)}Sair</button></span></header>`;
  const dec = (x) => decodeURIComponent(x);
  const enc = (x) => encodeURIComponent(x);
  const clientesSessao = () => (est.area && est.area.clientes) || [];
  const clienteSessao = (id) => clientesSessao().find((c) => c.id === id);
  const obrasDo = (cid) => (est.obras || []).filter((o) => o.cliente === cid);
  const obrasAvulsas = () => (est.obras || []).filter((o) => !o.cliente || !clienteSessao(o.cliente));
  const primeiroNome = () => String((est.sessao && est.sessao.nome) || '').split(/\s+/)[0];
  async function iniciarSessao(sessao) {
    est.sessao = sessao;
    $('#app').innerHTML = '<div class="pt-carregando">Carregando…</div>';
    try {
      const [area, obras] = await Promise.all([
        rpc('rdo_area').catch((e) => { if (/Could not find|does not exist|schema cache|404/i.test(e.message || '')) return { clientes: [] }; throw e; }),
        rpc('rdo_cliente_obras'),
      ]);
      est.area = area || { clientes: [] };
      est.obras = obras || [];
    } catch (e) { telaErro(e.message); return; }
    rota();
  }
  async function rota() {
    const h = location.hash;
    let m = h.match(/^#\/o\/([^/]+)(?:\/d\/(.+))?$/);
    if (m) {
      const id = dec(m[1]);
      if (!est.dados || est.dados.obra.id !== id) {
        $('#app').innerHTML = '<div class="pt-carregando">Carregando…</div>';
        try { est.dados = await rpc('rdo_cliente_obra', { p_obra: id }); est.aba = 'diarios'; }
        catch (e) { toast(e.message, true); location.hash = '#/'; return; }
      }
      est.aberto = m[2] ? dec(m[2]) : null;
      desenhar();
      return;
    }
    est.dados = null; est.aberto = null;
    m = h.match(/^#\/c\/([^/]+)\/doc\/([^/]+)\/([^/]+)$/); // endereço antigo de documento
    if (m) { location.replace(`#/c/${m[1]}/s/${m[2]}/v/${m[3]}`); return; }
    m = h.match(/^#\/c\/([^/]+)\/s\/([^/]+)(?:\/(p|v)\/([^/]+))?$/);
    if (m) {
      const c = clienteSessao(dec(m[1])), s = c && (c.servicos || []).find((x) => x.id === dec(m[2]));
      if (!s) { location.replace(c ? '#/c/' + m[1] : '#/'); return; }
      if (m[3] === 'v') telaDoc(c, s, dec(m[4])); else telaServico(c, s, m[3] === 'p' ? dec(m[4]) : null);
      return;
    }
    m = h.match(/^#\/c\/([^/]+)$/);
    if (m && clienteSessao(dec(m[1]))) { telaCliente(dec(m[1])); return; }
    telaInicio();
  }
  /** Para onde volta quem está numa obra: o cliente dela, a lista ou nada. */
  function voltarDaObra(o) {
    if (o && o.cliente && clienteSessao(o.cliente)) return { href: '#/c/' + enc(o.cliente), rot: clienteSessao(o.cliente).nome };
    if (clientesSessao().length + obrasAvulsas().length > 1) return { href: '#/', rot: 'Início' };
    return null;
  }
  function telaErro(msg) {
    $('#app').innerHTML = `<div class="pt">${topo()}<div class="card"><div class="empty"><b>Não foi possível abrir a área do cliente</b>${esc(msg)}<div class="actions" style="justify-content:center;margin-top:12px"><button class="btn" data-p="recarregar">Tentar de novo</button></div></div></div></div>`;
  }
  const cardObra = (o) => `<a class="card r-obra pt-obra" href="#/o/${enc(o.id)}"><div class="r-obra-l">
      <div class="r-obra-t"><b>${esc(o.nome || 'Obra')}</b>${o.contrato ? `<span class="chip neutro">${esc(o.contrato)}</span>` : ''}</div>
      <small>${esc([o.contratante, o.local].filter(Boolean).join(' · ') || ' ')}</small>
      <div class="r-obra-m"><span>${o.diarios} ${Number(o.diarios) === 1 ? 'diário aprovado' : 'diários aprovados'}</span><span>${o.ultimo ? `Último em ${dataBR(o.ultimo)}` : 'Nenhum ainda'}</span></div></div></a>`;
  function telaInicio() {
    const cs = clientesSessao(), av = obrasAvulsas();
    if (cs.length === 1 && !av.length) { history.replaceState(null, '', '#/c/' + enc(cs[0].id)); telaCliente(cs[0].id); return; }
    if (!cs.length && av.length === 1) { location.replace('#/o/' + enc(av[0].id)); return; }
    $('#app').innerHTML = `<div class="pt">${topo()}
      <div class="pagehead"><div><h1>Área do cliente</h1><p>${primeiroNome() ? `Olá, ${esc(primeiroNome())}.` : ''}</p></div></div>
      ${cs.length ? `<div class="pt-clis">${cs.map((c) => { const n = (c.servicos || []).length, no = obrasDo(c.id).length; return `<a class="card pt-cli" href="#/c/${enc(c.id)}"><b>${esc(c.nome)}</b><small>${n} ${n === 1 ? 'serviço' : 'serviços'}${no ? ` · ${no} ${no === 1 ? 'obra' : 'obras'}` : ''}</small></a>`; }).join('')}</div>` : ''}
      ${av.length ? `${cs.length ? '<h2 class="pt-h2">Obras</h2>' : ''}<div class="r-obras">${av.map(cardObra).join('')}</div>` : ''}
      ${!cs.length && !av.length ? '<div class="card"><div class="empty"><b>Nada liberado ainda</b>Quando a Souza Engenharia liberar os documentos e as obras do seu condomínio, eles aparecem aqui.</div></div>' : ''}
    </div>`;
  }
  /* ----- serviços: pastas, documentos, contrato e pagamentos ----- */
  const bloqueado = (n) => !!(n.bloqueio && n.bloqueio.ativo);
  /** Aparece para o cliente: bloqueado (com o aviso), com conteúdo, ou vazio marcado "Em elaboração". */
  const visivel = (n) => bloqueado(n) || R.temConteudo(n) || n.vazio !== 'oculta';
  const docsProntos = (l) => (l || []).reduce((t, n) => t + (bloqueado(n) ? 0 : (n.url ? 1 : 0) + (n.tipo === 'pasta' ? docsProntos(n.filhos) : 0)), 0);
  /** Pasta que só tem o link do Drive (nada dentro dela no portal): abre direto a pasta do Drive. */
  const soLink = (n) => !!n.url && !(n.filhos || []).some(R.temConteudo);
  const caminho = (s, pais) => [nomeSv(s)].concat(pais.map((p) => p.nome)).join(' › ');
  const temElab = (l) => (l || []).some((n) => !bloqueado(n) && (n.tipo === 'pasta' ? (!R.temConteudo(n) && n.vazio !== 'oculta') || temElab(n.filhos) : !n.url && n.vazio !== 'oculta'));
  const baseSv = (c, s) => `#/c/${enc(c.id)}/s/${enc(s.id)}`;
  const nomeSv = (s) => s.titulo || R.tipoDe(s);
  const hojeISO = () => (R.isoData ? R.isoData(new Date()) : new Date().toISOString().slice(0, 10));
  function linhaNo(n, base) {
    if (bloqueado(n)) return `<li class="bloq"><div>${icone(IC.cadeado)}<span><b>${esc(n.nome)}</b><small>${esc(n.bloqueio.msg || R.MSG_PRELIMINAR)}</small></span></div></li>`;
    if (!R.temConteudo(n)) return `<li class="elab"><div>${icone(n.tipo === 'pasta' ? IC.pasta : IC.nota)}<span><b>${esc(n.nome)}</b><small>Em elaboração</small></span>${icone(IC.relogio)}</div></li>`;
    if (n.tipo === 'pasta' && !soLink(n)) {
      const k = (n.filhos || []).filter(visivel).length + (n.url ? 1 : 0);
      return `<li><a href="${base}/p/${enc(n.id)}">${icone(IC.pasta)}<span><b>${esc(n.nome)}</b><small>${k} ${k === 1 ? 'item' : 'itens'}</small></span>${icone(IC.dir)}</a></li>`;
    }
    const d = R.drive(n.url) || { tipo: 'link', abrir: n.url };
    return d.tipo === 'link'
      ? `<li><a href="${esc(d.abrir)}" target="_blank" rel="noopener">${icone(IC.externo)}<span><b>${esc(n.nome)}</b><small>Abre em outra aba</small></span></a></li>`
      : `<li><a href="${base}/v/${enc(n.id)}">${icone(d.tipo === 'pasta' ? IC.pasta : IC.nota)}<span><b>${esc(n.nome)}</b><small>${d.tipo === 'pasta' ? 'Pasta com arquivos' : 'Documento'}</small></span>${icone(IC.dir)}</a></li>`;
  }
  const htmlNos = (lista, base) => { const l = (lista || []).filter(visivel); return l.length ? `<ul class="pt-docs">${l.map((n) => linhaNo(n, base)).join('')}</ul>` : ''; };
  /** Contrato e pagamentos: o link do contrato e as parcelas (copiadas da carteira da Souza). */
  function htmlContrato(c, s) {
    const f = s.financeiro, temF = f && ((f.parcelas || []).length || f.valor);
    if (!s.contratoUrl && !temF) return '';
    const r = temF ? R.resumoFinanceiro(f) : null, hoje = hojeISO();
    const dc = s.contratoUrl ? R.drive(s.contratoUrl) || { tipo: 'link', abrir: s.contratoUrl } : null;
    const estP = (p) => (p.pago ? ['ok', p.dataPago ? `Paga em ${dataBR(p.dataPago)}` : 'Paga'] : p.venc && p.venc < hoje ? ['estourado', `Venceu em ${dataBR(p.venc)}`] : ['neutro', p.venc ? `Vence em ${dataBR(p.venc)}` : 'A vencer']);
    return `<section class="card pt-ct"><div class="hd"><div><h3>Contrato e pagamentos</h3>${r ? `<p>${r.parcelas.filter((p) => p.pago).length} de ${r.parcelas.length} ${r.parcelas.length === 1 ? 'parcela paga' : 'parcelas pagas'}</p>` : ''}</div>
        ${dc ? `<a class="btn sm" href="${dc.tipo === 'link' ? esc(dc.abrir) : baseSv(c, s) + '/v/contrato'}" ${dc.tipo === 'link' ? 'target="_blank" rel="noopener"' : ''}>${icone(IC.nota)}Ver o contrato</a>` : ''}</div>
      ${r ? `<div class="bd"><div class="pt-ct-k"><div><span>Valor do contrato</span><b>${brl(r.total)}</b></div><div><span>Pago</span><b class="pt-ok">${brl(r.pago)}</b></div><div><span>A pagar</span><b>${brl(r.aPagar)}</b></div></div>
        <div class="r-bar ok pt-ct-bar" role="img" aria-label="${r.pct.toFixed(0)}% pago"><i style="width:${Math.min(100, r.pct).toFixed(1)}%"></i></div>
        ${r.parcelas.length ? `<ul class="pt-pc">${r.parcelas.map((p, i) => { const [cls, txt] = estP(p); return `<li><span class="pt-pc-t"><b>${esc(p.desc || `Parcela ${i + 1}`)}</b><small>${esc(txt)}</small></span><span class="pt-pc-v">${brl(p.valor)}</span><span class="chip ${cls}">${p.pago ? 'Paga' : cls === 'estourado' ? 'Em aberto' : 'A vencer'}</span></li>`; }).join('')}</ul>` : ''}</div>` : ''}</section>`;
  }
  function cardServico(c, s) {
    const n = docsProntos(R.estruturaDe(s)), el = temElab(R.estruturaDe(s));
    const f = s.financeiro, ps = (f && f.parcelas) || [];
    const partes = [n ? `${n} ${n === 1 ? 'documento disponível' : 'documentos disponíveis'}` : el ? 'Documentos em elaboração' : 'Documentos ainda não entregues'];
    if (n && el) partes.push('outros em elaboração');
    if (ps.length) partes.push(`${ps.filter((p) => p.pago).length} de ${ps.length} parcelas pagas`);
    return `<a class="card pt-sv" href="${baseSv(c, s)}"><span class="pt-sv-ic">${icone(IC.pasta)}</span><span class="pt-sv-t"><b>${esc(nomeSv(s))}</b>
      <small>${esc([R.tipoDe(s), s.codigo, s.data && dataBR(s.data)].filter(Boolean).join(' · '))}</small><small>${esc(partes.join(' · '))}</small></span>
      <span class="chip ${s.situacao === 'entregue' ? 'ok' : 'atencao'}">${s.situacao === 'entregue' ? 'Entregue' : 'Em andamento'}</span>${icone(IC.dir)}</a>`;
  }
  function telaCliente(cid) {
    const c = clienteSessao(cid);
    const sv = c.servicos || [];
    const hoje = hojeISO();
    const vencs = sv.map((s) => ({ s, v: R.vencimento(s) })).filter((x) => x.v).map((x) => Object.assign(x, R.situacaoVenc(x.v, hoje))).sort((a, b) => a.v.localeCompare(b.v));
    const emDia = new Set(sv.filter((s) => { const v = R.vencimento(s); return !v || R.situacaoVenc(v, hoje).estado === 'emdia'; }).map((s) => s.tipo));
    const ofertas = R.OFERTAS.filter((o) => !emDia.has(o.tipo) && !vencs.some((x) => x.s.tipo === o.tipo)).slice(0, 6);
    const obras = obrasDo(cid);
    const quem = primeiroNome() ? `Sou ${primeiroNome()}, do ${c.nome}.` : `Sou do ${c.nome}.`;
    const varios = clientesSessao().length + obrasAvulsas().length > 1;
    $('#app').innerHTML = `<div class="pt pt-area">${topo()}
      ${varios ? `<a class="btn ghost sm pt-voltar" href="#/">${icone(IC.esq)}Início</a>` : ''}
      <div class="pagehead"><div><h1>${esc(c.nome)}</h1><p>${primeiroNome() ? `Olá, ${esc(primeiroNome())}. ` : ''}Documentos e serviços da Souza Engenharia.</p></div></div>
      ${vencs.length ? `<section class="card pt-venc"><div class="hd"><div><h3>Vencimentos</h3><p>Quando cada laudo precisa ser renovado.</p></div></div><div class="bd"><ul>${vencs.map((x) => `<li class="${x.estado}">
          <span class="pt-venc-t"><b>${esc(nomeSv(x.s))}</b><small>${x.estado === 'vencido' ? `Venceu em ${dataBR(x.v)}` : `Vence em ${dataBR(x.v)}`}${x.estado === 'perto' ? ` · faltam ${x.dias} ${x.dias === 1 ? 'dia' : 'dias'}` : ''}</small></span>
          ${x.estado === 'emdia' ? '<span class="chip ok">Em dia</span>' : `<a class="btn sm ${x.estado === 'vencido' ? 'primary' : ''}" href="${esc(R.linkWhats(`Olá! ${quem} O ${nomeSv(x.s)}${x.s.codigo ? ' (' + x.s.codigo + ')' : ''} ${x.estado === 'vencido' ? 'venceu' : 'vence'} em ${dataBR(x.v)}. Gostaria de agendar a renovação.`))}" target="_blank" rel="noopener">Pedir renovação</a>`}</li>`).join('')}</ul></div></section>` : ''}
      <h2 class="pt-h2">Serviços</h2>
      ${sv.length ? `<div class="pt-svs">${sv.map((s) => cardServico(c, s)).join('')}</div>` : '<div class="card"><div class="empty">Nenhum serviço liberado ainda.</div></div>'}
      ${obras.length ? `<h2 class="pt-h2">Obras</h2><div class="r-obras">${obras.map(cardObra).join('')}</div>` : ''}
      ${ofertas.length ? `<h2 class="pt-h2">Outros serviços da Souza Engenharia</h2><div class="pt-ofs">${ofertas.map((o) => `<div class="card pt-of ${o.tipo === 'atc' ? 'destaque' : ''}"><b>${esc(o.titulo)}</b><p>${esc(o.texto)}</p>
          <a class="btn sm ${o.tipo === 'atc' ? 'primary' : ''}" href="${esc(R.linkWhats(`Olá! ${quem} Tenho interesse em ${o.titulo}. Podem me enviar uma proposta?`))}" target="_blank" rel="noopener">Quero um orçamento</a></div>`).join('')}</div>` : ''}
    </div>`;
    window.scrollTo(0, 0);
  }
  /** Página do serviço (pid vazio) ou de uma pasta dele. */
  function telaServico(c, s, pid) {
    const raiz = R.estruturaDe(s), base = baseSv(c, s);
    let lista = raiz, titulo = nomeSv(s), sub = [R.tipoDe(s), s.codigo, s.data && dataBR(s.data)].filter(Boolean).join(' · '), volta = '#/c/' + enc(c.id);
    if (pid) {
      const a = R.acharNo(raiz, pid);
      if (!a || a.no.tipo !== 'pasta' || bloqueado(a.no) || a.pais.some(bloqueado)) { location.replace(base); return; }
      lista = a.no.filhos || []; titulo = a.no.nome;
      // pasta com o link do Drive e mais coisas dentro: a pasta do Drive vem primeiro
      if (a.no.url) lista = [{ id: a.no.id, tipo: 'doc', nome: 'Arquivos da pasta', url: a.no.url }].concat(lista);
      sub = caminho(s, a.pais);
      volta = a.pais.length ? `${base}/p/${enc(a.pais[a.pais.length - 1].id)}` : base;
    }
    const docs = htmlNos(lista, base);
    $('#app').innerHTML = `<div class="pt pt-area">${topo()}
      <div class="ob-topo"><a class="btn icon" href="${volta}" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>${esc(titulo)}</b><span>${esc(sub)}${pid ? '' : ` · ${esc(c.nome)}`}</span></div>
        ${pid ? '' : `<div class="actions"><span class="chip ${s.situacao === 'entregue' ? 'ok' : 'atencao'}">${s.situacao === 'entregue' ? 'Entregue' : 'Em andamento'}</span></div>`}</div>
      ${pid ? '' : htmlContrato(c, s)}
      ${pid ? '' : '<h2 class="pt-h2">Documentos</h2>'}
      <section class="card pt-sv-docs"><div class="bd">${docs || `<p class="small muted">${pid ? 'Esta pasta está vazia.' : 'Os documentos aparecem aqui assim que forem entregues.'}</p>`}</div></section>
    </div>`;
    window.scrollTo(0, 0);
  }
  function telaDoc(c, s, nid) {
    const raiz = R.estruturaDe(s), base = baseSv(c, s);
    let url = '', nome = '', volta = base, onde = nomeSv(s);
    if (nid === 'contrato') { url = s.contratoUrl; nome = 'Contrato'; }
    else {
      const a = R.acharNo(raiz, nid);
      if (a && a.no.url && !bloqueado(a.no) && !a.pais.some(bloqueado)) {
        url = a.no.url; nome = a.no.nome; onde = caminho(s, a.pais);
        if (a.no.tipo === 'pasta' && !soLink(a.no)) volta = `${base}/p/${enc(a.no.id)}`;
        else if (a.pais.length) volta = `${base}/p/${enc(a.pais[a.pais.length - 1].id)}`;
      }
    }
    if (!url) { location.replace(base); return; }
    const d = R.drive(url) || { tipo: 'link', abrir: url };
    $('#app').innerHTML = `<div class="pt pt-docv">${topo()}
      <div class="ob-topo"><a class="btn icon" href="${volta}" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>${esc(nome)}</b><span>${esc(onde)}</span></div>
        <div class="actions">${d.baixar ? `<a class="btn" href="${esc(d.baixar)}" target="_blank" rel="noopener">${icone(IC.baixar)}<span>Baixar</span></a>` : ''}<a class="btn" href="${esc(d.abrir)}" target="_blank" rel="noopener">${icone(IC.externo)}<span>Abrir no Drive</span></a></div></div>
      ${d.preview ? `<div class="pt-frame ${d.tipo}"><iframe src="${esc(d.preview)}" title="${esc(nome)}" loading="lazy" allow="autoplay" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
        <p class="small muted pt-doc-dica">${d.tipo === 'pasta' ? 'Toque num arquivo para abrir. ' : ''}Se não aparecer, use "Abrir no Drive".</p>` : ''}
    </div>`;
    window.scrollTo(0, 0);
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
    const j = est.dados; if (!j) { if (est.sessao) telaInicio(); else telaEntrada(); return; }
    if (est.aberto) { telaDiario(est.aberto); return; }
    const o = j.obra, ds = (j.diarios || []).slice().sort(R.ordemDiario);
    const prog = R.progresso(o, ds), pz = R.prazo(o, ds, R.dataRef(o, ds));
    const clima = (d) => R.PERIODOS.map(([k]) => (d.clima && d.clima[k] && d.clima[k].tempo ? `<span title="${esc(R.nomeDe(R.TEMPOS, d.clima[k].tempo))}">${R.iconeTempo(d.clima[k].tempo)}</span>` : '<span class="r-sem">-</span>')).join('');
    const barra = (p, cls = '') => `<div class="r-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, p || 0)).toFixed(1)}%"></i></div>`;
    const volta = est.sessao ? voltarDaObra((est.obras || []).find((x) => x.id === o.id) || o) : null;
    $('#app').innerHTML = `<div class="pt">${topo(o)}
      ${volta ? `<a class="btn ghost sm pt-voltar" href="${esc(volta.href)}">${icone(IC.esq)}${esc(volta.rot)}</a>` : ''}
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
    if (a === 'abrir') { e.preventDefault(); if (est.sessao) { location.hash = base() + '/d/' + encodeURIComponent(b.dataset.id); return; } est.aberto = b.dataset.id; history.pushState(null, '', '#/d/' + encodeURIComponent(b.dataset.id)); telaDiario(b.dataset.id); }
    if (a === 'voltar') { e.preventDefault(); if (est.sessao) { location.hash = base(); return; } est.aberto = null; history.pushState(null, '', location.pathname); desenhar(); }
    if (a === 'pdf') { e.preventDefault(); pdf(); }
    if (a === 'senha') { e.preventDefault(); modalSenha(); }
    if (a === 'recarregar') { e.preventDefault(); iniciarSessao(est.sessao); }
  });
  window.addEventListener('hashchange', () => { if (est.sessao && est.area) rota(); });
  window.addEventListener('popstate', () => {
    if (est.sessao) return;
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
