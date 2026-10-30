'use strict';
/* =========================================================
   Diário de obra (RDO): obras, diário do dia, avanço dos
   serviços, relatórios por categoria e acesso do cliente.
   Os dados ficam no projeto Supabase do RDO (RDOB), separado
   do projeto principal. O documento sai de RDO.diarioHTML.
   ========================================================= */
(function () {
  const { $, $$, esc, norm, hojeISO, dataBR, uid } = Sis.util;
  const { ui, icone } = Sis;
  const A = Sis.acoes;
  const R = window.RDO;
  const B = window.RDOB;

  const ICS = {
    rdo: '<path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z"/><path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="m9 14 2 2 4-4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    galeria: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    relatorio: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 17v-3M12 17v-6M15 17v-2"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    aprovar: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    imprimir: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    cima: '<path d="m6 15 6-6 6 6"/>',
    baixo: '<path d="m6 9 6 6 6-6"/>',
    pontos: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
    nuvemPend: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 12v4M12 9v.01"/>',
  };
  Object.keys(ICS).forEach((k) => { if (!Sis.ICONES[k]) Sis.ICONES[k] = ICS[k]; });

  /* ---------------- dados ---------------- */
  const copia = (v) => JSON.parse(JSON.stringify(v));
  const rid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const ALF = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  function gerarCodigo() {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    const s = Array.from(b, (x) => ALF[x % ALF.length]).join('');
    return s.slice(0, 4) + '-' + s.slice(4);
  }
  const obras = () => B.store.dados('obras', 'obra').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const obra = (id) => { const r = id && B.store.get('obras', id); return r && r.tipo === 'obra' ? Object.assign({ id: r.id }, copia(r.dados)) : null; };
  const diariosDe = (obraId) => B.store.lista('diarios', 'diario').filter((r) => r.grupo === obraId).map((r) => Object.assign({ id: r.id, obraId: r.grupo }, r.dados)).sort(R.ordemDiario);
  const aprovacoesDe = (obraId) => B.store.lista('aprovacoes').filter((r) => r.grupo === obraId).map((r) => r.dados);
  function salvarObra(o) {
    const d = copia(o); delete d.id;
    d.atualizadoEm = new Date().toISOString();
    B.store.salvar('obras', o.id, 'obra', d, o.clienteId || null);
  }
  function normalizarObra(o) {
    o.etapas = Array.isArray(o.etapas) ? o.etapas : [];
    o.etapas.forEach((e) => { e.id = e.id || rid(); e.servicos = Array.isArray(e.servicos) ? e.servicos : []; e.servicos.forEach((s) => { s.id = s.id || rid(); }); });
    o.grupos = Array.isArray(o.grupos) ? o.grupos : [];
    o.equipamentos = Array.isArray(o.equipamentos) ? o.equipamentos : [];
    o.assinantes = Object.assign({ responsavel: {}, fiscal: {}, contratante: {} }, o.assinantes || {});
    o.acessos = Object.assign({}, o.acessos || {});
    return o;
  }
  /** Grava o diário sem perder o que a fila de fotos gravou enquanto ele estava aberto. */
  function gravarDiario(d) {
    const atual = B.store.get('diarios', d.id);
    const dados = copia(d); delete dados.id; delete dados.obraId;
    if (atual) {
      const rem = new Map((atual.dados.fotos || []).map((f) => [f.id, f]));
      dados.fotos = (dados.fotos || []).map((f) => { const r = rem.get(f.id); return r && r.drive && !f.drive ? Object.assign({}, f, { drive: r.drive }) : f; });
      if (!dados.drivePasta && atual.dados.drivePasta) dados.drivePasta = atual.dados.drivePasta;
    }
    B.store.salvar('diarios', d.id, 'diario', dados, d.obraId);
  }
  const cfgRdo = () => B.config();
  const urlPortal = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'clientesobras/';
  const logoSouza = () => `img/logo.png?v=${Sis.VERSAO}`;
  /** "2,5", "2.5", "1.250,5" e "10%" viram número. */
  function lerNum(v) {
    let t = String(v ?? '').replace('%', '').trim();
    if (!t) return null;
    t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    const n = Number(t);
    return isFinite(n) ? n : null;
  }

  /* ---------------- imagens ---------------- */
  async function lerImagem(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* usa <img> */ } }
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não consegui abrir esta imagem.')); i.src = URL.createObjectURL(file); });
  }
  /** Reduz a imagem para o maior lado caber em "max" px. */
  async function reduzir(file, max, tipo = 'image/jpeg', q = 0.72) {
    const img = await lerImagem(file);
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    const k = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (tipo === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    if (img.close) img.close();
    const blob = await new Promise((res) => c.toBlob(res, tipo, q));
    if (!blob) throw new Error('Não consegui preparar a imagem.');
    return { blob, w, h };
  }

  /* ---------------- estado ---------------- */
  const est = { filtro: 'andamento', d: null, dId: null, sujo: false, timer: null, servFoto: null, rel: { de: '', ate: '', aprovados: true, serv: '' }, obraRel: null };
  let _redesenhar = false;
  const digitando = () => { const a = document.activeElement; return a && $('#conteudo') && $('#conteudo').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  function redesenhar() {
    if (Sis.rota().mod !== 'rdo') return;
    if (ui.modalAberto() || digitando() || document.body.classList.contains('imprimindo')) { _redesenhar = true; return; }
    _redesenhar = false; Sis.desenhar(true);
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (_redesenhar && !ui.modalAberto() && !digitando()) { _redesenhar = false; if (Sis.rota().mod === 'rdo') Sis.desenhar(true); } }, 60));
  B.store.ouvir((origem) => { if (origem === 'remoto') redesenhar(); });
  B.ouvirEstado(pintarSync);
  function pintarSync() {
    const st = B.estado();
    $$('[data-rsync]').forEach((el) => {
      el.className = `r-sync ${st.cls}`;
      el.title = st.title || st.txt;
      el.innerHTML = `<i></i><span>${esc(st.txt)}</span>`;
      el.dataset.acao = st.acao || '';
    });
    // tira o aviso de envio das fotos que já subiram
    $$('.r-ft[data-id] .r-ft-p').forEach((i) => { const id = i.closest('.r-ft').dataset.id; if (est.d && !B.fotos.pendente({ id })) i.remove(); });
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-rsync]');
    if (!el) return;
    if (el.dataset.acao === 'sync') B.sync.agora();
    if (el.dataset.acao === 'relogin') modalConectar(true);
  });
  const syncHTML = () => '<button type="button" class="r-sync" data-rsync></button>';

  /* =========================================================
     Conexão com o projeto do RDO
     ========================================================= */
  function htmlConectar(relogin) {
    const fixo = B.projetoFixo();
    const ant = B.projeto();
    const email = B.conta() || (Sis.sync.info().email || '');
    return `${fixo ? '' : `<label class="f"><span>Endereço do projeto do RDO (Project URL)</span><input class="inp" name="url" value="${esc(ant ? ant.url : '')}" placeholder="https://xxxxxxxx.supabase.co" autocapitalize="off" spellcheck="false"></label>
      <label class="f"><span>Chave pública do projeto do RDO (publishable ou anon)</span><input class="inp" name="chave" value="${esc(ant ? ant.chave : '')}" autocapitalize="off" spellcheck="false"></label>`}
      <label class="f"><span>E-mail</span><input class="inp" type="email" name="email" value="${esc(email)}" autocapitalize="off"></label>
      <label class="f"><span>Senha deste projeto</span><input class="inp" type="password" name="senha" autocomplete="current-password" ${relogin || email ? 'autofocus' : ''}></label>`;
  }
  async function conectarDe(raiz) {
    await B.conectar({ url: $('[name=url]', raiz) && $('[name=url]', raiz).value, chave: $('[name=chave]', raiz) && $('[name=chave]', raiz).value, email: $('[name=email]', raiz).value, senha: $('[name=senha]', raiz).value });
  }
  function modalConectar(relogin) {
    ui.abrirModal({
      titulo: relogin ? 'Entrar de novo no Diário de obra' : 'Conectar o Diário de obra', sub: relogin ? 'A sessão expirou. O que você lançou neste aparelho continua guardado.' : '',
      corpo: htmlConectar(relogin),
      botoes: [{ rot: 'Cancelar' }, { rot: 'Entrar', classe: 'primary', acao: async (m) => { try { await conectarDe(m.el); m.fechar(); ui.toast('Diário de obra conectado.'); Sis.desenhar(true); } catch (e) { ui.toast(e.message, 'erro'); } } }],
    });
  }
  function telaConectar(el) {
    el.innerHTML = `<div class="pagehead"><div><h1>Diário de obra</h1><p>Relatórios diários, fotos e acesso do cliente</p></div></div>
      <div class="card r-con"><div class="hd"><div><h3>Conectar ao projeto do RDO</h3><p>O Diário de obra usa um projeto do Supabase separado do resto do sistema. Entre uma vez neste aparelho.</p></div></div>
      <form class="bd" id="rdo-con" onsubmit="return false">${htmlConectar(false)}<div class="actions"><button class="btn primary" type="submit">Conectar</button></div></form></div>`;
    $('#rdo-con', el).addEventListener('submit', async (ev) => {
      const b = $('button[type=submit]', ev.target); b.disabled = true;
      try { await conectarDe(ev.target); ui.toast('Diário de obra conectado.'); Sis.desenhar(); } catch (e) { ui.toast(e.message, 'erro'); b.disabled = false; }
    });
  }

  /* =========================================================
     Lista de obras
     ========================================================= */
  function resumoObra(o) {
    const ds = diariosDe(o.id);
    const prog = R.progresso(o, ds);
    const ult = ds[ds.length - 1];
    const pz = R.prazo(o, ds, R.dataRef(o, ds));
    return { ds, prog, ult, pz, rasc: ds.filter((d) => d.status !== 'aprovado').length };
  }
  const barra = (pct, cls = '') => `<div class="r-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct || 0)).toFixed(1)}%"></i></div>`;
  function telaLista(el) {
    const todas = obras();
    const lista = todas.filter((o) => (est.filtro === 'concluida' ? o.situacao === 'concluida' : o.situacao !== 'concluida'));
    const cfg = cfgRdo();
    const faltaCfg = !cfg.ponte.url || !cfg.assinatura;
    el.innerHTML = `<div class="pagehead"><div><h1>Diário de obra</h1><p>${todas.filter((o) => o.situacao !== 'concluida').length} em andamento</p></div>
      <div class="actions"><a class="btn" href="#/rdo/config">${icone('config')}Configurações</a><button class="btn primary" data-a="rdo-nova-obra">${icone('mais')}Nova obra</button></div></div>
      ${syncHTML()}
      ${faltaCfg ? `<a class="r-aviso" href="#/rdo/config">${icone('info')}<span>${[!cfg.ponte.url && 'Configure a ponte do Google Drive para guardar as fotos em alta qualidade', !cfg.assinatura && 'envie a imagem da sua assinatura'].filter(Boolean).join(' e ')}.</span></a>` : ''}
      <div class="seg r-filtro"><button class="${est.filtro !== 'concluida' ? 'on' : ''}" data-a="rdo-filtro" data-f="andamento">Em andamento</button><button class="${est.filtro === 'concluida' ? 'on' : ''}" data-a="rdo-filtro" data-f="concluida">Concluídas</button></div>
      ${lista.length ? `<div class="r-obras">${lista.map((o) => {
        const r = resumoObra(o);
        return `<div class="card r-obra"><a class="r-obra-l" href="#/rdo/${esc(o.id)}">
          <div class="r-obra-t"><b>${esc(o.nome)}</b>${o.contrato ? `<span class="chip neutro">${esc(o.contrato)}</span>` : ''}</div>
          <small>${esc(o.contratante || 'Sem contratante')}</small>
          <div class="r-obra-p"><span>Avanço</span><b>${R.fmtPct(r.prog.geral, 1)}</b></div>${barra(r.prog.geral)}
          <div class="r-obra-m"><span>${r.pz.decorrido !== null && r.pz.atual ? `Dia ${r.pz.decorrido} de ${r.pz.atual}` : 'Prazo não informado'}</span><span>${r.ult ? `Último: nº ${esc(r.ult.numero)} em ${dataBR(r.ult.data)}` : 'Sem diários'}</span></div></a>
          <div class="r-obra-a">${r.rasc ? `<span class="chip atencao">${r.rasc} ${r.rasc === 1 ? 'rascunho' : 'rascunhos'}</span>` : '<span></span>'}<button class="btn sm suave" data-a="rdo-novo-diario" data-o="${esc(o.id)}">${icone('mais')}Diário de hoje</button></div></div>`;
      }).join('')}</div>` : `<div class="card"><div class="empty"><b>${est.filtro === 'concluida' ? 'Nenhuma obra concluída' : 'Nenhuma obra em andamento'}</b>${est.filtro === 'concluida' ? '' : 'Cadastre a obra com a lista de serviços do contrato para começar os diários.'}</div></div>`}`;
    pintarSync();
  }
  A['rdo-filtro'] = (b) => { est.filtro = b.dataset.f; Sis.desenhar(true); };

  A['rdo-nova-obra'] = () => {
    let sel;
    ui.abrirModal({
      titulo: 'Nova obra', sub: 'Depois você completa os serviços do contrato, a mão de obra e os assinantes no cadastro.',
      corpo: `<div class="grid2">
        <label class="f req span2"><span>Nome da obra</span><input class="inp" name="nome" placeholder="Ex.: Construção da quadra" autofocus></label>
        <label class="f"><span>Contrato</span><input class="inp" name="contrato" placeholder="Ex.: SE253.QUA" autocapitalize="characters"></label>
        <label class="f"><span>Data de início</span><input class="inp" type="date" name="inicio" value="${hojeISO()}"></label>
        <div class="span2" id="rdo-n-cli"></div>
        <label class="f"><span>Prazo contratual (dias)</span><input class="inp" name="prazo" inputmode="numeric" placeholder="Ex.: 92"></label>
      </div>`,
      aoAbrir: (m) => { sel = Sis.seletorCliente($('#rdo-n-cli', m), { rotulo: 'Contratante (cadastro de clientes)' }); },
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Criar obra', classe: 'primary', acao: (m) => {
          const nome = $('[name=nome]', m.el).value.trim();
          if (!nome) { $('[name=nome]', m.el).classList.add('erro'); return; }
          const erro = sel.validar(); if (erro) { ui.toast(erro); return; }
          const cfg = cfgRdo();
          const cliId = sel.valor().clienteId;
          const cli = cliId ? Sis.clientes.get(cliId) : null;
          const prazo = parseInt($('[name=prazo]', m.el).value, 10);
          const o = normalizarObra({
            id: uid(), nome, contrato: $('[name=contrato]', m.el).value.trim(), clienteId: cliId || '',
            contratante: cli ? cli.nome : '', local: cli ? cli.endereco || '' : '', responsavel: cfg.responsavel.nome,
            dataInicio: $('[name=inicio]', m.el).value || '', prazoDias: prazo > 0 ? prazo : null, situacao: 'andamento',
            etapas: [], grupos: R.GRUPOS_PADRAO.map(([g, fs]) => ({ id: rid(), nome: g, funcoes: fs.map((f) => ({ id: rid(), nome: f })) })), equipamentos: [],
            assinantes: { responsavel: Object.assign({}, cfg.responsavel), fiscal: {}, contratante: { nome: '', cargo: cli ? `Representante de ${cli.nome}` : '' } },
            acessos: { cliente: gerarCodigo(), fiscal: gerarCodigo(), contratante: gerarCodigo() }, criadoEm: new Date().toISOString(),
          });
          salvarObra(o);
          m.fechar();
          location.hash = `#/rdo/${o.id}/cadastro`;
          ui.toast('Obra criada. Agora cadastre os serviços do contrato.');
        },
      }],
    });
  };

  /* =========================================================
     Obra: topo, abas
     ========================================================= */
  const ABAS = [['diarios', 'Diários', 'rdo'], ['servicos', 'Serviços e avanço', 'lista'], ['relatorios', 'Relatórios', 'relatorio'], ['cadastro', 'Cadastro da obra', 'editar']];
  function telaObra(el, id, aba) {
    const o = obra(id);
    if (!o) { el.innerHTML = '<div class="card"><div class="empty"><b>Obra não encontrada</b><a href="#/rdo">Ver as obras</a></div></div>'; return; }
    normalizarObra(o);
    const r = resumoObra(o);
    const kpis = aba === 'diarios' || aba === 'servicos' ? `<div class="r-kpis">
      <div><span>Avanço da obra</span><b>${R.fmtPct(r.prog.geral, 1)}</b>${barra(r.prog.geral)}</div>
      <div><span>Prazo</span><b>${r.pz.decorrido !== null && r.pz.atual ? `Dia ${r.pz.decorrido} de ${r.pz.atual}` : '-'}</b><small>${r.pz.aVencer === null || !r.pz.atual ? 'Informe início e prazo no cadastro' : r.pz.aVencer >= 0 ? `${R.dias(r.pz.aVencer)} a vencer · término ${dataBR(r.pz.termino)}` : `${R.dias(-r.pz.aVencer)} além do prazo`}</small></div>
      <div><span>Diários</span><b>${r.ds.length}</b><small>${r.rasc ? `${r.rasc} em rascunho` : 'Todos aprovados'}</small></div>
      <div><span>Último diário</span><b>${r.ult ? `nº ${esc(r.ult.numero)}` : '-'}</b><small>${r.ult ? `${dataBR(r.ult.data)}, ${R.diaSemana(r.ult.data).toLowerCase()}` : 'Nenhum ainda'}</small></div>
    </div>` : '';
    let corpo = '';
    if (aba === 'servicos') corpo = htmlServicos(o, r);
    else if (aba === 'relatorios') corpo = htmlRelatorios(o, r);
    else if (aba === 'cadastro') corpo = htmlCadastro(o, r);
    else corpo = htmlDiarios(o, r);
    el.innerHTML = `<div class="r-ob" data-obra="${esc(o.id)}">
      <div class="ob-topo"><a class="btn icon" href="#/rdo" aria-label="Voltar para as obras">${icone('esq')}</a>
        <div class="tit"><b>${esc(o.nome)}</b><span>${esc([o.contrato, o.contratante].filter(Boolean).join(' · ') || 'Obra')}</span></div>
        <div class="actions">${o.drivePasta ? `<a class="btn icon" href="${esc(o.drivePasta)}" target="_blank" rel="noopener" title="Fotos da obra no Drive" aria-label="Fotos da obra no Drive">${icone('galeria')}</a>` : ''}<button class="btn primary" data-a="rdo-novo-diario" data-o="${esc(o.id)}">${icone('mais')}<span>Novo diário</span></button></div></div>
      ${syncHTML()}
      <nav class="ob-abas">${ABAS.map(([k, n, ic]) => `<a href="#/rdo/${esc(o.id)}${k === 'diarios' ? '' : '/' + k}" class="${k === aba ? 'ativo' : ''}">${icone(ic)}${n}</a>`).join('')}</nav>
      ${kpis}
      <div id="rdo-corpo">${corpo}</div></div>`;
    pintarSync();
    if (aba === 'cadastro') ligarCadastro(el, o);
  }

  /* ---------------- aba Diários ---------------- */
  function htmlDiarios(o, r) {
    const semServ = !R.servicos(o).length;
    const ds = r.ds.slice().reverse();
    const clima = (d) => R.PERIODOS.map(([k]) => (d.clima && d.clima[k] && d.clima[k].tempo ? `<span title="${esc(R.nomeDe(R.TEMPOS, d.clima[k].tempo))}">${R.iconeTempo(d.clima[k].tempo)}</span>` : '<span class="r-sem">-</span>')).join('');
    return `${semServ ? `<a class="r-aviso" href="#/rdo/${esc(o.id)}/cadastro">${icone('info')}<span>Cadastre os serviços do contrato para ligar atividades e fotos a cada serviço.</span></a>` : ''}
      ${ds.length ? `<div class="card r-dlist">${ds.map((d) => `<a class="r-dl" href="#/rdo/${esc(o.id)}/d/${esc(d.id)}">
        <span class="r-dl-n">nº ${esc(d.numero)}</span>
        <span class="r-dl-d"><b>${dataBR(d.data)}</b><small>${R.diaSemana(d.data)}</small></span>
        <span class="r-dl-c">${clima(d)}</span>
        <span class="r-dl-i"><span>${(d.atividades || []).length} ${(d.atividades || []).length === 1 ? 'atividade' : 'atividades'}</span><span>${R.totalMao(o, d)} na obra</span><span>${(d.fotos || []).length} ${(d.fotos || []).length === 1 ? 'foto' : 'fotos'}</span>${(d.ocorrencias || []).length ? `<span class="r-oc-n">${(d.ocorrencias || []).length} ${(d.ocorrencias || []).length === 1 ? 'ocorrência' : 'ocorrências'}</span>` : ''}</span>
        <span class="chip ${d.status === 'aprovado' ? 'ok' : 'neutro'}">${d.status === 'aprovado' ? 'Aprovado' : 'Rascunho'}</span></a>`).join('')}</div>`
        : `<div class="card"><div class="empty"><b>Nenhum diário ainda</b>Toque em "Novo diário" para registrar o dia de hoje.</div></div>`}`;
  }

  /* ---------------- novo diário ---------------- */
  A['rdo-novo-diario'] = (b) => {
    const o = obra(b.dataset.o); if (!o) return;
    const ds = diariosDe(o.id);
    const ult = ds[ds.length - 1];
    ui.abrirModal({
      titulo: 'Novo diário', sub: esc(o.nome),
      corpo: `<label class="f"><span>Data do diário</span><input class="inp" type="date" name="data" value="${hojeISO()}"></label>
        <p class="small aviso-campo" data-q="existe" hidden></p>
        ${ult ? `<label class="chk"><input type="checkbox" name="copiar" checked> <span>Copiar do diário nº ${esc(ult.numero)} (${dataBR(ult.data)}): clima, mão de obra, equipamentos e atividades. Fotos, ocorrências e assinaturas não são copiadas.</span></label>` : ''}`,
      aoAbrir: (m) => {
        const inp = $('[name=data]', m), av = $('[data-q=existe]', m);
        const ver = () => { const ex = ds.find((d) => d.data === inp.value); av.hidden = !ex; if (ex) av.textContent = `Já existe o diário nº ${ex.numero} nesta data. Você pode criar outro mesmo assim.`; };
        inp.addEventListener('input', ver); ver();
      },
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Criar diário', classe: 'primary', acao: (m) => {
          const data = $('[name=data]', m.el).value;
          if (!data) { ui.toast('Informe a data.'); return; }
          const cp = $('[name=copiar]', m.el) && $('[name=copiar]', m.el).checked ? ult : null;
          const d = {
            id: uid(), obraId: o.id, numero: ds.reduce((mx, x) => Math.max(mx, Number(x.numero) || 0), 0) + 1, data, status: 'rascunho',
            clima: cp && cp.clima ? copia(cp.clima) : { manha: { tempo: '', cond: '' }, tarde: { tempo: '', cond: '' }, chuvaMm: null },
            mao: cp ? copia(cp.mao || {}) : {}, equip: cp ? copia(cp.equip || {}) : {},
            atividades: cp ? copia(cp.atividades || []).map((a) => Object.assign(a, { id: rid() })) : [],
            ocorrencias: [], fotos: [], obs: '', criadoEm: new Date().toISOString(),
          };
          gravarDiario(d);
          m.fechar();
          location.hash = `#/rdo/${o.id}/d/${d.id}`;
        },
      }],
    });
  };

  /* =========================================================
     Diário do dia
     ========================================================= */
  function salvarDepois() {
    est.sujo = true;
    const s = $('#rdo-salvo'); if (s) { s.textContent = 'Salvando…'; s.className = 'o-salvo salvando'; }
    clearTimeout(est.timer); est.timer = setTimeout(salvarAgora, 600);
  }
  function salvarAgora() {
    clearTimeout(est.timer); est.timer = null;
    if (!est.sujo || !est.d) return;
    est.sujo = false;
    gravarDiario(est.d);
    const s = $('#rdo-salvo'); if (s) { s.textContent = 'Salvo'; s.className = 'o-salvo ok'; }
  }
  /** Grava já a alteração feita por botão (clima, adicionar, tirar). */
  function salvarJa() { est.sujo = true; salvarAgora(); }
  window.addEventListener('beforeunload', salvarAgora);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });

  function abrirDiario(id) {
    const r = B.store.get('diarios', id);
    if (!r) return null;
    const fresco = Object.assign({ id: r.id, obraId: r.grupo }, copia(r.dados));
    if (est.dId !== id) { salvarAgora(); est.dId = id; est.d = fresco; est.servFoto = null; }
    else if (!est.sujo) est.d = fresco;
    else {
      const rem = new Map((fresco.fotos || []).map((f) => [f.id, f]));
      est.d.fotos = (est.d.fotos || []).map((f) => { const x = rem.get(f.id); return x && x.drive && !f.drive ? Object.assign({}, f, { drive: x.drive }) : f; });
      if (!est.d.drivePasta) est.d.drivePasta = fresco.drivePasta;
    }
    const d = est.d;
    d.clima = d.clima || { manha: {}, tarde: {} };
    R.PERIODOS.forEach(([k]) => { d.clima[k] = d.clima[k] || {}; });
    d.mao = d.mao || {}; d.equip = d.equip || {};
    d.atividades = d.atividades || []; d.ocorrencias = d.ocorrencias || []; d.fotos = d.fotos || [];
    return d;
  }
  /** % de cada serviço antes deste diário. */
  function pctAntes(o, d) {
    const ds = diariosDe(o.id).filter((x) => x.id !== d.id && (x.data < d.data || (x.data === d.data && (x.numero || 0) < (d.numero || 0))));
    return R.progresso(o, ds).por;
  }
  const opcoesServ = (o, sel, comGeral) => {
    const ets = o.etapas.filter((e) => e.servicos.length);
    return (comGeral ? `<option value="" ${!sel ? 'selected' : ''}>${comGeral}</option>` : '')
      + ets.map((e) => `<optgroup label="${esc(R.rotEtapa(e))}">${e.servicos.map((s) => `<option value="${esc(s.id)}" ${sel === s.id ? 'selected' : ''}>${esc(R.rotServ(s))}</option>`).join('')}</optgroup>`).join('');
  };

  function telaDiario(el, obraId, dId) {
    const o = obra(obraId);
    const d = o && abrirDiario(dId);
    if (!o || !d) { el.innerHTML = `<div class="card"><div class="empty"><b>Diário não encontrado</b><a href="#/rdo/${esc(obraId)}">Voltar para a obra</a></div></div>`; return; }
    normalizarObra(o);
    const aprovado = d.status === 'aprovado';
    const topo = `<div class="ob-topo r-ed-topo"><a class="btn icon" href="#/rdo/${esc(o.id)}" aria-label="Voltar para a obra">${icone('esq')}</a>
      <div class="tit"><b>RDO nº ${esc(d.numero)}</b><span>${R.diaSemana(d.data)}, ${dataBR(d.data)} · ${esc(o.nome)}</span></div>
      <div class="actions"><span class="chip ${aprovado ? 'ok' : 'neutro'}">${aprovado ? 'Aprovado' : 'Rascunho'}</span>${aprovado ? '' : '<span class="o-salvo ok" id="rdo-salvo">Salvo</span>'}
        ${d.drivePasta ? `<a class="btn icon" href="${esc(d.drivePasta)}" target="_blank" rel="noopener" title="Fotos em alta qualidade no Drive" aria-label="Fotos em alta qualidade">${icone('galeria')}</a>` : ''}
        <button class="btn icon" data-a="rdo-imprimir-diario" title="Imprimir ou salvar PDF" aria-label="Imprimir ou salvar PDF">${icone('imprimir')}</button>
        <button class="btn icon" data-a="rdo-diario-mais" aria-label="Mais opções">${icone('pontos')}</button></div></div>`;
    if (aprovado) {
      const aps = aprovacoesDe(o.id);
      const papeis = R.PAPEIS.filter(([k]) => k !== 'responsavel' && o.assinantes[k] && o.assinantes[k].nome);
      el.innerHTML = `<div class="r-ed">${topo}${syncHTML()}
        <div class="card r-apv"><div class="bd"><div class="r-apv-l">${icone('aprovar')}<div><b>Aprovado em ${R.dataHora(d.aprovadoEm)}</b><small>${esc((d.aprovador && d.aprovador.nome) || '')}. Este diário aparece no portal do cliente.</small></div></div>
          ${papeis.length ? `<div class="r-apv-p">${papeis.map(([k, rot]) => { const a = R.aprovacao(aps, d, k); return `<span class="chip ${a ? 'ok' : 'neutro'}">${rot}: ${a ? `aprovado em ${R.dataHora(a.em)}` : 'aguardando'}</span>`; }).join('')}</div>` : ''}
          <div class="actions"><button class="btn" data-a="rdo-reabrir">${icone('editar')}Reabrir para editar</button><button class="btn" data-a="rdo-imprimir-diario">${icone('imprimir')}Imprimir ou salvar PDF</button></div></div></div>
        <div class="r-papel" data-papel>${R.diarioHTML({ obra: o, diario: d, diarios: diariosDe(o.id), aprovacoes: aps, empresa: cfgRdo().empresa, logoSouza: logoSouza(), fotoSrc: (f) => B.fotos.src(f) })}</div></div>`;
      pintarSync();
      R.ajustarZoom($('[data-papel]', el));
      return;
    }
    const antes = pctAntes(o, d);
    const temServ = R.servicos(o).length > 0;
    if (est.servFoto === null) est.servFoto = (d.atividades.find((a) => a.servicoId) || {}).servicoId || '';
    const seg = (p, k, lista, curto) => `<div class="r-op" data-p="${p}" data-k="${k}">${lista.map(([v, n]) => `<button type="button" data-a="rdo-clima" data-p="${p}" data-k="${k}" data-v="${v}" class="${d.clima[p][k] === v ? 'on' : ''}" title="${esc(n)}">${k === 'tempo' ? R.iconeTempo(v) : ''}<span>${esc(curto ? curto[v] : n)}</span></button>`).join('')}</div>`;
    const CT = { claro: 'Claro', parcial: 'Parcial', nublado: 'Nublado', chuvoso: 'Chuva', forte: 'Forte' };
    const CC = { praticavel: 'Praticável', parcial: 'Parcial', impraticavel: 'Impraticável' };
    const total = R.totalMao(o, d);
    const choveuSemOc = R.choveu(d) && !d.ocorrencias.some((x) => x.tipo === 'clima');
    el.innerHTML = `<div class="r-ed">${topo}${syncHTML()}
      <section class="card"><div class="hd"><h3>Dia</h3></div><div class="bd grid2">
        <label class="f"><span>Data</span><input class="inp" type="date" data-d="data" value="${esc(d.data)}"></label>
        <label class="f"><span>Número do relatório</span><input class="inp" inputmode="numeric" data-d="numero" value="${esc(d.numero)}"></label></div></section>

      <section class="card"><div class="hd"><h3>Condição climática</h3></div><div class="bd r-clima">
        ${R.PERIODOS.map(([p, n]) => `<div class="r-cl"><b>${n}</b>${seg(p, 'tempo', R.TEMPOS, CT)}${seg(p, 'cond', R.CONDICOES, CC)}</div>`).join('')}
        <label class="f r-mm"><span>Chuva no dia (mm, opcional)</span><input class="inp" inputmode="decimal" data-d="clima.chuvaMm" value="${esc(d.clima.chuvaMm ?? '')}" placeholder="0"></label>
      </div></section>

      <section class="card"><div class="hd"><h3>Mão de obra <span class="r-cont" id="rdo-mo-total">${total}</span></h3>${o.grupos.length ? '' : `<a class="link" href="#/rdo/${esc(o.id)}/cadastro">Cadastrar funções</a>`}</div><div class="bd r-mo">
        ${o.grupos.filter((g) => g.funcoes.length).map((g) => `<div class="r-mo-g"><div class="r-mo-gt">${esc(g.nome)} <span data-gt="${esc(g.id)}">${g.funcoes.reduce((s, f) => s + (Number(d.mao[f.id]) || 0), 0)}</span></div>
          ${g.funcoes.map((f) => stepper('mao', f.id, f.nome, d.mao[f.id])).join('')}</div>`).join('') || '<p class="muted small">Nenhuma função cadastrada para esta obra.</p>'}
      </div></section>

      ${o.equipamentos.length ? `<section class="card"><div class="hd"><h3>Equipamentos</h3></div><div class="bd r-mo"><div class="r-mo-g">${o.equipamentos.map((e) => stepper('equip', e.id, e.nome, d.equip[e.id])).join('')}</div></div></section>` : ''}

      <section class="card"><div class="hd"><h3>Atividades <span class="r-cont">${d.atividades.length}</span></h3></div><div class="bd r-ats">
        ${d.atividades.map((a) => {
          const ant = a.servicoId && antes.get(a.servicoId) ? antes.get(a.servicoId).pct : null;
          const v = R.num(a.pct);
          return `<div class="r-at" data-at="${esc(a.id)}">
            <div class="r-at-l1">${temServ ? `<select class="inp" data-at-k="servicoId">${opcoesServ(o, a.servicoId, 'Atividade sem serviço do contrato')}</select>` : ''}
              <button class="btn icon" data-a="rdo-at-x" data-id="${esc(a.id)}" aria-label="Tirar atividade">${icone('lixo')}</button></div>
            ${!a.servicoId ? `<input class="inp" data-at-k="titulo" value="${esc(a.titulo || '')}" placeholder="O que foi feito">` : ''}
            <div class="r-at-l2">
              <label class="f"><span>Início</span><input class="inp" type="time" data-at-k="ini" value="${esc(a.ini || '')}"></label>
              <label class="f"><span>Fim</span><input class="inp" type="time" data-at-k="fim" value="${esc(a.fim || '')}"></label>
              <label class="f"><span>% acumulado${ant !== null ? ` (antes ${R.fmtPct(ant)})` : ''}</span><input class="inp" inputmode="decimal" data-at-k="pct" value="${esc(a.pct ?? '')}" placeholder="${ant !== null ? esc(String(ant).replace('.', ',')) : '0'}"></label>
              <span class="r-at-st" data-st="${esc(a.id)}">${v === null ? '' : R.statusPct(v)}</span></div>
            <textarea class="inp" rows="2" data-at-k="desc" placeholder="Descrição do que foi executado">${esc(a.desc || '')}</textarea></div>`;
        }).join('') || '<p class="muted small">Nenhuma atividade ainda.</p>'}
        <div class="actions"><button class="btn" data-a="rdo-at-mais">${icone('mais')}Atividade</button></div>
      </div></section>

      <section class="card"><div class="hd"><h3>Ocorrências <span class="r-cont">${d.ocorrencias.length}</span></h3></div><div class="bd r-ats">
        ${choveuSemOc ? `<div class="r-sug">${R.iconeTempo('chuvoso')}<span>Choveu neste dia. Quer registrar a ocorrência de chuva?</span><button class="btn sm suave" data-a="rdo-oc-chuva">Registrar</button></div>` : ''}
        ${d.ocorrencias.map((x) => `<div class="r-at" data-oc="${esc(x.id)}">
          <div class="r-at-l1"><select class="inp" data-oc-k="tipo">${R.OCORRENCIAS.map(([k, n]) => `<option value="${k}" ${x.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <button class="btn icon" data-a="rdo-oc-x" data-id="${esc(x.id)}" aria-label="Tirar ocorrência">${icone('lixo')}</button></div>
          <div class="r-at-l2"><label class="f"><span>Impacto no prazo</span><select class="inp" data-oc-k="impacto">${R.IMPACTOS.map(([k, n]) => `<option value="${k}" ${(x.impacto || 'nenhum') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            ${x.impacto && x.impacto !== 'nenhum' ? `<label class="f"><span>Dias</span><input class="inp" inputmode="numeric" data-oc-k="dias" value="${esc(x.dias ?? '')}" placeholder="0"></label>` : ''}</div>
          <textarea class="inp" rows="2" data-oc-k="desc" placeholder="O que aconteceu">${esc(x.desc || '')}</textarea></div>`).join('') || (choveuSemOc ? '' : '<p class="muted small">Nenhuma ocorrência.</p>')}
        <div class="actions"><button class="btn" data-a="rdo-oc-mais">${icone('mais')}Ocorrência</button></div>
      </div></section>

      <section class="card"><div class="hd"><h3>Fotos <span class="r-cont">${d.fotos.length}</span></h3>${d.drivePasta ? `<a class="link" href="${esc(d.drivePasta)}" target="_blank" rel="noopener">Ver em alta qualidade</a>` : ''}</div><div class="bd">
        ${temServ ? `<label class="f"><span>Serviço das próximas fotos</span><select class="inp" id="rdo-serv-foto">${opcoesServ(o, est.servFoto, 'Geral da obra')}</select></label>` : ''}
        <div class="actions r-foto-bt"><label class="btn primary">${icone('camera')}Tirar foto<input type="file" accept="image/*" capture="environment" data-fotos hidden></label>
          <label class="btn">${icone('galeria')}Da galeria<input type="file" accept="image/*" multiple data-fotos hidden></label></div>
        ${d.fotos.length ? `<div class="r-fts">${d.fotos.map((f) => { const s = R.servicos(o).find((x) => x.id === f.servicoId); const pd = B.fotos.pendente(f); return `<button type="button" class="r-ft" data-a="rdo-foto" data-id="${esc(f.id)}"><img src="${esc(B.fotos.src(f))}" alt="" loading="lazy">${pd ? `<i class="r-ft-p" title="${pd.print ? 'Enviando' : 'Aguardando o Drive'}">${icone('nuvemPend')}</i>` : ''}<span>${esc(f.legenda || R.rotServ(s))}</span></button>`; }).join('')}</div>` : ''}
      </div></section>

      <section class="card"><div class="hd"><h3>Observações</h3></div><div class="bd"><textarea class="inp" rows="3" data-d="obs" placeholder="Visitas, orientações, pendências do dia">${esc(d.obs || '')}</textarea></div></section>

      <div class="r-aprovar"><button class="btn primary grande" data-a="rdo-aprovar">${icone('aprovar')}Aprovar diário</button><p class="small muted">Depois de aprovado, o diário sai com a sua assinatura e aparece no portal do cliente.</p></div>
    </div>`;
    pintarSync();
  }
  const stepper = (tipo, id, nome, v) => `<div class="r-st"><span>${esc(nome)}</span><div><button type="button" class="btn icon" data-a="rdo-menos" data-t="${tipo}" data-id="${esc(id)}" aria-label="Menos">−</button><b data-q="${tipo}:${esc(id)}">${Number(v) || 0}</b><button type="button" class="btn icon" data-a="rdo-mais" data-t="${tipo}" data-id="${esc(id)}" aria-label="Mais">+</button></div></div>`;

  /* edição do diário */
  function contexto() {
    const r = Sis.rota();
    if (r.mod !== 'rdo' || r.partes[1] !== 'd' || !est.d) return null;
    const o = obra(r.partes[0]);
    return o ? { o: normalizarObra(o), d: est.d } : null;
  }
  const repintar = () => Sis.desenhar(true);
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t.closest || !t.closest('.r-ed') || !est.d) return;
    const d = est.d;
    if (t.dataset.d) {
      let v = t.value;
      if (t.dataset.d === 'numero') v = parseInt(v, 10) || '';
      if (t.dataset.d === 'clima.chuvaMm') v = lerNum(v);
      const ks = t.dataset.d.split('.');
      let alvo = d; ks.slice(0, -1).forEach((k) => { alvo[k] = alvo[k] || {}; alvo = alvo[k]; });
      alvo[ks[ks.length - 1]] = v;
      salvarDepois();
    }
    const at = t.closest('[data-at]');
    if (at && t.dataset.atK && t.tagName !== 'SELECT') {
      const a = d.atividades.find((x) => x.id === at.dataset.at); if (!a) return;
      let v = t.value;
      if (t.dataset.atK === 'pct') { v = lerNum(v); v = v === null ? null : Math.max(0, Math.min(100, v)); const st = $(`[data-st="${a.id}"]`); if (st) st.textContent = v === null ? '' : R.statusPct(v); }
      a[t.dataset.atK] = v;
      salvarDepois();
    }
    const oc = t.closest('[data-oc]');
    if (oc && t.dataset.ocK && t.tagName !== 'SELECT') {
      const x = d.ocorrencias.find((y) => y.id === oc.dataset.oc); if (!x) return;
      x[t.dataset.ocK] = t.dataset.ocK === 'dias' ? (parseInt(t.value, 10) || null) : t.value;
      salvarDepois();
    }
  });
  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (!t.closest || !t.closest('.r-ed') || !est.d) return;
    const d = est.d;
    if (t.dataset.d === 'data') { salvarJa(); repintar(); return; }
    const at = t.closest('[data-at]');
    if (at && t.dataset.atK === 'servicoId') {
      const a = d.atividades.find((x) => x.id === at.dataset.at);
      if (a) { a.servicoId = t.value; if (a.servicoId) est.servFoto = a.servicoId; salvarJa(); repintar(); }
      return;
    }
    const oc = t.closest('[data-oc]');
    if (oc && t.tagName === 'SELECT') {
      const x = d.ocorrencias.find((y) => y.id === oc.dataset.oc);
      if (x) { x[t.dataset.ocK] = t.value; salvarJa(); if (t.dataset.ocK === 'impacto') repintar(); }
      return;
    }
    if (t.id === 'rdo-serv-foto') { est.servFoto = t.value; return; }
    if (t.matches('[data-fotos]') && t.files && t.files.length) {
      const arqs = Array.from(t.files); t.value = '';
      await adicionarFotos(arqs);
    }
  });
  A['rdo-clima'] = (b) => {
    if (!est.d) return;
    const c = est.d.clima[b.dataset.p] = est.d.clima[b.dataset.p] || {};
    c[b.dataset.k] = c[b.dataset.k] === b.dataset.v ? '' : b.dataset.v;
    salvarJa(); repintar();
  };
  function passo(b, delta) {
    if (!est.d) return;
    const m = b.dataset.t === 'equip' ? est.d.equip : est.d.mao;
    m[b.dataset.id] = Math.max(0, (Number(m[b.dataset.id]) || 0) + delta);
    const el = $(`[data-q="${b.dataset.t}:${b.dataset.id}"]`); if (el) el.textContent = m[b.dataset.id];
    const ctx = contexto();
    if (ctx && b.dataset.t === 'mao') {
      const tot = $('#rdo-mo-total'); if (tot) tot.textContent = R.totalMao(ctx.o, est.d);
      ctx.o.grupos.forEach((g) => { const e = $(`[data-gt="${g.id}"]`); if (e) e.textContent = g.funcoes.reduce((s, f) => s + (Number(est.d.mao[f.id]) || 0), 0); });
    }
    salvarDepois();
  }
  A['rdo-mais'] = (b) => passo(b, 1);
  A['rdo-menos'] = (b) => passo(b, -1);
  A['rdo-at-mais'] = () => {
    if (!est.d) return;
    const ult = est.d.atividades[est.d.atividades.length - 1];
    est.d.atividades.push({ id: rid(), servicoId: '', titulo: '', ini: ult ? ult.ini : '08:00', fim: ult ? ult.fim : '17:00', pct: null, desc: '' });
    salvarJa(); repintar();
    setTimeout(() => { const l = $$('.r-ats [data-at]'); const u = l[l.length - 1]; if (u) { u.scrollIntoView({ block: 'center' }); const s = $('select, input', u); if (s) s.focus(); } }, 50);
  };
  A['rdo-at-x'] = (b) => { if (!est.d) return; est.d.atividades = est.d.atividades.filter((a) => a.id !== b.dataset.id); salvarJa(); repintar(); };
  A['rdo-oc-mais'] = () => { if (!est.d) return; est.d.ocorrencias.push({ id: rid(), tipo: 'outro', impacto: 'nenhum', dias: null, desc: '' }); salvarJa(); repintar(); };
  A['rdo-oc-chuva'] = () => {
    if (!est.d) return;
    const per = R.PERIODOS.filter(([k]) => est.d.clima[k] && R.CHUVA.has(est.d.clima[k].tempo)).map(([, n]) => n.toLowerCase());
    const imp = R.impraticavel(est.d);
    est.d.ocorrencias.push({ id: rid(), tipo: 'clima', impacto: imp ? 'atraso' : 'nenhum', dias: imp ? 1 : null, desc: `Chuva${per.length ? ' no período da ' + per.join(' e da ') : ''}${imp ? ', com serviços externos impraticáveis' : ''}.` });
    salvarJa(); repintar();
  };
  A['rdo-oc-x'] = (b) => { if (!est.d) return; est.d.ocorrencias = est.d.ocorrencias.filter((x) => x.id !== b.dataset.id); salvarJa(); repintar(); };

  /* fotos */
  async function adicionarFotos(arqs) {
    const ctx = contexto(); if (!ctx) return;
    const { o, d } = ctx;
    const serv = $('#rdo-serv-foto') ? $('#rdo-serv-foto').value : '';
    let n = 0;
    ui.toast(arqs.length > 1 ? `Preparando ${arqs.length} fotos…` : 'Preparando a foto…');
    for (const arq of arqs) {
      try {
        const red = await reduzir(arq, 1280, 'image/jpeg', 0.72);
        const id = uid();
        const path = `${o.id}/${d.id}/${id}.jpg`;
        d.fotos.push({ id, servicoId: serv, legenda: '', path, w: red.w, h: red.h, drive: null, em: new Date().toISOString() });
        est.sujo = true; salvarAgora();
        await B.fotos.adicionar({ id, obraId: o.id, diarioId: d.id, path, print: red.blob, original: arq, tipo: arq.type });
        n++;
      } catch (e) { ui.toast(`${arq.name}: ${e.message}`, 'erro'); }
    }
    if (n) ui.toast(n === 1 ? 'Foto adicionada.' : `${n} fotos adicionadas.`);
    repintar();
  }
  A['rdo-foto'] = (b) => {
    const ctx = contexto(); if (!ctx) return;
    const { o, d } = ctx;
    const f = d.fotos.find((x) => x.id === b.dataset.id); if (!f) return;
    const pd = B.fotos.pendente(f);
    ui.abrirModal({
      titulo: 'Foto', largo: true,
      corpo: `<div class="r-ft-g"><img src="${esc(B.fotos.src(f))}" alt=""></div>
        <div class="grid2"><label class="f"><span>Serviço</span><select class="inp" name="serv">${opcoesServ(o, f.servicoId, 'Geral da obra')}</select></label>
        <label class="f"><span>Legenda</span><input class="inp" name="leg" value="${esc(f.legenda || '')}" placeholder="Vazio: usa o nome do serviço"></label></div>
        <p class="small muted">${f.drive && f.drive.url ? `<a href="${esc(f.drive.url)}" target="_blank" rel="noopener">Abrir a original no Drive</a>` : pd ? (pd.print ? 'Enviando a foto…' : 'A original sobe para o Drive quando a ponte estiver configurada e houver internet.') : ''}</p>`,
      botoes: [
        { rot: 'Excluir foto', classe: 'danger', esq: true, acao: async (m) => { d.fotos = d.fotos.filter((x) => x.id !== f.id); est.sujo = true; salvarAgora(); await B.fotos.apagar(f); m.fechar(); repintar(); ui.toast('Foto excluída.'); } },
        { rot: 'Cancelar' },
        { rot: 'Salvar', classe: 'primary', acao: (m) => { f.servicoId = $('[name=serv]', m.el).value; f.legenda = $('[name=leg]', m.el).value.trim(); est.sujo = true; salvarAgora(); m.fechar(); repintar(); } },
      ],
    });
  };

  /* aprovar, reabrir, excluir */
  A['rdo-aprovar'] = async () => {
    const ctx = contexto(); if (!ctx) return;
    const { o, d } = ctx;
    const cfg = cfgRdo();
    const faltas = [];
    if (!d.atividades.length) faltas.push('nenhuma atividade registrada');
    if (!R.PERIODOS.some(([k]) => d.clima[k] && d.clima[k].tempo)) faltas.push('clima não informado');
    if (!cfg.assinatura) faltas.push('sem imagem da sua assinatura (envie em Configurações)');
    const ok = await ui.confirmar({ titulo: `Aprovar o RDO nº ${d.numero}?`, msg: `${faltas.length ? 'Atenção: ' + faltas.join(', ') + '.\n\n' : ''}O diário sai aprovado com data e hora e passa a aparecer no portal do cliente.`, ok: 'Aprovar' });
    if (!ok) return;
    d.status = 'aprovado';
    d.aprovadoEm = new Date().toISOString();
    d.aprovador = Object.assign({}, cfg.responsavel, o.assinantes.responsavel && o.assinantes.responsavel.nome ? o.assinantes.responsavel : {}, { assinatura: cfg.assinatura });
    est.sujo = true; salvarAgora();
    ui.toast('Diário aprovado.');
    repintar();
  };
  A['rdo-reabrir'] = async () => {
    const ctx = contexto(); if (!ctx) return;
    const { o, d } = ctx;
    const aps = aprovacoesDe(o.id).filter((a) => a.diarioId === d.id);
    const ok = await ui.confirmar({ titulo: 'Reabrir para editar?', msg: `O diário volta a rascunho e sai do portal do cliente até você aprovar de novo.${aps.length ? '\nAs aprovações do fiscal e do contratante deste diário serão desfeitas.' : ''}`, ok: 'Reabrir' });
    if (!ok) return;
    d.status = 'rascunho'; delete d.aprovadoEm;
    est.sujo = true; salvarAgora();
    B.store.lista('aprovacoes').filter((r) => r.dados && r.dados.diarioId === d.id).forEach((r) => B.store.excluir('aprovacoes', r.id));
    repintar();
  };
  A['rdo-diario-mais'] = () => {
    const ctx = contexto(); if (!ctx) return;
    const { o, d } = ctx;
    ui.abrirModal({
      titulo: `RDO nº ${d.numero}`, folha: true,
      corpo: `<div class="r-menu"><button class="btn" data-q="pdf">${icone('imprimir')}Imprimir ou salvar PDF</button>${d.drivePasta ? `<a class="btn" href="${esc(d.drivePasta)}" target="_blank" rel="noopener">${icone('galeria')}Fotos em alta qualidade</a>` : ''}<button class="btn danger" data-q="x">${icone('lixo')}Excluir este diário</button></div>`,
      aoAbrir: (el, m) => {
        $('[data-q=pdf]', el).addEventListener('click', () => { m.fechar(); A['rdo-imprimir-diario'](); });
        $('[data-q=x]', el).addEventListener('click', async () => {
          m.fechar();
          const ok = await ui.confirmar({ titulo: `Excluir o RDO nº ${d.numero}?`, msg: `As ${d.fotos.length} fotos deste diário também serão apagadas (as originais vão para a lixeira do Drive).`, ok: 'Excluir', perigo: true });
          if (!ok) return;
          for (const f of d.fotos) await B.fotos.apagar(f);
          clearTimeout(est.timer); est.sujo = false; est.dId = null; est.d = null;
          B.store.excluir('diarios', d.id);
          location.hash = `#/rdo/${o.id}`;
          ui.toast('Diário excluído.');
        });
      },
    });
  };

  /* =========================================================
     Serviços e avanço
     ========================================================= */
  function htmlServicos(o, r) {
    const p = r.prog;
    if (!p.servicos.length) return `<div class="card"><div class="empty"><b>Nenhum serviço cadastrado</b><a href="#/rdo/${esc(o.id)}/cadastro">Cadastrar os serviços do contrato</a></div></div>`;
    const linha = (s) => { const x = p.por.get(s.id); return `<tr class="r-sv" data-a="rdo-hist" data-id="${esc(s.id)}"><td class="r-num">${esc(s.num || '')}</td><td>${esc(s.desc)}${x.hist.some((h) => h.fotos.length) ? ` <span class="r-fn">${icone('camera')}${x.hist.reduce((t, h) => t + h.fotos.length, 0)}</span>` : ''}</td><td class="num r-peso">${R.num(s.peso) === null ? '-' : String(s.peso).replace('.', ',')}</td><td class="r-pc"><span>${R.fmtPct(x.pct)}</span>${barra(x.pct, x.pct >= 100 ? 'ok' : x.pct > 0 ? 'and' : '')}</td></tr>`; };
    return `<p class="small muted r-pesos">${p.pesoIgual ? 'Nenhum serviço tem peso: todos pesam igual no avanço. Defina os pesos no cadastro da obra.' : `Soma dos pesos: ${String(Math.round(p.totalPeso * 100) / 100).replace('.', ',')}. O avanço de cada etapa e da obra é a média ponderada pelos pesos.${p.semPeso ? ` ${p.semPeso} ${p.semPeso === 1 ? 'serviço está' : 'serviços estão'} sem peso e não ${p.semPeso === 1 ? 'conta' : 'contam'} no total.` : ''}`}
      · Concluídos ${p.cont.concluido} · Em andamento ${p.cont.andamento} · Não iniciados ${p.cont.nao}</p>
      <div class="card"><div class="bd flush tblwrap"><table class="tbl r-tsv"><thead><tr><th>Item</th><th>Serviço</th><th class="num r-peso">Peso</th><th>Executado</th></tr></thead><tbody>
      ${o.etapas.map((e) => `<tr class="r-et"><td class="r-num">${esc(e.num || '')}</td><td>${esc(e.titulo || 'Etapa')}</td><td class="num r-peso">${(() => { const t = e.servicos.reduce((s, x) => s + (R.num(x.peso) || 0), 0); return t ? String(Math.round(t * 100) / 100).replace('.', ',') : '-'; })()}</td><td class="r-pc"><span>${R.fmtPct(p.etapas.get(e.id), 1)}</span>${barra(p.etapas.get(e.id))}</td></tr>${e.servicos.map(linha).join('')}`).join('')}
      </tbody></table></div></div>`;
  }
  A['rdo-hist'] = (el) => {
    const id = $('.r-ob') && $('.r-ob').dataset.obra;
    const o = id && obra(id); if (!o) return;
    normalizarObra(o);
    const ds = diariosDe(o.id);
    const p = R.progresso(o, ds);
    const s = p.servicos.find((x) => x.id === el.dataset.id); if (!s) return;
    const x = p.por.get(s.id);
    const hist = x.hist.slice().reverse();
    ui.abrirModal({
      titulo: R.rotServ(s), sub: `${esc(R.rotEtapa(s.etapa))} · ${R.fmtPct(x.pct)} ${R.statusPct(x.pct).toLowerCase()}${x.horas ? ` · ${R.fmtHoras(x.horas)} registradas` : ''}`, largo: true,
      corpo: `${barra(x.pct, x.pct >= 100 ? 'ok' : 'and')}
        ${hist.length ? `<div class="r-hist">${hist.map((h) => `<div class="r-h"><div class="r-h-t"><a href="#/rdo/${esc(o.id)}/d/${esc(h.diarioId)}">${dataBR(h.data)} · RDO nº ${esc(h.numero)}</a><span>${h.horas ? R.fmtHoras(h.horas) : ''}</span><span>${h.de !== h.para ? `De <b>${R.fmtPct(h.de)}</b> para <b>${R.fmtPct(h.para)}</b>` : `<b>${R.fmtPct(h.para)}</b>`}</span></div>
          ${h.descs.length ? `<p>${h.descs.map(esc).join('<br>')}</p>` : ''}
          ${h.fotos.length ? `<div class="r-h-f">${h.fotos.map((f) => `<a href="${esc((f.drive && f.drive.url) || B.fotos.src(f))}" target="_blank" rel="noopener"><img src="${esc(B.fotos.src(f))}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}</div>`).join('')}</div>`
          : '<p class="muted">Este serviço ainda não aparece em nenhum diário.</p>'}`,
      botoes: [{ rot: 'Fechar' }],
    });
  };

  /* =========================================================
     Relatórios por categoria
     ========================================================= */
  const RELS = [
    ['diarios', 'Diários do período', 'Todos os diários do período num PDF só, um por página.'],
    ['clima', 'Chuvas e clima', 'Dias com chuva, dias impraticáveis e chuva acumulada.'],
    ['ocorrencias', 'Ocorrências', 'Ocorrências por tipo, com os dias de atraso e de aditivo de prazo.'],
    ['prazo', 'Prazo da obra', 'Prazo contratual, aditivos, decorrido, a vencer e término previsto.'],
    ['mao', 'Mão de obra', 'Efetivo por dia e por função, com o total de homens-dia.'],
    ['avanco', 'Avanço físico', 'Percentual de cada serviço e etapa no início e no fim do período.'],
    ['fotos', 'Fotográfico por serviço', 'As fotos de cada serviço em ordem de data.'],
  ];
  function htmlRelatorios(o, r) {
    if (est.obraRel !== o.id) { est.obraRel = o.id; est.rel = { de: o.dataInicio || (r.ds[0] && r.ds[0].data) || hojeISO(), ate: hojeISO(), aprovados: true, serv: '' }; }
    const rel = est.rel;
    return `<div class="card r-rel-p"><div class="bd"><div class="r-rel-f">
        <label class="f"><span>De</span><input class="inp" type="date" data-rel="de" value="${esc(rel.de)}"></label>
        <label class="f"><span>Até</span><input class="inp" type="date" data-rel="ate" value="${esc(rel.ate)}"></label>
        <label class="chk"><input type="checkbox" data-rel="aprovados" ${rel.aprovados ? 'checked' : ''}> <span>Só diários aprovados</span></label></div></div></div>
      <div class="r-rels">${RELS.map(([k, n, t]) => `<div class="card"><div class="hd"><div><h3>${n}</h3><p>${t}</p></div></div><div class="bd">
        ${k === 'fotos' ? `<label class="f"><span>Serviço</span><select class="inp" data-rel="serv">${opcoesServ(o, rel.serv, 'Todos os serviços com fotos')}</select></label>` : ''}
        <button class="btn" data-a="rdo-rel" data-k="${k}">${icone('imprimir')}Imprimir ou salvar PDF</button></div></div>`).join('')}</div>`;
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.dataset || !t.dataset.rel) return;
    est.rel[t.dataset.rel] = t.type === 'checkbox' ? t.checked : t.value;
  });

  function cabRel(o, titulo, rel) {
    const e = cfgRdo().empresa;
    return `<div class="rp-head"><div class="rp-logo r-rp-logos"><img src="${esc(logoSouza())}" alt="${esc(e.nome)}">${o.logoCliente && o.logoCliente.url ? `<img src="${esc(o.logoCliente.url)}" alt="">` : ''}</div>
      <div class="rp-tit"><h1>${esc(titulo)}</h1><div>${esc(o.nome)}</div><div>${rel ? `Período de ${dataBR(rel.de)} a ${dataBR(rel.ate)}` : ''}</div></div></div>
      <div class="rp-obra"><div><b>Obra:</b> ${esc(o.nome)}</div><div><b>Contrato:</b> ${esc(o.contrato || '-')}</div>
        <div><b>Contratante:</b> ${esc(o.contratante || '-')}</div><div><b>Local:</b> ${esc(o.local || '-')}</div>
        <div><b>Responsável:</b> ${esc(o.responsavel || '-')}</div><div><b>Emitido em:</b> ${dataBR(hojeISO())}</div></div>`;
  }
  const kp = (itens) => `<div class="rp-kpis">${itens.map(([a, b]) => `<div><span>${esc(a)}</span><b>${b}</b></div>`).join('')}</div>`;
  function relatorio(k, o) {
    const rel = est.rel;
    const todos = diariosDe(o.id);
    const base = rel.aprovados ? todos.filter((d) => d.status === 'aprovado') : todos;
    const ds = base.filter((d) => (!rel.de || d.data >= rel.de) && (!rel.ate || d.data <= rel.ate));
    const nomeRel = (RELS.find((x) => x[0] === k) || [])[1];
    const vazio = '<p class="obs">Nenhum diário no período.</p>';
    if (k === 'diarios') {
      if (!ds.length) return null;
      const aps = aprovacoesDe(o.id);
      return ds.map((d, i) => R.diarioHTML({ obra: o, diario: d, diarios: todos, aprovacoes: aps, empresa: cfgRdo().empresa, logoSouza: logoSouza(), fotoSrc: (f) => B.fotos.src(f), quebra: i > 0 })).join('');
    }
    let corpo = '';
    if (k === 'clima') {
      const chuva = ds.filter(R.choveu), impr = ds.filter(R.impraticavel);
      const mm = ds.reduce((s, d) => s + (R.num(d.clima && d.clima.chuvaMm) || 0), 0);
      const per = (d, p) => { const c = (d.clima && d.clima[p]) || {}; return c.tempo ? `${R.nomeDe(R.TEMPOS, c.tempo)}${c.cond ? ', ' + R.nomeDe(R.CONDICOES, c.cond).toLowerCase() : ''}` : '-'; };
      corpo = kp([['Diários no período', ds.length], ['Dias com chuva', chuva.length], ['Dias impraticáveis', impr.length], ['Chuva acumulada', mm ? String(Math.round(mm * 10) / 10).replace('.', ',') + ' mm' : '-']])
        + (ds.length ? `<h2>Dia a dia</h2><table><thead><tr><th>Data</th><th>Dia</th><th>RDO</th><th>Manhã</th><th>Tarde</th><th class="num">Chuva (mm)</th></tr></thead><tbody>
          ${ds.map((d) => `<tr class="${R.choveu(d) ? 'sub' : ''}"><td>${dataBR(d.data)}</td><td>${R.diaSemana(d.data)}</td><td>${esc(d.numero)}</td><td>${per(d, 'manha')}</td><td>${per(d, 'tarde')}</td><td class="num">${R.num(d.clima && d.clima.chuvaMm) ? String(d.clima.chuvaMm).replace('.', ',') : ''}</td></tr>`).join('')}</tbody></table>
          ${chuva.length ? `<h2>Dias com chuva</h2><p>${chuva.map((d) => `${dataBR(d.data)} (RDO ${esc(d.numero)})`).join(', ')}.</p>` : ''}` : vazio);
    } else if (k === 'ocorrencias') {
      const ocs = [];
      ds.forEach((d) => (d.ocorrencias || []).forEach((x) => ocs.push(Object.assign({ d }, x))));
      const soma = (imp) => ocs.filter((x) => x.impacto === imp).reduce((s, x) => s + (R.num(x.dias) || 0), 0);
      const porTipo = R.OCORRENCIAS.map(([t, n]) => { const l = ocs.filter((x) => x.tipo === t); return { n, q: l.length, at: l.filter((x) => x.impacto === 'atraso').reduce((s, x) => s + (R.num(x.dias) || 0), 0), ad: l.filter((x) => x.impacto === 'aditivo').reduce((s, x) => s + (R.num(x.dias) || 0), 0) }; }).filter((x) => x.q);
      corpo = kp([['Ocorrências', ocs.length], ['Dias de atraso', soma('atraso')], ['Dias de aditivo de prazo', soma('aditivo')], ['Diários no período', ds.length]])
        + (ocs.length ? `<h2>Por tipo</h2><table><thead><tr><th>Tipo</th><th class="num">Ocorrências</th><th class="num">Dias de atraso</th><th class="num">Dias de aditivo</th></tr></thead><tbody>${porTipo.map((x) => `<tr><td>${esc(x.n)}</td><td class="num">${x.q}</td><td class="num">${x.at || ''}</td><td class="num">${x.ad || ''}</td></tr>`).join('')}</tbody></table>
          <h2>Ocorrências</h2><table><thead><tr><th style="width:11%">Data</th><th style="width:7%">RDO</th><th style="width:18%">Tipo</th><th style="width:20%">Impacto</th><th>Descrição</th></tr></thead><tbody>${ocs.map((x) => `<tr><td>${dataBR(x.d.data)}</td><td>${esc(x.d.numero)}</td><td>${esc(R.nomeDe(R.OCORRENCIAS, x.tipo))}</td><td class="${x.impacto !== 'nenhum' ? 'neg' : ''}">${R.impactoTxt(x)}</td><td>${esc(x.desc || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="obs">Nenhuma ocorrência no período.</p>');
    } else if (k === 'prazo') {
      const pz = R.prazo(o, base, rel.ate || hojeISO());
      const ads = [];
      base.filter((d) => !rel.ate || d.data <= rel.ate).forEach((d) => (d.ocorrencias || []).filter((x) => x.impacto && x.impacto !== 'nenhum').forEach((x) => ads.push(Object.assign({ d }, x))));
      corpo = kp([['Início', dataBR(pz.inicio) || '-'], ['Prazo contratual', pz.contratual ? R.dias(pz.contratual) : '-'], ['Aditivos de prazo', R.dias(pz.aditivos)], ['Prazo atualizado', pz.atual ? R.dias(pz.atual) : '-']])
        + kp([['Término previsto', dataBR(pz.termino) || '-'], [`Decorrido em ${dataBR(rel.ate)}`, pz.decorrido === null ? '-' : R.dias(pz.decorrido)], ['A vencer', pz.aVencer === null ? '-' : pz.aVencer >= 0 ? R.dias(pz.aVencer) : `${R.dias(-pz.aVencer)} vencido`], ['Dias de atraso registrados', R.dias(pz.atraso)]])
        + (ads.length ? `<h2>Atrasos e aditivos registrados</h2><table><thead><tr><th style="width:11%">Data</th><th style="width:7%">RDO</th><th style="width:18%">Tipo</th><th style="width:20%">Impacto</th><th>Descrição</th></tr></thead><tbody>${ads.map((x) => `<tr><td>${dataBR(x.d.data)}</td><td>${esc(x.d.numero)}</td><td>${esc(R.nomeDe(R.OCORRENCIAS, x.tipo))}</td><td>${R.impactoTxt(x)}</td><td>${esc(x.desc || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="obs">Nenhum atraso ou aditivo registrado.</p>');
    } else if (k === 'mao') {
      const fs = o.grupos.flatMap((g) => g.funcoes.map((f) => Object.assign({ grupo: g.nome }, f)));
      const tot = ds.map((d) => R.totalMao(o, d));
      const hd = tot.reduce((s, x) => s + x, 0);
      corpo = kp([['Homens-dia no período', hd], ['Média por dia', ds.length ? String(Math.round((hd / ds.length) * 10) / 10).replace('.', ',') : '-'], ['Maior efetivo', tot.length ? Math.max(...tot) : '-'], ['Diários no período', ds.length]])
        + (ds.length ? `<h2>Por função</h2><table><thead><tr><th>Função</th><th>Grupo</th><th class="num">Homens-dia</th><th class="num">Média por dia</th><th class="num">Máximo</th></tr></thead><tbody>
          ${fs.map((f) => { const v = ds.map((d) => R.num(d.mao && d.mao[f.id]) || 0); const s = v.reduce((a, b) => a + b, 0); return s ? `<tr><td>${esc(f.nome)}</td><td>${esc(f.grupo)}</td><td class="num">${s}</td><td class="num">${String(Math.round((s / ds.length) * 10) / 10).replace('.', ',')}</td><td class="num">${Math.max(...v)}</td></tr>` : ''; }).join('')}</tbody></table>
          <h2>Dia a dia</h2><table><thead><tr><th>Data</th><th>RDO</th>${o.grupos.map((g) => `<th class="num">${esc(g.nome)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
          ${ds.map((d, i) => `<tr><td>${dataBR(d.data)}</td><td>${esc(d.numero)}</td>${o.grupos.map((g) => `<td class="num">${g.funcoes.reduce((s, f) => s + (R.num(d.mao && d.mao[f.id]) || 0), 0)}</td>`).join('')}<td class="num"><b>${tot[i]}</b></td></tr>`).join('')}</tbody></table>` : vazio);
    } else if (k === 'avanco') {
      const antes = R.progresso(o, base.filter((d) => rel.de && d.data < rel.de));
      const depois = R.progresso(o, base, { ate: rel.ate });
      corpo = kp([['Avanço no início do período', R.fmtPct(antes.geral, 1)], ['Avanço no fim do período', R.fmtPct(depois.geral, 1)], ['Avanço no período', R.fmtPct(depois.geral - antes.geral, 1)], ['Serviços concluídos', `${depois.cont.concluido} de ${depois.servicos.length}`]])
        + `<table><thead><tr><th style="width:8%">Item</th><th>Serviço</th><th class="num" style="width:8%">Peso</th><th class="num" style="width:12%">Em ${dataBR(rel.de)}</th><th class="num" style="width:12%">Em ${dataBR(rel.ate)}</th><th style="width:14%">Situação</th></tr></thead><tbody>
          ${o.etapas.map((e) => `<tr class="sub"><td>${esc(e.num || '')}</td><td>${esc(e.titulo)}</td><td class="num">${(() => { const t = e.servicos.reduce((s, x) => s + (R.num(x.peso) || 0), 0); return t ? String(Math.round(t * 100) / 100).replace('.', ',') : ''; })()}</td><td class="num">${R.fmtPct(antes.etapas.get(e.id), 1)}</td><td class="num">${R.fmtPct(depois.etapas.get(e.id), 1)}</td><td></td></tr>
            ${e.servicos.map((s) => { const a = antes.por.get(s.id).pct, b = depois.por.get(s.id).pct; return `<tr><td>${esc(s.num || '')}</td><td>${esc(s.desc)}</td><td class="num">${R.num(s.peso) === null ? '' : String(s.peso).replace('.', ',')}</td><td class="num">${R.fmtPct(a)}</td><td class="num">${R.fmtPct(b)}</td><td>${R.statusPct(b)}</td></tr>`; }).join('')}`).join('')}
          <tr class="tot"><td></td><td>Obra</td><td class="num"></td><td class="num">${R.fmtPct(antes.geral, 1)}</td><td class="num">${R.fmtPct(depois.geral, 1)}</td><td></td></tr></tbody></table>
          <p class="obs">${depois.pesoIgual ? 'Os serviços não têm peso: todos pesam igual.' : 'Etapas e obra: média ponderada pelo peso de cada serviço.'}</p>`;
    } else if (k === 'fotos') {
      const lista = R.servicos(o).filter((s) => !rel.serv || s.id === rel.serv);
      const blocos = lista.map((s) => {
        const fs = [];
        ds.forEach((d) => (d.fotos || []).filter((f) => f.servicoId === s.id).forEach((f) => fs.push({ f, d })));
        if (!fs.length) return '';
        return `<h2>${esc(R.rotServ(s))} <small>(${fs.length})</small></h2><div class="rdo-fotos">${fs.map(({ f, d }) => `<figure><div class="rdo-ft"><img src="${esc(B.fotos.src(f))}" alt=""></div><figcaption>${dataBR(d.data)} · RDO nº ${esc(d.numero)}${f.legenda ? ' · ' + esc(f.legenda) : ''}</figcaption></figure>`).join('')}</div>`;
      }).join('');
      corpo = blocos || '<p class="obs">Nenhuma foto ligada a serviços no período.</p>';
    }
    return `<div class="rp rdo-rel">${cabRel(o, nomeRel, rel)}${corpo}</div>`;
  }
  A['rdo-rel'] = (b) => {
    const id = $('.r-ob') && $('.r-ob').dataset.obra;
    const o = id && obra(id); if (!o) return;
    normalizarObra(o);
    if (est.rel.de && est.rel.ate && est.rel.de > est.rel.ate) { ui.toast('A data inicial é depois da final.'); return; }
    const html = relatorio(b.dataset.k, o);
    if (!html) { ui.toast('Nenhum diário no período.'); return; }
    const nome = (RELS.find((x) => x[0] === b.dataset.k) || [])[1];
    imprimir(html, { titulo: `${o.contrato ? o.contrato + ' - ' : ''}${o.nome} - ${nome} ${dataBR(est.rel.de).replace(/\//g, '-')} a ${dataBR(est.rel.ate).replace(/\//g, '-')}`, rodape: `${cfgRdo().empresa.nome} · ${o.nome}` });
  };
  A['rdo-imprimir-diario'] = () => {
    const ctx = contexto(); if (!ctx) return;
    salvarAgora();
    const { o, d } = ctx;
    const html = R.diarioHTML({ obra: o, diario: d, diarios: diariosDe(o.id), aprovacoes: aprovacoesDe(o.id), empresa: cfgRdo().empresa, logoSouza: logoSouza(), fotoSrc: (f) => B.fotos.src(f) });
    imprimir(html, { titulo: `${o.contrato ? o.contrato + ' - ' : ''}RDO nº ${String(d.numero).padStart(3, '0')} - ${dataBR(d.data).replace(/\//g, '-')}`, rodape: `Relatório ${dataBR(d.data)} nº ${d.numero} · ${o.nome}` });
  };
  const cssStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
  function imprimir(html, { titulo, rodape }) {
    const root = $('#print-root');
    root.innerHTML = html;
    let st = $('#estilo-pagina');
    if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
    st.textContent = `@page{size:A4 portrait;margin:10mm 10mm 12mm 10mm;
      @bottom-left{content:${cssStr(rodape || '')};font-family:"Segoe UI",Arial,sans-serif;font-size:7.5pt;color:#777}
      @bottom-right{content:"Página " counter(page) " de " counter(pages);font-family:"Segoe UI",Arial,sans-serif;font-size:7.5pt;color:#777}}`;
    const tit = String(titulo || 'Diário de obra').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    let ant = document.title;
    document.body.classList.add('imprimindo');
    const fim = () => { document.body.classList.remove('imprimindo'); document.title = ant; root.innerHTML = ''; window.removeEventListener('afterprint', fim); if (_redesenhar) redesenhar(); };
    window.addEventListener('afterprint', fim);
    const imgs = $$('img', root);
    const espera = imgs.map((i) => (i.complete && i.naturalWidth ? Promise.resolve() : new Promise((res) => { i.onload = res; i.onerror = res; })));
    ui.toast(imgs.length > 4 ? 'Preparando as fotos para imprimir…' : 'Preparando a impressão…');
    Promise.race([Promise.all(espera), new Promise((res) => setTimeout(res, 15000))]).then(() => setTimeout(() => { ant = document.title; document.title = tit; window.print(); }, 80));
  }

  /* =========================================================
     Cadastro da obra
     ========================================================= */
  function htmlCadastro(o, r) {
    const usados = servicosUsados(o.id);
    const totalPeso = R.servicos(o).reduce((s, x) => s + (R.num(x.peso) || 0), 0);
    const ac = o.acessos;
    const codigo = (k, rot, txt) => `<div class="r-cod"><div><b>${rot}</b><small>${txt}</small></div><code>${esc(ac[k] || '-')}</code>
      <div class="actions"><button class="btn sm" data-a="rdo-cod-msg" data-k="${k}">${icone('copiar')}Copiar mensagem</button><button class="btn sm ghost" data-a="rdo-cod-novo" data-k="${k}">${icone('repetir')}Novo código</button></div></div>`;
    return `<div class="r-cad">
      <section class="card"><div class="hd"><h3>Dados da obra</h3></div><div class="bd grid2">
        <label class="f req span2"><span>Nome da obra</span><input class="inp" data-ob="nome" value="${esc(o.nome)}"></label>
        <label class="f"><span>Contrato</span><input class="inp" data-ob="contrato" value="${esc(o.contrato || '')}"></label>
        <label class="f"><span>Situação</span><select class="inp" data-ob="situacao"><option value="andamento" ${o.situacao !== 'concluida' ? 'selected' : ''}>Em andamento</option><option value="concluida" ${o.situacao === 'concluida' ? 'selected' : ''}>Concluída</option></select></label>
        <div class="span2" id="rdo-c-cli"></div>
        <label class="f span2"><span>Contratante (como sai no diário)</span><input class="inp" data-ob="contratante" value="${esc(o.contratante || '')}"></label>
        <label class="f span2"><span>Local</span><input class="inp" data-ob="local" value="${esc(o.local || '')}"></label>
        <label class="f"><span>Responsável (cabeçalho)</span><input class="inp" data-ob="responsavel" value="${esc(o.responsavel || '')}"></label>
        <label class="f"><span>Data de início</span><input class="inp" type="date" data-ob="dataInicio" value="${esc(o.dataInicio || '')}"></label>
        <label class="f"><span>Prazo contratual (dias)</span><input class="inp" inputmode="numeric" data-ob="prazoDias" value="${esc(o.prazoDias ?? '')}"></label>
        <div class="f"><span class="small" style="font-weight:500;color:var(--ink-2)">Logo do cliente</span><div class="r-logo">${o.logoCliente && o.logoCliente.url ? `<img src="${esc(o.logoCliente.url)}" alt="">` : '<span class="muted small">Sem logo</span>'}
          <label class="btn sm">${icone('enviar')}${o.logoCliente ? 'Trocar' : 'Enviar'}<input type="file" accept="image/*" data-logo hidden></label>${o.logoCliente ? `<button class="btn sm ghost" data-a="rdo-logo-x">Tirar</button>` : ''}</div></div>
      </div></section>

      <section class="card"><div class="hd"><div><h3>Serviços do contrato</h3><p>Mesma numeração do contrato. O peso define quanto cada serviço conta no avanço da etapa e da obra (não precisa somar 100).</p></div>
        <div class="actions"><button class="btn sm" data-a="rdo-sv-orc">${icone('planilha')}Puxar de um orçamento</button><button class="btn sm" data-a="rdo-sv-colar">${icone('copiar')}Colar do Excel</button></div></div>
        <div class="bd r-sved">
        ${o.etapas.map((e, ie) => `<div class="r-sv-et" data-et="${esc(e.id)}">
          <div class="r-sv-l r-sv-lt"><input class="inp r-sv-n" data-et-k="num" value="${esc(e.num || '')}" placeholder="${ie + 1}"><input class="inp" data-et-k="titulo" value="${esc(e.titulo || '')}" placeholder="Nome da etapa"><span class="r-sv-pt">${(() => { const t = e.servicos.reduce((s, x) => s + (R.num(x.peso) || 0), 0); return t ? String(Math.round(t * 100) / 100).replace('.', ',') : ''; })()}</span>
            <span class="r-sv-bt"><button class="btn icon" data-a="rdo-et-mv" data-id="${esc(e.id)}" data-d="-1" ${ie === 0 ? 'disabled' : ''} aria-label="Subir">${icone('cima')}</button><button class="btn icon" data-a="rdo-et-mv" data-id="${esc(e.id)}" data-d="1" ${ie === o.etapas.length - 1 ? 'disabled' : ''} aria-label="Descer">${icone('baixo')}</button><button class="btn icon" data-a="rdo-et-x" data-id="${esc(e.id)}" aria-label="Excluir etapa">${icone('lixo')}</button></span></div>
          ${e.servicos.map((s, is) => `<div class="r-sv-l" data-sv="${esc(s.id)}"><input class="inp r-sv-n" data-sv-k="num" value="${esc(s.num || '')}" placeholder="${esc((e.num || ie + 1) + '.' + (is + 1))}"><input class="inp" data-sv-k="desc" value="${esc(s.desc || '')}" placeholder="Descrição do serviço"><input class="inp r-sv-p" data-sv-k="peso" inputmode="decimal" value="${esc(R.num(s.peso) === null ? '' : String(s.peso).replace('.', ','))}" placeholder="Peso">
            <span class="r-sv-bt"><button class="btn icon" data-a="rdo-sv-mv" data-id="${esc(s.id)}" data-d="-1" ${is === 0 ? 'disabled' : ''} aria-label="Subir">${icone('cima')}</button><button class="btn icon" data-a="rdo-sv-mv" data-id="${esc(s.id)}" data-d="1" ${is === e.servicos.length - 1 ? 'disabled' : ''} aria-label="Descer">${icone('baixo')}</button><button class="btn icon" data-a="rdo-sv-x" data-id="${esc(s.id)}" aria-label="Excluir serviço" ${usados.has(s.id) ? 'title="Usado em diários"' : ''}>${icone('lixo')}</button></span></div>`).join('')}
          <button class="btn sm ghost r-sv-add" data-a="rdo-sv-mais" data-id="${esc(e.id)}">${icone('mais')}Serviço</button></div>`).join('')}
        <div class="actions"><button class="btn" data-a="rdo-et-mais">${icone('mais')}Etapa</button><span class="small muted" id="rdo-peso-total">${totalPeso ? `Soma dos pesos: ${String(Math.round(totalPeso * 100) / 100).replace('.', ',')}` : ''}</span></div>
      </div></section>

      <section class="card"><div class="hd"><div><h3>Mão de obra</h3><p>Funções que aparecem no diário, agrupadas como no relatório.</p></div></div><div class="bd r-sved">
        ${o.grupos.map((g) => `<div class="r-sv-et" data-gr="${esc(g.id)}"><div class="r-sv-l r-sv-lt"><input class="inp" data-gr-k="nome" value="${esc(g.nome)}" placeholder="Nome do grupo"><span class="r-sv-bt"><button class="btn icon" data-a="rdo-gr-x" data-id="${esc(g.id)}" aria-label="Excluir grupo">${icone('lixo')}</button></span></div>
          ${g.funcoes.map((f) => `<div class="r-sv-l" data-fn="${esc(f.id)}" data-g="${esc(g.id)}"><input class="inp" data-fn-k="nome" value="${esc(f.nome)}" placeholder="Função"><span class="r-sv-bt"><button class="btn icon" data-a="rdo-fn-x" data-id="${esc(f.id)}" data-g="${esc(g.id)}" aria-label="Excluir função">${icone('lixo')}</button></span></div>`).join('')}
          <button class="btn sm ghost r-sv-add" data-a="rdo-fn-mais" data-id="${esc(g.id)}">${icone('mais')}Função</button></div>`).join('')}
        <div class="actions"><button class="btn" data-a="rdo-gr-mais">${icone('mais')}Grupo</button></div>
      </div></section>

      <section class="card"><div class="hd"><div><h3>Equipamentos</h3><p>Opcional. Aparecem no diário com a quantidade do dia.</p></div></div><div class="bd r-sved">
        ${o.equipamentos.map((e) => `<div class="r-sv-l" data-eq="${esc(e.id)}"><input class="inp" data-eq-k="nome" value="${esc(e.nome)}" placeholder="Equipamento"><span class="r-sv-bt"><button class="btn icon" data-a="rdo-eq-x" data-id="${esc(e.id)}" aria-label="Excluir equipamento">${icone('lixo')}</button></span></div>`).join('')}
        <div class="actions"><button class="btn" data-a="rdo-eq-mais">${icone('mais')}Equipamento</button></div>
      </div></section>

      <section class="card"><div class="hd"><div><h3>Assinaturas</h3><p>Saem no fim de cada diário. O fiscal e o contratante aprovam pelo portal, cada um com o seu código.</p></div></div><div class="bd r-assn">
        ${R.PAPEIS.map(([k, rot]) => { const p = o.assinantes[k] || {}; return `<div><b>${rot}</b><div class="grid2">
          <label class="f"><span>Nome</span><input class="inp" data-as="${k}" data-as-k="nome" value="${esc(p.nome || '')}"></label>
          <label class="f"><span>Cargo</span><input class="inp" data-as="${k}" data-as-k="cargo" value="${esc(p.cargo || '')}"></label>
          <label class="f"><span>Registro (CREA, CAU)</span><input class="inp" data-as="${k}" data-as-k="registro" value="${esc(p.registro || '')}"></label>
          <label class="f"><span>E-mail</span><input class="inp" data-as="${k}" data-as-k="email" value="${esc(p.email || '')}"></label></div></div>`; }).join('')}
      </div></section>

      <section class="card"><div class="hd"><div><h3>Acesso do cliente</h3><p>Portal: <a href="${esc(urlPortal())}" target="_blank" rel="noopener">${esc(urlPortal().replace(/^https?:\/\//, ''))}</a>. Só aparecem os diários aprovados.</p></div></div><div class="bd r-cods">
        ${codigo('cliente', 'Código da obra', 'Consulta os diários, as fotos e o avanço')}
        ${codigo('fiscal', 'Código do fiscal', `Consulta e aprova como fiscal${o.assinantes.fiscal.nome ? ' (' + esc(o.assinantes.fiscal.nome) + ')' : ''}`)}
        ${codigo('contratante', 'Código do contratante', `Consulta e aprova como contratante${o.assinantes.contratante.nome ? ' (' + esc(o.assinantes.contratante.nome) + ')' : ''}`)}
      </div></section>

      <section class="card"><div class="hd"><h3>Fotos no Drive</h3></div><div class="bd"><p class="small muted">${o.drivePasta ? `As originais em alta qualidade ficam na <a href="${esc(o.drivePasta)}" target="_blank" rel="noopener">pasta desta obra no Drive</a>, uma subpasta por diário.` : 'A pasta da obra no Drive é criada quando a primeira foto subir pela ponte.'}</p>
        <div class="actions"><button class="btn danger" data-a="rdo-obra-x">${icone('lixo')}Excluir obra</button></div></div></section>
    </div>`;
  }
  function servicosUsados(obraId) {
    const s = new Map();
    diariosDe(obraId).forEach((d) => { (d.atividades || []).forEach((a) => { if (a.servicoId) s.set(a.servicoId, (s.get(a.servicoId) || 0) + 1); }); (d.fotos || []).forEach((f) => { if (f.servicoId) s.set(f.servicoId, (s.get(f.servicoId) || 0) + 1); }); });
    return s;
  }
  function ligarCadastro(el, o) {
    const r = $('#rdo-c-cli', el);
    if (r) Sis.seletorCliente(r, { clienteId: o.clienteId, rotulo: 'Cliente no cadastro (opcional)', aoMudar: (id) => {
      mudarObra((x) => {
        x.clienteId = id || '';
        const c = id && Sis.clientes.get(id);
        if (c) { if (!x.contratante) x.contratante = c.nome; if (!x.local) x.local = c.endereco || ''; }
      }, false);
      const c = id && Sis.clientes.get(id);
      if (c) { const ct = $('[data-ob=contratante]'), lc = $('[data-ob=local]'); if (ct && !ct.value) ct.value = c.nome; if (lc && !lc.value) lc.value = c.endereco || ''; }
    } });
  }
  const obraAberta = () => { const id = $('.r-ob') && $('.r-ob').dataset.obra; const o = id && obra(id); return o ? normalizarObra(o) : null; };
  function mudarObra(fn, pintar = true) {
    const o = obraAberta(); if (!o) return;
    fn(o);
    salvarObra(o);
    if (pintar) Sis.desenhar(true);
  }
  /** Soma dos pesos por etapa e no total, sem redesenhar (para não tirar o cursor do campo). */
  function atualizarPesos() {
    const o = obraAberta(); if (!o) return;
    const f = (n) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '');
    let tot = 0;
    o.etapas.forEach((e) => { const t = e.servicos.reduce((s, x) => s + (R.num(x.peso) || 0), 0); tot += t; const el = $(`[data-et="${e.id}"] .r-sv-pt`); if (el) el.textContent = f(t); });
    const el = $('#rdo-peso-total'); if (el) el.textContent = tot ? `Soma dos pesos: ${f(tot)}` : '';
  }
  const achar = (o, id) => { for (const e of o.etapas) { const i = e.servicos.findIndex((s) => s.id === id); if (i >= 0) return { e, i }; } return null; };
  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (!t.closest || !t.closest('.r-cad')) return;
    if (t.dataset.ob) {
      let v = t.value.trim();
      if (t.dataset.ob === 'prazoDias') v = parseInt(v, 10) > 0 ? parseInt(v, 10) : null;
      if (t.dataset.ob === 'nome' && !v) { t.classList.add('erro'); return; }
      t.classList.remove('erro');
      mudarObra((o) => { o[t.dataset.ob] = v; }, false);
      return;
    }
    const et = t.closest('[data-et]'), sv = t.closest('[data-sv]');
    if (sv && t.dataset.svK) {
      mudarObra((o) => { const f = achar(o, sv.dataset.sv); if (!f) return; const s = f.e.servicos[f.i]; if (t.dataset.svK === 'peso') s.peso = lerNum(t.value); else s[t.dataset.svK] = t.value.trim(); }, false);
      if (t.dataset.svK === 'peso') atualizarPesos();
      return;
    }
    if (et && t.dataset.etK) { mudarObra((o) => { const e = o.etapas.find((x) => x.id === et.dataset.et); if (e) e[t.dataset.etK] = t.value.trim(); }, false); return; }
    const gr = t.closest('[data-gr]'), fn = t.closest('[data-fn]');
    if (fn && t.dataset.fnK) { mudarObra((o) => { const g = o.grupos.find((x) => x.id === fn.dataset.g); const f = g && g.funcoes.find((x) => x.id === fn.dataset.fn); if (f) f.nome = t.value.trim(); }, false); return; }
    if (gr && t.dataset.grK) { mudarObra((o) => { const g = o.grupos.find((x) => x.id === gr.dataset.gr); if (g) g.nome = t.value.trim(); }, false); return; }
    const eq = t.closest('[data-eq]');
    if (eq && t.dataset.eqK) { mudarObra((o) => { const e = o.equipamentos.find((x) => x.id === eq.dataset.eq); if (e) e.nome = t.value.trim(); }, false); return; }
    if (t.dataset.as) { mudarObra((o) => { o.assinantes[t.dataset.as] = Object.assign({}, o.assinantes[t.dataset.as], { [t.dataset.asK]: t.value.trim() }); }, false); return; }
    if (t.matches('[data-logo]') && t.files && t.files[0]) {
      const arq = t.files[0]; t.value = '';
      if (!navigator.onLine) { ui.toast('Para enviar a logo é preciso internet.'); return; }
      try {
        const png = /png|svg|gif|webp/i.test(arq.type);
        const red = await reduzir(arq, 600, png ? 'image/png' : 'image/jpeg', 0.85);
        const o = obraAberta(); if (!o) return;
        const path = `obras/${o.id}/logo-${Date.now()}.${png ? 'png' : 'jpg'}`;
        const url = await B.enviarArquivo(path, red.blob, png ? 'image/png' : 'image/jpeg');
        const ant = o.logoCliente && o.logoCliente.path;
        mudarObra((x) => { x.logoCliente = { path, url }; });
        if (ant) B.apagarArquivos([ant]).catch(() => {});
        ui.toast('Logo do cliente salva.');
      } catch (e) { ui.toast('Não foi possível enviar a logo: ' + e.message, 'erro'); }
    }
  });
  A['rdo-logo-x'] = () => { const o = obraAberta(); const ant = o && o.logoCliente && o.logoCliente.path; mudarObra((x) => { x.logoCliente = null; }); if (ant) B.apagarArquivos([ant]).catch(() => {}); };
  A['rdo-et-mais'] = () => { mudarObra((o) => { o.etapas.push({ id: rid(), num: String(o.etapas.length + 1), titulo: '', servicos: [] }); }); setTimeout(() => { const l = $$('[data-et-k=titulo]'); const u = l[l.length - 1]; if (u) { u.focus(); u.scrollIntoView({ block: 'center' }); } }, 50); };
  A['rdo-sv-mais'] = (b) => {
    let novo;
    mudarObra((o) => { const e = o.etapas.find((x) => x.id === b.dataset.id); if (!e) return; novo = rid(); e.servicos.push({ id: novo, num: `${e.num || o.etapas.indexOf(e) + 1}.${e.servicos.length + 1}`, desc: '', peso: null }); });
    setTimeout(() => { const i = $(`[data-sv="${novo}"] [data-sv-k=desc]`); if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); } }, 50);
  };
  A['rdo-sv-mv'] = (b) => mudarObra((o) => { const f = achar(o, b.dataset.id); if (!f) return; const j = f.i + Number(b.dataset.d); if (j < 0 || j >= f.e.servicos.length) return; const [s] = f.e.servicos.splice(f.i, 1); f.e.servicos.splice(j, 0, s); });
  A['rdo-et-mv'] = (b) => mudarObra((o) => { const i = o.etapas.findIndex((x) => x.id === b.dataset.id); const j = i + Number(b.dataset.d); if (i < 0 || j < 0 || j >= o.etapas.length) return; const [e] = o.etapas.splice(i, 1); o.etapas.splice(j, 0, e); });
  A['rdo-sv-x'] = async (b) => {
    const o = obraAberta(); if (!o) return;
    const n = servicosUsados(o.id).get(b.dataset.id);
    if (n) { ui.alerta({ titulo: 'Serviço em uso', msg: `Este serviço aparece em ${n} ${n === 1 ? 'registro' : 'registros'} dos diários (atividades ou fotos), por isso não pode ser excluído. Se precisar, mude a descrição.` }); return; }
    mudarObra((x) => { const f = achar(x, b.dataset.id); if (f) f.e.servicos.splice(f.i, 1); });
  };
  A['rdo-et-x'] = async (b) => {
    const o = obraAberta(); if (!o) return;
    const e = o.etapas.find((x) => x.id === b.dataset.id); if (!e) return;
    const us = servicosUsados(o.id);
    if (e.servicos.some((s) => us.has(s.id))) { ui.alerta({ titulo: 'Etapa em uso', msg: 'Esta etapa tem serviços que aparecem nos diários. Ela não pode ser excluída.' }); return; }
    if (e.servicos.length && !(await ui.confirmar({ titulo: 'Excluir etapa?', msg: `A etapa "${e.titulo || 'sem nome'}" e os ${e.servicos.length} serviços dela serão excluídos.`, ok: 'Excluir', perigo: true }))) return;
    mudarObra((x) => { x.etapas = x.etapas.filter((y) => y.id !== b.dataset.id); });
  };
  A['rdo-gr-mais'] = () => mudarObra((o) => { o.grupos.push({ id: rid(), nome: 'Novo grupo', funcoes: [] }); });
  A['rdo-gr-x'] = async (b) => {
    const o = obraAberta(); if (!o) return;
    const g = o.grupos.find((x) => x.id === b.dataset.id); if (!g) return;
    if (g.funcoes.length && !(await ui.confirmar({ titulo: 'Excluir grupo?', msg: `O grupo "${g.nome}" e as ${g.funcoes.length} funções dele saem dos próximos diários. Os diários já feitos ficam sem esses números.`, ok: 'Excluir', perigo: true }))) return;
    mudarObra((x) => { x.grupos = x.grupos.filter((y) => y.id !== b.dataset.id); });
  };
  A['rdo-fn-mais'] = (b) => { let novo; mudarObra((o) => { const g = o.grupos.find((x) => x.id === b.dataset.id); if (g) { novo = rid(); g.funcoes.push({ id: novo, nome: '' }); } }); setTimeout(() => { const i = $(`[data-fn="${novo}"] input`); if (i) i.focus(); }, 50); };
  A['rdo-fn-x'] = (b) => mudarObra((o) => { const g = o.grupos.find((x) => x.id === b.dataset.g); if (g) g.funcoes = g.funcoes.filter((f) => f.id !== b.dataset.id); });
  A['rdo-eq-mais'] = () => { let novo; mudarObra((o) => { novo = rid(); o.equipamentos.push({ id: novo, nome: '' }); }); setTimeout(() => { const i = $(`[data-eq="${novo}"] input`); if (i) i.focus(); }, 50); };
  A['rdo-eq-x'] = (b) => mudarObra((o) => { o.equipamentos = o.equipamentos.filter((e) => e.id !== b.dataset.id); });
  A['rdo-cod-novo'] = async (b) => {
    const ok = await ui.confirmar({ titulo: 'Gerar um código novo?', msg: 'O código atual para de funcionar na hora. Quem usava o código antigo vai precisar do novo.', ok: 'Gerar novo código' });
    if (ok) mudarObra((o) => { o.acessos[b.dataset.k] = gerarCodigo(); });
  };
  A['rdo-cod-msg'] = async (b) => {
    const o = obraAberta(); if (!o) return;
    const k = b.dataset.k, cod = o.acessos[k];
    const quem = k === 'fiscal' ? ' Com este código você também aprova os diários como fiscal da obra.' : k === 'contratante' ? ' Com este código você também aprova os diários como contratante.' : '';
    const txt = `Olá! Os diários da obra ${o.nome} estão disponíveis em ${urlPortal()}\nCódigo de acesso: ${cod}${quem ? '\n' + quem.trim() : ''}`;
    try { await navigator.clipboard.writeText(txt); ui.toast('Mensagem copiada. É só colar no WhatsApp ou no e-mail.'); }
    catch { ui.alerta({ titulo: 'Mensagem para o cliente', msg: txt }); }
  };
  A['rdo-obra-x'] = async () => {
    const o = obraAberta(); if (!o) return;
    const n = diariosDe(o.id).length;
    if (n) { ui.alerta({ titulo: 'Obra com diários', msg: `Esta obra tem ${n} ${n === 1 ? 'diário' : 'diários'}. Para tirá-la da lista, mude a situação para "Concluída". Para excluir, apague os diários antes.` }); return; }
    if (!(await ui.confirmar({ titulo: 'Excluir obra?', msg: `A obra "${o.nome}" será excluída.`, ok: 'Excluir', perigo: true }))) return;
    B.store.excluir('obras', o.id);
    location.hash = '#/rdo';
  };

  /* importar serviços de um orçamento ou colar do Excel */
  A['rdo-sv-orc'] = () => {
    const lista = Sis.orcamentos ? Sis.orcamentos.lista().sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))) : [];
    if (!lista.length) { ui.toast('Nenhum orçamento no módulo Orçamentos.'); return; }
    const o = obraAberta(); if (!o) return;
    ui.abrirModal({
      titulo: 'Puxar serviços de um orçamento', sub: 'As etapas viram etapas e os itens viram serviços, com a mesma numeração.',
      corpo: `<label class="f"><span>Orçamento</span><select class="inp" name="orc">${lista.map((x) => `<option value="${esc(x.id)}">${esc([x.codigo, x.titulo].filter(Boolean).join(' - '))}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" name="peso"> <span>Preencher o peso com a participação de cada item no valor do orçamento (você pode mudar depois)</span></label>
        ${R.servicos(o).length ? '<p class="small aviso-campo">A lista atual de serviços será substituída. Serviços usados em diários são mantidos.</p>' : ''}`,
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Puxar serviços', classe: 'primary', acao: (m) => {
          const orc = lista.find((x) => x.id === $('[name=orc]', m.el).value); if (!orc) return;
          const comPeso = $('[name=peso]', m.el).checked;
          const c = Sis.orcamentos.calcular(orc);
          const tot = c.direto || 0;
          const etapas = orc.etapas.map((e, i) => ({ id: rid(), num: String(i + 1), titulo: e.titulo || '', servicos: e.itens.map((l, j) => { const v = (c.m.get(l.id) || {}).tot || 0; return { id: rid(), num: `${i + 1}.${j + 1}`, desc: l.desc || '', peso: comPeso && tot ? Math.round((v / tot) * 10000) / 100 : null }; }) }));
          mudarObra((x) => {
            const us = servicosUsados(x.id);
            const manter = x.etapas.map((e) => Object.assign({}, e, { servicos: e.servicos.filter((s) => us.has(s.id)) })).filter((e) => e.servicos.length);
            x.etapas = etapas.concat(manter.map((e) => Object.assign(e, { titulo: (e.titulo || 'Etapa') + ' (serviços já usados)' })));
          });
          m.fechar();
          ui.toast(`${etapas.reduce((s, e) => s + e.servicos.length, 0)} serviços em ${etapas.length} etapas.`);
        },
      }],
    });
  };
  function lerColado(txt) {
    const etapas = [];
    let atual = null;
    String(txt || '').split(/\r?\n/).forEach((linha) => {
      const cols = linha.split('\t').map((c) => c.trim());
      if (!cols.join('')) return;
      let [n, desc, peso] = cols;
      if (cols.length === 1) { const m = cols[0].match(/^(\d+(?:\.\d+)*)\s*[-–]?\s*(.+)$/); if (m) { n = m[1]; desc = m[2]; } else { n = ''; desc = cols[0]; } }
      const ehEtapa = n && /^\d+(\.0+)?$/.test(n);
      const pv = lerNum(peso);
      if (ehEtapa || !atual) {
        if (ehEtapa) { atual = { id: rid(), num: n, titulo: desc || '', servicos: [] }; etapas.push(atual); return; }
        atual = { id: rid(), num: String(etapas.length + 1), titulo: 'ETAPA', servicos: [] }; etapas.push(atual);
      }
      atual.servicos.push({ id: rid(), num: n || '', desc: desc || '', peso: pv });
    });
    return etapas;
  }
  A['rdo-sv-colar'] = () => {
    ui.abrirModal({
      titulo: 'Colar serviços do Excel', sub: 'Copie as colunas Item, Descrição e Peso (opcional) da planilha do contrato e cole abaixo. Linhas com número inteiro (1, 2.0) viram etapas.',
      corpo: `<textarea class="inp" name="txt" rows="10" placeholder="1&#9;PREPARAÇÃO DO TERRENO&#10;1.1&#9;Demarcação dos pontos diretores&#9;2&#10;1.2&#9;Movimentação de terra&#9;5"></textarea><p class="small muted" data-q="prev"></p>`,
      aoAbrir: (m) => { const t = $('[name=txt]', m), p = $('[data-q=prev]', m); t.addEventListener('input', () => { const e = lerColado(t.value); p.textContent = e.length ? `${e.length} etapas e ${e.reduce((s, x) => s + x.servicos.length, 0)} serviços.` : ''; }); },
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Adicionar ao fim da lista', classe: 'primary', acao: (m) => {
          const e = lerColado($('[name=txt]', m.el).value);
          if (!e.length) { ui.toast('Nada para adicionar.'); return; }
          mudarObra((x) => { x.etapas = x.etapas.concat(e); });
          m.fechar();
          ui.toast(`${e.reduce((s, x) => s + x.servicos.length, 0)} serviços adicionados.`);
        },
      }],
    });
  };

  /* =========================================================
     Configurações do RDO
     ========================================================= */
  function telaConfig(el) {
    const c = cfgRdo();
    const p = B.projeto();
    const f = B.fotos.contagem();
    const campo = (grupo, k, rot, v, extra = '') => `<label class="f ${extra}"><span>${rot}</span><input class="inp" data-cf="${grupo}.${k}" value="${esc(v || '')}"></label>`;
    el.innerHTML = `<div class="ob-topo"><a class="btn icon" href="#/rdo" aria-label="Voltar">${icone('esq')}</a><div class="tit"><b>Configurações do Diário de obra</b><span>Valem para todas as obras e todos os aparelhos</span></div></div>
      ${syncHTML()}
      <div class="cfg">
        <div class="card"><div class="hd"><div><h3>Ponte do Google Drive</h3><p>Guarda as fotos originais em alta qualidade no seu Drive. O passo a passo da instalação está no guia do RDO.</p></div></div><div class="bd">
          <label class="f"><span>Endereço do App da Web (termina em /exec)</span><input class="inp" data-cf="ponte.url" value="${esc(c.ponte.url)}" placeholder="https://script.google.com/macros/s/.../exec" autocapitalize="off" spellcheck="false"></label>
          <label class="f"><span>Senha da ponte (a mesma do script)</span><input class="inp" type="password" data-cf="ponte.senha" value="${esc(c.ponte.senha)}" autocomplete="off"></label>
          <div class="actions"><button class="btn" data-a="rdo-ponte-teste">${icone('check')}Testar a ponte</button><span class="small muted" id="rdo-ponte-st">${f.ponte ? `${f.ponte} ${f.ponte === 1 ? 'foto aguarda' : 'fotos aguardam'} a ponte para subir ao Drive.` : ''}</span></div></div></div>
        <div class="card"><div class="hd"><div><h3>Sua assinatura</h3><p>Imagem que sai no diário quando você aprova. Use uma assinatura em fundo branco ou transparente.</p></div></div><div class="bd">
          <div class="r-logo r-assimg">${c.assinatura ? `<img src="${esc(c.assinatura)}" alt="Assinatura">` : '<span class="muted small">Sem assinatura</span>'}<label class="btn sm">${icone('enviar')}${c.assinatura ? 'Trocar' : 'Enviar'} imagem<input type="file" accept="image/*" data-assinatura hidden></label></div>
          <div class="grid2" style="margin-top:12px">${campo('responsavel', 'nome', 'Nome', c.responsavel.nome)}${campo('responsavel', 'cargo', 'Cargo', c.responsavel.cargo)}${campo('responsavel', 'registro', 'Registro', c.responsavel.registro)}${campo('responsavel', 'email', 'E-mail', c.responsavel.email)}</div>
          <p class="small muted">Esses dados entram como responsável nas obras novas.</p></div></div>
        <div class="card"><div class="hd"><div><h3>Rodapé dos relatórios</h3></div></div><div class="bd"><div class="grid2">
          ${campo('empresa', 'nome', 'Empresa', c.empresa.nome)}${campo('empresa', 'telefone', 'Telefone', c.empresa.telefone)}${campo('empresa', 'email', 'E-mail', c.empresa.email)}${campo('empresa', 'site', 'Site', c.empresa.site)}</div></div></div>
        <div class="card"><div class="hd"><div><h3>Conexão e espaço</h3></div></div><div class="bd">
          <dl class="kv"><dt>Projeto</dt><dd>${esc(p ? p.url.replace(/^https?:\/\//, '') : '-')}</dd><dt>Conta</dt><dd>${esc(B.conta() || '-')}</dd>
            <dt>Fotos na fila</dt><dd>${f.enviar + f.ponte}</dd><dt>Espaço das fotos</dt><dd id="rdo-espaco">Calculando…</dd></dl>
          <p class="small muted">O plano grátis do Supabase tem 1 GB para arquivos. Cada foto reduzida ocupa cerca de 150 KB.</p>
          <div class="actions"><button class="btn" data-a="rdo-sync">${icone('nuvem')}Sincronizar agora</button><button class="btn" data-a="rdo-sair">${icone('sair')}Desconectar este aparelho</button></div></div></div>
      </div>`;
    pintarSync();
    B.rpc('rdo_espaco').then((n) => { const e = $('#rdo-espaco'); if (e) { const mb = (Number(n) || 0) / 1048576; e.textContent = `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB de 1.024 MB (${((mb / 1024) * 100).toFixed(1).replace('.', ',')}%)`; } })
      .catch(() => { const e = $('#rdo-espaco'); if (e) e.textContent = navigator.onLine ? 'Não disponível' : 'Sem internet'; });
  }
  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (!t.dataset) return;
    if (t.dataset.cf) {
      const [g, k] = t.dataset.cf.split('.');
      const c = cfgRdo();
      c[g] = Object.assign({}, c[g], { [k]: t.value.trim() });
      B.salvarConfig(c);
      ui.toast('Configuração salva.');
      if (g === 'ponte') setTimeout(() => B.fotos.processar(), 300);
      return;
    }
    if (t.matches && t.matches('[data-assinatura]') && t.files && t.files[0]) {
      const arq = t.files[0]; t.value = '';
      if (!navigator.onLine) { ui.toast('Para enviar a assinatura é preciso internet.'); return; }
      try {
        const red = await reduzir(arq, 900, 'image/png');
        const path = `config/assinatura-${Date.now()}.png`;
        const url = await B.enviarArquivo(path, red.blob, 'image/png');
        const c = cfgRdo(); c.assinatura = url; B.salvarConfig(c);
        ui.toast('Assinatura salva.');
        Sis.desenhar(true);
      } catch (e) { ui.toast('Não foi possível enviar a assinatura: ' + e.message, 'erro'); }
    }
  });
  A['rdo-ponte-teste'] = async () => {
    const st = $('#rdo-ponte-st');
    if (st) st.textContent = 'Testando…';
    try {
      const j = await B.ponte({ acao: 'teste' });
      if (st) st.innerHTML = `Ponte funcionando. <a href="${esc(j.pasta || '#')}" target="_blank" rel="noopener">Abrir a pasta no Drive</a>`;
      B.fotos.processar();
    } catch (e) { if (st) st.textContent = e.message; }
  };
  A['rdo-sync'] = () => { B.sync.agora(); ui.toast('Sincronizando…'); };
  A['rdo-sair'] = async () => {
    const n = B.pendentes(), f = B.fotos.contagem();
    const ok = await ui.confirmar({ titulo: 'Desconectar o Diário de obra?', msg: `${n || f.enviar ? `Há ${n} alterações e ${f.enviar} fotos que ainda não subiram. Elas serão perdidas neste aparelho.\n\n` : ''}Os dados que já estão no Supabase continuam lá.`, ok: 'Desconectar', perigo: !!(n || f.enviar) });
    if (!ok) return;
    await B.desconectar();
    location.hash = '#/rdo';
    Sis.desenhar();
  };

  /* =========================================================
     Registro no sistema
     ========================================================= */
  function desenharTela(el, partes) {
    if (!B.conectado()) { telaConectar(el); return; }
    if (!partes[0]) telaLista(el);
    else if (partes[0] === 'config') telaConfig(el);
    else if (partes[1] === 'd' && partes[2]) telaDiario(el, partes[0], partes[2]);
    else telaObra(el, partes[0], ABAS.some((a) => a[0] === partes[1]) ? partes[1] : 'diarios');
  }
  function render(el, partes) {
    if (est.sujo && !(partes[1] === 'd' && partes[2] === est.dId)) salvarAgora();
    if (B.pronto()) { desenharTela(el, partes); return; }
    el.innerHTML = '<div class="empty">Abrindo o Diário de obra…</div>';
    B.iniciar().then(() => { if (Sis.rota().mod === 'rdo') Sis.desenhar(true); })
      .catch((e) => { el.innerHTML = `<div class="card"><div class="empty"><b>Não foi possível abrir o Diário de obra</b>${esc(e.message)}</div></div>`; });
  }
  Sis.modulo({
    id: 'rdo', nome: 'Diário de obra', desc: 'RDO, fotos e portal do cliente', icone: 'rdo', sistema: true,
    render,
    buscar(t) {
      if (!B.conectado()) return [];
      return obras().filter((o) => norm([o.nome, o.contrato, o.contratante].join(' ')).includes(t)).slice(0, 4)
        .map((o) => ({ tipo: 'Diário de obra', titulo: o.nome, sub: [o.contrato, o.contratante].filter(Boolean).join(' · '), rota: `#/rdo/${o.id}` }));
    },
  });
  setTimeout(() => { B.iniciar().catch(() => {}); }, 3000);
})();
