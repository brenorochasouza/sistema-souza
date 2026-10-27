'use strict';
/* =========================================================
   Início: o resumo do dia com o que importa dos sistemas.
   ========================================================= */
(function () {
  const { $, esc, brl, brl0, hojeISO, deISO, somaDias, isoData, DIAS, dataCurta, minutos, hhmm, duracaoTexto, diasDesde, dataLonga } = Sis.util;
  const { icone, clientes, ui } = Sis;

  function cardHoje() {
    const hoje = hojeISO();
    const lista = Sis.agenda.doDia(hoje);
    const agora = new Date().getHours() * 60 + new Date().getMinutes();
    const linhas = lista.map((e) => {
      const c = Sis.agenda.cat(e.categoria);
      const fim = minutos(e.inicio) + e.duracao;
      const sub = e.clienteId ? clientes.nome(e.clienteId) : e.local;
      return `<div class="lin" role="button" tabindex="0" data-a="ini-ev" data-id="${esc(e.id)}" style="cursor:pointer">
        <div class="hora"><b>${e.inicio}</b><small>${duracaoTexto(e.duracao)}</small></div><span class="marco ${fim < agora ? 'feito' : ''}"></span>
        <div style="min-width:0;flex:1"><div class="tit">${esc(e.titulo)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}<span class="cat-et"><span class="sq" style="background:${c.cor}"></span>${esc(c.nome)}</span></div></div>`;
    }).join('');
    const prox = Sis.agenda.proximo(hoje);
    let txtProx = '';
    if (prox) {
      const d = deISO(prox.data);
      const diff = Math.round((d - deISO(hoje)) / 86400000);
      const quando = diff === 1 ? 'amanhã' : diff < 7 ? DIAS[d.getDay()] : dataCurta(prox.data);
      txtProx = `Próximo: ${quando} às ${prox.inicio}, ${esc(prox.titulo)}`;
    }
    return `<section class="card ord-1"><div class="ini-h"><h2>Hoje</h2><a href="#/agenda">${lista.length ? `${lista.length} ${lista.length === 1 ? 'compromisso' : 'compromissos'}` : 'Agenda'}</a></div>
      <div class="bd">${linhas || `<div class="ini-vazio">Nenhum compromisso hoje. <button class="link" data-a="ini-novo">Marcar um compromisso</button></div>`}
      ${txtProx ? `<div class="ini-prox">${txtProx}</div>` : ''}</div></section>`;
  }

  function cardTarefas() {
    const { pendentes } = Sis.agenda.tarefas();
    const mostrar = pendentes.slice(0, 5);
    return `<section class="card ord-2"><div class="ini-h"><h2>A fazer</h2><a href="#/agenda/tarefas">${pendentes.length ? pendentes.length : 'Abrir'}</a></div>
      <div class="bd">${mostrar.length ? mostrar.map((t) => `<div class="lin"><button class="ck" data-a="ini-tarefa" data-id="${esc(t.id)}" aria-label="Concluir">${icone('check')}</button><div style="min-width:0">${esc(t.texto)}</div></div>`).join('')
        + (pendentes.length > 5 ? `<div class="ini-prox"><a href="#/agenda/tarefas">Mais ${pendentes.length - 5} ${pendentes.length - 5 === 1 ? 'tarefa' : 'tarefas'}</a></div>` : '')
        : '<div class="ini-vazio">Nenhuma pendência. <a href="#/agenda/tarefas">Anotar uma tarefa</a></div>'}</div></section>`;
  }

  function cardComercial() {
    const r = Sis.comercial.resumo();
    const parados = r.parados.slice(0, 4);
    return `<section class="card ord-3"><div class="ini-h"><h2>Comercial</h2><a href="#/clientes">Clientes</a></div><div class="bd">
      <div class="nums3"><a href="#/clientes?aba=v"><b>${r.aMarcar}</b><span>visitas a marcar</span></a><a href="#/clientes?aba=e"><b>${r.enviar}</b><span>orçamentos a enviar</span></a><a href="#/clientes?aba=a"><b>${r.aberto}</b><span>em aberto</span></a></div>
      ${parados.length ? `<div class="subt">Em aberto há mais de 7 dias</div>${parados.map((s) => `<a class="lin" href="#/clientes?c=${esc(s.clienteId)}" style="text-decoration:none;color:inherit">
        <div style="min-width:0;flex:1"><div class="tit">${esc(clientes.nome(s.clienteId))}</div><div class="sub">${esc(s.tipo)}</div></div><div class="dir sub n">${diasDesde(s.mudouEm)} dias</div></a>`).join('')}
        ${r.parados.length > 4 ? `<div class="ini-prox"><a href="#/clientes?aba=a">Mais ${r.parados.length - 4} em aberto há mais de 7 dias</a></div>` : ''}` : ''}
    </div></section>`;
  }

  function cardParcelas() {
    const v = Sis.comercial.parcelasVencidas();
    if (!v.length) return '';
    const total = v.reduce((a, p) => a + p.valor, 0);
    return `<section class="card ord-4"><div class="ini-h"><h2>Parcelas vencidas</h2><a href="#/clientes?aba=c">Contratos</a></div><div class="bd">
      <div class="ini-total"><b>${brl(total)}</b><span class="small muted">${v.length} ${v.length === 1 ? 'parcela' : 'parcelas'} a receber</span></div>
      ${v.slice(0, 6).map((p) => `<div class="lin"><button class="ck" data-a="ini-parcela" data-id="${esc(p.servicoId)}" data-i="${p.i}" aria-label="Marcar como recebida" title="Marcar como recebida">${icone('check')}</button>
        <div style="min-width:0;flex:1"><div class="tit">${esc(clientes.nome(p.clienteId))}</div><div class="sub">${esc(p.desc)}, venceu em ${dataCurta(p.venc)}</div></div><div class="dir n">${brl(p.valor)}</div></div>`).join('')}
    </div></section>`;
  }

  function cardObras() {
    const lista = Sis.obrasResumo ? Sis.obrasResumo() : [];
    return `<section class="card ord-5"><div class="ini-h"><h2>Obras em andamento</h2><a href="#/obras">${lista.length || 'Obras'}</a></div><div class="bd">
      ${lista.length ? lista.map((o) => `<a class="ini-obra" href="#/obras/${esc(o.id)}/painel">
        <div style="display:flex;justify-content:space-between;gap:10px"><div style="min-width:0"><div class="tit">${esc(o.nome)}</div><div class="sub">${esc(o.cliente)}</div></div><b class="n" style="font-weight:500">${Math.round(o.pct * 100)}%</b></div>
        <div class="barra-prog"><i style="width:${Math.min(100, o.pct * 100)}%"></i></div>
        <div class="sub n">${brl0(o.lancado)} lançados de ${brl0(o.orcado)}</div>
        ${o.aPagar7 > 0.004 ? `<div class="sub n" style="color:var(--warn);margin-top:2px">${brl(o.aPagar7)} a pagar nos próximos 7 dias</div>` : ''}</a>`).join('')
        : '<div class="ini-vazio">Nenhuma obra em andamento.</div>'}
    </div></section>`;
  }

  function render(el) {
    el.innerHTML = `<div class="ini-topo"><h1>${dataLonga(new Date())}</h1>
      <div class="busca">${icone('busca')}<input class="inp" id="ini-busca" placeholder="Buscar cliente, obra ou nota" autocomplete="off"><div class="busca-caixa" id="ini-caixa" hidden></div></div></div>
      <div class="ini">
        <div class="ini-col">${cardHoje()}${cardComercial()}${cardParcelas()}</div>
        <div class="ini-col">${cardTarefas()}${cardObras()}</div>
      </div>`;
    Sis.ligarBusca($('#ini-busca', el), $('#ini-caixa', el));
  }

  const A = Sis.acoes;
  A['ini-tarefa'] = (b) => { Sis.agenda.alternarTarefa(b.dataset.id); ui.toast('Tarefa concluída.'); Sis.desenhar(true); };
  A['ini-parcela'] = (b) => { Sis.comercial.marcarParcela(b.dataset.id, +b.dataset.i, true); ui.toast('Parcela marcada como recebida.'); Sis.desenhar(true); };
  A['ini-ev'] = (b) => Sis.agenda.abrir(b.dataset.id);
  A['ini-novo'] = () => Sis.agenda.novoCompromisso({ data: hojeISO(), hora: hhmm(Math.min(20 * 60, Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * 60)) });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.a === 'ini-ev') A['ini-ev'](e.target); });

  Sis.modulo({ id: 'inicio', nome: 'Início', icone: 'inicio', sistema: false, render });
  setInterval(() => { if (Sis.rota().mod === 'inicio' && !ui.modalAberto() && document.activeElement && document.activeElement.id !== 'ini-busca') Sis.desenhar(true); }, 60000);
  void somaDias; void isoData;
})();
