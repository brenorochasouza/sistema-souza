'use strict';
/* =========================================================
   Agenda: semana de trabalho, compromissos, tarefas e
   categorias. As visitas marcadas em Clientes aparecem aqui
   automaticamente.
   ========================================================= */
(function () {
  const { $, $$, esc, norm, hojeISO, deISO, isoData, somaDias, segundaDe, MESES, DIAS, DIAS_LONGOS, minutos, hhmm, duracaoTexto, idCurto, dataBR } = Sis.util;
  const { store, ui, icone, clientes } = Sis;
  const T = 'agenda';

  const CAT_PADRAO = [
    { id: 'primeira-visita', nome: 'Primeira visita', cor: '#C43E50' },
    { id: 'obra', nome: 'Obra', cor: '#B4700F' },
    { id: 'insp-fachada', nome: 'Inspeção fachada', cor: '#1F5F8B' },
    { id: 'insp-predial', nome: 'Inspeção predial', cor: '#2E7D5B' },
    { id: 'pericia', nome: 'Perícia', cor: '#5B3E8E' },
    { id: 'consultoria', nome: 'Consultoria', cor: '#0F7B7B' },
    { id: 'pessoal', nome: 'Pessoal', cor: '#4A5568' },
  ];
  const PALETA = ['#B03A6E', '#2C5AA0', '#3B6E22', '#8E4B10', '#7D2E4D', '#146B5C', '#6B5B2E', '#8A3324', '#365E9B', '#5E4B8B'];
  const DURACOES = [15, 30, 45, 60, 90, 120, 180, 240];
  const PX = 64 / 60;
  const HORA_INI = 13, HORA_FIM = 21;

  const est = { semana: segundaDe(new Date()), dia: null, param: '|' };
  const navegar = () => { if (location.hash !== '#/agenda') location.hash = '#/agenda'; else Sis.desenhar(true); };

  /* ---------- dados ---------- */
  function categorias() {
    const l = store.dados(T, 'categoria');
    const base = l.length ? l : CAT_PADRAO.map((c, i) => Object.assign({ ordem: i }, c));
    return base.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }
  function clarear(hex, p) {
    const n = parseInt(String(hex || '#4A5568').slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * p));
    return `rgb(${c.join(',')})`;
  }
  function cat(id) {
    const c = categorias().find((x) => x.id === id) || { id, nome: 'Sem categoria', cor: '#6E685E' };
    return Object.assign({ fraca: clarear(c.cor, 0.88), borda: clarear(c.cor, 0.55) }, c);
  }
  function eventos() { return store.dados(T, 'evento'); }
  /** Visitas marcadas em Clientes, mostradas como compromissos. */
  function visitas() { return Sis.comercial ? Sis.comercial.visitasAgendadas() : []; }
  function todos() {
    return eventos().concat(visitas().map((v) => ({
      id: 'vis:' + v.servicoId, data: v.data, inicio: v.hora, duracao: 60, titulo: 'Visita: ' + v.tipo,
      clienteId: v.clienteId, local: '', categoria: 'primeira-visita', obs: '', visita: true, servicoId: v.servicoId,
    })));
  }
  const doDia = (iso) => todos().filter((e) => e.data === iso).sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
  const localDe = (e) => e.local || (e.clienteId ? clientes.endereco(e.clienteId) : '');
  function proximo(depoisDe) {
    const futuros = todos().filter((e) => e.data > depoisDe).sort((a, b) => a.data.localeCompare(b.data) || minutos(a.inicio) - minutos(b.inicio));
    return futuros[0] || null;
  }
  function tarefas() {
    const l = store.dados(T, 'tarefa');
    return {
      pendentes: l.filter((t) => !t.feito).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm))),
      feitas: l.filter((t) => t.feito).sort((a, b) => String(b.feitoEm).localeCompare(String(a.feitoEm))),
    };
  }
  function alternarTarefa(id) {
    const r = store.get(T, id); if (!r) return;
    const feito = !r.dados.feito;
    store.salvar(T, id, 'tarefa', Object.assign({}, r.dados, { feito, feitoEm: feito ? new Date().toISOString() : '' }));
  }
  function numeroSemana(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
    const j4 = new Date(x.getFullYear(), 0, 4);
    return 1 + Math.round(((x - j4) / 86400000 - 3 + ((j4.getDay() + 6) % 7)) / 7);
  }
  const rotSemana = (seg) => { const f = somaDias(seg, 4); return `${seg.getDate()} de ${MESES[seg.getMonth()]} a ${f.getDate()} de ${MESES[f.getMonth()]}`; };

  Sis.agenda = { doDia, proximo, tarefas, alternarTarefa, cat, localDe, numeroSemana };
  Sis.usosCli.push((id) => ({ n: eventos().filter((e) => e.clienteId === id).length, rot: 'compromisso', plural: 'compromissos' }));

  /* ---------- semana ---------- */
  function diasDaSemana(evs) {
    const dias = [0, 1, 2, 3, 4];
    [5, 6].forEach((i) => { if (evs.some((e) => e.data === isoData(somaDias(est.semana, i)))) dias.push(i); });
    return dias;
  }
  function limites(evs) {
    let ini = HORA_INI * 60, fim = HORA_FIM * 60;
    evs.forEach((e) => { const s = minutos(e.inicio); if (s < ini) ini = Math.floor(s / 60) * 60; if (s + e.duracao > fim) fim = Math.ceil((s + e.duracao) / 60) * 60; });
    return { ini, fim: Math.min(fim, 24 * 60) };
  }
  function posicionar(evs) {
    const ord = evs.slice().sort((a, b) => minutos(a.inicio) - minutos(b.inicio) || b.duracao - a.duracao);
    const grupos = []; let g = [], fimG = -1;
    ord.forEach((e) => { const s = minutos(e.inicio); if (g.length && s >= fimG) { grupos.push(g); g = []; fimG = -1; } g.push(e); fimG = Math.max(fimG, s + e.duracao); });
    if (g.length) grupos.push(g);
    grupos.forEach((gr) => {
      const cols = [];
      gr.forEach((e) => { const s = minutos(e.inicio); let i = cols.findIndex((f) => f <= s); if (i < 0) { cols.push(s + e.duracao); i = cols.length - 1; } else cols[i] = s + e.duracao; e._c = i; });
      gr.forEach((e) => { e._n = cols.length; });
    });
    return ord;
  }

  function render(el, partes, params) {
    const marca = (params.s || '') + '|' + (params.d || '');
    if (marca !== est.param) {
      est.param = marca;
      if (params.s) { est.semana = segundaDe(deISO(params.s)); est.dia = null; }
      if (params.d) { est.semana = segundaDe(deISO(params.d)); est.dia = (deISO(params.d).getDay() + 6) % 7; }
    }
    if (partes[0] === 'tarefas') { renderTarefas(el); return; }
    const kSem = isoData(est.semana);
    const fimSem = isoData(somaDias(est.semana, 6));
    const evs = todos().filter((e) => e.data >= kSem && e.data <= fimSem);
    const dias = diasDaSemana(evs);
    const hoje = hojeISO();
    if (est.dia === null || !dias.includes(est.dia)) {
      const hd = (new Date().getDay() + 6) % 7;
      est.dia = kSem === isoData(segundaDe(new Date())) && dias.includes(hd) ? hd : 0;
    }
    const lim = limites(evs);
    const nPend = tarefas().pendentes.length;
    const ehAtual = kSem === isoData(segundaDe(new Date()));

    let regua = '<div class="esp"></div>';
    for (let m = lim.ini; m < lim.fim; m += 60) regua += `<div class="ag-hora" style="height:${60 * PX}px"><span>${hhmm(m)}</span></div>`;
    regua += `<div class="ag-hora" style="height:0"><span>${hhmm(lim.fim)}</span></div>`;

    let abas = '', cols = '';
    dias.forEach((i) => {
      const d = somaDias(est.semana, i), iso = isoData(d);
      const doD = posicionar(evs.filter((e) => e.data === iso));
      const ehHoje = iso === hoje;
      abas += `<button class="ag-aba ${ehHoje ? 'hoje' : ''}" data-a="ag-dia" data-i="${i}" aria-selected="${i === est.dia}"><small>${DIAS[d.getDay()].slice(0, 3)}</small><b>${d.getDate()}</b><i>${'<em></em>'.repeat(Math.min(doD.length, 4))}</i></button>`;
      let faixas = '';
      for (let m = lim.ini; m < lim.fim; m += 60) faixas += `<div class="ag-faixa" style="height:${60 * PX}px" data-a="ag-novo" data-data="${iso}" data-hora="${hhmm(m)}"></div>`;
      let agora = '';
      if (ehHoje) { const n = new Date().getHours() * 60 + new Date().getMinutes(); if (n >= lim.ini && n <= lim.fim) agora = `<div class="ag-agora" style="top:${(n - lim.ini) * PX}px"></div>`; }
      const blocos = doD.map((e) => {
        const c = cat(e.categoria);
        const s = minutos(e.inicio);
        const larg = 100 / e._n;
        const sub = [clientes.nome(e.clienteId), e.local].filter(Boolean)[0] || '';
        return `<button class="ag-ev ${e.duracao < 45 ? 'curto' : e.duracao < 60 ? 'medio' : ''}${e.visita ? 'visita' : ''}" data-a="ag-abrir" data-id="${esc(e.id)}"
          style="top:${(s - lim.ini) * PX + 1}px;height:${Math.max(e.duracao * PX - 3, 22)}px;left:calc(${e._c * larg}% + 3px);width:calc(${larg}% - 6px);--cf:${c.fraca};--cb:${c.borda}">
          <div class="h">${e.inicio} às ${hhmm(s + e.duracao)}</div><div class="t">${esc(e.titulo)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</button>`;
      }).join('');
      cols += `<section class="ag-dia ${i === est.dia ? '' : 'oculto'} ${ehHoje ? 'hoje' : ''}"><div class="ag-dtopo"><small>${DIAS[d.getDay()]}</small><b>${d.getDate()}</b></div>
        <div class="ag-pista">${faixas}${agora}${blocos}</div></section>`;
    });

    el.innerHTML = `
      <div class="ag-topo">
        <div class="ag-sem">
          <button class="btn icon" data-a="ag-sem" data-d="-7" aria-label="Semana anterior">${icone('esq')}</button>
          <div class="rot"><b>${rotSemana(est.semana)}</b><small>Semana ${numeroSemana(est.semana)} de ${est.semana.getFullYear()}, ${evs.length} ${evs.length === 1 ? 'compromisso' : 'compromissos'}</small></div>
          <button class="btn icon" data-a="ag-sem" data-d="7" aria-label="Próxima semana">${icone('dir')}</button>
          ${ehAtual ? '' : '<button class="btn sm" data-a="ag-hoje">Hoje</button>'}
        </div>
        <div class="actions">
          <div class="seg"><a href="#/agenda" class="on">Semana</a><a href="#/agenda/tarefas">A fazer ${nPend ? `<span class="cont">${nPend}</span>` : ''}</a></div>
          <button class="btn icon" data-a="ag-semanas" aria-label="Todas as semanas" title="Todas as semanas">${icone('lista')}</button>
          <button class="btn primary so-pc" data-a="ag-novo">${icone('mais')}Novo compromisso</button>
        </div>
      </div>
      <nav class="ag-abas">${abas}</nav>
      <div class="ag-quadro"><div class="ag-regua">${regua}</div><div class="ag-dias">${cols}</div></div>
      <button class="btn primary so-cel ag-fab" data-a="ag-novo">${icone('mais')}Compromisso</button>`;
  }

  /* ---------- formulário de compromisso ---------- */
  function htmlCats(sel) {
    return categorias().map((c) => `<button type="button" class="cat" data-cat="${esc(c.id)}" aria-pressed="${c.id === sel}" style="--cf:${clarear(c.cor, 0.88)};--cb:${c.cor}"><span class="sq" style="background:${c.cor}"></span>${esc(c.nome)}</button>`).join('')
      + '<button type="button" class="cat add" data-cat-add="1">+ Nova</button>';
  }
  function formulario(ev, preset = {}) {
    const editando = ev && ev.id;
    const e = Object.assign({ data: preset.data || isoData(somaDias(est.semana, est.dia || 0)), inicio: preset.hora || '13:00', duracao: 60, titulo: '', clienteId: '', local: '', categoria: categorias()[0].id, obs: '' }, ev || {});
    let catSel = e.categoria;
    let corNova = PALETA.find((p) => !categorias().some((c) => c.cor.toUpperCase() === p)) || PALETA[0];
    let seletor;
    const botoes = [];
    if (editando) botoes.push({ rot: 'Excluir', classe: 'danger', esq: true, acao: (m) => { store.excluir(T, e.id); m.fechar(); ui.toast('Compromisso excluído.'); Sis.desenhar(true); } });
    botoes.push({ rot: 'Cancelar' }, { rot: 'Salvar', classe: 'primary', acao: salvar });

    function salvar(m) {
      const el = m.el;
      const titulo = $('[name=titulo]', el).value.trim();
      if (!titulo) { $('[name=titulo]', el).classList.add('erro'); $('[name=titulo]', el).focus(); ui.toast('Dê um título ao compromisso.'); return; }
      const erro = seletor.validar();
      if (erro) { ui.toast(erro); seletor.focar(); return; }
      const data = $('[name=data]', el).value;
      if (!data) { ui.toast('Informe a data.'); return; }
      const v = seletor.valor();
      const dados = {
        data, inicio: $('[name=inicio]', el).value || '13:00', duracao: Math.max(5, parseInt($('[name=duracao]', el).value, 10) || 60),
        titulo, clienteId: v.clienteId, local: v.local, categoria: catSel, obs: $('[name=obs]', el).value.trim(),
      };
      store.salvar(T, editando ? e.id : idCurto(), 'evento', dados);
      m.fechar();
      est.semana = segundaDe(deISO(data)); est.dia = (deISO(data).getDay() + 6) % 7;
      ui.toast(editando ? 'Compromisso atualizado.' : 'Compromisso criado.');
      Sis.desenhar(true);
    }

    ui.abrirModal({
      titulo: editando ? 'Editar compromisso' : 'Novo compromisso', botoes,
      corpo: `<label class="f req"><span>Título</span><input class="inp" name="titulo" value="${esc(e.titulo)}" placeholder="Vistoria de fachada" autocomplete="off" ${editando ? '' : 'autofocus'}></label>
        <div class="grid3">
          <label class="f"><span>Data</span><input class="inp" type="date" name="data" value="${esc(e.data)}"></label>
          <label class="f"><span>Início</span><input class="inp" type="time" step="300" name="inicio" value="${esc(e.inicio)}"></label>
          <label class="f"><span>Duração (min)</span><input class="inp" type="number" min="5" step="5" name="duracao" value="${e.duracao}"></label>
        </div>
        <div class="durs">${DURACOES.map((d) => `<button type="button" class="dur" data-dur="${d}" aria-pressed="${d === e.duracao}">${duracaoTexto(d)}</button>`).join('')}</div>
        <div class="f"><span class="small" style="font-weight:500;color:var(--ink-2)">Categoria</span><div class="cats" data-q="cats">${htmlCats(catSel)}</div></div>
        <div class="caixa" data-q="novacat" hidden>
          <label class="f"><span>Nome da nova categoria</span><input class="inp" data-q="catnome" placeholder="Laudo de recebimento"></label>
          <div class="paleta" data-q="paleta"></div>
          <div class="actions"><button type="button" class="btn sm" data-q="catcancela">Cancelar</button><button type="button" class="btn sm primary" data-q="catsalva">Criar categoria</button></div>
          <div class="cat-minhas" data-q="minhas"></div>
        </div>
        <div data-q="cliente"></div>
        <label class="f"><span>Observações</span><textarea class="inp" name="obs" rows="2" placeholder="O que levar, com quem falar, pendências">${esc(e.obs)}</textarea></label>
        ${editando ? `<div class="actions"><button type="button" class="btn sm" data-q="mapa">${icone('mapa')}Abrir no mapa</button><button type="button" class="btn sm" data-q="repetir">${icone('repetir')}Repetir na próxima semana</button><button type="button" class="btn sm" data-q="duplicar">${icone('copiar')}Duplicar</button></div>` : ''}`,
      aoAbrir: (el, m) => {
        const q = (s) => $(`[data-q="${s}"]`, el);
        seletor = Sis.seletorCliente(q('cliente'), { clienteId: e.clienteId, local: e.local, outroLocal: true, rotulo: 'Cliente ou obra' });
        el.addEventListener('click', (ev2) => {
          const d = ev2.target.closest('[data-dur]');
          if (d) { $('[name=duracao]', el).value = d.dataset.dur; $$('.dur', el).forEach((x) => x.setAttribute('aria-pressed', x === d)); return; }
          const c = ev2.target.closest('[data-cat]');
          if (c) { catSel = c.dataset.cat; $$('[data-cat]', el).forEach((x) => x.setAttribute('aria-pressed', x === c)); return; }
          if (ev2.target.closest('[data-cat-add]')) { const cx = q('novacat'); cx.hidden = !cx.hidden; pintarPaleta(); pintarMinhas(); if (!cx.hidden) q('catnome').focus(); return; }
          const tom = ev2.target.closest('[data-tom]');
          if (tom) { corNova = tom.dataset.tom; pintarPaleta(); return; }
          const rem = ev2.target.closest('[data-rem]');
          if (rem) { removerCat(rem.dataset.rem); return; }
          const s = ev2.target.closest('[data-q]'); if (!s) return;
          if (s.dataset.q === 'catcancela') q('novacat').hidden = true;
          if (s.dataset.q === 'catsalva') criarCat();
          if (s.dataset.q === 'mapa') ui.abrirMapa(seletor.enderecoEfetivo());
          if (s.dataset.q === 'repetir' || s.dataset.q === 'duplicar') {
            const novo = Object.assign({}, e); delete novo.id;
            if (s.dataset.q === 'repetir') novo.data = isoData(somaDias(deISO(e.data), 7));
            else novo.inicio = hhmm(Math.min(minutos(e.inicio) + e.duracao, 23 * 60));
            store.salvar(T, idCurto(), 'evento', novo);
            m.fechar(); ui.toast(s.dataset.q === 'repetir' ? 'Repetido na próxima semana.' : 'Compromisso duplicado.'); Sis.desenhar(true);
          }
        });
        $('[name=duracao]', el).addEventListener('input', (ev2) => { const v = +ev2.target.value; $$('.dur', el).forEach((x) => x.setAttribute('aria-pressed', +x.dataset.dur === v)); });
        function pintarPaleta() { q('paleta').innerHTML = PALETA.map((p) => `<button type="button" class="tom" data-tom="${p}" aria-pressed="${p === corNova}" style="background:${p}" aria-label="Cor"></button>`).join(''); }
        function pintarMinhas() {
          const pad = CAT_PADRAO.map((c) => c.id);
          q('minhas').innerHTML = categorias().filter((c) => !pad.includes(c.id)).map((c) => `<span><i class="sq" style="background:${c.cor}"></i>${esc(c.nome)}<button type="button" class="btn icon" style="padding:2px" data-rem="${esc(c.id)}" aria-label="Remover ${esc(c.nome)}">${icone('fechar')}</button></span>`).join('');
        }
        function persistirPadrao() {
          if (store.lista(T, 'categoria').length) return;
          store.gravar(T, CAT_PADRAO.map((c, i) => ({ id: c.id, tipo: 'categoria', dados: { nome: c.nome, cor: c.cor, ordem: i } })), { silencioso: true });
        }
        function criarCat() {
          const nome = q('catnome').value.trim();
          if (!nome) { q('catnome').focus(); return; }
          const id = norm(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat' + Date.now();
          if (categorias().some((c) => c.id === id)) { ui.toast('Já existe uma categoria com esse nome.'); return; }
          persistirPadrao();
          store.salvar(T, id, 'categoria', { nome, cor: corNova, ordem: categorias().length });
          catSel = id; q('cats').innerHTML = htmlCats(catSel); q('novacat').hidden = true; q('catnome').value = '';
          ui.toast('Categoria criada.');
        }
        function removerCat(id) {
          if (eventos().some((x) => x.categoria === id)) { ui.toast('Essa categoria está em uso em algum compromisso.'); return; }
          store.excluir(T, id);
          if (catSel === id) catSel = categorias()[0].id;
          q('cats').innerHTML = htmlCats(catSel); pintarMinhas();
        }
      },
    });
  }

  function abrirVisita(id) {
    const sid = id.replace(/^vis:/, '');
    const s = Sis.comercial && Sis.comercial.servico(sid);
    if (!s) return;
    const c = clientes.get(s.clienteId) || { nome: '?', endereco: '' };
    ui.abrirModal({
      titulo: 'Visita: ' + s.tipo, sub: `${esc(c.nome)}${c.endereco ? '<br>' + esc(c.endereco) : ''}`,
      corpo: `<p class="small muted" style="margin:0">Visita marcada em Clientes. Remarcar aqui atualiza lá também.</p>
        <div class="grid2"><label class="f"><span>Data</span><input class="inp" type="date" name="data" value="${esc(s.dataVisita)}"></label>
        <label class="f"><span>Horário</span><input class="inp" type="time" name="hora" value="${esc(s.horaVisita || '09:00')}"></label></div>`,
      botoes: [
        { rot: 'Ver em Clientes', esq: true, acao: (m) => { m.fechar(); Sis.ir('#/clientes?c=' + s.clienteId); } },
        { rot: 'Visita feita', acao: (m) => { Sis.comercial.mudarEtapa(sid, 'enviar'); m.fechar(); ui.toast('Visita feita. O orçamento foi para "a enviar".'); Sis.desenhar(true); } },
        { rot: 'Remarcar', classe: 'primary', acao: (m) => {
          const data = $('[name=data]', m.el).value, hora = $('[name=hora]', m.el).value || '09:00';
          if (!data) { ui.toast('Informe a data.'); return; }
          Sis.comercial.remarcar(sid, data, hora); m.fechar(); ui.toast('Visita remarcada.'); Sis.desenhar(true);
        } },
      ],
    });
  }

  function painelSemanas() {
    const mapa = {};
    eventos().forEach((e) => { const k = isoData(segundaDe(deISO(e.data))); mapa[k] = (mapa[k] || 0) + 1; });
    const atual = isoData(segundaDe(new Date())), prox = isoData(somaDias(segundaDe(new Date()), 7));
    [atual, prox].forEach((k) => { if (!(k in mapa)) mapa[k] = 0; });
    const chaves = Object.keys(mapa).sort().reverse();
    ui.abrirModal({
      titulo: 'Semanas', folha: true,
      corpo: `<ul class="lista-sem">${chaves.map((k) => { const d = deISO(k); return `<li><button data-sem="${k}" class="${k === atual ? 'atual' : ''}"><span><b>${rotSemana(d)}${k === atual ? ', atual' : ''}</b><br><small class="muted">Semana ${numeroSemana(d)} de ${d.getFullYear()}</small></span><span class="qtd">${mapa[k]}</span></button></li>`; }).join('')}</ul>`,
      aoAbrir: (el, m) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-sem]'); if (b) { m.fechar(); est.semana = deISO(b.dataset.sem); est.dia = null; navegar(); } }),
    });
  }

  /* ---------- tarefas ---------- */
  let editando = null;
  function renderTarefas(el) {
    const g = tarefas();
    const linha = (t) => `<li class="tarefa ${t.feito ? 'feita' : ''}" data-tid="${esc(t.id)}">
      <button class="ck ${t.feito ? 'on' : ''}" data-a="ag-tf-marcar" data-id="${esc(t.id)}" aria-label="${t.feito ? 'Reabrir' : 'Concluir'}">${icone('check')}</button>
      ${editando === t.id ? `<input class="inp" data-tf-edit="${esc(t.id)}" value="${esc(t.texto)}">` : `<button class="txt" data-a="ag-tf-editar" data-id="${esc(t.id)}">${esc(t.texto)}</button>`}
      <button class="btn icon" data-a="ag-tf-apagar" data-id="${esc(t.id)}" aria-label="Apagar">${icone('fechar')}</button></li>`;
    el.innerHTML = `
      <div class="ag-topo"><div class="ag-sem"><div class="rot"><b>A fazer</b><small>${g.pendentes.length} ${g.pendentes.length === 1 ? 'pendência' : 'pendências'}</small></div></div>
        <div class="actions"><div class="seg"><a href="#/agenda">Semana</a><a href="#/agenda/tarefas" class="on">A fazer ${g.pendentes.length ? `<span class="cont">${g.pendentes.length}</span>` : ''}</a></div></div></div>
      <form class="add-tarefa" data-tf-form onsubmit="return false"><input class="inp" data-tf-nova placeholder="O que precisa ser feito" autocomplete="off"><button class="btn primary" type="submit">${icone('mais')}Adicionar</button></form>
      ${!g.pendentes.length && !g.feitas.length ? '<div class="empty" style="max-width:720px"><b>Nenhuma pendência anotada</b>Escreva acima e toque em Adicionar.</div>' : ''}
      <ul class="tarefas">${g.pendentes.map(linha).join('')}</ul>
      ${g.feitas.length ? `<div class="divisor"><span>Concluídas (${g.feitas.length})</span><hr><button class="link" data-a="ag-tf-limpar">Limpar</button></div><ul class="tarefas">${g.feitas.map(linha).join('')}</ul>` : ''}`;
    $('[data-tf-form]', el).addEventListener('submit', () => {
      const inp = $('[data-tf-nova]', el); const texto = inp.value.trim();
      if (!texto) { inp.focus(); return; }
      store.salvar(T, 't' + idCurto(), 'tarefa', { texto, feito: false, criadoEm: new Date().toISOString(), feitoEm: '' });
      renderTarefas(el); $('[data-tf-nova]', el).focus();
    });
    const ed = $('[data-tf-edit]', el);
    if (ed) {
      ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length);
      let fim = false;
      const encerrar = (guardar) => {
        if (fim) return; fim = true;
        const r = store.get(T, editando); const txt = ed.value.trim();
        if (guardar && r && txt && txt !== r.dados.texto) store.salvar(T, r.id, 'tarefa', Object.assign({}, r.dados, { texto: txt }));
        editando = null; renderTarefas(el);
      };
      ed.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); encerrar(true); } if (e.key === 'Escape') { e.preventDefault(); encerrar(false); } });
      ed.addEventListener('blur', () => setTimeout(() => encerrar(true), 100));
    }
  }

  /* ---------- ações ---------- */
  const A = Sis.acoes;
  A['ag-sem'] = (b) => { est.semana = somaDias(est.semana, +b.dataset.d); est.dia = null; navegar(); };
  A['ag-hoje'] = () => { est.semana = segundaDe(new Date()); est.dia = null; navegar(); };
  A['ag-dia'] = (b) => { est.dia = +b.dataset.i; Sis.desenhar(true); };
  A['ag-novo'] = (b) => formulario(null, { data: b.dataset.data, hora: b.dataset.hora });
  A['ag-abrir'] = (b) => {
    if (b.dataset.id.startsWith('vis:')) { abrirVisita(b.dataset.id); return; }
    const r = store.get(T, b.dataset.id); if (r) formulario(Object.assign({ id: r.id }, r.dados));
  };
  A['ag-semanas'] = painelSemanas;
  A['ag-tf-marcar'] = (b) => { alternarTarefa(b.dataset.id); Sis.desenhar(true); };
  A['ag-tf-editar'] = (b) => { editando = b.dataset.id; renderTarefas($('#conteudo')); };
  A['ag-tf-apagar'] = (b) => { store.excluir(T, b.dataset.id); Sis.desenhar(true); };
  A['ag-tf-limpar'] = () => { const f = tarefas().feitas; store.gravar(T, f.map((t) => ({ id: t.id, tipo: 'tarefa', dados: store.get(T, t.id).dados, excluido: true }))); ui.toast(`${f.length} ${f.length === 1 ? 'concluída removida' : 'concluídas removidas'}.`); Sis.desenhar(true); };
  Sis.agenda.novoCompromisso = (preset) => formulario(null, preset || {});
  Sis.agenda.abrir = (id) => A['ag-abrir']({ dataset: { id } });

  Sis.modulo({
    id: 'agenda', nome: 'Agenda', desc: 'Compromissos e tarefas', icone: 'agenda', sistema: true, render,
    buscar(t) {
      const hoje = hojeISO();
      return eventos().filter((e) => norm(e.titulo).includes(t) || norm(clientes.nome(e.clienteId)).includes(t))
        .sort((a, b) => Math.abs(deISO(a.data) - deISO(hoje)) - Math.abs(deISO(b.data) - deISO(hoje))).slice(0, 4)
        .map((e) => ({ tipo: 'Agenda', titulo: e.titulo, sub: `${dataBR(e.data)} às ${e.inicio}${e.clienteId ? ', ' + clientes.nome(e.clienteId) : ''}`, rota: '#/agenda?d=' + e.data }));
    },
  });
  setInterval(() => { if (Sis.rota().mod === 'agenda' && !ui.modalAberto() && !Sis.rota().partes.length) Sis.desenhar(true); }, 60000);
  void DIAS_LONGOS;
})();
