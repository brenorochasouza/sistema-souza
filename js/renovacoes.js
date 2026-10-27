'use strict';
/* =========================================================
   Renovações: laudos recorrentes entregues (SPDA, inspeção
   predial, fachada, AVCB...) e quando renovar. O lembrete vai
   para a Google Agenda 90 dias antes da renovação.
   Fica na tabela "comercial", tipo "laudo", grupo = cliente.
   ========================================================= */
(function () {
  const { $, $$, esc, norm, hojeISO, deISO, isoData, somaDias, dataBR } = Sis.util;
  const { store, ui, icone, clientes } = Sis;
  const T = 'comercial';
  const TIPO = 'laudo';
  const ANTECEDENCIA = 90;
  const TIPOS = ['Laudo de SPDA', 'Inspeção Predial', 'Inspeção de Fachada', 'AVCB'];
  const A = Sis.acoes;
  const est = { filtro: 'atencao', busca: '' };

  /* ---------------- dados ---------------- */
  const laudos = () => store.dados(T, TIPO);
  const laudo = (id) => { const r = store.get(T, id); return r && r.tipo === TIPO ? Object.assign({ id: r.id }, r.dados) : null; };
  function salvar(l) {
    const d = Object.assign({}, l); delete d.id;
    store.salvar(T, l.id, TIPO, d, l.clienteId || null);
  }
  const ativo = (l) => !l.situacao || l.situacao === 'ativo';
  /** Data de entrega + anos (29/02 vira 28/02 quando o ano não é bissexto). */
  function somaAnos(iso, anos) {
    const [a, m, d] = iso.split('-').map(Number);
    const fim = new Date(a + anos, m, 0).getDate();
    return isoData(new Date(a + anos, m - 1, Math.min(d, fim)));
  }
  /** Anos entre entrega e renovação, para laudos gravados antes do campo existir. */
  const anosDe = (l) => (l.anos ? l.anos : l.entrega && l.renovacao ? Math.max(1, Math.round((deISO(l.renovacao) - deISO(l.entrega)) / 31557600000)) : '');
  /** Depois de salvar, mostra a lista em que o laudo aparece. */
  const filtroDe = (l) => { const k = situacao(l).k; est.filtro = k === 'contatar' || k === 'vencido' ? 'atencao' : 'todos'; };
  const diasAte = (iso, hoje = hojeISO()) => Math.round((deISO(iso) - deISO(hoje)) / 86400000);
  /** Dia do contato: 90 dias antes da renovação. */
  const dataContato = (l) => isoData(somaDias(deISO(l.renovacao), -ANTECEDENCIA));
  /** Dia do lembrete na agenda: o do contato, ou amanhã se esse dia já passou. */
  function dataLembrete(l) {
    const c = dataContato(l), amanha = isoData(somaDias(new Date(), 1));
    return c > hojeISO() ? c : amanha;
  }
  function situacao(l) {
    if (l.situacao === 'renovado') return { k: 'renovado', txt: `Renovado${l.renovadoEm ? ' em ' + dataBR(l.renovadoEm) : ''}`, cls: 'ok' };
    if (l.situacao === 'encerrado') return { k: 'encerrado', txt: 'Não renovou', cls: 'neutro' };
    const d = diasAte(l.renovacao);
    const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
    if (d < 0) return { k: 'vencido', d, txt: `Vencido há ${dias(-d)}`, cls: 'estourado' };
    if (d <= ANTECEDENCIA) return { k: 'contatar', d, txt: d === 0 ? 'Vence hoje' : `Vence em ${dias(d)}`, cls: 'atencao' };
    return { k: 'emdia', d, txt: `Contato em ${dataBR(dataContato(l))}`, cls: 'previsto' };
  }
  const nomeCli = (l) => clientes.nome(l.clienteId) || 'Cliente removido do cadastro';
  function contagem() {
    const ativos = laudos().filter(ativo).map((l) => situacao(l).k);
    return { contatar: ativos.filter((k) => k === 'contatar').length, vencido: ativos.filter((k) => k === 'vencido').length, emdia: ativos.filter((k) => k === 'emdia').length };
  }

  /* ---------------- Google Agenda ---------------- */
  function linkAgenda(l) {
    const c = clientes.get(l.clienteId);
    const dia = dataLembrete(l).replace(/-/g, '');
    const titulo = `Renovar ${l.tipo}: ${c ? c.nome : 'cliente'}`;
    const det = [
      `Renovação do laudo em ${dataBR(l.renovacao)}.`,
      `Laudo entregue em ${dataBR(l.entrega)}.`,
      l.obs ? `Observação: ${l.obs}` : '',
      'Sistema Souza: https://breno.souzaengenharia.com/#/renovacoes',
    ].filter(Boolean).join('\n');
    let u = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo)
      + '&dates=' + dia + 'T090000/' + dia + 'T093000&ctz=America/Bahia&details=' + encodeURIComponent(det);
    if (c && c.endereco) u += '&location=' + encodeURIComponent(c.endereco);
    return u;
  }
  function abrirAgenda(id) {
    const l = laudo(id); if (!l) return;
    window.open(linkAgenda(l), '_blank', 'noopener');
    l.agendaEm = hojeISO(); l.agendaPara = dataLembrete(l);
    salvar(l);
    if (Sis.rota().mod === 'renovacoes') Sis.desenhar(true);
  }
  function oferecerAgenda(id, titulo) {
    const l = laudo(id); if (!l) return;
    const passou = dataContato(l) <= hojeISO();
    ui.abrirModal({
      titulo, sub: esc(`${nomeCli(l)} · ${l.tipo}`),
      corpo: `<p class="msg">${passou
        ? `A renovação (${dataBR(l.renovacao)}) está a menos de ${ANTECEDENCIA} dias. O lembrete fica para amanhã, <b>${dataBR(dataLembrete(l))}</b>, às 9h.`
        : `O lembrete entra na sua Google Agenda em <b>${dataBR(dataLembrete(l))}</b>, às 9h, ${ANTECEDENCIA} dias antes da renovação (${dataBR(l.renovacao)}).`}</p>
        <p class="small muted" style="margin:0">A Google Agenda abre com o evento preenchido. É só salvar.</p>`,
      botoes: [{ rot: 'Agora não' }, { rot: 'Adicionar na Google Agenda', classe: 'primary', icone: 'agenda', acao: (m) => { m.fechar(); abrirAgenda(id); } }],
    });
  }

  /* ---------------- tela ---------------- */
  function itemHTML(l) {
    const s = situacao(l), at = ativo(l);
    const agendado = at && l.agendaEm && l.agendaPara === dataLembrete(l);
    return `<div class="rn-it ${s.k}">
      <div class="rn-cli"><b>${esc(nomeCli(l))}</b><span>${esc(l.tipo)}${l.obs ? ` · ${esc(l.obs)}` : ''}</span></div>
      <div class="rn-dt"><span><small>Entregue</small>${dataBR(l.entrega) || '-'}</span><span><small>Renovação${anosDe(l) ? ` (${anosDe(l)} ${anosDe(l) === 1 ? 'ano' : 'anos'})` : ''}</small><b>${dataBR(l.renovacao) || '-'}</b></span></div>
      <div class="rn-st"><span class="chip ${s.cls}">${esc(s.txt)}</span>${at && l.contatoEm ? `<small>${icone('check')}Contatado em ${dataBR(l.contatoEm)}</small>` : ''}</div>
      <div class="rn-ac">${at ? `
        <button class="btn icon ${agendado ? 'rn-ok' : ''}" data-a="rn-agenda" data-id="${esc(l.id)}" title="${agendado ? `Lembrete enviado para a agenda (${dataBR(l.agendaPara)})` : 'Adicionar lembrete na Google Agenda'}" aria-label="Google Agenda">${icone('agenda')}</button>
        <button class="btn icon ${l.contatoEm ? 'rn-ok' : ''}" data-a="rn-contato" data-id="${esc(l.id)}" title="${l.contatoEm ? 'Desmarcar contato' : 'Marcar como contatado hoje'}" aria-label="Contatado">${icone('check')}</button>
        <button class="btn sm" data-a="rn-renovar" data-id="${esc(l.id)}">${icone('repetir')}Registrar renovação</button>` : ''}
        <button class="btn icon" data-a="rn-editar" data-id="${esc(l.id)}" aria-label="Editar" title="Editar">${icone('editar')}</button></div>
    </div>`;
  }
  function render(el) {
    const todos = laudos();
    const hoje = hojeISO(), ano = hoje.slice(0, 4);
    const c = contagem();
    const renovAno = todos.filter((l) => l.situacao === 'renovado' && String(l.renovadoEm || '').startsWith(ano)).length;
    const t = norm(est.busca);
    const F = {
      atencao: (l) => ativo(l) && ['contatar', 'vencido'].includes(situacao(l).k),
      emdia: (l) => ativo(l) && situacao(l).k === 'emdia',
      todos: (l) => ativo(l),
      historico: (l) => !ativo(l),
    };
    const vis = todos.filter(F[est.filtro] || F.atencao)
      .filter((l) => !t || norm(nomeCli(l) + ' ' + l.tipo + ' ' + (l.obs || '')).includes(t))
      .sort((a, b) => (est.filtro === 'historico' ? String(b.renovacao).localeCompare(String(a.renovacao)) : String(a.renovacao).localeCompare(String(b.renovacao))));
    const segs = [['atencao', 'Contatar', c.contatar + c.vencido], ['emdia', 'Em dia', c.emdia], ['todos', 'Todos ativos', c.contatar + c.vencido + c.emdia], ['historico', 'Histórico', todos.filter((l) => !ativo(l)).length]];
    const vazio = {
      atencao: todos.length ? `Nenhum laudo vence nos próximos ${ANTECEDENCIA} dias.` : 'Registre os laudos recorrentes que você entrega para acompanhar as renovações.',
      emdia: 'Nenhum laudo em dia.', todos: 'Nenhum laudo ativo.', historico: 'Laudos renovados ou não renovados aparecem aqui.',
    };
    el.innerHTML = `<div class="pagehead"><div><h1>Renovações</h1><p>Laudos recorrentes entregues e quando renovar</p></div>
        <div class="actions"><button class="btn primary" data-a="rn-novo">${icone('mais')}Laudo entregue</button></div></div>
      <div class="o-painel rn-painel">
        <div class="${c.contatar ? 'al' : ''}"><span>A contatar (próx. ${ANTECEDENCIA} dias)</span><b>${c.contatar}</b></div>
        <div class="${c.vencido ? 'vc' : ''}"><span>Vencidos</span><b>${c.vencido}</b></div>
        <div><span>Em dia</span><b>${c.emdia}</b></div>
        <div><span>Renovados em ${ano}</span><b>${renovAno}</b></div>
      </div>
      <div class="o-filtros"><div class="seg">${segs.map(([k, n, q]) => `<button data-a="rn-filtro" data-f="${k}" class="${est.filtro === k ? 'on' : ''}">${n}${q ? ` <span class="o-q">${q}</span>` : ''}</button>`).join('')}</div>
        <div class="o-busca">${icone('busca')}<input class="inp" id="rn-busca" placeholder="Buscar cliente ou laudo" value="${esc(est.busca)}" autocomplete="off"></div></div>
      ${vis.length ? `<div class="rn-lista">${vis.map(itemHTML).join('')}</div>`
        : `<div class="card"><div class="empty"><b>${t ? 'Nada encontrado' : 'Tudo em ordem'}</b>${t ? 'Tente outro nome.' : vazio[est.filtro]}
          ${!todos.length ? `<div class="actions" style="justify-content:center;margin-top:14px"><button class="btn primary" data-a="rn-novo">${icone('mais')}Laudo entregue</button></div>` : ''}</div></div>`}`;
    const inp = $('#rn-busca', el);
    inp.addEventListener('input', () => {
      est.busca = inp.value;
      const pos = inp.selectionStart;
      render(el);
      const n = $('#rn-busca', el); n.focus(); n.setSelectionRange(pos, pos);
    });
  }
  A['rn-filtro'] = (b) => { est.filtro = b.dataset.f; Sis.desenhar(true); };

  /* ---------------- novo e editar ---------------- */
  function camposLaudo(l, { renovacaoSo = false } = {}) {
    const usados = [...new Set(TIPOS.concat(laudos().map((x) => x.tipo).filter(Boolean)))];
    return `${renovacaoSo ? '' : `<div id="rn-cli"></div>
      <div class="f"><span class="rn-rot">Laudo</span><div class="tipos">${TIPOS.map((t) => `<button type="button" class="tipo ${l.tipo === t ? 'on' : ''}" data-tipo="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <input class="inp" name="tipo" list="rn-tipos" value="${esc(l.tipo || '')}" placeholder="Ou digite outro laudo"><datalist id="rn-tipos">${usados.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>`}
      <div class="grid2">
        <label class="f req"><span>Data de entrega</span><input class="inp" type="date" name="entrega" value="${esc(l.entrega || '')}"></label>
        <label class="f req"><span>Renovar a cada (anos)</span><input class="inp" name="anos" inputmode="numeric" value="${esc(l.anos || '')}" placeholder="Ex.: 1" autocomplete="off"></label>
      </div>
      <div class="rn-anos">${[1, 2, 3, 5].map((n) => `<button type="button" class="tipo ${String(l.anos) === String(n) ? 'on' : ''}" data-anos="${n}">${n} ${n === 1 ? 'ano' : 'anos'}</button>`).join('')}</div>
      <p class="small muted rn-aviso" data-aviso></p>
      <label class="f"><span>Observação</span><input class="inp" name="obs" value="${esc(l.obs || '')}" placeholder="Opcional. Ex.: torres A e B"></label>`;
  }
  function ligarCampos(el, l, renovacaoSo) {
    const q = (n) => $(`[name=${n}]`, el);
    let sel = null;
    if (!renovacaoSo) {
      sel = Sis.seletorCliente($('#rn-cli', el), { clienteId: l.clienteId || '', rotulo: 'Cliente', obrigatorio: true });
      $$('[data-tipo]', el).forEach((b) => b.addEventListener('click', () => { q('tipo').value = b.dataset.tipo; $$('[data-tipo]', el).forEach((x) => x.classList.toggle('on', x === b)); }));
      q('tipo').addEventListener('input', () => $$('[data-tipo]', el).forEach((x) => x.classList.toggle('on', x.dataset.tipo === q('tipo').value)));
    }
    const aviso = $('[data-aviso]', el);
    const lerAnos = () => { const t = q('anos').value.trim(); return /^\d{1,2}$/.test(t) && +t >= 1 ? +t : null; };
    const atualizar = () => {
      const n = lerAnos(), e = q('entrega').value;
      $$('[data-anos]', el).forEach((x) => x.classList.toggle('on', +x.dataset.anos === n));
      if (!n || !e) { aviso.innerHTML = q('anos').value.trim() && !n ? '<span class="aviso-campo">Informe os anos em número inteiro, como 1 ou 5.</span>' : ''; return; }
      const x = { renovacao: somaAnos(e, n) };
      aviso.innerHTML = `Renovação em <b>${dataBR(x.renovacao)}</b>. ` + (dataContato(x) > hojeISO() ? `Lembrete de contato em ${dataBR(dataContato(x))}, ${ANTECEDENCIA} dias antes.` : `Já está dentro dos ${ANTECEDENCIA} dias: o laudo entra direto em "Contatar".`);
    };
    $$('[data-anos]', el).forEach((b) => b.addEventListener('click', () => { q('anos').value = b.dataset.anos; atualizar(); }));
    q('anos').addEventListener('input', atualizar); q('entrega').addEventListener('input', atualizar); atualizar();
    return {
      ler() {
        const v = { entrega: q('entrega').value, anos: lerAnos(), obs: q('obs').value.trim() };
        if (!renovacaoSo) {
          const erro = sel.validar(); if (erro) { ui.toast(erro); return null; }
          v.clienteId = sel.valor().clienteId;
          v.tipo = q('tipo').value.trim();
          if (!v.tipo) { q('tipo').classList.add('erro'); ui.toast('Escolha ou digite o laudo.'); return null; }
        }
        if (!v.entrega) { q('entrega').classList.add('erro'); ui.toast('Informe a data de entrega.'); return null; }
        if (!v.anos) { q('anos').classList.add('erro'); ui.toast('Informe em quantos anos o laudo precisa ser renovado.'); return null; }
        v.renovacao = somaAnos(v.entrega, v.anos);
        return v;
      },
    };
  }
  A['rn-novo'] = () => {
    let f;
    ui.abrirModal({
      titulo: 'Laudo recorrente entregue', sub: 'O sistema calcula a renovação e manda o lembrete para a Google Agenda 90 dias antes.',
      corpo: camposLaudo({ entrega: hojeISO() }),
      aoAbrir: (el) => { f = ligarCampos(el, {}, false); },
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Salvar', classe: 'primary', acao: (m) => {
          const v = f.ler(); if (!v) return;
          const id = Sis.util.idCurto();
          const novo = Object.assign({ id, situacao: 'ativo', criadoEm: new Date().toISOString() }, v);
          if (!novo.obs) delete novo.obs;
          salvar(novo); filtroDe(novo);
          m.fechar(); Sis.desenhar(true);
          oferecerAgenda(id, 'Laudo registrado');
        },
      }],
    });
  };
  A['rn-editar'] = (b) => {
    const l = laudo(b.dataset.id); if (!l) return;
    const at = ativo(l);
    const ant = [];
    for (let x = l.anteriorId && laudo(l.anteriorId); x && ant.length < 20; x = x.anteriorId && laudo(x.anteriorId)) ant.push(x);
    let f;
    const botoes = [{ rot: 'Excluir', classe: 'danger', esq: true, icone: 'lixo', acao: async (m) => {
      if (!(await ui.confirmar({ titulo: 'Excluir este registro?', msg: `${nomeCli(l)} · ${l.tipo}, renovação em ${dataBR(l.renovacao)}.`, ok: 'Excluir', perigo: true }))) return;
      store.excluir(T, l.id); m.fechar(); Sis.desenhar(true); ui.toast('Registro excluído.');
    } }];
    if (at) botoes.push({ rot: 'Não vai renovar', acao: async (m) => {
      if (!(await ui.confirmar({ titulo: 'Marcar como não renovado?', msg: 'O laudo sai da lista de contatos e vai para o Histórico.', ok: 'Marcar' }))) return;
      Object.assign(l, { situacao: 'encerrado', encerradoEm: hojeISO() }); salvar(l); m.fechar(); Sis.desenhar(true); ui.toast('Movido para o Histórico.');
    } });
    else botoes.push({ rot: 'Reativar', acao: (m) => { Object.assign(l, { situacao: 'ativo' }); delete l.encerradoEm; salvar(l); m.fechar(); Sis.desenhar(true); ui.toast('Laudo reativado.'); } });
    botoes.push({ rot: 'Cancelar' }, {
      rot: 'Salvar', classe: 'primary', acao: (m) => {
        const v = f.ler(); if (!v) return;
        const mudouData = v.renovacao !== l.renovacao;
        Object.assign(l, v); if (!v.obs) delete l.obs;
        salvar(l); if (ativo(l)) filtroDe(l); m.fechar(); Sis.desenhar(true);
        if (mudouData && ativo(l)) oferecerAgenda(l.id, 'Data de renovação alterada');
        else ui.toast('Laudo atualizado.');
      },
    });
    ui.abrirModal({
      titulo: 'Editar laudo', sub: at ? '' : esc(situacao(l).txt),
      corpo: camposLaudo(Object.assign({}, l, { anos: anosDe(l) })) + (ant.length ? `<div class="rn-hist"><span class="secao-form">Ciclos anteriores</span>${ant.map((x) => `<div><span>${esc(x.tipo)}</span><span>entregue em ${dataBR(x.entrega)}</span></div>`).join('')}</div>` : ''),
      aoAbrir: (el) => { f = ligarCampos(el, l, false); },
      botoes,
    });
  };
  A['rn-renovar'] = (b) => {
    const l = laudo(b.dataset.id); if (!l) return;
    let f;
    ui.abrirModal({
      titulo: 'Registrar renovação', sub: esc(`${nomeCli(l)} · ${l.tipo}`),
      corpo: `<p class="small muted" style="margin:0">Laudo atual entregue em ${dataBR(l.entrega)}, renovação prevista para ${dataBR(l.renovacao)}. Informe a entrega do novo laudo.</p>`
        + camposLaudo({ entrega: hojeISO(), anos: anosDe(l), obs: l.obs }, { renovacaoSo: true }),
      aoAbrir: (el) => { f = ligarCampos(el, l, true); },
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Registrar', classe: 'primary', acao: (m) => {
          const v = f.ler(); if (!v) return;
          const id = Sis.util.idCurto();
          const novo = Object.assign({ id, clienteId: l.clienteId, tipo: l.tipo, situacao: 'ativo', anteriorId: l.id, criadoEm: new Date().toISOString() }, v);
          if (!novo.obs) delete novo.obs;
          salvar(novo);
          Object.assign(l, { situacao: 'renovado', renovadoEm: v.entrega, proximoId: id });
          salvar(l); filtroDe(novo);
          m.fechar(); Sis.desenhar(true);
          oferecerAgenda(id, 'Renovação registrada');
        },
      }],
    });
  };
  A['rn-agenda'] = (b) => abrirAgenda(b.dataset.id);
  A['rn-contato'] = (b) => {
    const l = laudo(b.dataset.id); if (!l) return;
    if (l.contatoEm) delete l.contatoEm; else l.contatoEm = hojeISO();
    salvar(l); Sis.desenhar(true);
    ui.toast(l.contatoEm ? 'Contato registrado hoje.' : 'Contato desmarcado.');
  };

  /* ---------------- card do Início ---------------- */
  function cardInicio() {
    const lista = laudos().filter(ativo).map((l) => ({ l, s: situacao(l) })).filter((x) => x.s.k === 'contatar' || x.s.k === 'vencido')
      .sort((a, b) => String(a.l.renovacao).localeCompare(String(b.l.renovacao)));
    if (!laudos().length) return '';
    const sem = lista.filter((x) => !x.l.contatoEm).length;
    return `<section class="card ord-3"><div class="ini-h"><h2>Renovações</h2><a href="#/renovacoes">${lista.length ? `${lista.length} para contatar` : 'Laudos'}</a></div><div class="bd">
      ${lista.length ? lista.slice(0, 5).map(({ l, s }) => `<a class="lin" href="#/renovacoes" style="text-decoration:none;color:inherit">
        <div style="min-width:0;flex:1"><div class="tit">${esc(nomeCli(l))}</div><div class="sub">${esc(l.tipo)}${l.contatoEm ? ` · contatado em ${dataBR(l.contatoEm)}` : ''}</div></div>
        <div class="dir"><span class="chip ${s.cls}">${esc(s.k === 'vencido' ? s.txt : dataBR(l.renovacao))}</span></div></a>`).join('')
        + (lista.length > 5 ? `<div class="ini-prox"><a href="#/renovacoes">Mais ${lista.length - 5}</a></div>` : '')
        + (sem && sem < lista.length ? `<div class="ini-prox">${sem} ainda sem contato</div>` : '')
        : `<div class="ini-vazio">Nenhum laudo vence nos próximos ${ANTECEDENCIA} dias.</div>`}
    </div></section>`;
  }

  /* ---------------- registro ---------------- */
  Sis.renovacoes = { cardInicio, laudos, contagem };
  Sis.usosCli.push((id) => ({ n: laudos().filter((l) => l.clienteId === id).length, rot: 'laudo recorrente', plural: 'laudos recorrentes' }));
  Sis.modulo({
    id: 'renovacoes', nome: 'Renovações', desc: 'Laudos recorrentes', icone: 'repetir', sistema: true, render,
    buscar(t) {
      return laudos().filter((l) => norm(nomeCli(l) + ' ' + l.tipo).includes(t)).slice(0, 3)
        .map((l) => ({ tipo: 'Renovação', titulo: `${l.tipo}: ${nomeCli(l)}`, sub: `${situacao(l).txt} · renovação em ${dataBR(l.renovacao)}`, rota: '#/renovacoes' }));
    },
  });
})();
