'use strict';
/* =========================================================
   Orçamentos: planilhas orçamentárias por etapas, itens e
   subitens, com material, mão de obra e BDI. Impressão em A4
   (ou PDF), exportação e importação de planilhas do Excel.
   Tabela "orcamentos": um registro por orçamento
   (tipo "orcamento", grupo = cliente) e um de configuração.
   ========================================================= */
(function () {
  const { $, $$, esc, norm, brl, hojeISO, dataBR } = Sis.util;
  const { store, ui, icone, clientes } = Sis;
  const T = 'orcamentos';
  const A = Sis.acoes;

  Object.assign(Sis.ICONES, {
    orcamento: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6.5h8"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>',
    pontos: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
    cima: '<path d="m6 15 6-6 6 6"/>',
    baixo: '<path d="m6 9 6 6 6-6"/>',
    imprimir: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    planilha: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    desfazer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    refazer: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    recuar: '<path d="M5 4v7a3 3 0 0 0 3 3h12"/><path d="m16 10 4 4-4 4"/>',
    avancar: '<path d="M19 20v-7a3 3 0 0 0-3-3H4"/><path d="m8 14-4-4 4-4"/>',
    balao: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    recolher: '<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>',
    expandir: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>',
    dados: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h4"/>',
    mover: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    etiqueta: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
  });

  /* ---------------- constantes ---------------- */
  const STATUS = [
    ['elaboracao', 'Em elaboração', 'neutro'],
    ['enviado', 'Enviado', 'info'],
    ['aprovado', 'Aprovado', 'ok'],
    ['recusado', 'Recusado', 'estourado'],
  ];
  const ST = Object.fromEntries(STATUS.map(([k, n, c]) => [k, { n, c }]));
  const MODALIDADES = [['global', 'Preço global'], ['unitario', 'Preço unitário'], ['administracao', 'Administração']];
  const MOD = Object.fromEntries(MODALIDADES);
  const TITULO_MOD = { global: 'Obra por preço global', unitario: 'Obra por preço unitário', administracao: 'Obra por administração' };
  const UNIDADES = ['und', 'm²', 'm', 'm³', 'vb', 'mês', 'kg', 'h', 'dia', 'pç', 'cj', 'L', 't'];
  const ETAPAS_PADRAO = ['SERVIÇOS TÉCNICOS', 'ADMINISTRAÇÃO', 'SERVIÇOS PRELIMINARES', 'DEMOLIÇÕES, RETIRADAS E RECOMPOSIÇÕES',
    'ALVENARIAS E DIVISÓRIAS', 'PISOS E REVESTIMENTOS', 'FORROS', 'PORTAS, PORTAS ESPECIAIS E ESQUADRIAS METÁLICAS', 'PINTURA',
    'INSTALAÇÕES', 'LIMPEZA'];
  const EMPRESA_PADRAO = {
    nome: 'Souza Engenharia', cnpj: '49.885.935/0001-91', responsavel: 'Eng. Breno Rocha Souza',
    cargo: 'Diretor da Souza Engenharia', registro: 'CREA-BA 052098151-0', telefone: '(71) 99723-7168',
    email: 'obras@souzaengenharia.com', site: 'www.souzaengenharia.com', cidade: 'Salvador',
  };
  const CONFIG_PADRAO = { bdi: 36, bdiRotulo: 'BDI + LUCRO + IMPOSTO', validade: 30, observacoes: '' };
  const IMPRESSAO_PADRAO = { orientacao: 'paisagem', colunas: 'completa', bdi: 'separado', resumo: true, obs: true, assinatura: true, extenso: true };
  const ID_CONFIG = 'config';

  /* ---------------- números ---------------- */
  const _q = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const _v = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vazio = (n) => n === null || n === undefined || n === '' || !isFinite(n);
  const fq = (n) => (vazio(n) ? '' : _q.format(n));
  const fv = (n) => (vazio(n) ? '' : _v.format(Math.round(n * 100) / 100 + 0));
  const nn = (n) => (vazio(n) ? 0 : Number(n));
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const pct = (x, casas = 1) => (isFinite(x) ? (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '0') + '%';
  /** Valor digitado como no Excel: "1.600", "85,5", "12,5*3+2" ou "=21*2". */
  const cru = (n) => (vazio(n) ? '' : String(Math.round(n * 1e6) / 1e6).replace('.', ','));
  function lerNumero(s) {
    const orig = String(s ?? '').trim();
    let t = orig.replace(/^=/, '').replace(/R\$/gi, '').replace(/\s+/g, '');
    if (!t) return { v: null, f: '' };
    t = t.replace(/\d[\d.,]*/g, (tok) => {
      if (tok.includes(',')) return tok.replace(/\./g, '').replace(',', '.');
      if (/^\d{1,3}(\.\d{3})+$/.test(tok)) return tok.replace(/\./g, '');
      return tok;
    });
    if (!/^[0-9.+\-*/()]+$/.test(t) || /[.]{2,}|\d\.\d+\./.test(t)) return null;
    const expr = /[+*/()]/.test(t) || /.-/.test(t);
    let v;
    try { v = Function('"use strict";return (' + t + ')')(); } catch { return null; }
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return { v: Math.round(v * 1e6) / 1e6, f: expr ? orig.replace(/^=/, '') : '' };
  }

  /** Valor por extenso em reais. */
  function extenso(valor) {
    const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    const ate999 = (n) => {
      if (n === 100) return 'cem';
      const c = Math.floor(n / 100), r = n % 100, p = [];
      if (c) p.push(C[c]);
      if (r) p.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : ''));
      return p.join(' e ');
    };
    const inteiro = (n) => {
      if (n === 0) return 'zero';
      const grupos = [];
      for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
      const nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
      const partes = [];
      for (let i = grupos.length - 1; i >= 0; i--) {
        const g = grupos[i];
        if (!g) continue;
        const txt = i === 1 && g === 1 ? 'mil' : ate999(g) + (i ? ' ' + nomes[i][g === 1 ? 0 : 1] : '');
        partes.push({ txt, g, i });
      }
      return partes.map((p, k) => {
        if (k === 0) return p.txt;
        const ultimo = k === partes.length - 1;
        return (ultimo && (p.g < 100 || p.g % 100 === 0) ? ' e ' : ' ') + p.txt;
      }).join('');
    };
    const cent = Math.round(Math.abs(valor) * 100);
    const reais = Math.floor(cent / 100), cts = cent % 100;
    const partes = [];
    if (reais) {
      const r = inteiro(reais);
      const deReais = reais >= 1e6 && reais % 1e6 === 0 ? ' de' : '';
      partes.push(r + deReais + (reais === 1 ? ' real' : ' reais'));
    }
    if (cts) partes.push(inteiro(cts) + (cts === 1 ? ' centavo' : ' centavos'));
    return partes.length ? partes.join(' e ') : 'zero real';
  }

  /* ---------------- dados ---------------- */
  const copia = (v) => JSON.parse(JSON.stringify(v));
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const temSub = (l) => Array.isArray(l.sub) && l.sub.length > 0;
  const novaLinha = (p = {}) => Object.assign({ id: rid(), desc: '', un: '', qtd: null, mat: null, mdo: null }, p);
  const novaEtapa = (titulo = '') => ({ id: rid(), titulo, itens: [] });
  function novosIds(l) { l.id = rid(); if (l.sub) l.sub.forEach(novosIds); if (l.itens) l.itens.forEach(novosIds); return l; }

  function config() {
    const r = store.get(T, ID_CONFIG);
    const c = (r && r.dados) || {};
    return Object.assign({}, CONFIG_PADRAO, c, { empresa: Object.assign({}, EMPRESA_PADRAO, c.empresa || {}) });
  }
  function salvarConfig(c) { store.salvar(T, ID_CONFIG, 'config', c); }

  function normalizar(o) {
    o.etapas = Array.isArray(o.etapas) ? o.etapas : [];
    o.etapas.forEach((e) => {
      e.id = e.id || rid(); e.titulo = e.titulo || ''; e.itens = Array.isArray(e.itens) ? e.itens : [];
      e.itens.forEach((l) => { l.id = l.id || rid(); if (l.sub) l.sub.forEach((s) => { s.id = s.id || rid(); }); });
    });
    o.status = ST[o.status] ? o.status : 'elaboracao';
    o.modalidade = MOD[o.modalidade] ? o.modalidade : 'global';
    o.bdi = vazio(o.bdi) ? 0 : Number(o.bdi);
    o.bdiRotulo = o.bdiRotulo || CONFIG_PADRAO.bdiRotulo;
    o.impressao = Object.assign({}, IMPRESSAO_PADRAO, o.impressao || {});
    return o;
  }
  const registro = (id) => { const r = store.get(T, id); return r && r.tipo === 'orcamento' ? r : null; };
  const listaOrc = () => store.lista(T, 'orcamento').map((r) => normalizar(Object.assign({ id: r.id }, copia(r.dados))));

  function proximoCodigo(ano = new Date().getFullYear()) {
    let max = 0;
    store.lista(T, 'orcamento').forEach((r) => {
      const m = String((r.dados && r.dados.codigo) || '').match(/^(\d+)\/(\d{4})$/);
      if (m && +m[2] === ano) max = Math.max(max, +m[1]);
    });
    return String(max + 1).padStart(3, '0') + '/' + ano;
  }

  /* ---------------- cálculo ----------------
     Linha: total = quantidade x (material + mão de obra).
     Item com subitens: soma dos subitens. Etapa: soma dos itens.
     Valor final = custo direto + BDI (% sobre o custo direto). */
  function calcular(o) {
    const m = new Map();
    const folha = (l) => {
      if (l.neg) return { mat: 0, mdo: 0, tot: 0, unit: null, neg: true };
      const q = nn(l.qtd), a = nn(l.mat), b = nn(l.mdo);
      return { mat: q * a, mdo: q * b, tot: q * (a + b), unit: vazio(l.mat) && vazio(l.mdo) ? null : a + b, neg: false };
    };
    const soma = (xs) => xs.reduce((s, x) => ({ mat: s.mat + x.mat, mdo: s.mdo + x.mdo, tot: s.tot + x.tot }), { mat: 0, mdo: 0, tot: 0 });
    let nItens = 0, nSub = 0, nNeg = 0;
    const etapas = o.etapas.map((e) => {
      const its = e.itens.map((l) => {
        nItens++;
        let r;
        if (temSub(l)) {
          const ss = l.sub.map((s) => { nSub++; const x = folha(s); if (x.neg) nNeg++; m.set(s.id, x); return x; });
          r = soma(ss); r.neg = ss.every((x) => x.neg); r.unit = null;
        } else { r = folha(l); if (r.neg) nNeg++; }
        m.set(l.id, r);
        return r;
      });
      const r = soma(its);
      r.neg = its.length > 0 && its.some((x) => x.neg) && Math.abs(r.tot) < 0.005;
      m.set(e.id, r);
      return r;
    });
    const t = soma(etapas);
    const taxa = nn(o.bdi) / 100;
    return { m, etapas, mat: t.mat, mdo: t.mdo, direto: t.tot, bdiValor: t.tot * taxa, final: t.tot * (1 + taxa), nItens, nSub, nNeg };
  }
  const totalFinal = (o) => calcular(o).final;

  /* ---------------- estado da tela ---------------- */
  const est = {
    id: null, orc: null, ver: null, sujo: false, timer: null, salvo: 'ok',
    desfazer: [], refazer: [], antes: null, recolhidas: new Set(),
    filtro: 'todos', busca: '', abcTodos: false, cel: false, pintando: false,
  };
  /** Troca o HTML sem que o campo removido (o Chrome dispara focusout na remoção) grave o valor antigo. */
  function trocarHTML(el, html) {
    est.pintando = true;
    try { el.innerHTML = html; } finally { est.pintando = false; }
  }
  const MQ_CEL = '(max-width: 1023px)';
  const celular = () => matchMedia(MQ_CEL).matches;

  function abrirOrc(id) {
    const r = registro(id);
    if (!r) return null;
    if (est.id === id && est.orc) {
      if (r.atualizado_em !== est.ver && !est.sujo) { est.orc = normalizar(Object.assign({ id }, copia(r.dados))); est.ver = r.atualizado_em; }
      return est.orc;
    }
    salvarAgora();
    est.id = id; est.orc = normalizar(Object.assign({ id }, copia(r.dados))); est.ver = r.atualizado_em;
    est.desfazer = []; est.refazer = []; est.recolhidas = new Set(); est.abcTodos = false;
    return est.orc;
  }
  function marcarSalvo(s) {
    est.salvo = s;
    const el = $('#orc-salvo');
    if (el) { el.className = 'o-salvo ' + s; el.textContent = s === 'ok' ? 'Salvo' : 'Salvando…'; }
  }
  function salvarDepois() {
    est.sujo = true; marcarSalvo('salvando');
    clearTimeout(est.timer); est.timer = setTimeout(salvarAgora, 450);
  }
  function salvarAgora() {
    clearTimeout(est.timer); est.timer = null;
    if (!est.sujo || !est.orc) return;
    const o = est.orc;
    if (!registro(o.id)) { est.sujo = false; return; }
    const d = copia(o); delete d.id;
    d.atualizadoEm = new Date().toISOString();
    store.salvar(T, o.id, 'orcamento', d, o.clienteId || null);
    est.ver = store.mapa(T).get(o.id).atualizado_em;
    est.sujo = false; marcarSalvo('ok');
  }
  window.addEventListener('pagehide', salvarAgora);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });

  /** Altera o orçamento aberto guardando o estado anterior para desfazer. */
  function mudar(fn, { pintar: repintar = true, foco = null } = {}) {
    empilhar(JSON.stringify(est.orc));
    fn(est.orc);
    salvarDepois();
    if (repintar) pintar(foco);
  }
  function empilhar(antes) {
    est.desfazer.push(antes);
    if (est.desfazer.length > 100) est.desfazer.shift();
    est.refazer = [];
    atualizarBotoesHist();
  }
  function desfazer() {
    if (!est.desfazer.length) { ui.toast('Nada para desfazer.'); return; }
    est.refazer.push(JSON.stringify(est.orc));
    est.orc = normalizar(JSON.parse(est.desfazer.pop()));
    salvarDepois(); pintarTudo();
  }
  function refazer() {
    if (!est.refazer.length) return;
    est.desfazer.push(JSON.stringify(est.orc));
    est.orc = normalizar(JSON.parse(est.refazer.pop()));
    salvarDepois(); pintarTudo();
  }
  function atualizarBotoesHist() {
    const d = $('[data-a="orc-desfazer"]'), r = $('[data-a="orc-refazer"]');
    if (d) d.disabled = !est.desfazer.length;
    if (r) r.disabled = !est.refazer.length;
  }

  /** Onde está uma linha: etapa, lista que a contém, posição e item pai (se for subitem). */
  function acharLinha(o, id) {
    for (const e of o.etapas) {
      for (let i = 0; i < e.itens.length; i++) {
        const l = e.itens[i];
        if (l.id === id) return { etapa: e, lista: e.itens, idx: i, pai: null, linha: l };
        if (l.sub) for (let k = 0; k < l.sub.length; k++) if (l.sub[k].id === id) return { etapa: e, lista: l.sub, idx: k, pai: l, linha: l.sub[k] };
      }
    }
    return null;
  }
  const acharEtapa = (o, id) => o.etapas.find((e) => e.id === id) || null;
  /** Número da linha na planilha (1.2 ou 1.2.3). */
  function numeroDe(o, id) {
    for (let i = 0; i < o.etapas.length; i++) {
      const e = o.etapas[i];
      if (e.id === id) return String(i + 1);
      for (let j = 0; j < e.itens.length; j++) {
        const l = e.itens[j];
        if (l.id === id) return `${i + 1}.${j + 1}`;
        if (l.sub) for (let k = 0; k < l.sub.length; k++) if (l.sub[k].id === id) return `${i + 1}.${j + 1}.${k + 1}`;
      }
    }
    return '';
  }

  /* ---------------- banco ainda sem a tabela ---------------- */
  function avisoTabela() {
    const aus = Sis.sync.ausentes ? Sis.sync.ausentes() : null;
    if (!aus || !aus.has(T)) return '';
    return `<div class="banner warn"><div><b>Falta criar a tabela de orçamentos no Supabase.</b> Os orçamentos estão salvos neste aparelho e sobem para a nuvem assim que o script <b>4_orcamentos.sql</b> for executado no SQL Editor.</div></div>`;
  }

  /* =========================================================
     Lista de orçamentos
     ========================================================= */
  function cardOrc(o) {
    const c = calcular(o);
    const cli = clientes.nome(o.clienteId);
    const st = ST[o.status];
    return `<a class="o-card" href="#/orcamentos/${esc(o.id)}">
      <div class="o-card-top"><span class="o-cod">Nº ${esc(o.codigo || 's/n')}</span><span class="chip ${st.c}">${st.n}</span></div>
      <b class="o-card-tit">${esc(o.titulo || 'Orçamento sem título')}</b>
      <span class="o-card-cli">${esc(cli || 'Sem cliente')}</span>
      <div class="o-card-pe"><div><small>Valor final</small><b class="n">${brl(c.final)}</b></div>
        <div class="dir"><small>${dataBR(o.data)}</small><small>${o.etapas.length} ${o.etapas.length === 1 ? 'etapa' : 'etapas'} · ${c.nItens + c.nSub} linhas</small></div></div>
    </a>`;
  }
  function renderLista(el) {
    salvarAgora();
    const todos = listaOrc().sort((a, b) => String(b.atualizadoEm || b.data || '').localeCompare(String(a.atualizadoEm || a.data || '')));
    const t = norm(est.busca);
    const contar = (k) => todos.filter((o) => o.status === k);
    const soma = (l) => l.reduce((s, o) => s + totalFinal(o), 0);
    const ano = String(new Date().getFullYear());
    const aprovAno = contar('aprovado').filter((o) => String(o.data || '').startsWith(ano));
    const decididos = todos.filter((o) => (o.status === 'aprovado' || o.status === 'recusado') && String(o.data || '').startsWith(ano));
    const vis = todos.filter((o) => (est.filtro === 'todos' || o.status === est.filtro)
      && (!t || norm([o.titulo, o.codigo, clientes.nome(o.clienteId)].join(' ')).includes(t)));
    const filtros = [['todos', 'Todos', todos.length]].concat(STATUS.map(([k, n]) => [k, n, contar(k).length]));
    el.innerHTML = `<div class="pagehead"><div><h1>Orçamentos</h1><p>Planilhas orçamentárias por etapas, itens e subitens</p></div>
        <div class="actions"><button class="btn" data-a="orc-importar">${icone('enviar')}Importar planilha</button><button class="btn primary" data-a="orc-novo">${icone('mais')}Novo orçamento</button></div></div>
      ${avisoTabela()}
      <div class="o-painel">
        <div><span>Em elaboração</span><b>${contar('elaboracao').length}</b><small class="n">${brl(soma(contar('elaboracao')))}</small></div>
        <div><span>Enviados, aguardando</span><b>${contar('enviado').length}</b><small class="n">${brl(soma(contar('enviado')))}</small></div>
        <div><span>Aprovados em ${ano}</span><b>${aprovAno.length}</b><small class="n">${brl(soma(aprovAno))}</small></div>
        <div><span>Taxa de aprovação em ${ano}</span><b>${decididos.length ? pct(aprovAno.length / decididos.length, 0) : '-'}</b><small>${decididos.length} ${decididos.length === 1 ? 'decidido' : 'decididos'}</small></div>
      </div>
      <div class="o-filtros"><div class="seg">${filtros.map(([k, n, q]) => `<button data-a="orc-filtro" data-f="${k}" class="${est.filtro === k ? 'on' : ''}">${n}${q ? ` <span class="o-q">${q}</span>` : ''}</button>`).join('')}</div>
        <div class="o-busca">${icone('busca')}<input class="inp" id="orc-busca" placeholder="Buscar por obra, cliente ou número" value="${esc(est.busca)}" autocomplete="off"></div></div>
      ${vis.length ? `<div class="o-grid">${vis.map(cardOrc).join('')}</div>`
        : `<div class="card"><div class="empty"><b>${todos.length ? 'Nenhum orçamento neste filtro' : 'Nenhum orçamento ainda'}</b>${todos.length ? 'Troque o filtro ou a busca.' : 'Crie o primeiro orçamento ou importe uma planilha do Excel.'}
          ${todos.length ? '' : `<div class="actions" style="justify-content:center;margin-top:14px"><button class="btn primary" data-a="orc-novo">${icone('mais')}Novo orçamento</button></div>`}</div></div>`}`;
    const inp = $('#orc-busca', el);
    inp.addEventListener('input', () => {
      est.busca = inp.value;
      const pos = inp.selectionStart;
      renderLista(el);
      const n = $('#orc-busca', el); n.focus(); n.setSelectionRange(pos, pos);
    });
  }
  A['orc-filtro'] = (b) => { est.filtro = b.dataset.f; Sis.desenhar(true); };

  /* ---------------- novo orçamento ---------------- */
  function criarOrc(dados) {
    const cfg = config();
    const o = normalizar(Object.assign({
      codigo: proximoCodigo(), titulo: '', clienteId: '', local: '', modalidade: 'global', data: hojeISO(),
      validade: cfg.validade, status: 'elaboracao', bdi: cfg.bdi, bdiRotulo: cfg.bdiRotulo,
      etapas: [], observacoes: cfg.observacoes || '', criadoEm: new Date().toISOString(),
    }, dados));
    const id = Sis.util.uid();
    const d = copia(o); delete d.id;
    d.atualizadoEm = new Date().toISOString();
    store.salvar(T, id, 'orcamento', d, o.clienteId || null);
    return id;
  }
  A['orc-novo'] = () => {
    const cfg = config();
    const outros = listaOrc().sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    let sel;
    ui.abrirModal({
      titulo: 'Novo orçamento', sub: 'Você completa as etapas, os itens e os subitens na planilha.',
      corpo: `<div class="grid2">
        <label class="f req span2"><span>Obra ou serviço</span><input class="inp" name="titulo" placeholder="Ex.: Impermeabilização da cobertura" autofocus></label>
        <div class="span2" id="orc-n-cli"></div>
        <label class="f"><span>Modalidade</span><select class="inp" name="modalidade">${MODALIDADES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
        <label class="f"><span>BDI (%)</span><input class="inp money" name="bdi" inputmode="decimal" value="${esc(cru(cfg.bdi))}"></label>
      </div>
      <div class="f"><span class="secao-form">Começar com</span>
        <div class="o-inicio">
          <label class="o-op"><input type="radio" name="base" value="padrao" checked><span><b>Etapas padrão</b><small>${ETAPAS_PADRAO.length} etapas da Souza, sem itens</small></span></label>
          <label class="o-op"><input type="radio" name="base" value="branco"><span><b>Em branco</b><small>Você cria as etapas</small></span></label>
          <label class="o-op ${outros.length ? '' : 'off'}"><input type="radio" name="base" value="copia" ${outros.length ? '' : 'disabled'}><span><b>Cópia de outro orçamento</b><small>Etapas, itens e preços</small></span></label>
        </div>
        <select class="inp" name="origem" hidden>${outros.map((o) => `<option value="${esc(o.id)}">${esc((o.codigo ? o.codigo + ' · ' : '') + (o.titulo || 'Sem título'))}</option>`).join('')}</select>
      </div>`,
      aoAbrir: (m) => {
        sel = Sis.seletorCliente($('#orc-n-cli', m), { rotulo: 'Cliente' });
        $$('[name=base]', m).forEach((r) => r.addEventListener('change', () => { $('[name=origem]', m).hidden = $('[name=base]:checked', m).value !== 'copia'; }));
      },
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Criar orçamento', classe: 'primary', acao: (m) => {
          const titulo = $('[name=titulo]', m.el).value.trim();
          if (!titulo) { $('[name=titulo]', m.el).classList.add('erro'); $('[name=titulo]', m.el).focus(); return; }
          const erro = sel.validar(); if (erro) { ui.toast(erro); return; }
          const bdi = lerNumero($('[name=bdi]', m.el).value);
          if (!bdi || bdi.v === null) { $('[name=bdi]', m.el).classList.add('erro'); return; }
          const base = $('[name=base]:checked', m.el).value;
          let etapas = [];
          if (base === 'padrao') etapas = ETAPAS_PADRAO.map((t) => novaEtapa(t));
          if (base === 'copia') {
            const src = listaOrc().find((o) => o.id === $('[name=origem]', m.el).value);
            if (src) etapas = copia(src.etapas).map(novosIds);
          }
          const id = criarOrc({ titulo, clienteId: sel.valor().clienteId, modalidade: $('[name=modalidade]', m.el).value, bdi: bdi.v, etapas });
          m.fechar();
          location.hash = `#/orcamentos/${id}`;
        },
      }],
    });
  };

  /* =========================================================
     Orçamento aberto: topo, abas, planilha, resumo e dados
     ========================================================= */
  const ABAS = [['planilha', 'Planilha', 'planilha'], ['resumo', 'Resumo', 'grafico'], ['dados', 'Dados e condições', 'dados']];
  const NUMS = new Set(['qtd', 'mat', 'mdo']);
  const totHTML = (r) => (r.neg ? '<span class="o-negc">A negociar</span>' : fv(r.tot));
  const totEtapa = (r, c) => (r.neg ? '<span class="o-negc">A negociar</span>' : `<b class="n">${brl(r.tot)}</b><small>${c.direto ? pct(r.tot / c.direto) : ''}</small>`);
  const bdiTxt = (o) => pct(nn(o.bdi) / 100, Math.round(nn(o.bdi) * 100) % 100 ? 2 : 0);

  function htmlTopo(o) {
    const st = ST[o.status], cli = clientes.nome(o.clienteId);
    return `<div class="ob-topo o-topo"><a class="btn icon" href="#/orcamentos" aria-label="Voltar para orçamentos">${icone('esq')}</a>
      <div class="tit"><b>${esc(o.titulo || 'Orçamento sem título')}</b><span>Nº ${esc(o.codigo || 's/n')} · ${esc(cli || 'Sem cliente')} · ${MOD[o.modalidade]}</span></div>
      <div class="actions"><button class="chip ${st.c} o-st" data-a="orc-status" aria-label="Situação do orçamento">${st.n}${icone('baixo')}</button>
        <button class="btn" data-a="orc-imprimir">${icone('imprimir')}<span>Imprimir / PDF</span></button>
        <button class="btn o-so-pc" data-a="orc-excel">${icone('planilha')}<span>Excel</span></button>
        <button class="btn icon" data-a="orc-mais" aria-label="Mais opções">${icone('pontos')}</button></div></div>`;
  }
  function htmlKpis(o, c) {
    const d = c.direto;
    return `<div class="o-kpis">
      <div class="o-k"><span>Custo direto</span><b class="n">${brl(c.direto)}</b><small>${o.etapas.length} ${o.etapas.length === 1 ? 'etapa' : 'etapas'} · ${c.nItens} itens · ${c.nSub} subitens</small></div>
      <div class="o-k"><span>Material</span><b class="n">${brl(c.mat)}</b><small>${d ? pct(c.mat / d) : '0%'} do custo direto</small></div>
      <div class="o-k"><span>Mão de obra</span><b class="n">${brl(c.mdo)}</b><small>${d ? pct(c.mdo / d) : '0%'} do custo direto</small></div>
      <div class="o-k"><span>${esc(o.bdiRotulo)}</span><b class="n">${brl(c.bdiValor)}</b><small>${bdiTxt(o)} sobre o custo direto</small></div>
      <div class="o-k hero"><span>Valor final</span><b class="n">${brl(c.final)}</b><small>${c.nNeg ? `Fora do total: ${c.nNeg} ${c.nNeg === 1 ? 'linha' : 'linhas'} a negociar` : 'Custo direto + BDI'}</small></div>
    </div>`;
  }
  function htmlBarra(o, c) {
    return `<div class="o-b-it o-so-pc"><span>Custo direto</span><b class="n">${brl(c.direto)}</b></div>
      <div class="o-b-it"><span>${esc(o.bdiRotulo)} (${bdiTxt(o)})</span><b class="n">${brl(c.bdiValor)}</b></div>
      <div class="o-b-it fim"><span>Valor final</span><b class="n">${brl(c.final)}</b></div>`;
  }

  function renderOrc(el, id, aba) {
    const o = abrirOrc(id);
    if (!o) { el.innerHTML = '<div class="card"><div class="empty"><b>Orçamento não encontrado</b><a href="#/orcamentos">Ver todos os orçamentos</a></div></div>'; return; }
    est.cel = celular();
    const c = calcular(o);
    trocarHTML(el, `<div class="o-ed" data-aba="${aba}">
      ${htmlTopo(o)}
      ${avisoTabela()}
      <nav class="ob-abas">${ABAS.map(([k, n, ic]) => `<a href="#/orcamentos/${esc(o.id)}${k === 'planilha' ? '' : '/' + k}" class="${k === aba ? 'ativo' : ''}">${icone(ic)}${n}</a>`).join('')}</nav>
      ${aba !== 'dados' ? `<div id="orc-kpis">${htmlKpis(o, c)}</div>` : ''}
      <div id="orc-corpo">${corpoAba(aba, o, c)}</div>
      ${aba === 'planilha' && o.etapas.length ? `<div class="o-barra" id="orc-barra">${htmlBarra(o, c)}</div>` : ''}
    </div>`);
    posRender(el, aba);
  }
  const abaAtual = () => { const ed = $('.o-ed'); return ed ? ed.dataset.aba : null; };
  function corpoAba(aba, o, c) {
    if (aba === 'resumo') return htmlResumo(o, c);
    if (aba === 'dados') return htmlDados(o);
    return htmlPlanilha(o, c);
  }
  /** Redesenha a aba aberta sem refazer a tela toda (mantém a rolagem). */
  function pintar(foco) {
    const corpo = $('#orc-corpo');
    if (!corpo || !est.orc) return;
    fecharPop();
    const aba = abaAtual(), o = est.orc, c = calcular(o);
    est.cel = celular();
    trocarHTML(corpo, corpoAba(aba, o, c));
    const k = $('#orc-kpis'); if (k) k.innerHTML = htmlKpis(o, c);
    const b = $('#orc-barra');
    if (b) b.innerHTML = htmlBarra(o, c);
    else if (aba === 'planilha' && o.etapas.length) corpo.insertAdjacentHTML('afterend', `<div class="o-barra" id="orc-barra">${htmlBarra(o, c)}</div>`);
    posRender(corpo, aba);
    if (foco) {
      const f = $(foco);
      if (f) { f.focus({ preventScroll: false }); if (f.tagName === 'INPUT' && f.select) f.select(); f.scrollIntoView({ block: 'nearest' }); }
    }
  }
  function pintarTopo() {
    const t = $('.o-topo');
    if (t && est.orc) t.outerHTML = htmlTopo(est.orc);
  }
  const pintarTudo = () => Sis.desenhar(true);

  function crescerTodos(raiz) {
    const tas = $$('textarea.o-auto', raiz);
    tas.forEach((t) => { t.style.height = 'auto'; });
    const hs = tas.map((t) => t.scrollHeight);
    tas.forEach((t, i) => { t.style.height = hs[i] + 'px'; });
  }
  function crescer(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  function posRender(raiz, aba) {
    crescerTodos(raiz);
    atualizarBotoesHist();
    if (aba === 'dados') {
      const r = $('#orc-d-cli');
      if (r) Sis.seletorCliente(r, { clienteId: est.orc.clienteId, rotulo: 'Cliente', aoMudar: (id) => { mudar((o) => { o.clienteId = id; }, { pintar: false }); pintarTopo(); atualizarLocal(); } });
    }
  }

  /* ---------------- planilha ---------------- */
  function unidadesUsadas(o) {
    const s = new Set(UNIDADES);
    listaOrc().concat([o]).forEach((x) => x.etapas.forEach((e) => e.itens.forEach((l) => { if (l.un) s.add(l.un); (l.sub || []).forEach((y) => { if (y.un) s.add(y.un); }); })));
    return [...s];
  }
  function htmlPlanilha(o, c) {
    const todas = o.etapas.length && o.etapas.every((e) => est.recolhidas.has(e.id));
    const tool = `<div class="o-tool">
      <button class="btn sm primary" data-a="orc-add-etapa">${icone('mais')}Etapa</button>
      ${o.etapas.length ? `<button class="btn sm ghost" data-a="orc-rec-todas">${icone(todas ? 'expandir' : 'recolher')}${todas ? 'Expandir etapas' : 'Recolher etapas'}</button>` : ''}
      <span class="o-esp"></span>
      <button class="btn icon" data-a="orc-desfazer" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" ${est.desfazer.length ? '' : 'disabled'}>${icone('desfazer')}</button>
      <button class="btn icon" data-a="orc-refazer" title="Refazer (Ctrl+Y)" aria-label="Refazer" ${est.refazer.length ? '' : 'disabled'}>${icone('refazer')}</button>
      <span class="o-salvo ${est.salvo}" id="orc-salvo">${est.salvo === 'ok' ? 'Salvo' : 'Salvando…'}</span></div>
      <datalist id="orc-uns">${unidadesUsadas(o).map((u) => `<option value="${esc(u)}">`).join('')}</datalist>`;
    if (!o.etapas.length) {
      return tool + `<div class="card"><div class="empty"><b>Planilha vazia</b>Comece pelas etapas da obra. Cada etapa recebe itens, e cada item pode ter subitens.
        <div class="actions" style="justify-content:center;margin-top:14px"><button class="btn" data-a="orc-etapas-padrao">Usar as etapas padrão</button><button class="btn primary" data-a="orc-add-etapa">${icone('mais')}Nova etapa</button></div></div></div>`;
    }
    return tool + `<div id="orc-plan">${est.cel ? planilhaCel(o, c) : planilhaPC(o, c)}</div>`
      + (est.cel ? '' : `<p class="o-dica">Enter vai para a linha de baixo · Ctrl+Enter insere um item abaixo · Alt+↑/↓ move a linha · nas quantidades e preços dá para digitar contas, como 12,5*3+2</p>`);
  }

  function planilhaPC(o, c) {
    let h = `<table class="o-tab"><colgroup><col class="c-n"><col class="c-d"><col class="c-u"><col class="c-q"><col class="c-v"><col class="c-v"><col class="c-pu"><col class="c-t"><col class="c-m"></colgroup>
      <thead><tr><th>Item</th><th>Descrição dos serviços</th><th>Unid.</th><th class="num">Quant.</th><th class="num">Material</th><th class="num">Mão de obra</th><th class="num">Preço unit.</th><th class="num">Total (R$)</th><th><span class="sr">Opções</span></th></tr></thead>`;
    o.etapas.forEach((e, i) => { h += tbodyEtapa(e, i, c); });
    return h + `</table><button class="o-add-et" data-a="orc-add-etapa">${icone('mais')}Nova etapa</button>`;
  }
  function tbodyEtapa(e, i, c) {
    const n = i + 1, r = c.m.get(e.id), rec = est.recolhidas.has(e.id);
    let h = `<tbody class="o-etapa ${rec ? 'rec' : ''}" data-e="${e.id}">
      <tr class="o-et"><td class="o-n"><button class="o-chev" data-a="orc-rec" data-e="${e.id}" aria-label="${rec ? 'Expandir' : 'Recolher'} etapa" aria-expanded="${!rec}">${icone(rec ? 'dir' : 'baixo')}</button><span class="o-badge">${n}</span></td>
        <td colspan="6"><input class="o-in o-et-tit" data-f="titulo" data-e="${e.id}" value="${esc(e.titulo)}" placeholder="Nome da etapa" autocomplete="off"${rec ? ` title="${e.itens.length} ${e.itens.length === 1 ? 'item' : 'itens'} recolhidos"` : ''}></td>
        <td class="num o-tot" data-t="${e.id}" data-k="e">${totEtapa(r, c)}</td>
        <td class="o-ac"><button class="btn icon o-mn" data-a="orc-menu" data-k="etapa" data-e="${e.id}" aria-label="Opções da etapa ${n}">${icone('pontos')}</button></td></tr>`;
    if (!rec) {
      e.itens.forEach((l, j) => {
        h += linhaPC(l, `${n}.${j + 1}`, 'item', c);
        if (temSub(l)) l.sub.forEach((s, k) => { h += linhaPC(s, `${n}.${j + 1}.${k + 1}`, 'sub', c); });
      });
      h += `<tr class="o-add"><td></td><td colspan="8"><button class="o-addb" data-a="orc-add-item" data-e="${e.id}">${icone('mais')}Item na etapa ${n}</button>${e.itens.length ? '' : '<span class="o-vaz">Etapa sem itens</span>'}</td></tr>`;
    }
    return h + '</tbody>';
  }
  function linhaPC(l, num, nivel, c) {
    const r = c.m.get(l.id), g = nivel === 'item' && temSub(l);
    const cls = ['o-it', nivel === 'sub' ? 'o-sub' : '', g ? 'o-grp' : '', l.neg ? 'o-neg' : ''].filter(Boolean).join(' ');
    const inpN = (f, fmt) => `<td class="o-c"><input class="o-in num" data-f="${f}" inputmode="decimal" autocomplete="off" value="${esc(fmt(l[f]))}"${f === 'qtd' && l.qf ? ` title="Memória de cálculo: ${esc(l.qf)}"` : ''}></td>`;
    let h = `<tr class="${cls}" data-l="${l.id}"><td class="o-n">${num}</td>
      <td class="o-dc"><div class="sugere"><textarea class="o-in o-desc o-auto" data-f="desc" rows="1" placeholder="${g ? 'Descrição do item' : 'Descrição do serviço'}">${esc(l.desc)}</textarea><div class="lista-sug o-sugs" hidden></div></div></td>`;
    if (g) h += `<td colspan="4" class="o-gcel"><span class="o-gdet" data-g="${l.id}">${l.sub.length} ${l.sub.length === 1 ? 'subitem' : 'subitens'}</span><button class="o-addb" data-a="orc-add-sub" data-l="${l.id}">${icone('mais')}Subitem</button></td><td class="o-pu"></td>`;
    else h += `<td class="o-c"><input class="o-in o-un" data-f="un" list="orc-uns" autocomplete="off" value="${esc(l.un)}" aria-label="Unidade"></td>${inpN('qtd', fq)}${inpN('mat', fv)}${inpN('mdo', fv)}<td class="num o-pu" data-u="${l.id}">${r.unit == null ? '' : fv(r.unit)}</td>`;
    h += `<td class="num o-tot" data-t="${l.id}">${totHTML(r)}</td>
      <td class="o-ac"><button class="btn icon o-mn" data-a="orc-menu" data-k="${nivel}" data-l="${l.id}" aria-label="Opções do item ${num}">${icone('pontos')}</button></td></tr>`;
    if (l.obs != null) {
      h += `<tr class="o-obs ${nivel === 'sub' ? 'o-sub' : ''}" data-l="${l.id}"><td></td><td colspan="7"><div class="o-obs-b">${icone('balao')}<span class="rot">Observação</span>
        <textarea class="o-in o-auto" data-f="obs" rows="1" placeholder="Escreva a observação deste item">${esc(l.obs)}</textarea></div></td>
        <td class="o-ac"><button class="btn icon" data-a="orc-obs-x" data-l="${l.id}" aria-label="Remover observação" title="Remover observação">${icone('fechar')}</button></td></tr>`;
    }
    return h;
  }

  function planilhaCel(o, c) {
    return o.etapas.map((e, i) => {
      const n = i + 1, r = c.m.get(e.id), rec = est.recolhidas.has(e.id);
      let h = `<section class="o-ce ${rec ? 'rec' : ''}" data-e="${e.id}">
        <div class="o-ce-h"><button class="o-ce-tit" data-a="orc-rec" data-e="${e.id}" aria-expanded="${!rec}"><span class="o-badge">${n}</span><span class="nm">${esc(e.titulo || 'Etapa sem nome')}</span></button>
          <span class="o-ce-tot" data-t="${e.id}" data-k="e">${totEtapa(r, c)}</span>
          <button class="btn icon" data-a="orc-menu" data-k="etapa" data-e="${e.id}" aria-label="Opções da etapa ${n}">${icone('pontos')}</button></div>`;
      if (!rec) {
        h += '<div class="o-ce-l">';
        e.itens.forEach((l, j) => {
          h += linhaCel(l, `${n}.${j + 1}`, false, c);
          if (temSub(l)) l.sub.forEach((s, k) => { h += linhaCel(s, `${n}.${j + 1}.${k + 1}`, true, c); });
        });
        h += `<button class="o-ce-add" data-a="orc-add-item" data-e="${e.id}">${icone('mais')}Item na etapa ${n}</button></div>`;
      }
      return h + '</section>';
    }).join('') + `<button class="o-add-et" data-a="orc-add-etapa">${icone('mais')}Nova etapa</button>`;
  }
  function linhaCel(l, num, sub, c) {
    const r = c.m.get(l.id), g = !sub && temSub(l);
    const det = g ? `${l.sub.length} ${l.sub.length === 1 ? 'subitem' : 'subitens'}`
      : l.neg ? 'Valores a negociar'
        : [vazio(l.qtd) ? '' : `${fq(l.qtd)} ${l.un || ''}`.trim(), r.unit != null ? `x ${fv(r.unit)}` : ''].filter(Boolean).join(' ');
    return `<button class="o-cl ${sub ? 'sub' : ''} ${g ? 'grp' : ''}" data-a="orc-editar" data-l="${l.id}">
      <span class="n">${num}</span><span class="d"><span class="tx">${esc(l.desc || 'Sem descrição')}</span>${det ? `<small>${esc(det)}</small>` : ''}${l.obs ? `<small class="ob">${icone('balao')}${esc(l.obs)}</small>` : ''}</span>
      <span class="t" data-t="${l.id}">${totHTML(r)}</span></button>`;
  }

  /** Atualiza só os valores calculados enquanto se digita. */
  function atualizarCalculos() {
    const o = est.orc; if (!o) return;
    const c = calcular(o);
    $$('#orc-corpo [data-t]').forEach((td) => { const r = c.m.get(td.dataset.t); if (r) td.innerHTML = td.dataset.k === 'e' ? totEtapa(r, c) : totHTML(r); });
    $$('#orc-corpo [data-u]').forEach((td) => { const r = c.m.get(td.dataset.u); td.textContent = r && r.unit != null ? fv(r.unit) : ''; });
    const k = $('#orc-kpis'); if (k) k.innerHTML = htmlKpis(o, c);
    const b = $('#orc-barra'); if (b) b.innerHTML = htmlBarra(o, c);
  }

  /* ---------------- edição direto na planilha ---------------- */
  const ehCampo = (t) => !!(t && t.closest && t.dataset && t.dataset.f && t.closest('.o-ed'));
  function alvoCampo(t) {
    if (!est.orc) return null;
    if (t.dataset.e) { const e = acharEtapa(est.orc, t.dataset.e); return e ? { obj: e } : null; }
    const tr = t.closest('[data-l]');
    const p = tr && acharLinha(est.orc, tr.dataset.l);
    return p ? { obj: p.linha, pos: p } : null;
  }
  document.addEventListener('focusin', (ev) => {
    const t = ev.target;
    if (!ehCampo(t)) return;
    est.antes = JSON.stringify(est.orc);
    if (t.classList.contains('num')) {
      const a = alvoCampo(t);
      if (a) {
        t.value = t.dataset.f === 'qtd' && a.obj.qf ? a.obj.qf : cru(a.obj[t.dataset.f]);
        t.select(); t._selFoco = true;
      }
    }
    if (t.classList.contains('o-desc') && !t._sug) {
      t._sug = true;
      const lid = t.closest('[data-l]').dataset.l;
      ui.sugestoes(t, t.nextElementSibling, fonteCatalogo(lid), (it) => usarCatalogo(lid, it));
    }
  });
  /* O clique que deu foco não desfaz a seleção do número inteiro. */
  document.addEventListener('mouseup', (ev) => { const t = ev.target; if (t && t._selFoco) { ev.preventDefault(); t._selFoco = false; } });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t) t._selFoco = false;
    if (!ehCampo(t)) return;
    const a = alvoCampo(t); if (!a) return;
    const f = t.dataset.f;
    if (t.tagName === 'TEXTAREA') crescer(t);
    if (NUMS.has(f)) {
      const r = lerNumero(t.value);
      t.classList.toggle('erro', r === null);
      if (r === null) return;
      a.obj[f] = r.v;
      if (f === 'qtd') { if (r.f) a.obj.qf = r.f; else delete a.obj.qf; }
      if (a.obj.neg && r.v !== null) { delete a.obj.neg; const tr = t.closest('tr'); if (tr) tr.classList.remove('o-neg'); }
      atualizarCalculos();
    } else a.obj[f] = t.value;
    salvarDepois();
  });
  document.addEventListener('focusout', (ev) => {
    const t = ev.target;
    if (est.pintando || !ehCampo(t) || !t.isConnected) return;
    const a = alvoCampo(t); if (!a) return;
    const f = t.dataset.f;
    let repintar = false;
    if (NUMS.has(f)) {
      t.classList.remove('erro');
      t.value = f === 'qtd' ? fq(a.obj[f]) : fv(a.obj[f]);
      if (f === 'qtd') t.title = a.obj.qf ? 'Memória de cálculo: ' + a.obj.qf : '';
    } else if (f === 'obs') {
      if (!t.value.trim()) { delete a.obj.obs; repintar = true; } else a.obj.obs = t.value.trim();
    } else {
      const v = t.value.trim();
      if (v !== t.value) t.value = v;
      a.obj[f] = v;
    }
    const agora = JSON.stringify(est.orc);
    if (est.antes && est.antes !== agora) { empilhar(est.antes); salvarDepois(); }
    est.antes = null;
    if (repintar) setTimeout(() => pintar(), 0);
  });
  document.addEventListener('keydown', (ev) => {
    if (!est.orc || Sis.rota().mod !== 'orcamentos' || !$('.o-ed')) return;
    if (ev.key === 'Escape' && popAtual) { ev.preventDefault(); ev.stopPropagation(); fecharPop(); return; }
    if (ui.modalAberto()) return;
    const t = ev.target, mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    const emCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (mod && !ev.shiftKey && k === 'z' && !emCampo) { ev.preventDefault(); desfazer(); return; }
    if (mod && (k === 'y' || (ev.shiftKey && k === 'z')) && !emCampo) { ev.preventDefault(); refazer(); return; }
    if (!ehCampo(t) || ev.defaultPrevented) return;
    const tr = t.closest('[data-l]');
    if (ev.key === 'Enter' && mod) {
      ev.preventDefault();
      if (tr) inserirAbaixo(tr.dataset.l);
      else if (t.dataset.e) addItem(t.dataset.e, { inicio: true });
      return;
    }
    if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && tr && !t.closest('.o-obs')) {
      ev.preventDefault();
      const f = t.dataset.f, id = tr.dataset.l;
      mover(id, ev.key === 'ArrowUp' ? -1 : 1, `tr.o-it[data-l="${id}"] [data-f="${f}"]`);
      return;
    }
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.altKey) {
      ev.preventDefault();
      focarVizinho(t, 1);
    }
  });
  /** Enter: mesmo campo na linha de baixo (como no Excel). */
  function focarVizinho(t, dir) {
    const f = t.dataset.f;
    if (t.dataset.e) {
      const prox = $(`tbody[data-e="${t.dataset.e}"] tr.o-it [data-f="desc"]`);
      if (prox) prox.focus(); else t.blur();
      return;
    }
    const linhas = $$('#orc-plan tr.o-it').filter((x) => x.querySelector(`[data-f="${f}"]`));
    const atual = t.closest('tr.o-it, tr.o-obs');
    let i = linhas.indexOf(atual);
    if (i < 0 && atual) i = linhas.findIndex((x) => x.dataset.l === atual.dataset.l);
    const alvo = linhas[i + dir];
    if (alvo) { const c = alvo.querySelector(`[data-f="${f}"]`); c.focus(); if (c.select && c.tagName === 'INPUT') c.select(); }
    else t.blur();
  }

  /* ---------------- catálogo: serviços já usados em outros orçamentos ---------------- */
  function catalogo() {
    const mapa = new Map();
    const fontes = listaOrc().filter((o) => o.id !== (est.orc && est.orc.id));
    if (est.orc) fontes.push(est.orc);
    fontes.forEach((o) => {
      const quando = o.atualizadoEm || o.data || '';
      const add = (l) => {
        if (temSub(l) || !l.desc || l.neg || (vazio(l.mat) && vazio(l.mdo))) return;
        const k = norm(l.desc) + '|' + norm(l.un);
        const ex = mapa.get(k);
        if (!ex || quando >= ex.quando) mapa.set(k, { id: l.id, desc: l.desc, un: l.un || '', mat: l.mat, mdo: l.mdo, quando, orc: o.codigo || '' });
      };
      o.etapas.forEach((e) => e.itens.forEach((l) => { add(l); (l.sub || []).forEach(add); }));
    });
    return [...mapa.values()];
  }
  function fonteCatalogo(lid) {
    let cache = null;
    return (t) => {
      if (t.length < 3) return [];
      if (!cache) cache = catalogo();
      return cache.filter((x) => x.id !== lid && norm(x.desc).includes(t))
        .sort((a, b) => (norm(a.desc).startsWith(t) ? 0 : 1) - (norm(b.desc).startsWith(t) ? 0 : 1) || String(b.quando).localeCompare(String(a.quando)))
        .map((x) => Object.assign({ titulo: x.desc, sub: `${x.un || 'sem unidade'} · material ${fv(nn(x.mat))} · mão de obra ${fv(nn(x.mdo))}${x.orc ? ' · orç. ' + x.orc : ''}` }, x));
    };
  }
  function usarCatalogo(lid, it) {
    mudar((o) => {
      const p = acharLinha(o, lid); if (!p) return;
      Object.assign(p.linha, { desc: it.desc, un: it.un, mat: it.mat, mdo: it.mdo });
      delete p.linha.neg;
    }, { foco: `tr.o-it[data-l="${lid}"] [data-f="qtd"]` });
  }

  /* ---------------- menus ---------------- */
  let popAtual = null, popAncora = null, popY = 0;
  function fecharPop() { if (popAtual) { popAtual.remove(); popAtual = null; popAncora = null; } }
  function popover(ancora, itens) {
    if (popAtual && popAncora === ancora) { fecharPop(); return; }
    fecharPop();
    const p = document.createElement('div');
    p.className = 'o-pop'; p.setAttribute('role', 'menu');
    p.innerHTML = itens.map((it, i) => (it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" class="${it.perigo ? 'perigo' : ''} ${it.on ? 'on' : ''}" ${it.off ? 'disabled' : ''}>${it.ic ? icone(it.ic) : '<span class="ic"></span>'}<span>${esc(it.rot)}</span>${it.atalho ? `<kbd>${esc(it.atalho)}</kbd>` : ''}</button>`)).join('');
    document.body.appendChild(p);
    popAtual = p; popAncora = ancora; popY = window.scrollY;
    const r = ancora.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    let x = Math.min(r.right - w, innerWidth - w - 8); if (x < 8) x = 8;
    let y = r.bottom + 4; if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 4);
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const it = itens[+b.dataset.i]; fecharPop(); it.acao();
    });
    p.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const bs = $$('button:not([disabled])', p), i = bs.indexOf(document.activeElement);
      const n = bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]; if (n) n.focus();
    });
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { const b = p.querySelector('button:not([disabled])'); if (b) b.focus(); }, 0);
  }
  document.addEventListener('mousedown', (e) => { if (popAtual && !popAtual.contains(e.target) && !(popAncora && popAncora.contains(e.target))) fecharPop(); }, true);
  document.addEventListener('touchstart', (e) => { if (popAtual && !popAtual.contains(e.target) && !(popAncora && popAncora.contains(e.target))) fecharPop(); }, { capture: true, passive: true });
  window.addEventListener('resize', fecharPop);
  window.addEventListener('hashchange', () => { fecharPop(); salvarAgora(); });
  document.addEventListener('scroll', (e) => {
    if (!popAtual) return;
    if (e.target === document ? Math.abs(window.scrollY - popY) > 6 : (e.target.contains && e.target.contains(popAncora))) fecharPop();
  }, true);

  function menuLinha(el) {
    const id = el.dataset.l, o = est.orc, pos = acharLinha(o, id);
    if (!pos) return;
    const sub = !!pos.pai, l = pos.linha, grp = !sub && temSub(l);
    const it = [{ rot: 'Editar em janela', ic: 'editar', acao: () => editarLinha(id) }];
    if (!sub) it.push({ rot: 'Adicionar subitem', ic: 'recuar', acao: () => addSub(id) });
    it.push({ rot: sub ? 'Inserir subitem abaixo' : 'Inserir item abaixo', ic: 'mais', atalho: 'Ctrl+Enter', acao: () => inserirAbaixo(id) });
    it.push({ rot: 'Duplicar', ic: 'copiar', acao: () => duplicar(id) });
    it.push('-');
    it.push({ rot: 'Mover para cima', ic: 'cima', atalho: 'Alt+↑', off: pos.idx === 0, acao: () => mover(id, -1) });
    it.push({ rot: 'Mover para baixo', ic: 'baixo', atalho: 'Alt+↓', off: pos.idx === pos.lista.length - 1, acao: () => mover(id, 1) });
    if (!sub) it.push({ rot: 'Mover para outra etapa', ic: 'mover', off: o.etapas.length < 2, acao: () => moverParaEtapa(id) });
    if (!sub) it.push({ rot: 'Virar subitem do item acima', ic: 'recuar', off: pos.idx === 0 || grp, acao: () => recuar(id) });
    if (sub) it.push({ rot: 'Virar item da etapa', ic: 'avancar', acao: () => avancar(id) });
    it.push('-');
    it.push({ rot: l.obs != null ? 'Remover observação' : 'Adicionar observação', ic: 'balao', acao: () => alternarObs(id) });
    if (!grp) it.push({ rot: l.neg ? 'Tirar "a negociar"' : 'Marcar "a negociar"', ic: 'etiqueta', acao: () => alternarNeg(id) });
    it.push('-');
    it.push({ rot: grp ? 'Excluir item e subitens' : 'Excluir', ic: 'lixo', perigo: true, acao: () => excluirLinha(id) });
    popover(el, it);
  }
  function menuEtapa(el) {
    const eid = el.dataset.e, o = est.orc, i = o.etapas.findIndex((e) => e.id === eid);
    if (i < 0) return;
    const rec = est.recolhidas.has(eid);
    popover(el, [
      { rot: 'Adicionar item', ic: 'mais', acao: () => addItem(eid) },
      { rot: 'Renomear etapa', ic: 'editar', acao: () => renomearEtapa(eid) },
      { rot: 'Inserir etapa abaixo', ic: 'mais', acao: () => addEtapa(eid) },
      { rot: 'Duplicar etapa', ic: 'copiar', acao: () => duplicarEtapa(eid) },
      '-',
      { rot: 'Mover para cima', ic: 'cima', off: i === 0, acao: () => moverEtapa(eid, -1) },
      { rot: 'Mover para baixo', ic: 'baixo', off: i === o.etapas.length - 1, acao: () => moverEtapa(eid, 1) },
      { rot: rec ? 'Expandir' : 'Recolher', ic: rec ? 'expandir' : 'recolher', acao: () => alternarRec(eid) },
      '-',
      { rot: 'Excluir etapa', ic: 'lixo', perigo: true, acao: () => excluirEtapa(eid) },
    ]);
  }

  /* ---------------- operações nas linhas ---------------- */
  const focoDesc = (id) => `tr.o-it[data-l="${id}"] [data-f="desc"]`;
  function virarGrupo(l) {
    if (temSub(l)) return false;
    const tinha = !vazio(l.qtd) || !vazio(l.mat) || !vazio(l.mdo) || !!l.neg;
    l.sub = [];
    if (tinha) {
      const s = novaLinha({ desc: l.desc, un: l.un, qtd: l.qtd, mat: l.mat, mdo: l.mdo });
      if (l.qf) s.qf = l.qf;
      if (l.neg) s.neg = true;
      l.sub.push(s);
    }
    ['un', 'qtd', 'mat', 'mdo', 'qf', 'neg'].forEach((k) => { delete l[k]; });
    return tinha;
  }
  function limparGrupo(l) { if (Array.isArray(l.sub) && !l.sub.length) { delete l.sub; Object.assign(l, { un: '', qtd: null, mat: null, mdo: null }); } }
  /** Insere uma linha nova: alvo = { etapa, abaixoDe } para item ou { pai, abaixoDe } para subitem. */
  function inserirLinha(o, alvo, n) {
    let moveu = false;
    if (alvo.pai) {
      const p = acharLinha(o, alvo.pai);
      if (!p || p.pai) return false;
      moveu = virarGrupo(p.linha);
      const k = alvo.abaixoDe ? p.linha.sub.findIndex((x) => x.id === alvo.abaixoDe) : -1;
      p.linha.sub.splice(k >= 0 ? k + 1 : p.linha.sub.length, 0, n);
      est.recolhidas.delete(p.etapa.id);
    } else {
      const e = acharEtapa(o, alvo.etapa);
      if (!e) return false;
      const k = alvo.abaixoDe ? e.itens.findIndex((x) => x.id === alvo.abaixoDe) : -1;
      e.itens.splice(alvo.inicio ? 0 : k >= 0 ? k + 1 : e.itens.length, 0, n);
      est.recolhidas.delete(e.id);
    }
    if (moveu) setTimeout(() => ui.toast('O item virou grupo: os valores dele passaram para o primeiro subitem.'), 0);
    return true;
  }
  function addItem(eid, { abaixoDe = null, inicio = false } = {}) {
    const alvo = { etapa: eid, abaixoDe, inicio };
    if (est.cel) { editarLinha(null, alvo); return; }
    const n = novaLinha();
    mudar((o) => inserirLinha(o, alvo, n), { foco: focoDesc(n.id) });
  }
  function addSub(lid, abaixoDe = null) {
    const alvo = { pai: lid, abaixoDe };
    if (est.cel) { editarLinha(null, alvo); return; }
    const n = novaLinha();
    mudar((o) => inserirLinha(o, alvo, n), { foco: focoDesc(n.id) });
  }
  function inserirAbaixo(id) {
    const pos = acharLinha(est.orc, id); if (!pos) return;
    if (pos.pai) addSub(pos.pai.id, id); else addItem(pos.etapa.id, { abaixoDe: id });
  }
  function duplicar(id) {
    let nid = null;
    mudar((o) => {
      const p = acharLinha(o, id); if (!p) return;
      const n = novosIds(copia(p.linha)); nid = n.id;
      p.lista.splice(p.idx + 1, 0, n);
    }, { foco: null });
    if (nid && !est.cel) { const f = $(focoDesc(nid)); if (f) f.focus(); }
    ui.toast('Linha duplicada.');
  }
  function mover(id, dir, foco = null) {
    const p = acharLinha(est.orc, id);
    if (!p || p.idx + dir < 0 || p.idx + dir >= p.lista.length) return;
    mudar((o) => { const q = acharLinha(o, id); const [x] = q.lista.splice(q.idx, 1); q.lista.splice(q.idx + dir, 0, x); }, { foco });
  }
  function moverParaEtapa(id) {
    const o = est.orc, p = acharLinha(o, id); if (!p || p.pai) return;
    const opcoes = o.etapas.map((e, i) => ({ e, i })).filter((x) => x.e.id !== p.etapa.id);
    ui.abrirModal({
      titulo: `Mover o item ${numeroDe(o, id)}`, sub: esc(p.linha.desc || 'Sem descrição'), folha: true,
      corpo: `<label class="f"><span>Para a etapa</span><select class="inp" name="etapa">${opcoes.map((x) => `<option value="${x.e.id}">${x.i + 1}. ${esc(x.e.titulo || 'Etapa sem nome')}</option>`).join('')}</select></label>
        <p class="small muted">O item entra no fim da etapa escolhida${temSub(p.linha) ? ', com os subitens' : ''}.</p>`,
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Mover', classe: 'primary', acao: (m) => {
          const dest = $('[name=etapa]', m.el).value;
          m.fechar();
          mudar((x) => { const q = acharLinha(x, id); const [l] = q.lista.splice(q.idx, 1); const e = acharEtapa(x, dest); e.itens.push(l); est.recolhidas.delete(dest); });
          ui.toast(`Item movido para a etapa ${o.etapas.findIndex((e) => e.id === dest) + 1}.`);
        },
      }],
    });
  }
  function recuar(id) {
    const p = acharLinha(est.orc, id);
    if (!p || p.pai || p.idx === 0 || temSub(p.linha)) return;
    mudar((o) => {
      const q = acharLinha(o, id), anterior = q.lista[q.idx - 1];
      const [l] = q.lista.splice(q.idx, 1);
      virarGrupo(anterior);
      delete l.sub;
      anterior.sub.push(l);
    }, { foco: est.cel ? null : focoDesc(id) });
  }
  function avancar(id) {
    const p = acharLinha(est.orc, id); if (!p || !p.pai) return;
    mudar((o) => {
      const q = acharLinha(o, id), pai = q.pai;
      const [l] = pai.sub.splice(q.idx, 1);
      const i = q.etapa.itens.indexOf(pai);
      q.etapa.itens.splice(i + 1, 0, l);
      limparGrupo(pai);
    }, { foco: est.cel ? null : focoDesc(id) });
  }
  function alternarObs(id) {
    const p = acharLinha(est.orc, id); if (!p) return;
    if (p.linha.obs != null) { mudar((o) => { delete acharLinha(o, id).linha.obs; }); return; }
    if (est.cel) { editarLinha(id, null, 'obs'); return; }
    mudar((o) => { acharLinha(o, id).linha.obs = ''; }, { foco: `tr.o-obs[data-l="${id}"] textarea` });
  }
  function alternarNeg(id) {
    const p = acharLinha(est.orc, id); if (!p) return;
    const vira = !p.linha.neg;
    mudar((o) => { const l = acharLinha(o, id).linha; if (vira) l.neg = true; else delete l.neg; });
    ui.toast(vira ? 'Linha marcada como "a negociar": fica fora do total.' : 'A linha voltou a entrar no total.');
  }
  async function excluirLinha(id) {
    const p = acharLinha(est.orc, id); if (!p) return;
    const num = numeroDe(est.orc, id);
    if (temSub(p.linha)) {
      const ok = await ui.confirmar({ titulo: `Excluir o item ${num}?`, msg: `O item "${p.linha.desc || 'sem descrição'}" e os ${p.linha.sub.length} subitens dele saem do orçamento.`, ok: 'Excluir', perigo: true });
      if (!ok) return;
    }
    mudar((o) => { const q = acharLinha(o, id); q.lista.splice(q.idx, 1); if (q.pai) limparGrupo(q.pai); });
    ui.toast(`Item ${num} excluído. Ctrl+Z ou o botão Desfazer traz de volta.`);
  }

  /* ---------------- operações nas etapas ---------------- */
  function addEtapa(abaixoDe) {
    const ins = (titulo) => {
      const n = novaEtapa(titulo);
      mudar((o) => { const k = abaixoDe ? o.etapas.findIndex((e) => e.id === abaixoDe) : -1; o.etapas.splice(k >= 0 ? k + 1 : o.etapas.length, 0, n); }, { foco: est.cel ? null : `input[data-e="${n.id}"]` });
      return n;
    };
    if (est.cel) { pedirNomeEtapa('Nova etapa', '', (t) => ins(t)); return; }
    ins('');
  }
  function pedirNomeEtapa(titulo, valor, cb) {
    ui.abrirModal({
      titulo, folha: true,
      corpo: `<label class="f req"><span>Nome da etapa</span><input class="inp" name="nome" value="${esc(valor)}" placeholder="Ex.: IMPERMEABILIZAÇÃO" autofocus></label>`,
      aoAbrir: (el) => { const i = $('[name=nome]', el); setTimeout(() => i.focus(), 60); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('.mf .primary', el.parentNode).click(); } }); },
      botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar', classe: 'primary', acao: (m) => { const v = $('[name=nome]', m.el).value.trim(); if (!v) { $('[name=nome]', m.el).classList.add('erro'); return; } m.fechar(); cb(v); } }],
    });
  }
  function renomearEtapa(eid) {
    if (!est.cel) { const i = $(`input[data-e="${eid}"]`); if (i) { i.focus(); i.select(); } return; }
    const e = acharEtapa(est.orc, eid); if (!e) return;
    pedirNomeEtapa('Renomear etapa', e.titulo, (t) => mudar((o) => { acharEtapa(o, eid).titulo = t; }));
  }
  function duplicarEtapa(eid) {
    mudar((o) => { const i = o.etapas.findIndex((e) => e.id === eid); const n = novosIds(copia(o.etapas[i])); n.titulo = (n.titulo + ' (cópia)').trim(); o.etapas.splice(i + 1, 0, n); });
    ui.toast('Etapa duplicada.');
  }
  function moverEtapa(eid, dir) {
    mudar((o) => { const i = o.etapas.findIndex((e) => e.id === eid); if (i + dir < 0 || i + dir >= o.etapas.length) return; const [e] = o.etapas.splice(i, 1); o.etapas.splice(i + dir, 0, e); });
  }
  async function excluirEtapa(eid) {
    const o = est.orc, i = o.etapas.findIndex((e) => e.id === eid); if (i < 0) return;
    const e = o.etapas[i];
    if (e.itens.length) {
      const n = e.itens.reduce((s, l) => s + 1 + (l.sub ? l.sub.length : 0), 0);
      const ok = await ui.confirmar({ titulo: `Excluir a etapa ${i + 1}?`, msg: `"${e.titulo || 'Etapa sem nome'}" tem ${n} ${n === 1 ? 'linha' : 'linhas'} que também serão excluídas.`, ok: 'Excluir etapa', perigo: true });
      if (!ok) return;
    }
    mudar((x) => { x.etapas.splice(x.etapas.findIndex((y) => y.id === eid), 1); });
    ui.toast(`Etapa ${i + 1} excluída. Desfazer traz de volta.`);
  }
  function alternarRec(eid) {
    if (est.recolhidas.has(eid)) est.recolhidas.delete(eid); else est.recolhidas.add(eid);
    pintar();
  }

  /* ---------------- janela de edição (celular e "Editar em janela") ---------------- */
  function editarLinha(id, alvo = null, focar = null) {
    const o = est.orc;
    const pos = id ? acharLinha(o, id) : null;
    if (id && !pos) return;
    const l = pos ? copia(pos.linha) : novaLinha();
    const sub = pos ? !!pos.pai : !!(alvo && alvo.pai);
    const grp = pos && !sub && temSub(pos.linha);
    let num;
    if (pos) num = numeroDe(o, id);
    else if (alvo.pai) { const p = acharLinha(o, alvo.pai); num = numeroDe(o, alvo.pai) + '.' + ((p.linha.sub || []).length + (temSub(p.linha) ? 1 : (vazio(p.linha.qtd) && vazio(p.linha.mat) && vazio(p.linha.mdo) ? 1 : 2))); }
    else { const e = acharEtapa(o, alvo.etapa); num = `${o.etapas.indexOf(e) + 1}.${e.itens.length + 1}`; }
    const titulo = pos ? `${sub ? 'Subitem' : 'Item'} ${num}` : `Novo ${sub ? 'subitem' : 'item'}`;
    const acoes = pos ? [
      !sub ? ['addsub', 'recuar', 'Adicionar subitem'] : null,
      ['abaixo', 'mais', sub ? 'Subitem abaixo' : 'Item abaixo'],
      ['dup', 'copiar', 'Duplicar'],
      ['cima', 'cima', 'Subir', pos.idx === 0],
      ['baixo', 'baixo', 'Descer', pos.idx === pos.lista.length - 1],
      !sub ? ['etapa', 'mover', 'Outra etapa', o.etapas.length < 2] : null,
      !sub ? ['recuar', 'recuar', 'Virar subitem', pos.idx === 0 || grp] : ['avancar', 'avancar', 'Virar item'],
    ].filter(Boolean) : [];
    const m = ui.abrirModal({
      titulo, sub: pos ? '' : `Entra como ${num}`, folha: true,
      corpo: `<label class="f req"><span>Descrição${grp ? ' do item' : ' do serviço'}</span><div class="sugere"><textarea class="inp" name="desc" rows="3" placeholder="Ex.: Pintura em parede acrílico acetinado">${esc(l.desc)}</textarea><div class="lista-sug" hidden></div></div></label>
        ${grp ? `<p class="small muted o-grp-nota">${icone('info')}Este item é a soma dos ${pos.linha.sub.length} subitens dele. Quantidade e preços ficam nos subitens.</p>` : `
        <div class="grid2 o-mg">
          <label class="f"><span>Unidade</span><input class="inp" name="un" list="orc-uns" value="${esc(l.un)}" autocomplete="off"></label>
          <label class="f"><span>Quantidade</span><input class="inp money" name="qtd" inputmode="decimal" value="${esc(l.qf || cru(l.qtd))}" autocomplete="off"></label>
          <div class="o-uns span2">${UNIDADES.slice(0, 9).map((u) => `<button type="button" class="o-un-b ${l.un === u ? 'on' : ''}" data-u="${esc(u)}">${esc(u)}</button>`).join('')}</div>
          <label class="f"><span>Material (R$ por unidade)</span><input class="inp money" name="mat" inputmode="decimal" value="${esc(cru(l.mat))}" autocomplete="off"></label>
          <label class="f"><span>Mão de obra (R$ por unidade)</span><input class="inp money" name="mdo" inputmode="decimal" value="${esc(cru(l.mdo))}" autocomplete="off"></label>
        </div>
        <div class="o-prev" data-prev></div>
        <label class="chk"><input type="checkbox" name="neg" ${l.neg ? 'checked' : ''}> <span>Valores a negociar (fica fora do total)</span></label>`}
        <label class="f"><span>Observação</span><textarea class="inp" name="obs" rows="2" placeholder="Opcional. Aparece logo abaixo da linha">${esc(l.obs || '')}</textarea></label>
        ${acoes.length ? `<div class="o-m-acoes">${acoes.map(([k, ic, rot, off]) => `<button type="button" class="btn sm" data-ma="${k}" ${off ? 'disabled' : ''}>${icone(ic)}${rot}</button>`).join('')}</div>` : ''}`,
      aoAbrir: (el, mm) => {
        const q = (n) => $(`[name=${n}]`, el);
        const prev = $('[data-prev]', el);
        const atualizar = () => {
          if (!prev) return;
          const v = ['qtd', 'mat', 'mdo'].map((n) => lerNumero(q(n).value));
          ['qtd', 'mat', 'mdo'].forEach((n, i) => q(n).classList.toggle('erro', v[i] === null));
          if (v.some((x) => x === null)) { prev.innerHTML = '<span class="aviso-campo">Confira os números digitados.</span>'; return; }
          const [qq, a, b] = v.map((x) => nn(x.v));
          prev.innerHTML = `<span>Preço unitário <b class="n">${brl(a + b)}</b></span><span>Total <b class="n">${q('neg').checked ? 'A negociar' : brl(qq * (a + b))}</b></span>`;
        };
        if (prev) { ['qtd', 'mat', 'mdo'].forEach((n) => q(n).addEventListener('input', atualizar)); q('neg').addEventListener('change', atualizar); atualizar(); }
        $$('.o-un-b', el).forEach((b) => b.addEventListener('click', () => { q('un').value = b.dataset.u; $$('.o-un-b', el).forEach((x) => x.classList.toggle('on', x === b)); }));
        const desc = q('desc');
        ui.sugestoes(desc, desc.nextElementSibling, fonteCatalogo(id), (it) => {
          desc.value = it.desc;
          if (q('un')) { q('un').value = it.un; q('mat').value = cru(it.mat); q('mdo').value = cru(it.mdo); atualizar(); q('qtd').focus(); }
        });
        $$('[data-ma]', el).forEach((b) => b.addEventListener('click', () => {
          if (!aplicar(mm, false)) return;
          mm.fechar();
          const k = b.dataset.ma;
          if (k === 'addsub') addSub(id);
          else if (k === 'abaixo') inserirAbaixo(id);
          else if (k === 'dup') duplicar(id);
          else if (k === 'cima') mover(id, -1);
          else if (k === 'baixo') mover(id, 1);
          else if (k === 'etapa') moverParaEtapa(id);
          else if (k === 'recuar') recuar(id);
          else if (k === 'avancar') avancar(id);
        }));
        if (focar) setTimeout(() => { const f = q(focar); if (f) f.focus(); }, 80);
        else if (!pos && !matchMedia('(pointer: coarse)').matches) setTimeout(() => desc.focus(), 60);
      },
      botoes: pos
        ? [{ rot: 'Excluir', classe: 'danger', esq: true, icone: 'lixo', acao: (mm) => { mm.fechar(); excluirLinha(id); } }, { rot: 'Cancelar' }, { rot: 'Salvar', classe: 'primary', acao: (mm) => { if (aplicar(mm, true)) mm.fechar(); } }]
        : [{ rot: 'Cancelar' }, { rot: 'Adicionar e criar outro', acao: (mm) => { if (aplicar(mm, true)) { mm.fechar(); editarLinha(null, alvoSeguinte()); } } }, { rot: 'Adicionar', classe: 'primary', acao: (mm) => { if (aplicar(mm, true)) mm.fechar(); } }],
    });
    let ultimoNovo = null;
    const alvoSeguinte = () => (alvo.pai ? { pai: alvo.pai, abaixoDe: ultimoNovo } : { etapa: alvo.etapa, abaixoDe: ultimoNovo });
    /** Lê a janela e grava. Retorna false se algo precisa ser corrigido. */
    function aplicar(mm, mostrar) {
      const el = mm.el, q = (n) => $(`[name=${n}]`, el);
      const campos = { desc: q('desc').value.trim() };
      const obs = q('obs').value.trim();
      if (!grp) {
        const v = {};
        for (const n of ['qtd', 'mat', 'mdo']) {
          const r = lerNumero(q(n).value);
          if (r === null) { q(n).classList.add('erro'); q(n).focus(); return false; }
          v[n] = r;
        }
        Object.assign(campos, { un: q('un').value.trim(), qtd: v.qtd.v, mat: v.mat.v, mdo: v.mdo.v, qf: v.qtd.f || undefined, neg: q('neg').checked || undefined });
      }
      if (!pos && !campos.desc && vazio(campos.qtd) && vazio(campos.mat) && vazio(campos.mdo)) { q('desc').classList.add('erro'); q('desc').focus(); return false; }
      const antes = pos ? JSON.stringify(pos.linha) : null;
      const aplicarEm = (x) => {
        Object.keys(campos).forEach((k) => { if (campos[k] === undefined) delete x[k]; else x[k] = campos[k]; });
        if (obs) x.obs = obs; else delete x.obs;
      };
      if (pos) {
        const teste = copia(pos.linha); aplicarEm(teste);
        if (JSON.stringify(teste) !== antes) mudar((x) => aplicarEm(acharLinha(x, id).linha));
      } else {
        const n = novaLinha(); aplicarEm(n); ultimoNovo = n.id;
        mudar((x) => inserirLinha(x, alvo, n));
        if (mostrar) ui.toast(`${sub ? 'Subitem' : 'Item'} ${num} adicionado.`);
      }
      return true;
    }
    return m;
  }

  /* ---------------- resumo ---------------- */
  function htmlResumo(o, c) {
    if (!o.etapas.length) return '<div class="card"><div class="empty"><b>Sem etapas ainda</b>O resumo aparece quando a planilha tiver valores.</div></div>';
    const d = c.direto;
    const max = Math.max(0, ...c.etapas.map((r) => r.tot)) || 1;
    const barras = o.etapas.map((e, i) => {
      const r = c.etapas[i];
      return `<div class="o-rb"><div class="o-rb-n"><span class="o-badge">${i + 1}</span><span class="nm">${esc(e.titulo || 'Etapa sem nome')}</span></div>
        <div class="o-rb-trk" title="Material ${brl(r.mat)} · Mão de obra ${brl(r.mdo)}"><i class="m" style="width:${(r.mat / max) * 100}%"></i><i class="d" style="width:${(r.mdo / max) * 100}%"></i></div>
        <div class="o-rb-v">${r.neg ? '<span class="o-negc">A negociar</span>' : `<b class="n">${brl(r.tot)}</b><small>${d ? pct(r.tot / d) : ''}</small>`}</div></div>`;
    }).join('');
    const folhas = [];
    o.etapas.forEach((e, i) => e.itens.forEach((l, j) => {
      if (temSub(l)) l.sub.forEach((s, k) => folhas.push({ n: `${i + 1}.${j + 1}.${k + 1}`, l: s, r: c.m.get(s.id) }));
      else folhas.push({ n: `${i + 1}.${j + 1}`, l, r: c.m.get(l.id) });
    }));
    let acum = 0;
    const abc = folhas.filter((f) => f.r.tot > 0).sort((a, b) => b.r.tot - a.r.tot).map((f) => {
      const antes = d ? acum / d : 0;
      acum += f.r.tot;
      return Object.assign(f, { p: d ? f.r.tot / d : 0, pa: d ? acum / d : 0, cl: antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C' });
    });
    const cont = { A: 0, B: 0, C: 0 }; abc.forEach((x) => { cont[x.cl]++; });
    const mostrar = est.abcTodos ? abc : abc.slice(0, 15);
    const pm = d ? c.mat / d : 0;
    return `<div class="o-res">
      <div class="card o-res-et"><div class="hd"><div><h3>Custo por etapa</h3><p>Custo direto, sem BDI</p></div><div class="legend"><span><i class="sw" style="background:var(--brand)"></i>Material</span><span><i class="sw" style="background:var(--apagar)"></i>Mão de obra</span></div></div><div class="bd">${barras}</div></div>
      <div class="card"><div class="hd"><div><h3>Formação do preço</h3><p>Do custo direto ao valor final</p></div></div><div class="bd">
        <div class="o-comp"><i class="m" style="flex:${c.mat}"></i><i class="d" style="flex:${c.mdo}"></i><i class="b" style="flex:${c.bdiValor}"></i></div>
        <dl class="o-dl"><dt><i class="sw" style="background:var(--brand)"></i>Material</dt><dd class="n">${brl(c.mat)}</dd><dd>${pct(pm)}</dd>
          <dt><i class="sw" style="background:var(--apagar)"></i>Mão de obra</dt><dd class="n">${brl(c.mdo)}</dd><dd>${d ? pct(1 - pm) : '0%'}</dd>
          <dt class="t">Custo direto</dt><dd class="n t">${brl(c.direto)}</dd><dd class="t">100%</dd>
          <dt><i class="sw" style="background:var(--ink)"></i>${esc(o.bdiRotulo)}</dt><dd class="n">${brl(c.bdiValor)}</dd><dd>${bdiTxt(o)}</dd>
          <dt class="f">Valor final</dt><dd class="n f">${brl(c.final)}</dd><dd class="f"></dd></dl>
        <p class="small muted o-ext">${esc(extenso(c.final))}</p></div></div>
      <div class="card o-res-abc"><div class="hd"><div><h3>Curva ABC dos serviços</h3><p>${abc.length ? `Classe A: ${cont.A} ${cont.A === 1 ? 'serviço soma' : 'serviços somam'} 80% do custo direto · B: ${cont.B} · C: ${cont.C}` : 'Sem serviços com valor.'}</p></div></div>
        ${abc.length ? `<div class="bd flush tblwrap"><table class="tbl o-abc"><thead><tr><th>Classe</th><th>Item</th><th>Serviço</th><th class="num">Total</th><th class="num">%</th><th class="num">% acumulado</th></tr></thead><tbody>
          ${mostrar.map((x) => `<tr><td><span class="o-cl-abc ${x.cl}">${x.cl}</span></td><td class="n">${x.n}</td><td>${esc(x.l.desc || 'Sem descrição')}</td><td class="num">${brl(x.r.tot)}</td><td class="num">${pct(x.p)}</td><td class="num">${pct(x.pa)}</td></tr>`).join('')}
          </tbody></table></div>${abc.length > 15 ? `<div class="bd" style="padding-top:10px"><button class="link" data-a="orc-abc">${est.abcTodos ? 'Mostrar só os 15 maiores' : `Ver todos os ${abc.length} serviços`}</button></div>` : ''}` : ''}</div>
    </div>`;
  }
  A['orc-abc'] = () => { est.abcTodos = !est.abcTodos; pintar(); };

  /* ---------------- dados e condições ---------------- */
  function htmlDados(o) {
    const cli = clientes.get(o.clienteId);
    return `<div class="o-dados">
      <div class="card"><div class="hd"><h3>Identificação</h3></div><div class="bd"><div class="grid2">
        <label class="f req span2"><span>Obra ou serviço</span><input class="inp" data-o="titulo" value="${esc(o.titulo)}"></label>
        <label class="f"><span>Número do orçamento</span><input class="inp" data-o="codigo" value="${esc(o.codigo || '')}" placeholder="001/2026"></label>
        <label class="f"><span>Data</span><input class="inp" type="date" data-o="data" value="${esc(o.data || '')}"></label>
        <div class="span2" id="orc-d-cli"></div>
        <label class="f span2"><span>Local da obra</span><input class="inp" data-o="local" id="orc-local" value="${esc(o.local || '')}" placeholder="${esc(cli && cli.endereco ? 'Vazio: usa o endereço do cliente' : 'Endereço da obra')}"></label>
      </div></div></div>
      <div class="card"><div class="hd"><h3>Preço e situação</h3></div><div class="bd"><div class="grid2">
        <label class="f"><span>Modalidade</span><select class="inp" data-o="modalidade">${MODALIDADES.map(([k, n]) => `<option value="${k}" ${o.modalidade === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f"><span>Situação</span><select class="inp" data-o="status">${STATUS.map(([k, n]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f"><span>BDI (%)</span><input class="inp money" data-o="bdi" inputmode="decimal" value="${esc(cru(o.bdi))}"></label>
        <label class="f"><span>Validade da proposta (dias)</span><input class="inp money" data-o="validade" inputmode="numeric" value="${esc(o.validade ?? '')}"></label>
        <label class="f span2"><span>Nome do BDI na planilha</span><input class="inp" data-o="bdiRotulo" value="${esc(o.bdiRotulo)}"></label>
      </div><p class="small muted" style="margin:10px 0 0">O BDI incide sobre o custo direto (material + mão de obra). Valor final = custo direto + BDI.</p></div></div>
      <div class="card o-dados-obs"><div class="hd"><div><h3>Observações e condições</h3><p>Saem no fim da planilha impressa. Ex.: prazo de execução, forma de pagamento, o que não está incluso.</p></div></div>
        <div class="bd"><textarea class="inp" data-o="observacoes" rows="8" placeholder="Uma condição por linha">${esc(o.observacoes || '')}</textarea></div></div>
    </div>`;
  }
  function atualizarLocal() {
    const i = $('#orc-local'); if (!i || !est.orc) return;
    const c = clientes.get(est.orc.clienteId);
    i.placeholder = c && c.endereco ? 'Vazio: usa o endereço do cliente' : 'Endereço da obra';
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.dataset || !t.dataset.o || !t.closest('.o-ed') || !est.orc) return;
    const k = t.dataset.o;
    let v = t.value;
    if (k === 'bdi') { const r = lerNumero(v); if (!r || r.v === null || r.v < 0) { t.classList.add('erro'); ui.toast('Informe o BDI em %, por exemplo 36.'); return; } v = r.v; t.value = cru(v); }
    else if (k === 'validade') { v = v.trim() === '' ? null : parseInt(v, 10); if (v !== null && !(v >= 0)) { t.classList.add('erro'); return; } }
    else if (k !== 'observacoes') v = v.trim();
    t.classList.remove('erro');
    if (k === 'titulo' && !v) { t.classList.add('erro'); return; }
    mudar((o) => { o[k] = v; if (k === 'status') o.statusEm = hojeISO(); }, { pintar: false });
    pintarTopo();
  });

  /* ---------------- situação, duplicar, excluir ---------------- */
  function mudarStatus(k) {
    if (!est.orc || est.orc.status === k) return;
    mudar((o) => { o.status = k; o.statusEm = hojeISO(); }, { pintar: false });
    pintarTopo();
    const s = $('[data-o="status"]'); if (s) s.value = k;
    ui.toast(`Situação: ${ST[k].n}.`);
  }
  A['orc-status'] = (el) => popover(el, STATUS.map(([k, n]) => ({ rot: n, ic: est.orc.status === k ? 'check' : '', on: est.orc.status === k, acao: () => mudarStatus(k) })));
  function duplicarOrc() {
    salvarAgora();
    const o = est.orc;
    const d = copia(o); delete d.id;
    const id = criarOrc(Object.assign(d, { codigo: proximoCodigo(), titulo: (o.titulo || 'Orçamento') + ' (cópia)', status: 'elaboracao', statusEm: null, data: hojeISO(), etapas: copia(o.etapas).map(novosIds), criadoEm: new Date().toISOString() }));
    location.hash = `#/orcamentos/${id}`;
    ui.toast('Orçamento duplicado. Você está na cópia.');
  }
  async function excluirOrc() {
    const o = est.orc;
    const ok = await ui.confirmar({ titulo: 'Excluir orçamento?', msg: `O orçamento ${o.codigo || ''} "${o.titulo}" será excluído de todos os aparelhos.`, ok: 'Excluir', perigo: true });
    if (!ok) return;
    clearTimeout(est.timer); est.sujo = false;
    store.excluir(T, o.id);
    est.id = null; est.orc = null;
    location.hash = '#/orcamentos';
    ui.toast('Orçamento excluído.');
  }
  A['orc-mais'] = (el) => popover(el, [
    { rot: 'Imprimir ou salvar PDF', ic: 'imprimir', acao: () => A['orc-imprimir']() },
    { rot: 'Exportar para Excel', ic: 'planilha', acao: () => A['orc-excel']() },
    { rot: 'Duplicar orçamento', ic: 'copiar', acao: duplicarOrc },
    { rot: 'Dados e condições', ic: 'dados', acao: () => { location.hash = `#/orcamentos/${est.orc.id}/dados`; } },
    '-',
    { rot: 'Excluir orçamento', ic: 'lixo', perigo: true, acao: excluirOrc },
  ]);

  /* ---------------- ações da planilha ---------------- */
  A['orc-menu'] = (el) => (el.dataset.k === 'etapa' ? menuEtapa(el) : menuLinha(el));
  A['orc-add-item'] = (el) => addItem(el.dataset.e);
  A['orc-add-sub'] = (el) => addSub(el.dataset.l);
  A['orc-add-etapa'] = () => addEtapa(null);
  A['orc-rec'] = (el) => alternarRec(el.dataset.e);
  A['orc-rec-todas'] = () => {
    const ids = est.orc.etapas.map((e) => e.id);
    if (ids.every((i) => est.recolhidas.has(i))) est.recolhidas.clear(); else ids.forEach((i) => est.recolhidas.add(i));
    pintar();
  };
  A['orc-etapas-padrao'] = () => mudar((o) => { ETAPAS_PADRAO.forEach((t) => o.etapas.push(novaEtapa(t))); });
  A['orc-desfazer'] = () => desfazer();
  A['orc-refazer'] = () => refazer();
  A['orc-editar'] = (el) => editarLinha(el.dataset.l);
  A['orc-obs-x'] = (el) => alternarObs(el.dataset.l);
  matchMedia(MQ_CEL).addEventListener('change', () => { if (Sis.rota().mod === 'orcamentos' && $('.o-ed') && !ui.modalAberto()) pintar(); });

  /* =========================================================
     Impressão em A4 e "Salvar como PDF"
     ========================================================= */
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const DATA_LONGA = (iso) => { if (!iso) return ''; const [a, m, d] = iso.split('-').map(Number); return `${d} de ${Sis.util.MESES_LONGOS[m - 1]} de ${a}`; };
  /** Valores para impressão e Excel. Com o BDI embutido, os preços unitários são arredondados ao centavo. */
  function valoresSaida(o, embutido) {
    const f = embutido ? 1 + nn(o.bdi) / 100 : 1;
    const m = new Map();
    const folha = (l) => {
      const semPreco = vazio(l.mat) && vazio(l.mdo);
      if (l.neg) return { neg: true, mu: null, du: null, unit: null, tm: 0, td: 0, tot: 0 };
      const q = nn(l.qtd);
      let a = nn(l.mat), b = nn(l.mdo);
      if (embutido) { a = r2(a * f); b = r2(b * f); }
      const tm = embutido ? r2(q * a) : q * a, td = embutido ? r2(q * b) : q * b;
      return { neg: false, mu: vazio(l.mat) ? null : a, du: vazio(l.mdo) ? null : b, unit: semPreco ? null : a + b, tm, td, tot: tm + td };
    };
    const soma = (xs) => xs.reduce((s, x) => ({ tm: s.tm + x.tm, td: s.td + x.td, tot: s.tot + x.tot }), { tm: 0, td: 0, tot: 0 });
    const ets = o.etapas.map((e) => {
      const its = e.itens.map((l) => {
        let r;
        if (temSub(l)) { const ss = l.sub.map((s) => { const x = folha(s); m.set(s.id, x); return x; }); r = soma(ss); r.neg = ss.every((x) => x.neg); }
        else r = folha(l);
        m.set(l.id, r); return r;
      });
      const r = soma(its); r.neg = its.length > 0 && its.some((x) => x.neg) && Math.abs(r.tot) < 0.005;
      m.set(e.id, r); return r;
    });
    const t = soma(ets);
    const bdi = embutido ? 0 : t.tot * nn(o.bdi) / 100;
    return { m, tm: t.tm, td: t.td, direto: t.tot, bdi, final: t.tot + bdi };
  }

  function htmlImpressao(o, op) {
    const cfg = config(), e = cfg.empresa;
    const emb = op.bdi === 'embutido', completa = op.colunas !== 'resumida';
    const V = valoresSaida(o, emb);
    const cli = clientes.get(o.clienteId);
    const local = o.local || (cli && cli.endereco) || '';
    const nc = completa ? 10 : 6;
    const negc = '<span class="pe-neg">A negociar</span>';
    const tot = (r) => (r.neg ? negc : fv(r.tot));
    const linha = (l, num, sub) => {
      const r = V.m.get(l.id), g = !sub && temSub(l);
      let h;
      if (g) {
        h = completa
          ? `<tr class="pe-grp"><td class="c-i">${num}</td><td colspan="5">${esc(l.desc)}</td><td class="num">${fv(r.tm)}</td><td class="num">${fv(r.td)}</td><td></td><td class="num">${tot(r)}</td></tr>`
          : `<tr class="pe-grp"><td class="c-i">${num}</td><td colspan="4">${esc(l.desc)}</td><td class="num">${tot(r)}</td></tr>`;
      } else {
        const neg = r.neg;
        h = `<tr class="${sub ? 'pe-sub' : 'pe-it'}"><td class="c-i">${num}</td><td class="pe-d">${esc(l.desc)}</td><td class="c-u">${esc(l.un)}</td><td class="num">${fq(l.qtd)}</td>`
          + (completa ? `<td class="num">${neg ? '' : fv(r.mu)}</td><td class="num">${neg ? '' : fv(r.du)}</td><td class="num">${neg ? '' : fv(r.tm)}</td><td class="num">${neg ? '' : fv(r.td)}</td>` : '')
          + `<td class="num">${neg ? '' : fv(r.unit)}</td><td class="num pe-t">${tot(r)}</td></tr>`;
      }
      if (l.obs) h += `<tr class="pe-obs"><td></td><td colspan="${nc - 1}"><b>Observação:</b> ${esc(l.obs)}</td></tr>`;
      return h;
    };
    let corpo = '';
    o.etapas.forEach((et, i) => {
      const n = i + 1, re = V.m.get(et.id);
      corpo += `<tbody><tr class="pe-et"><td class="c-i">${n}</td><td colspan="${nc - 1}">${esc(et.titulo)}</td></tr>`;
      et.itens.forEach((l, j) => {
        corpo += linha(l, `${n}.${j + 1}`, false);
        if (temSub(l)) l.sub.forEach((s, k) => { corpo += linha(s, `${n}.${j + 1}.${k + 1}`, true); });
      });
      if (!et.itens.length) corpo += `<tr class="pe-it"><td></td><td colspan="${nc - 1}" class="pe-vaz">Sem itens</td></tr>`;
      corpo += completa
        ? `<tr class="pe-st"><td></td><td colspan="5">Subtotal da etapa ${n}</td><td class="num">${fv(re.tm)}</td><td class="num">${fv(re.td)}</td><td></td><td class="num">${tot(re)}</td></tr>`
        : `<tr class="pe-st"><td></td><td colspan="4">Subtotal da etapa ${n}</td><td class="num">${tot(re)}</td></tr>`;
      corpo += '</tbody>';
    });
    const cab = completa
      ? '<tr><th class="c-i">Item</th><th>Descrição dos serviços</th><th class="c-u">Unid.</th><th class="num c-q">Quant.</th><th class="num">Material</th><th class="num">Mão de obra</th><th class="num">Total material</th><th class="num">Total mão de obra</th><th class="num">Preço unit.</th><th class="num">Total</th></tr>'
      : '<tr><th class="c-i">Item</th><th>Descrição dos serviços</th><th class="c-u">Unid.</th><th class="num c-q">Quant.</th><th class="num">Preço unit.</th><th class="num">Total</th></tr>';
    const resumo = op.resumo ? `<h2>Resumo por etapa</h2><table class="pe-res"><colgroup><col style="width:6%"><col><col style="width:13%"><col style="width:13%"><col style="width:14%"><col style="width:8%"></colgroup><thead><tr><th class="c-i">Item</th><th>Etapa</th><th class="num">Material</th><th class="num">Mão de obra</th><th class="num">Total</th><th class="num">%</th></tr></thead><tbody>
        ${o.etapas.map((et, i) => { const r = V.m.get(et.id); return `<tr><td class="c-i">${i + 1}</td><td>${esc(et.titulo)}</td><td class="num">${fv(r.tm)}</td><td class="num">${fv(r.td)}</td><td class="num">${tot(r)}</td><td class="num">${V.direto && !r.neg ? pct(r.tot / V.direto) : ''}</td></tr>`; }).join('')}</tbody>
        <tfoot>${emb ? '' : `<tr><td></td><td>Custo direto</td><td class="num">${fv(V.tm)}</td><td class="num">${fv(V.td)}</td><td class="num">${fv(V.direto)}</td><td class="num">100%</td></tr>
          <tr><td></td><td colspan="3">${esc(o.bdiRotulo)} (${bdiTxt(o)})</td><td class="num">${fv(V.bdi)}</td><td></td></tr>`}
          <tr class="f"><td></td><td colspan="3">Valor final${emb ? ` (BDI de ${bdiTxt(o)} incluso)` : ''}</td><td class="num">${fv(V.final)}</td><td></td></tr></tfoot></table>` : '';
    const fim = `<div class="pe-fim"><table class="pe-tot">
        ${emb ? '' : `<tr><td>Subtotal geral (custo direto)</td><td class="num">${brl(V.direto)}</td></tr><tr><td>${esc(o.bdiRotulo)} (${bdiTxt(o)})</td><td class="num">${brl(V.bdi)}</td></tr>`}
        <tr class="f"><td>Valor final da obra${emb ? ` (BDI de ${bdiTxt(o)} incluso)` : ''}</td><td class="num">${brl(V.final)}</td></tr></table>
        ${op.extenso ? `<p class="pe-ext">${esc(cap(extenso(V.final)))}.</p>` : ''}</div>`;
    const temNeg = calcular(o).nNeg > 0;
    const notas = [emb ? `Preços unitários com BDI de ${bdiTxt(o)} incluso, arredondados ao centavo.` : '', temNeg ? 'Itens "a negociar" não entram no valor final.' : ''].filter(Boolean);
    return `<div class="rp pe ${op.orientacao === 'retrato' ? 'retrato' : ''} ${completa ? '' : 'resumida'}">
      <div class="rp-head"><div class="rp-logo"><img src="img/logo.png?v=${Sis.VERSAO}" alt="${esc(e.nome)}"></div>
        <div class="rp-tit"><h1>Planilha orçamentária</h1><div class="pe-mod">${TITULO_MOD[o.modalidade]}</div><div>Orçamento nº ${esc(o.codigo || 's/n')} · ${dataBR(o.data)}${o.validade ? ` · Validade de ${o.validade} dias` : ''}</div></div></div>
      <div class="rp-obra">
        <div><b>Obra:</b> ${esc(o.titulo)}</div><div><b>Cliente:</b> ${esc(cli ? cli.nome : '-')}</div>
        <div><b>Local:</b> ${esc(local || '-')}</div><div><b>Responsável técnico:</b> ${esc([e.responsavel, e.cargo].filter(Boolean).join(', '))}</div>
        <div><b>Contato:</b> ${esc([e.telefone, e.email].filter(Boolean).join(' · '))}</div><div><b>Registro:</b> ${esc(e.registro || '-')}</div>
      </div>
      ${resumo}
      ${op.resumo ? '<h2>Planilha detalhada</h2>' : ''}
      <table class="pe-tab"><colgroup>${(completa ? [5, 32, 4.5, 6.5, 8.5, 8.5, 9, 9, 8.5, 8.5] : [6, 54, 6, 8, 12, 14]).map((w) => `<col style="width:${w}%">`).join('')}</colgroup><thead>${cab}</thead>${corpo}</table>
      ${fim}
      ${notas.length ? `<p class="obs">${notas.join(' ')}</p>` : ''}
      ${op.obs && (o.observacoes || '').trim() ? `<div class="pe-cond"><h2>Observações e condições</h2><div class="pe-obsg">${esc(o.observacoes.trim())}</div></div>` : ''}
      ${op.assinatura ? `<div class="pe-assin"><div class="pe-local">${esc(e.cidade ? e.cidade + ', ' : '')}${DATA_LONGA(o.data || hojeISO())}.</div>
        <div class="pe-ass"><b>${esc(e.responsavel)}</b>${e.cargo ? `<br>${esc(e.cargo)}` : ''}${e.registro ? `<br>${esc(e.registro)}` : ''}</div></div>` : ''}
    </div>`;
  }
  const cssStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
  function imprimir(o, op) {
    const e = config().empresa;
    $('#print-root').innerHTML = htmlImpressao(o, op);
    let st = $('#estilo-pagina');
    if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
    const rod = [e.nome, e.cnpj ? 'CNPJ ' + e.cnpj : '', `Orçamento nº ${o.codigo || 's/n'}`].filter(Boolean).join(' · ');
    st.textContent = `@page{size:A4 ${op.orientacao === 'retrato' ? 'portrait' : 'landscape'};margin:11mm 10mm 13mm 10mm;
      @bottom-left{content:${cssStr(rod)};font-family:"Segoe UI",Arial,sans-serif;font-size:7.5pt;color:#777}
      @bottom-right{content:"Página " counter(page) " de " counter(pages);font-family:"Segoe UI",Arial,sans-serif;font-size:7.5pt;color:#777}}`;
    const tituloAnt = document.title;
    document.title = `Orçamento ${o.codigo || ''} - ${o.titulo || ''}`.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    document.body.classList.add('imprimindo');
    const fim = () => {
      document.body.classList.remove('imprimindo');
      document.title = tituloAnt;
      $('#print-root').innerHTML = '';
      window.removeEventListener('afterprint', fim);
    };
    window.addEventListener('afterprint', fim);
    const imgs = $$('#print-root img');
    Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()))).then(() => setTimeout(() => window.print(), 60));
  }
  A['orc-imprimir'] = () => {
    salvarAgora();
    const o = est.orc; if (!o) return;
    if (!o.etapas.length) { ui.toast('A planilha ainda não tem etapas.'); return; }
    const op = Object.assign({}, IMPRESSAO_PADRAO, o.impressao);
    const seg = (k, ops) => `<div class="seg o-seg" data-op="${k}">${ops.map(([v, n]) => `<button type="button" data-v="${v}" class="${op[k] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const chk = (k, n) => `<label class="chk"><input type="checkbox" data-op="${k}" ${op[k] ? 'checked' : ''}> <span>${n}</span></label>`;
    ui.abrirModal({
      titulo: 'Imprimir ou salvar PDF', sub: 'Na janela de impressão, escolha "Salvar como PDF" para gerar o arquivo.',
      corpo: `<div class="o-imp">
        <div class="f"><span>Folha</span>${seg('orientacao', [['paisagem', 'A4 deitada'], ['retrato', 'A4 em pé']])}</div>
        <div class="f"><span>Colunas</span>${seg('colunas', [['completa', 'Material e mão de obra'], ['resumida', 'Só preço unitário e total']])}</div>
        <div class="f"><span>BDI</span>${seg('bdi', [['separado', 'Em linha separada'], ['embutido', 'Embutido nos preços']])}</div>
        <div class="o-imp-chk">${chk('resumo', 'Resumo por etapa no início')}${chk('extenso', 'Valor final por extenso')}${chk('obs', 'Observações e condições')}${chk('assinatura', 'Local, data e assinatura')}</div></div>`,
      aoAbrir: (el) => {
        $$('.o-seg', el).forEach((s) => s.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; op[s.dataset.op] = b.dataset.v; $$('button', s).forEach((x) => x.classList.toggle('on', x === b)); }));
        $$('input[data-op]', el).forEach((c) => c.addEventListener('change', () => { op[c.dataset.op] = c.checked; }));
      },
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Imprimir', classe: 'primary', icone: 'imprimir', acao: (m) => {
          if (JSON.stringify(op) !== JSON.stringify(Object.assign({}, IMPRESSAO_PADRAO, o.impressao))) { est.orc.impressao = Object.assign({}, op); salvarDepois(); salvarAgora(); }
          m.fechar();
          imprimir(est.orc, op);
        },
      }],
    });
  };

  /* =========================================================
     Excel: exportar (.xlsx com fórmulas, no modelo da planilha)
     ========================================================= */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /** Arquivo .zip sem compressão (o Excel aceita). */
  function zip(arquivos) {
    const enc = new TextEncoder(), partes = [], central = [];
    const agora = new Date();
    const dosT = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    const dosD = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    let off = 0;
    for (const a of arquivos) {
      const nome = enc.encode(a.nome), d = typeof a.dados === 'string' ? enc.encode(a.dados) : a.dados, crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true);
      h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), nome, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true);
      c.setUint16(28, nome.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nome);
      off += 30 + nome.length + d.length;
    }
    const tamC = central.reduce((s, x) => s + x.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamC, true); fim.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const xn = (n) => String(Math.round(n * 1e9) / 1e9);

  async function gerarXlsx(o) {
    const cfg = config(), e = cfg.empresa;
    const cli = clientes.get(o.clienteId);
    const V = valoresSaida(o, false);
    /* estilos (índices em cellXfs) */
    const X = { hd: 1, etN: 2, etT: 3, itN: 4, itD: 5, itU: 6, itQ: 7, itV: 8, grN: 9, grD: 10, grV: 11, grE: 12, sbN: 13, sbD: 14, sbU: 15, sbQ: 16, sbV: 17, obs: 18, stL: 19, stV: 20, fL: 21, fV: 22, cab: 23, fimL: 24, fimV: 25, neg: 26 };
    const linhas = [];   // { r, ht, cels: [[col, xml]] }
    const merges = [];
    let r = 1;
    const cel = {
      t: (c, v, s) => [c, `<c r="${c}${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`],
      n: (c, v, s) => [c, vazio(v) ? `<c r="${c}${r}" s="${s}"/>` : `<c r="${c}${r}" s="${s}"><v>${xn(v)}</v></c>`],
      f: (c, f, v, s) => [c, `<c r="${c}${r}" s="${s}"><f>${xe(f)}</f><v>${xn(nn(v))}</v></c>`],
      e: (c, s) => [c, `<c r="${c}${r}" s="${s}"/>`],
    };
    const alt = (txt, porLinha, minimo = 16.5, passo = 15.6) => Math.max(minimo, Math.ceil(Math.max(1, String(txt || '').length) / porLinha) * passo + 2);
    const add = (cels, ht) => { linhas.push({ r, ht, cels }); r++; };
    const COLS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

    /* cabeçalho com o logo */
    r = 2;
    const cabTxt = [
      ['PLANILHA ORÇAMENTÁRIA PARA ' + TITULO_MOD[o.modalidade].toUpperCase(), 'b', 15, 'FFC43E50'],
      ['OBRA: ' + String(o.titulo || '').toUpperCase(), 'b', 12.5, 'FF2A2418'],
      [`Cliente: ${cli ? cli.nome : '-'}${o.local || (cli && cli.endereco) ? ' · ' + (o.local || cli.endereco) : ''}`, '', 11, 'FF2A2418'],
      [`Orçamento nº ${o.codigo || 's/n'} · ${dataBR(o.data)}${o.validade ? ` · Validade de ${o.validade} dias` : ''}`, '', 11, 'FF2A2418'],
      [`${e.responsavel}${e.cargo ? ' - ' + e.cargo : ''}${e.registro ? ' · ' + e.registro : ''}`, '', 11, 'FF4B4438'],
      [[e.telefone, e.email, e.site].filter(Boolean).join(' · '), '', 11, 'FF4B4438'],
    ];
    const rich = cabTxt.map(([t, b, sz, cor], i) => `<r><rPr>${b ? '<b/>' : ''}<sz val="${sz}"/><color rgb="${cor}"/><rFont val="Aptos Narrow"/><family val="2"/></rPr><t xml:space="preserve">${xe(t)}${i < cabTxt.length - 1 ? '\n' : ''}</t></r>`).join('');
    add([['D', `<c r="D2" s="${X.cab}" t="inlineStr"><is>${rich}</is></c>`]], 118);
    merges.push('D2:K2');
    r = 4;
    add([cel.t('B', 'ITEM', X.hd), cel.t('C', 'DESCRIÇÃO DOS SERVIÇOS', X.hd), cel.t('D', 'UNID.', X.hd), cel.t('E', 'QUANT.', X.hd), cel.t('F', 'MATERIAL', X.hd), cel.t('G', 'MÃO DE OBRA', X.hd), cel.t('H', 'TOTAL MAT', X.hd), cel.t('I', 'TOTAL MDO', X.hd), cel.t('J', 'P. UNIT. R$', X.hd), cel.t('K', 'R$ TOTAL', X.hd)], 22);
    r = 6;
    const subtotais = [];
    const linhaFolha = (l, num, sub) => {
      const x = V.m.get(l.id);
      const [sN, sD, sU, sQ, sV] = sub ? [X.sbN, X.sbD, X.sbU, X.sbQ, X.sbV] : [X.itN, X.itD, X.itU, X.itQ, X.itV];
      const q = l.qtd, a = l.neg ? null : l.mat, b = l.neg ? null : l.mdo;
      const qq = nn(q), aa = nn(a), bb = nn(b);
      add([cel.t('B', num, sN), cel.t('C', l.desc, sD), cel.t('D', l.un, sU), cel.n('E', q, sQ), cel.n('F', a, sV), cel.n('G', b, sV),
        cel.f('H', `F${r}*E${r}`, qq * aa, sV), cel.f('I', `G${r}*E${r}`, qq * bb, sV), cel.f('J', `G${r}+F${r}`, aa + bb, sV),
        l.neg ? cel.t('K', 'A NEGOCIAR', X.neg) : cel.f('K', `J${r}*E${r}`, x.tot, sV)], alt(l.desc, 64));
      return r - 1;
    };
    const linhaObs = (l) => {
      if (!l.obs) return;
      add([cel.t('B', 'OBSERVAÇÃO: ' + l.obs, X.obs), ...COLS.slice(1).map((c) => cel.e(c, X.obs))], alt('OBSERVAÇÃO: ' + l.obs, 190));
      merges.push(`B${r - 1}:K${r - 1}`);
    };
    o.etapas.forEach((et, i) => {
      const n = i + 1;
      add([cel.n('B', n, X.etN), cel.t('C', et.titulo, X.etT), ...COLS.slice(2).map((c) => cel.e(c, X.etT))], 19);
      merges.push(`C${r - 1}:K${r - 1}`);
      const nivel1 = [];
      et.itens.forEach((l, j) => {
        const num = `${n}.${j + 1}`;
        if (temSub(l)) {
          const x = V.m.get(l.id);
          const rg = r;
          add([cel.t('B', num, X.grN), cel.t('C', l.desc, X.grD), cel.e('D', X.grE), cel.e('E', X.grE), cel.e('F', X.grE), cel.e('G', X.grE),
            cel.f('H', `SUM(H${rg + 1}:H${rg + 1})`, x.tm, X.grV), cel.f('I', `SUM(I${rg + 1}:I${rg + 1})`, x.td, X.grV), cel.e('J', X.grE), cel.f('K', `SUM(K${rg + 1}:K${rg + 1})`, x.tot, X.grV)], alt(l.desc, 64));
          linhaObs(l);
          let ult = r;
          l.sub.forEach((s, k) => { ult = linhaFolha(s, `${num}.${k + 1}`, true); linhaObs(s); });
          const ln = linhas.find((y) => y.r === rg);
          const ini = rg + 1 + (l.obs ? 1 : 0);
          ln.cels = ln.cels.map(([c, xml]) => [c, xml.replace(/SUM\(([HIK])\d+:[HIK]\d+\)/, (m0, col) => `SUM(${col}${ini}:${col}${ult})`)]);
          nivel1.push(rg);
        } else { nivel1.push(linhaFolha(l, num, false)); linhaObs(l); }
      });
      const x = V.m.get(et.id);
      const temGrupo = et.itens.some(temSub);
      const f = !nivel1.length ? '0' : temGrupo ? nivel1.map((k) => `K${k}`).join('+') : `SUM(K${nivel1[0]}:K${nivel1[nivel1.length - 1]})`;
      add([cel.t('B', 'SUBTOTAL', X.stL), ...COLS.slice(1, 9).map((c) => cel.e(c, X.stL)), cel.f('K', f, x.tot, X.stV)], 18);
      merges.push(`B${r - 1}:J${r - 1}`);
      subtotais.push(r - 1);
      r++;
    });
    const rSG = r;
    add([cel.t('B', 'SUBTOTAL GERAL', X.fimL), ...COLS.slice(1, 9).map((c) => cel.e(c, X.fimL)), cel.f('K', subtotais.map((k) => `K${k}`).join('+') || '0', V.direto, X.fimV)], 20);
    merges.push(`B${rSG}:J${rSG}`);
    add([cel.t('B', `${o.bdiRotulo} (${bdiTxt(o)})`, X.fimL), ...COLS.slice(1, 9).map((c) => cel.e(c, X.fimL)), cel.f('K', `K${rSG}*${xn(nn(o.bdi) / 100)}`, V.direto * nn(o.bdi) / 100, X.fimV)], 20);
    merges.push(`B${rSG + 1}:J${rSG + 1}`);
    add([cel.t('B', 'VALOR FINAL DA OBRA', X.fimL), ...COLS.slice(1, 9).map((c) => cel.e(c, X.fimL)), cel.f('K', `SUM(K${rSG}:K${rSG + 1})`, V.direto * (1 + nn(o.bdi) / 100), X.fimV)], 22);
    merges.push(`B${rSG + 2}:J${rSG + 2}`);
    if ((o.observacoes || '').trim()) {
      r++;
      const t = 'OBSERVAÇÕES E CONDIÇÕES\n' + o.observacoes.trim();
      add([cel.t('B', t, X.cab), ...COLS.slice(1).map((c) => cel.e(c, X.cab))], Math.max(30, t.split('\n').reduce((s, l) => s + Math.ceil(Math.max(1, l.length) / 190), 0) * 15.6 + 4));
      merges.push(`B${r - 1}:K${r - 1}`);
    }
    const ultima = r - 1;

    const sheetRows = linhas.map((l) => `<row r="${l.r}"${l.ht ? ` ht="${l.ht}" customHeight="1"` : ''}>${l.cels.sort((a, b) => a[0].localeCompare(b[0])).map((c) => c[1]).join('')}</row>`).join('');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:K${ultima}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90" zoomScaleNormal="90"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="C6" sqref="C6"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="2.7" customWidth="1"/><col min="2" max="2" width="9.5" customWidth="1"/><col min="3" max="3" width="62" customWidth="1"/><col min="4" max="4" width="8" customWidth="1"/><col min="5" max="5" width="10.5" customWidth="1"/><col min="6" max="10" width="15.5" customWidth="1"/><col min="11" max="11" width="17.5" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L&amp;8${xe(e.nome)} · Orçamento nº ${xe(o.codigo || '')}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter><drawing r:id="rId1"/></worksheet>`;

    const borda = '<left style="thin"><color rgb="FFDAD6CF"/></left><right style="thin"><color rgb="FFDAD6CF"/></right><top style="thin"><color rgb="FFDAD6CF"/></top><bottom style="thin"><color rgb="FFDAD6CF"/></bottom><diagonal/>';
    const xf = (font, fill, border, numFmt, al) => `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${numFmt ? ' applyNumberFormat="1"' : ''} applyAlignment="1"><alignment ${al}/></xf>`;
    const C = 'horizontal="center" vertical="center"', L = 'horizontal="left" vertical="center" wrapText="1"', Li = 'horizontal="left" vertical="center" wrapText="1" indent="2"', R = 'vertical="center"', RR = 'horizontal="right" vertical="center"';
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="_-&quot;R$&quot;\\ * #,##0.00_-;\\-&quot;R$&quot;\\ * #,##0.00_-;_-&quot;R$&quot;\\ * &quot;-&quot;??_-;_-@_-"/><numFmt numFmtId="165" formatCode="#,##0.00##"/></numFmts>
<fonts count="7"><font><sz val="11"/><color rgb="FF2A2418"/><name val="Aptos Narrow"/><family val="2"/></font><font><sz val="12"/><color rgb="FF2A2418"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FF2A2418"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><i/><sz val="11.5"/><color rgb="FF9C2F40"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FF9C2F40"/><name val="Aptos Narrow"/><family val="2"/></font></fonts>
<fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9F3141"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC43E50"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6E2DC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFAFAF8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFBEEF0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${borda}</border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="27"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
${xf(2, 2, 1, 0, C + ' wrapText="1"')}
${xf(2, 3, 1, 0, C)}${xf(2, 3, 1, 0, 'horizontal="left" vertical="center"')}
${xf(1, 4, 1, 0, C)}${xf(1, 4, 1, 0, L)}${xf(1, 4, 1, 0, C)}${xf(1, 4, 1, 165, C)}${xf(1, 4, 1, 164, R)}
${xf(3, 5, 1, 0, C)}${xf(3, 5, 1, 0, L)}${xf(3, 5, 1, 164, R)}${xf(3, 5, 1, 0, R)}
${xf(1, 6, 1, 0, C)}${xf(1, 6, 1, 0, Li)}${xf(1, 6, 1, 0, C)}${xf(1, 6, 1, 165, C)}${xf(1, 6, 1, 164, R)}
${xf(5, 7, 1, 0, L)}
${xf(2, 2, 1, 0, RR)}${xf(2, 2, 1, 164, R)}
${xf(4, 2, 1, 0, RR)}${xf(4, 2, 1, 164, R)}
${xf(0, 8, 0, 0, 'horizontal="left" vertical="center" wrapText="1" indent="1"')}
${xf(4, 2, 1, 0, RR)}${xf(4, 2, 1, 164, R)}
${xf(6, 4, 1, 0, C)}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

    let logo = null;
    try { const resp = await fetch(`img/logo.png?v=${Sis.VERSAO}`); if (resp.ok) logo = new Uint8Array(await resp.arrayBuffer()); } catch { /* sem logo */ }
    const arquivos = [
      { nome: '[Content_Types].xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${logo ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { nome: '_rels/.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { nome: 'docProps/core.xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(`Orçamento ${o.codigo || ''} - ${o.titulo || ''}`)}</dc:title><dc:creator>${xe(e.nome)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
      { nome: 'xl/workbook.xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="ORÇAMENTO" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'ORÇAMENTO'!$4:$4</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { nome: 'xl/_rels/workbook.xml.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { nome: 'xl/styles.xml', dados: styles },
      { nome: 'xl/worksheets/sheet1.xml', dados: logo ? sheet : sheet.replace('<drawing r:id="rId1"/>', '') },
    ];
    if (logo) {
      const px = 9525, w = 250, h = Math.round(250 * 381 / 900);
      arquivos.push(
        { nome: 'xl/worksheets/_rels/sheet1.xml.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` },
        { nome: 'xl/drawings/drawing1.xml', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>${12 * px}</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>${30 * px}</xdr:rowOff></xdr:from><xdr:ext cx="${w * px}" cy="${h * px}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * px}" cy="${h * px}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>` },
        { nome: 'xl/drawings/_rels/drawing1.xml.rels', dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>` },
        { nome: 'xl/media/image1.png', dados: logo },
      );
    }
    return zip(arquivos);
  }
  A['orc-excel'] = async () => {
    salvarAgora();
    const o = est.orc; if (!o) return;
    if (!o.etapas.length) { ui.toast('A planilha ainda não tem etapas.'); return; }
    try {
      const blob = await gerarXlsx(o);
      const nome = `Orçamento ${o.codigo || ''} - ${o.titulo || ''}`.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() + '.xlsx';
      ui.baixarArquivo(nome, blob);
      ui.toast('Planilha do Excel gerada, com as fórmulas.');
    } catch (e) { console.error(e); ui.toast('Não foi possível gerar a planilha: ' + e.message, 'erro'); }
  };

  /* =========================================================
     Excel: importar uma planilha no modelo da Souza
     ========================================================= */
  function lerZip(buf) {
    const dv = new DataView(buf);
    let i = buf.byteLength - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('O arquivo não é uma planilha .xlsx.');
    const n = dv.getUint16(i + 10, true);
    let p = dv.getUint32(i + 16, true);
    const dec = new TextDecoder();
    const arq = {};
    for (let k = 0; k < n; k++) {
      const metodo = dv.getUint16(p + 10, true), tamC = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
      arq[dec.decode(new Uint8Array(buf, p + 46, nl))] = { metodo, tamC, loc };
      p += 46 + nl + el + cl;
    }
    return {
      tem: (nome) => !!arq[nome],
      async ler(nome) {
        const a = arq[nome];
        if (!a) return null;
        const ini = a.loc + 30 + dv.getUint16(a.loc + 26, true) + dv.getUint16(a.loc + 28, true);
        const dados = new Uint8Array(buf, ini, a.tamC);
        if (a.metodo === 0) return dec.decode(dados);
        if (a.metodo !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir a planilha. Atualize o navegador.');
        const out = await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        return dec.decode(out);
      },
    };
  }
  async function lerXlsx(arquivo) {
    const z = lerZip(await arquivo.arrayBuffer());
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const tags = (d, t) => Array.from(d.getElementsByTagName(t));
    const wb = xml(await z.ler('xl/workbook.xml'));
    const rels = xml(await z.ler('xl/_rels/workbook.xml.rels'));
    const folha = tags(wb, 'sheet')[0];
    if (!folha) throw new Error('A planilha não tem abas.');
    const rid = folha.getAttribute('r:id') || folha.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = tags(rels, 'Relationship').find((x) => x.getAttribute('Id') === rid);
    let alvo = rel ? rel.getAttribute('Target') : 'worksheets/sheet1.xml';
    alvo = alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
    const textoDe = (n) => tags(n, 't').map((t) => t.textContent).join('');
    const ss = z.tem('xl/sharedStrings.xml') ? tags(xml(await z.ler('xl/sharedStrings.xml')), 'si').map(textoDe) : [];
    const sh = xml(await z.ler(alvo));
    const linhas = [];
    tags(sh, 'row').forEach((row) => {
      const cel = {};
      tags(row, 'c').forEach((c) => {
        const ref = c.getAttribute('r') || '', col = ref.replace(/\d+/g, ''), t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0];
        let val = null;
        if (t === 's') val = v ? ss[+v.textContent] ?? '' : '';
        else if (t === 'inlineStr') val = textoDe(c);
        else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
        else if (t === 'b') val = v ? v.textContent === '1' : null;
        else if (v && v.textContent !== '') val = Number(v.textContent);
        if (val !== null && val !== '') cel[col] = val;
      });
      if (Object.keys(cel).length) linhas.push({ r: +row.getAttribute('r'), cel });
    });
    return interpretarPlanilha(linhas);
  }
  /** Lê o modelo de planilha da Souza: etapas (1), itens (1.1), subitens (1.1.1), subtítulos sem número e observações. */
  function interpretarPlanilha(linhas) {
    const txt = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
    const cols = { item: 'B', desc: 'C', u: 'D', q: 'E', mat: 'F', mdo: 'G' };
    const head = linhas.find((l) => Object.values(l.cel).some((v) => typeof v === 'string' && /descri/i.test(norm(v))));
    if (head) {
      Object.entries(head.cel).forEach(([k, v]) => {
        const t = norm(String(v));
        if (/^item/.test(t)) cols.item = k;
        else if (/descri/.test(t)) cols.desc = k;
        else if (/^quant/.test(t)) cols.q = k;
        else if (/^unid/.test(t)) cols.u = k;
        else if (/^material/.test(t)) cols.mat = k;
        else if (/^mao de obra|^m\.? ?o\.?$/.test(t)) cols.mdo = k;
      });
    }
    const o = { titulo: '', modalidade: 'global', bdi: null, bdiRotulo: '', etapas: [] };
    const renum = [];
    let etapa = null, grupo = null, ultimo = null, ultimoItem = null;
    const numCel = (v) => (vazio(v) || typeof v !== 'number' ? (typeof v === 'string' && /^-?[\d.,]+$/.test(v.trim()) ? Number(v.replace(/\./g, '').replace(',', '.')) : null) : v);
    for (const l of linhas) {
      const c = l.cel;
      if (!head || l.r < head.r) {
        Object.values(c).forEach((v) => {
          const s = String(v);
          const m = s.match(/OBRA\s*:\s*([^\n]+)/i); if (m && !o.titulo) o.titulo = txt(m[1]);
          if (/pre[cç]o\s+unit/i.test(s)) o.modalidade = 'unitario'; else if (/administra/i.test(s)) o.modalidade = 'administracao';
        });
        continue;
      }
      if (l.r === head.r) continue;
      const it = txt(c[cols.item]), ds = txt(c[cols.desc]);
      if (!it && !ds) continue;
      const rot = it || ds;
      if (/^observa/i.test(rot)) {
        if (ultimo) ultimo.obs = txt(rot.replace(/^observa[çc][ãa]o\s*:?\s*/i, ''));
        continue;
      }
      if (/bdi/i.test(rot) && !ds) {
        const m = rot.match(/\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/);
        if (m) o.bdi = Number(m[1].replace(',', '.'));
        o.bdiRotulo = txt(rot.replace(/\(.*\)/, ''));
        continue;
      }
      if (/^(sub ?total|valor final|total geral|total)/i.test(norm(rot))) continue;
      const nItem = typeof c[cols.item] === 'number' ? c[cols.item] : null;
      if (nItem !== null && Number.isInteger(nItem) && ds) {
        etapa = { id: rid(), titulo: ds, itens: [] }; o.etapas.push(etapa); grupo = null; ultimo = null; ultimoItem = null;
        continue;
      }
      if (!etapa) { etapa = { id: rid(), titulo: 'ETAPA', itens: [] }; o.etapas.push(etapa); }
      const ref = nItem !== null ? String(nItem) : it;
      if (!ref && ds) {
        grupo = novaLinha({ desc: ds, sub: [] }); delete grupo.un; delete grupo.qtd; delete grupo.mat; delete grupo.mdo;
        etapa.itens.push(grupo); ultimo = grupo; ultimoItem = grupo;
        continue;
      }
      if (!/^\d+(\.\d+){1,2}$/.test(ref)) continue;
      const va = c[cols.u], vb = c[cols.q];
      let un = '', qtd = null;
      if (typeof va === 'number' && typeof vb !== 'number') { qtd = va; un = txt(vb); }
      else if (typeof vb === 'number') { qtd = vb; un = txt(va); }
      else { un = txt(va || vb); qtd = numCel(va) ?? numCel(vb); }
      const lin = novaLinha({ desc: ds, un, qtd: vazio(qtd) ? null : Math.round(qtd * 1e6) / 1e6, mat: vazio(numCel(c[cols.mat])) ? null : Math.round(numCel(c[cols.mat]) * 1e6) / 1e6, mdo: vazio(numCel(c[cols.mdo])) ? null : Math.round(numCel(c[cols.mdo]) * 1e6) / 1e6 });
      if (vazio(lin.qtd) && vazio(lin.mat) && vazio(lin.mdo)) lin.neg = true;
      const niveis = ref.split('.').length;
      if (niveis === 3 && ultimoItem) {
        virarGrupo(ultimoItem); ultimoItem.sub.push(lin);
      } else if (grupo && niveis === 2) {
        grupo.sub.push(lin);
      } else {
        grupo = null; etapa.itens.push(lin); ultimoItem = lin;
      }
      lin._ref = ref;
      ultimo = lin;
    }
    o.etapas.forEach((e, i) => e.itens.forEach((l, j) => {
      l.sub = l.sub && l.sub.length ? l.sub : undefined;
      if (!l.sub) delete l.sub;
      const chk = (x, num) => { if (x._ref && x._ref.split('.').length === num.split('.').length && x._ref !== num) renum.push([x._ref, num]); delete x._ref; };
      chk(l, `${i + 1}.${j + 1}`);
      (l.sub || []).forEach((s, k) => chk(s, `${i + 1}.${j + 1}.${k + 1}`));
    }));
    return { orc: o, renum };
  }
  A['orc-importar'] = () => {
    ui.escolherArquivo('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', async (f) => {
      let res;
      try { res = await lerXlsx(f); } catch (e) { console.error(e); ui.alerta({ titulo: 'Não consegui ler a planilha', msg: e.message }); return; }
      const p = res.orc;
      if (!p.etapas.length) { ui.alerta({ titulo: 'Nenhuma etapa encontrada', msg: 'A planilha precisa seguir o modelo: número da etapa na coluna ITEM, itens numerados como 1.1 e subitens como 1.1.1.' }); return; }
      const cfg = config();
      if (p.bdi === null) p.bdi = cfg.bdi;
      if (!p.bdiRotulo) p.bdiRotulo = cfg.bdiRotulo;
      const c = calcular(normalizar(copia(p)));
      let sel;
      ui.abrirModal({
        titulo: 'Importar planilha', sub: esc(f.name),
        corpo: `<div class="o-imp-res"><div><b>${p.etapas.length}</b><span>etapas</span></div><div><b>${c.nItens}</b><span>itens</span></div><div><b>${c.nSub}</b><span>subitens</span></div><div class="w"><b class="n">${brl(c.direto)}</b><span>custo direto</span></div></div>
          ${res.renum.length ? `<p class="small muted">${res.renum.length} ${res.renum.length === 1 ? 'linha tinha numeração diferente e foi renumerada' : 'linhas tinham numeração diferente e foram renumeradas'}: ${res.renum.slice(0, 6).map(([a, b]) => `${esc(a)} → ${esc(b)}`).join(', ')}${res.renum.length > 6 ? '…' : ''}</p>` : ''}
          <div class="grid2"><label class="f req span2"><span>Obra ou serviço</span><input class="inp" name="titulo" value="${esc(p.titulo)}"></label>
          <div class="span2" id="orc-i-cli"></div>
          <label class="f"><span>Modalidade</span><select class="inp" name="modalidade">${MODALIDADES.map(([k, n]) => `<option value="${k}" ${p.modalidade === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="f"><span>BDI (%)</span><input class="inp money" name="bdi" inputmode="decimal" value="${esc(cru(p.bdi))}"></label></div>`,
        aoAbrir: (el) => { sel = Sis.seletorCliente($('#orc-i-cli', el), { rotulo: 'Cliente' }); },
        botoes: [{ rot: 'Cancelar' }, {
          rot: 'Criar orçamento', classe: 'primary', acao: (m) => {
            const titulo = $('[name=titulo]', m.el).value.trim();
            if (!titulo) { $('[name=titulo]', m.el).classList.add('erro'); return; }
            const erro = sel.validar(); if (erro) { ui.toast(erro); return; }
            const bdi = lerNumero($('[name=bdi]', m.el).value);
            if (!bdi || bdi.v === null) { $('[name=bdi]', m.el).classList.add('erro'); return; }
            const id = criarOrc({ titulo, clienteId: sel.valor().clienteId, modalidade: $('[name=modalidade]', m.el).value, bdi: bdi.v, bdiRotulo: p.bdiRotulo, etapas: p.etapas });
            m.fechar();
            location.hash = `#/orcamentos/${id}`;
            ui.toast('Planilha importada.');
          },
        }],
      });
    });
  };

  /* =========================================================
     Configurações: cabeçalho e padrões dos orçamentos
     ========================================================= */
  function cardConfig() {
    const c = config(), e = c.empresa;
    const f = (k, rot, v, extra = '') => `<label class="f ${extra}"><span>${rot}</span><input class="inp" data-oc="${k}" value="${esc(v ?? '')}"></label>`;
    return `<div class="card"><div class="hd"><div><h3>Orçamentos: cabeçalho e padrões</h3><p>Vale para todos os aparelhos.</p></div></div><div class="bd">
      <div class="grid2">
        ${f('empresa.nome', 'Empresa', e.nome)}${f('empresa.cnpj', 'CNPJ', e.cnpj)}
        ${f('empresa.responsavel', 'Responsável técnico', e.responsavel)}${f('empresa.cargo', 'Cargo', e.cargo)}
        ${f('empresa.registro', 'Registro profissional', e.registro)}${f('empresa.cidade', 'Cidade (para a data)', e.cidade)}
        ${f('empresa.telefone', 'Telefone', e.telefone)}${f('empresa.email', 'E-mail', e.email)}
        ${f('empresa.site', 'Site', e.site, 'span2')}
        ${f('bdi', 'BDI padrão (%)', cru(c.bdi))}${f('validade', 'Validade padrão (dias)', c.validade)}
        ${f('bdiRotulo', 'Nome do BDI', c.bdiRotulo, 'span2')}
        <label class="f span2"><span>Observações padrão de um orçamento novo</span><textarea class="inp" data-oc="observacoes" rows="4" placeholder="Ex.: Prazo de execução, forma de pagamento">${esc(c.observacoes || '')}</textarea></label>
      </div>
      <div class="actions" style="margin-top:12px"><button class="btn primary" data-a="orc-cfg-salvar">Salvar</button></div></div></div>`;
  }
  A['orc-cfg-salvar'] = () => {
    const c = config();
    const novo = { empresa: Object.assign({}, c.empresa), bdi: c.bdi, validade: c.validade, bdiRotulo: c.bdiRotulo, observacoes: c.observacoes };
    for (const el of $$('[data-oc]')) {
      const k = el.dataset.oc, v = el.value.trim();
      if (k.startsWith('empresa.')) novo.empresa[k.slice(8)] = v;
      else if (k === 'bdi') { const r = lerNumero(v); if (!r || r.v === null) { el.classList.add('erro'); ui.toast('Confira o BDI padrão.'); return; } novo.bdi = r.v; }
      else if (k === 'validade') { const n = v === '' ? null : parseInt(v, 10); if (n !== null && !(n >= 0)) { el.classList.add('erro'); return; } novo.validade = n; }
      else novo[k] = k === 'observacoes' ? el.value : v;
    }
    salvarConfig(novo);
    ui.toast('Padrões dos orçamentos salvos.');
  };

  /* =========================================================
     Registro no sistema
     ========================================================= */
  Sis.orcamentosConfig = { card: cardConfig };
  Sis.orcamentos = { lista: listaOrc, calcular, extenso, lerNumero, interpretarPlanilha, gerarXlsx, lerXlsx };
  Sis.usosCli.push((id) => ({ n: store.lista(T, 'orcamento').filter((r) => r.dados && r.dados.clienteId === id).length, rot: 'orçamento', plural: 'orçamentos' }));
  Sis.modulo({
    id: 'orcamentos', nome: 'Orçamentos', desc: 'Planilhas por etapas e itens', icone: 'orcamento', sistema: true,
    render(el, partes) {
      if (est.sujo) salvarAgora();
      if (partes[0]) renderOrc(el, partes[0], ABAS.some((a) => a[0] === partes[1]) ? partes[1] : 'planilha');
      else renderLista(el);
    },
    buscar(t) {
      return listaOrc().filter((o) => norm([o.titulo, o.codigo, clientes.nome(o.clienteId)].join(' ')).includes(t)).slice(0, 4)
        .map((o) => ({ tipo: 'Orçamento', titulo: o.titulo || 'Sem título', sub: `Nº ${o.codigo || 's/n'} · ${clientes.nome(o.clienteId) || 'sem cliente'} · ${brl(totalFinal(o))}`, rota: `#/orcamentos/${o.id}` }));
    },
  });
})();
