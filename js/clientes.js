'use strict';
/* =========================================================
   Clientes: carteira comercial (visitas, orçamentos, contratos
   e recebimentos) e o cadastro único de clientes.
   ========================================================= */
(function () {
  const { $, $$, esc, norm, r2, brl, hojeISO, deISO, isoData, dataCurta, dataBR, diasDesde, idCurto, kvLocal } = Sis.util;
  const { store, ui, icone, clientes } = Sis;
  const T = 'comercial';
  const TIPOS = ['Inspeção Predial', 'Inspeção de Fachada', 'AVCB', 'Impermeabilização'];

  const est = { sub: 'carteira', aba: 'v', filtro: null, rascunho: null, aExcluir: null, contrato: null, obs: {}, ultimoC: null, busca: '' };

  /* ---------- dados ---------- */
  const servicos = () => store.dados(T, 'servico');
  const servico = (id) => { const r = store.get(T, id); return r ? Object.assign({ id: r.id }, r.dados) : null; };
  function salvarServico(s, mudouEtapa = false) {
    const d = Object.assign({}, s); delete d.id;
    if (mudouEtapa) d.mudouEm = new Date().toISOString();
    store.salvar(T, s.id, 'servico', d);
  }
  const parcelasDe = (s) => (s.contrato && s.contrato.parcelas) || [];
  const quitado = (s) => s.contrato && !s.contrato.pendente && parcelasDe(s).length && parcelasDe(s).every((p) => p.pago);
  function mudarEtapa(id, etapa) {
    const s = servico(id); if (!s) return;
    s.etapa = etapa;
    if (etapa === 'agendar') s.dataVisita = '';
    salvarServico(s, true);
  }
  function remarcar(id, data, hora) {
    const s = servico(id); if (!s) return;
    s.etapa = 'agendada'; s.dataVisita = data; s.horaVisita = hora || '09:00';
    salvarServico(s, true);
  }
  function visitasAgendadas() {
    return servicos().filter((s) => s.etapa === 'agendada' && s.dataVisita)
      .map((s) => ({ servicoId: s.id, data: s.dataVisita, hora: /^\d{2}:\d{2}$/.test(s.horaVisita || '') ? s.horaVisita : '09:00', tipo: s.tipo, clienteId: s.clienteId }));
  }
  function parcelasVencidas() {
    const hoje = hojeISO(), out = [];
    servicos().filter((s) => s.etapa === 'aprovado').forEach((s) => parcelasDe(s).forEach((p, i) => {
      if (!p.pago && p.venc && p.venc < hoje) out.push({ servicoId: s.id, i, clienteId: s.clienteId, tipo: s.tipo, desc: p.desc, valor: p.valor, venc: p.venc });
    }));
    return out.sort((a, b) => a.venc.localeCompare(b.venc));
  }
  function marcarParcela(sid, i, pago) {
    const s = servico(sid); if (!s || !s.contrato) return;
    const p = s.contrato.parcelas[i]; if (!p) return;
    p.pago = pago; p.dataPago = pago ? hojeISO() : '';
    salvarServico(s);
  }
  function grupos(lista) {
    const g = {
      v: lista.filter((s) => s.etapa === 'agendar' || s.etapa === 'agendada'),
      e: lista.filter((s) => s.etapa === 'enviar'),
      a: lista.filter((s) => s.etapa === 'aberto'),
      c: lista.filter((s) => s.etapa === 'aprovado'),
      f: lista.filter((s) => s.etapa === 'recusado'),
    };
    g.v.sort((a, b) => ((a.dataVisita || '9999') < (b.dataVisita || '9999') ? -1 : 1));
    return g;
  }
  function resumo() {
    const g = grupos(servicos());
    const parados = g.a.filter((s) => diasDesde(s.mudouEm) >= 7).sort((a, b) => String(a.mudouEm).localeCompare(String(b.mudouEm)));
    return { aMarcar: g.v.filter((s) => s.etapa === 'agendar').length, visitas: g.v.length, enviar: g.e.length, aberto: g.a.length, parados };
  }

  Sis.comercial = { servicos, servico, visitasAgendadas, mudarEtapa, remarcar, parcelasVencidas, marcarParcela, resumo };
  Sis.usosCli.push((id) => ({ n: servicos().filter((s) => s.clienteId === id).length, rot: 'serviço', plural: 'serviços' }));

  /* ---------- utilidades de contrato ---------- */
  function valorDe(txt) {
    let t = String(txt || '').replace(/[^\d,.]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }
  function maisMeses(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    const alvo = new Date(a, m - 1 + n, 1);
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    alvo.setDate(Math.min(d, ultimo));
    return isoData(alvo);
  }
  function montarParcelas(f) {
    const total = valorDe(f.valor);
    if (!total) return { erro: 'Informe o valor do contrato.' };
    if (f.forma === 'parcelado') {
      const n = Math.min(60, Math.max(1, parseInt(f.n, 10) || 0));
      if (!f.primeira) return { erro: 'Informe a data do primeiro pagamento.' };
      const base = Math.floor((total * 100) / n) / 100;
      const ps = [];
      for (let i = 0; i < n; i++) ps.push({ desc: `Parcela ${i + 1} de ${n}`, valor: i === n - 1 ? r2(total - base * (n - 1)) : base, venc: maisMeses(f.primeira, i), pago: false, dataPago: '' });
      return { parcelas: ps };
    }
    if (f.forma === 'entrega') {
      const ms = f.marcos.filter((m) => m.desc.trim() || valorDe(m.pct));
      if (!ms.length) return { erro: 'Descreva ao menos um marco de entrega.' };
      return { parcelas: ms.map((m, i) => { const pct = valorDe(m.pct); return { desc: (m.desc.trim() || `Marco ${i + 1}`) + ` (${pct}%)`, valor: Math.round(total * pct) / 100, venc: '', pago: false, dataPago: '' }; }) };
    }
    return { erro: 'Escolha a forma de pagamento.' };
  }

  /* ---------- agenda do cliente: convite ---------- */
  function linkConvite(titulo, iso, hhmmV, endereco) {
    const [y, mo, d] = iso.split('-').map(Number), [h, mi] = hhmmV.split(':').map(Number);
    const ini = new Date(y, mo - 1, d, h, mi), fim = new Date(ini.getTime() + 3600000);
    const f = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}T${String(x.getHours()).padStart(2, '0')}${String(x.getMinutes()).padStart(2, '0')}00`;
    let u = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) + '&dates=' + f(ini) + '/' + f(fim) + '&ctz=America/Bahia';
    if (endereco) u += '&location=' + encodeURIComponent(endereco);
    return u;
  }
  function compartilhar(titulo, url) {
    if (navigator.share) { navigator.share({ title: titulo, text: titulo, url }).catch(() => {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => ui.toast('Link do convite copiado.')).catch(() => ui.toast('Não foi possível copiar o link.'));
  }

  /* ---------- render ---------- */
  function render(el, partes, params) {
    if (params.c && params.c !== est.ultimoC) { est.ultimoC = params.c; est.filtro = params.c; est.sub = 'carteira'; }
    if (!params.c) est.ultimoC = null;
    if (params.aba && params.aba !== est.ultimoAba) { est.ultimoAba = params.aba; est.aba = params.aba; est.filtro = null; }
    if (!params.aba) est.ultimoAba = null;
    est.sub = partes[0] === 'cadastro' ? 'cadastro' : 'carteira';
    const cab = `<div class="pagehead"><div><h1>Clientes</h1><p>${est.sub === 'cadastro' ? 'Cadastro único usado por todos os sistemas' : 'Visitas, orçamentos e contratos'}</p></div>
      <div class="actions"><div class="seg"><a href="#/clientes" class="${est.sub === 'carteira' ? 'on' : ''}">Carteira</a><a href="#/clientes/cadastro" class="${est.sub === 'cadastro' ? 'on' : ''}">Cadastro</a></div>
      ${est.sub === 'cadastro' ? `<button class="btn primary" data-a="cl-cad-novo">${icone('mais')}Novo cliente</button>` : ''}</div></div>`;
    if (est.sub === 'cadastro') { el.innerHTML = cab + htmlCadastro(); ligarCadastro(el); return; }

    let lista = servicos();
    if (est.filtro && !clientes.get(est.filtro)) est.filtro = null;
    if (est.filtro) lista = lista.filter((s) => s.clienteId === est.filtro);
    lista.sort((a, b) => new Date(a.mudouEm) - new Date(b.mudouEm));
    const g = grupos(lista);
    const todos = grupos(servicos());

    let contratado = 0, aReceber = 0, recebidoMes = 0, vencido = 0;
    const mes = hojeISO().slice(0, 7), hoje = hojeISO();
    todos.c.forEach((s) => {
      parcelasDe(s).forEach((p) => { contratado += p.valor; if (p.pago) { if ((p.dataPago || '').slice(0, 7) === mes) recebidoMes += p.valor; } else { aReceber += p.valor; if (p.venc && p.venc < hoje) vencido += p.valor; } });
      if (s.contrato && s.contrato.pendente) contratado += Number(s.contrato.valor) || 0;
    });

    const proxVenc = (s) => parcelasDe(s).filter((p) => !p.pago && p.venc).map((p) => p.venc).sort()[0] || '9999';
    const ativos = g.c.filter((s) => !quitado(s)).sort((a, b) => (proxVenc(a) < proxVenc(b) ? -1 : 1));
    const quites = g.c.filter(quitado);
    const foco = quites.some((s) => (est.contrato && est.contrato.sid === s.id) || est.aExcluir === s.id);
    // Recusados ficam recolhidos no fim de "Em aberto", como os contratos quitados
    const focoRec = g.f.some((s) => est.aExcluir === s.id || est.obs[s.id]);
    if (est.aba === 'f') est.aba = 'a';
    const recusados = g.f.length ? `<details class="quit" ${focoRec ? 'open' : ''}><summary>${g.f.length} ${g.f.length === 1 ? 'orçamento recusado' : 'orçamentos recusados'}</summary><div class="cl-cards">${g.f.map(card).join('')}</div></details>` : '';
    const VAZIO = {
      v: 'Nenhuma visita na fila. Cadastre um serviço na barra acima.',
      e: 'Nenhum orçamento esperando ser escrito. Quando uma visita for feita, ela aparece aqui.',
      a: 'Nenhum orçamento aguardando resposta.',
      c: 'Nenhum contrato ativo. Ao aprovar um orçamento, você registra o contrato e ele aparece aqui.',
    };
    const col = (k, cls, titulo, n, corpo) => `<section class="cl-col ${cls} ${est.aba === k ? 'sel' : ''}"><div class="cl-coltopo"><h2>${titulo}</h2><span>${n}</span></div>${corpo}</section>`;
    const cartoes = (k) => (g[k].length ? `<div class="cl-cards">${g[k].map(card).join('')}</div>` : `<p class="cl-vazio">${VAZIO[k]}</p>`);

    const fc = est.filtro ? clientes.get(est.filtro) : null;
    el.innerHTML = cab + `
      <div class="cl-painel">
        <div><b>${todos.v.length}</b><span>Visitas</span></div>
        <div><b>${todos.e.length}</b><span>A enviar</span></div>
        <div><b>${todos.a.length}</b><span>Em aberto</span></div>
        <div><b class="din">${brl(contratado)}</b><span>Contratado</span></div>
        <div><b class="din">${brl(aReceber)}</b><span>A receber${vencido > 0.004 ? `, ${brl(vencido)} vencido` : ''}</span></div>
        <div><b class="din">${brl(recebidoMes)}</b><span>Recebido no mês</span></div>
      </div>
      <div class="cl-cmd">
        <div class="cl-campo">${icone('busca')}<input id="cl-busca" placeholder="Nome do condomínio" autocomplete="off" spellcheck="false" value="${esc(est.busca)}">
          <button class="btn icon" data-a="cl-mic" id="cl-mic" title="Ditar" aria-label="Ditar" hidden>${icone('mic')}</button>
          <button class="btn icon" data-a="cl-ia" id="cl-ia" title="Ditar um novo serviço com IA" aria-label="Ditar com IA" hidden>${icone('ia')}</button></div>
        <div class="cl-achados" id="cl-achados" hidden></div>
      </div>
      ${est.rascunho ? htmlNovo() : ''}
      ${fc ? `<div class="filtro">Mostrando só ${esc(fc.nome)}<button data-a="cl-semfiltro" aria-label="Remover filtro">${icone('fechar')}</button></div>` : ''}
      <nav class="cl-abas">${[['v', 'Visitas', g.v.length], ['e', 'A enviar', g.e.length], ['a', 'Em aberto', g.a.length], ['c', 'Contratos', ativos.length]].map(([k, r, n]) => `<button class="cl-aba" data-a="cl-aba" data-k="${k}" aria-selected="${est.aba === k}">${r} ${n}</button>`).join('')}</nav>
      <div class="cl-board">
        ${col('v', 'v', 'Visitas', g.v.length, cartoes('v'))}
        ${col('e', 'e', 'Orçamentos a enviar', g.e.length, cartoes('e'))}
        ${col('a', 'a', 'Orçamentos em aberto', g.a.length, cartoes('a') + recusados)}
        ${col('c', 'c larga', 'Contratos', ativos.length, (g.c.length ? `<div class="cl-resumo"><div><b>${brl(aReceber)}</b><span>A receber</span></div><div class="vc"><b>${brl(vencido)}</b><span>Vencido</span></div><div class="rc"><b>${brl(recebidoMes)}</b><span>Recebido no mês</span></div></div>` : '')
          + (ativos.length ? `<div class="cl-cards">${ativos.map(contratoHtml).join('')}</div>` : `<p class="cl-vazio">${VAZIO.c}</p>`)
          + (quites.length ? `<details class="quit" ${foco ? 'open' : ''}><summary>${quites.length} ${quites.length === 1 ? 'contrato quitado' : 'contratos quitados'}</summary><div class="cl-cards">${quites.map(contratoHtml).join('')}</div></details>` : ''))}
      </div>`;
    ligarComando(el);
    if (est.rascunho) ligarNovo(el);
    if (est.contrato) { ligarContrato(el); atualizarPrevia(el); }
  }

  /* ---------- cartões ---------- */
  function card(s) {
    const c = clientes.get(s.clienteId) || { nome: '?', endereco: '' };
    if (est.aExcluir === s.id) return confirmaHtml(s, c);
    if (est.contrato && est.contrato.sid === s.id) return formContratoHtml(s, c);
    const d = diasDesde(s.mudouEm);
    const meta = [];
    if (s.etapa === 'agendada') {
      const atrasada = s.dataVisita && s.dataVisita < hojeISO();
      meta.push(`<span class="${atrasada ? 'tarde' : ''}">Visita ${dataCurta(s.dataVisita)}${s.horaVisita ? ' às ' + s.horaVisita : ''}${atrasada ? ', já passou' : ''}</span>`);
    } else if (s.etapa === 'recusado') meta.push('<span>Recusado</span>');
    else if (s.etapa !== 'aprovado') {
      const cobrar = s.etapa === 'aberto' && d >= 7;
      meta.push(`<span class="${cobrar ? 'tarde' : ''}">Parado há ${d} ${d === 1 ? 'dia' : 'dias'}${cobrar ? ', cobrar' : ''}</span>`);
    }
    if (c.endereco) meta.push(`<span>${esc(c.endereco)}</span>`);
    let acs = '';
    if (s.etapa === 'agendar') {
      acs = `<div class="agendar"><input class="inp" type="date" data-vdata="${s.id}" value="${hojeISO()}"><input class="inp" type="time" data-vhora="${s.id}" value="${esc(s.horaVisita || '09:00')}" style="max-width:120px"><button class="btn sm suave" data-a="cl-marcar" data-id="${s.id}">Marcar visita</button></div>`;
    } else if (s.etapa === 'agendada') {
      acs = `<button class="btn sm suave" data-a="cl-etapa" data-e="enviar" data-id="${s.id}">Visita feita</button><button class="btn sm" data-a="cl-etapa" data-e="agendar" data-id="${s.id}">Remarcar</button>`;
    } else if (s.etapa === 'enviar') {
      acs = `<button class="btn sm suave" data-a="cl-etapa" data-e="aberto" data-id="${s.id}">Orçamento enviado</button>`;
    } else if (s.etapa === 'aberto') {
      acs = `<button class="btn sm suave" data-a="cl-aprovar" data-id="${s.id}">Aprovado</button><button class="btn sm" data-a="cl-etapa" data-e="recusado" data-id="${s.id}">Recusado</button>`;
    } else {
      acs = `<button class="btn sm" data-a="cl-etapa" data-e="aberto" data-id="${s.id}">Reabrir</button>`;
    }
    const links = s.etapa === 'agendada' && s.dataVisita ? `<div class="linkrow"><button class="btn sm ghost" data-a="cl-convite" data-id="${s.id}">${icone('compartilhar')}Enviar convite</button>${c.endereco ? `<button class="btn sm ghost" data-a="cl-mapa" data-id="${s.id}">${icone('mapa')}Mapa</button>` : ''}</div>` : '';
    return `<article class="cc ${s.etapa === 'recusado' ? 'fim' : ''}">
      <h4>${esc(c.nome)}</h4><div class="srv">${esc(s.tipo)}</div>
      <div class="meta">${meta.join('')}</div>${links}
      ${obsHtml(s)}
      <div class="acs">${acs}<span class="dir"><button class="btn icon" data-a="cl-obs" data-id="${s.id}" title="Observação" aria-label="Observação">${icone('editar')}</button><button class="btn icon" data-a="cl-excluir" data-id="${s.id}" title="Excluir" aria-label="Excluir">${icone('lixo')}</button></span></div>
    </article>`;
  }
  function obsHtml(s) {
    if (est.obs[s.id]) return `<div><textarea class="inp" data-obs="${s.id}" rows="3" placeholder="Anotações da visita, contato, detalhes">${esc(s.obs || '')}</textarea><div class="actions" style="margin-top:6px"><button class="btn sm primary" data-a="cl-obs-salvar" data-id="${s.id}">Salvar observação</button><button class="btn sm" data-a="cl-obs" data-id="${s.id}">Cancelar</button></div></div>`;
    return s.obs ? `<div class="obs">${esc(s.obs)}</div>` : '';
  }
  function confirmaHtml(s, c) {
    return `<article class="cc"><h4>${esc(c.nome)}</h4><div class="srv">${esc(s.tipo)}</div>
      <div class="meta"><span class="tarde">Excluir este serviço da carteira?</span></div>
      <div class="acs"><button class="btn sm primary perigo" data-a="cl-excluir-ok" data-id="${s.id}">Excluir</button><button class="btn sm" data-a="cl-excluir-nao">Manter</button></div></article>`;
  }
  function contratoHtml(s) {
    const c = clientes.get(s.clienteId) || { nome: '?' };
    if (est.aExcluir === s.id) return confirmaHtml(s, c);
    if (est.contrato && est.contrato.sid === s.id) return formContratoHtml(s, c);
    const ct = s.contrato;
    if (!ct || ct.pendente) {
      return `<article class="cc"><h4>${esc(c.nome)}</h4><div class="srv">${esc(s.tipo)}</div>
        <div class="meta"><span class="tarde">Contrato ainda sem dados de pagamento</span></div>${obsHtml(s)}
        <div class="acs"><button class="btn sm suave" data-a="cl-contrato" data-id="${s.id}">Preencher contrato</button><span class="dir"><button class="btn icon" data-a="cl-obs" data-id="${s.id}" aria-label="Observação">${icone('editar')}</button><button class="btn icon" data-a="cl-excluir" data-id="${s.id}" aria-label="Excluir">${icone('lixo')}</button></span></div></article>`;
    }
    const total = ct.parcelas.reduce((a, p) => a + p.valor, 0);
    const rec = ct.parcelas.filter((p) => p.pago).reduce((a, p) => a + p.valor, 0);
    const hoje = hojeISO();
    const linhas = ct.parcelas.map((p, i) => {
      const atras = !p.pago && p.venc && p.venc < hoje;
      const q = p.pago ? 'Recebido em ' + dataBR(p.dataPago) : p.venc ? 'Vence ' + dataBR(p.venc) + (atras ? ', vencida' : '') : 'Aguardando a entrega';
      return `<li class="parc ${p.pago ? 'pago' : ''} ${atras ? 'venc' : ''}"><button class="ck ${p.pago ? 'on' : ''}" data-a="cl-parcela" data-id="${s.id}" data-i="${i}" aria-label="Marcar ${esc(p.desc)} como recebida">${icone('check')}</button>
        <span class="pd">${esc(p.desc)}<span class="pq">${q}</span></span><span class="pv">${brl(p.valor)}</span></li>`;
    }).join('');
    return `<article class="cc"><h4>${esc(c.nome)}</h4><div class="srv">${esc(s.tipo)}</div>
      <div class="meta"><span>${brl(total)}, ${ct.forma === 'parcelado' ? 'parcelado' : 'por entrega'}</span><span>Recebido ${brl(rec)}</span></div>
      <div class="prog"><i style="width:${total ? (rec / total) * 100 : 0}%"></i></div>
      <ul class="parcs">${linhas}</ul>${obsHtml(s)}
      <div class="acs"><button class="btn sm" data-a="cl-contrato" data-id="${s.id}">Refazer contrato</button><button class="btn sm ghost" data-a="cl-renovar" data-id="${s.id}" title="Criar este serviço de novo para o próximo ciclo">${icone('repetir')}Renovar</button>
        <span class="dir"><button class="btn icon" data-a="cl-obs" data-id="${s.id}" aria-label="Observação">${icone('editar')}</button><button class="btn icon" data-a="cl-excluir" data-id="${s.id}" aria-label="Excluir">${icone('lixo')}</button></span></div></article>`;
  }

  /* ---------- contrato ---------- */
  function abrirContrato(s) {
    const ct = s.contrato || {};
    est.contrato = { sid: s.id, valor: ct.valor ? String(ct.valor).replace('.', ',') : '', forma: ct.pendente ? '' : ct.forma || '', n: '2', primeira: hojeISO(), marcos: [{ desc: '', pct: '' }] };
    Sis.desenhar(true);
    setTimeout(() => { const e = $('#cf-valor'); if (e) e.focus(); }, 30);
  }
  function formContratoHtml(s, c) {
    const f = est.contrato;
    let corpo = '';
    if (f.forma === 'parcelado') {
      corpo = `<div class="grid2"><label class="f"><span>Quantas parcelas</span><input class="inp" id="cf-n" inputmode="numeric" value="${esc(f.n)}"></label>
        <label class="f"><span>Primeiro pagamento</span><input class="inp" type="date" id="cf-data" value="${esc(f.primeira)}"></label></div>`;
    } else if (f.forma === 'entrega') {
      corpo = `<div class="f"><span class="small" style="font-weight:500;color:var(--ink-2)">Marcos de entrega</span><div class="marcos" id="cf-marcos">${f.marcos.map((m, i) => `<div class="mrc"><input class="inp md" data-i="${i}" value="${esc(m.desc)}" placeholder="Assinatura do contrato"><input class="inp mp" data-i="${i}" value="${esc(m.pct)}" inputmode="decimal" placeholder="%"><button type="button" class="btn icon" data-a="cl-cf-tiramarco" data-i="${i}" aria-label="Remover marco">${icone('fechar')}</button></div>`).join('')}</div>
        <button type="button" class="btn sm" data-a="cl-cf-maismarco">${icone('mais')}Adicionar marco</button></div>`;
    }
    return `<article class="cc" style="border-color:var(--brand-100)"><h4>${esc(c.nome)}</h4><div class="srv">${esc(s.tipo)}</div>
      <div class="meta"><span>Orçamento aprovado. Registre o contrato.</span></div>
      <label class="f"><span>Valor do contrato</span><input class="inp" id="cf-valor" inputmode="decimal" value="${esc(f.valor)}" placeholder="0,00"></label>
      <div class="f"><span class="small" style="font-weight:500;color:var(--ink-2)">Forma de pagamento</span><div class="tipos"><button type="button" class="tipo ${f.forma === 'parcelado' ? 'on' : ''}" data-a="cl-cf-forma" data-f="parcelado">Parcelado</button><button type="button" class="tipo ${f.forma === 'entrega' ? 'on' : ''}" data-a="cl-cf-forma" data-f="entrega">Por entrega</button></div></div>
      ${corpo}
      <p class="previa" id="cf-previa"></p>
      <div class="acs"><button class="btn sm primary" data-a="cl-cf-salvar">Salvar contrato</button><button class="btn sm" data-a="cl-cf-depois">Preencher depois</button><button class="btn sm ghost" data-a="cl-cf-cancelar">Cancelar</button></div></article>`;
  }
  function capturar() {
    const f = est.contrato; if (!f) return;
    if ($('#cf-valor')) f.valor = $('#cf-valor').value;
    if ($('#cf-n')) f.n = $('#cf-n').value;
    if ($('#cf-data')) f.primeira = $('#cf-data').value;
    $$('#cf-marcos .md').forEach((e) => { f.marcos[e.dataset.i].desc = e.value; });
    $$('#cf-marcos .mp').forEach((e) => { f.marcos[e.dataset.i].pct = e.value; });
  }
  function atualizarPrevia() {
    const el = $('#cf-previa'); if (!el || !est.contrato) return;
    capturar();
    const r = montarParcelas(est.contrato);
    el.classList.remove('erro');
    if (r.erro) { el.textContent = est.contrato.forma ? r.erro : ''; el.classList.toggle('erro', !!est.contrato.forma); return; }
    let txt = r.parcelas.map((p) => `${p.desc}: ${brl(p.valor)}${p.venc ? ' em ' + dataBR(p.venc) : ''}`).join('\n');
    if (est.contrato.forma === 'entrega') {
      const soma = Math.round(est.contrato.marcos.reduce((a, m) => a + valorDe(m.pct), 0) * 100) / 100;
      const falta = Math.round((100 - soma) * 100) / 100;
      txt += `\nSoma dos marcos: ${soma}%`;
      if (Math.abs(falta) > 0.009) { txt += falta > 0 ? `, faltam ${falta}%` : `, passou ${-falta}%`; el.classList.add('erro'); }
    }
    el.textContent = txt;
  }
  function ligarContrato(el) { $$('.cc input', el).forEach((i) => i.addEventListener('input', atualizarPrevia)); }

  /* ---------- barra de comando e novo serviço ---------- */
  function ligarComando(el) {
    const inp = $('#cl-busca', el), box = $('#cl-achados', el);
    function achar() {
      est.busca = inp.value;
      const t = norm(inp.value);
      if (!t) { box.hidden = true; box.innerHTML = ''; return; }
      const iguais = clientes.buscar(t, 6);
      const exato = clientes.lista().some((c) => norm(c.nome) === t);
      let h = iguais.map((c) => `<div class="cl-achado"><div style="min-width:0"><b>${ui.realce(c.nome, t)}</b><small>${esc(c.endereco || 'sem endereço')}, ${servicos().filter((s) => s.clienteId === c.id).length} serviço(s)</small></div>
        <div class="actions" style="flex-wrap:nowrap"><button class="btn sm" data-a="cl-ver" data-id="${c.id}">Ver</button><button class="btn sm primary" data-a="cl-novo" data-id="${c.id}">Novo serviço</button></div></div>`).join('');
      if (!exato) h += `<div class="cl-achado"><span class="muted">Não está no cadastro</span><button class="btn sm primary" data-a="cl-novo" data-nome="1">Cadastrar “${esc(inp.value.trim())}”</button></div>`;
      box.innerHTML = h; box.hidden = false;
    }
    inp.addEventListener('input', achar);
    inp.addEventListener('focus', achar);
    inp.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 200));
    box.addEventListener('mousedown', (e) => e.preventDefault());
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Rec) { $('#cl-mic', el).hidden = false; $('#cl-ia', el).hidden = false; }
  }
  function htmlNovo() {
    const r = est.rascunho;
    const novo = !r.clienteId;
    return `<div class="novo-srv"><h3>${novo ? 'Novo cliente e serviço' : 'Novo serviço'}</h3>
      ${novo ? `<div class="grid2"><label class="f req"><span>Cliente</span><input class="inp" id="nv-nome" value="${esc(r.nome)}"></label><label class="f"><span>Endereço</span><input class="inp" id="nv-end" value="${esc(r.endereco || '')}" placeholder="Rua, número, bairro, cidade"></label></div>`
        : `<div><b>${esc(clientes.nome(r.clienteId))}</b><div class="small muted">${esc(clientes.endereco(r.clienteId) || 'Sem endereço no cadastro')}</div></div>`}
      <div class="f"><span class="small" style="font-weight:500;color:var(--ink-2)">Serviço</span><div class="tipos">${TIPOS.map((t) => `<button type="button" class="tipo ${r.tipo === t ? 'on' : ''}" data-a="cl-tipo" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <input class="inp" id="nv-tipo" value="${esc(r.tipo)}" placeholder="Ou escreva outro serviço"></div>
      <div class="actions"><button class="btn primary" data-a="cl-novo-salvar">Adicionar à carteira</button><button class="btn" data-a="cl-novo-cancelar">Cancelar</button></div></div>`;
  }
  function ligarNovo(el) {
    const inpT = $('#nv-tipo', el);
    inpT.addEventListener('input', () => { est.rascunho.tipo = inpT.value; $$('.tipo[data-t]', el).forEach((b) => b.classList.toggle('on', b.dataset.t === inpT.value)); });
    const n = $('#nv-nome', el); if (n) n.addEventListener('input', () => { est.rascunho.nome = n.value; });
    const e = $('#nv-end', el); if (e) e.addEventListener('input', () => { est.rascunho.endereco = e.value; });
  }
  function criarServico(clienteId, tipo, extra = {}) {
    const agora = new Date().toISOString();
    store.salvar(T, idCurto(), 'servico', Object.assign({ clienteId, tipo, etapa: 'agendar', dataVisita: '', horaVisita: '', obs: '', criadoEm: agora, mudouEm: agora }, extra));
  }

  /* ---------- ditado ---------- */
  function ditar(botao, aoTexto) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec(); rec.lang = 'pt-BR'; rec.interimResults = false;
    rec.onstart = () => botao.classList.add('on');
    rec.onend = () => botao.classList.remove('on');
    rec.onerror = () => { botao.classList.remove('on'); ui.toast('Não consegui ouvir. Tente de novo ou use o microfone do teclado.'); };
    rec.onresult = (ev) => { const t = ev.results[0][0].transcript || ''; if (t) aoTexto(t); };
    try { rec.start(); } catch { ui.toast('O ditado não está disponível neste navegador.'); }
  }
  async function perguntarIA(fala, chave) {
    const agora = new Date();
    const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const p2 = (n) => String(n).padStart(2, '0');
    const rotulo = `${dias[agora.getDay()]}, ${p2(agora.getDate())}/${p2(agora.getMonth() + 1)}/${agora.getFullYear()} ${p2(agora.getHours())}:${p2(agora.getMinutes())}`;
    const prompt = 'Você organiza a carteira de clientes de uma empresa de engenharia predial que atende condomínios.\n'
      + `Agora é ${rotulo}.\n`
      + 'O usuário ditou por voz um novo serviço. Extraia os dados e responda APENAS com JSON válido, sem markdown:\n'
      + '{"nome": "nome do condomínio", "endereco": "rua ou bairro" ou null, "tipo": "tipo do serviço", "dataVisita": "AAAA-MM-DD" ou null, "horaVisita": "HH:MM" ou null}\n'
      + `Regras:\n- "tipo": se for próximo de um destes, use exatamente o texto da lista: ${TIPOS.join('; ')}. Senão, use o que foi ditado, curto e com inicial maiúscula.\n`
      + '- "nome": só o nome do condomínio ou cliente.\n- "dataVisita": resolva datas relativas a partir de agora. Sem menção de visita ou data: null.\n- Sem endereço ou horário ditado: null.\n'
      + 'Clientes já cadastrados (use exatamente o nome se o ditado se referir a um deles): ' + clientes.lista().map((c) => c.nome).join('; ') + '\n'
      + 'Ditado: ' + fala;
    let ultimoErro;
    for (const modelo of ['claude-haiku-5-5', 'claude-haiku-4-5-20251001']) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: modelo, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
      });
      if (resp.status === 404) { ultimoErro = new Error('modelo indisponível'); continue; }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const texto = (data.content || []).map((b) => b.text || '').join('').replace(/```json|```/g, '').trim();
      const i = texto.indexOf('{'), f = texto.lastIndexOf('}');
      if (i < 0 || f < 0) throw new Error('sem JSON');
      return JSON.parse(texto.slice(i, f + 1));
    }
    throw ultimoErro;
  }
  function aplicarIA(r, fala) {
    const nome = (r.nome || '').trim();
    if (!nome) { colocarNaBusca(fala); return; }
    let cli = clientes.porNome(nome) || clientes.lista().find((c) => norm(c.nome).includes(norm(nome)) || norm(nome).includes(norm(c.nome)));
    let cid = cli ? cli.id : clientes.criar(nome, r.endereco || '');
    if (cli && r.endereco && !cli.endereco) clientes.alterar(cli.id, { endereco: r.endereco.trim() });
    const temData = r.dataVisita && /^\d{4}-\d{2}-\d{2}$/.test(r.dataVisita);
    criarServico(cid, (r.tipo || 'Serviço').trim(), temData ? { etapa: 'agendada', dataVisita: r.dataVisita, horaVisita: /^\d{2}:\d{2}$/.test(r.horaVisita || '') ? r.horaVisita : '09:00' } : {});
    est.aba = 'v'; est.filtro = null;
    ui.toast(`Criado por voz: ${clientes.nome(cid)}, ${r.tipo || 'Serviço'}${temData ? ', visita ' + dataBR(r.dataVisita) : ''}`);
    Sis.desenhar(true);
  }
  function colocarNaBusca(fala) { est.busca = fala; Sis.desenhar(true); const i = $('#cl-busca'); if (i) { i.focus(); i.dispatchEvent(new Event('input')); } }

  /* ---------- cadastro ---------- */
  function htmlCadastro() {
    const t = norm(est.buscaCad || '');
    const lista = clientes.lista().filter((c) => !t || norm(c.nome).includes(t) || norm(c.endereco).includes(t));
    const uso = (id) => clientes.usos(id).map((u) => `${u.n} ${u.n === 1 ? u.rot : u.plural}`).join(', ') || 'Sem uso';
    return `<div class="cl-campo" style="margin-bottom:12px">${icone('busca')}<input id="cad-busca" placeholder="Buscar por nome ou endereço" value="${esc(est.buscaCad || '')}" autocomplete="off"></div>
      <p class="small muted" style="margin:0 0 10px">${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}. Ao corrigir um nome ou endereço aqui, a mudança vale para a agenda, a carteira e as obras.</p>
      ${lista.length ? `<div class="cad-lista">${lista.map((c) => `<div class="cad-it"><div class="tx"><b>${ui.realce(c.nome, t)}</b><small>${c.endereco ? ui.realce(c.endereco, t) : 'Sem endereço'}</small></div>
        <span class="uso">${uso(c.id)}</span><button class="btn icon" data-a="cl-cad-editar" data-id="${c.id}" aria-label="Editar">${icone('editar')}</button><button class="btn icon" data-a="cl-cad-excluir" data-id="${c.id}" aria-label="Excluir">${icone('lixo')}</button></div>`).join('')}</div>`
        : '<div class="card"><div class="empty"><b>Nenhum cliente encontrado</b>Use Novo cliente para cadastrar.</div></div>'}`;
  }
  function ligarCadastro(el) {
    const i = $('#cad-busca', el);
    i.addEventListener('input', () => { est.buscaCad = i.value; const pos = i.selectionStart; Sis.desenhar(true); const n = $('#cad-busca'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
  }

  /* ---------- ações ---------- */
  const A = Sis.acoes;
  A['cl-aba'] = (b) => { est.aba = b.dataset.k; Sis.desenhar(true); };
  A['cl-ver'] = (b) => { est.filtro = b.dataset.id; est.busca = ''; Sis.desenhar(true); };
  A['cl-semfiltro'] = () => { est.filtro = null; if (location.hash.includes('?c=')) location.hash = '#/clientes'; else Sis.desenhar(true); };
  A['cl-novo'] = (b) => {
    const nome = b.dataset.nome ? $('#cl-busca').value.trim() : '';
    est.rascunho = { clienteId: b.dataset.id || '', nome, endereco: '', tipo: '' };
    est.busca = '';
    Sis.desenhar(true);
    setTimeout(() => { const e = $('#nv-tipo'); if (e) e.focus(); }, 30);
  };
  A['cl-tipo'] = (b) => { est.rascunho.tipo = b.dataset.t; $('#nv-tipo').value = b.dataset.t; $$('.tipo[data-t]').forEach((x) => x.classList.toggle('on', x === b)); };
  A['cl-novo-cancelar'] = () => { est.rascunho = null; Sis.desenhar(true); };
  A['cl-novo-salvar'] = () => {
    const r = est.rascunho;
    const tipo = $('#nv-tipo').value.trim();
    if (!tipo) { $('#nv-tipo').focus(); ui.toast('Informe o serviço.'); return; }
    let cid = r.clienteId;
    if (!cid) {
      const nome = $('#nv-nome').value.trim();
      if (!nome) { $('#nv-nome').focus(); return; }
      const existe = clientes.porNome(nome);
      cid = existe ? existe.id : clientes.criar(nome, $('#nv-end').value);
    }
    criarServico(cid, tipo);
    est.rascunho = null; est.aba = 'v';
    ui.toast('Serviço adicionado à carteira.');
    Sis.desenhar(true);
  };
  A['cl-marcar'] = (b) => {
    const id = b.dataset.id;
    const data = $(`[data-vdata="${id}"]`).value || hojeISO();
    const hora = $(`[data-vhora="${id}"]`).value || '09:00';
    remarcar(id, data, hora);
    ui.toast('Visita marcada. Ela já aparece na agenda.');
    Sis.desenhar(true);
  };
  A['cl-etapa'] = (b) => { mudarEtapa(b.dataset.id, b.dataset.e); Sis.desenhar(true); };
  A['cl-aprovar'] = (b) => abrirContrato(servico(b.dataset.id));
  A['cl-contrato'] = (b) => abrirContrato(servico(b.dataset.id));
  A['cl-cf-forma'] = (b) => { capturar(); est.contrato.forma = b.dataset.f; Sis.desenhar(true); };
  A['cl-cf-maismarco'] = () => { capturar(); est.contrato.marcos.push({ desc: '', pct: '' }); Sis.desenhar(true); };
  A['cl-cf-tiramarco'] = (b) => { capturar(); est.contrato.marcos.splice(+b.dataset.i, 1); if (!est.contrato.marcos.length) est.contrato.marcos.push({ desc: '', pct: '' }); Sis.desenhar(true); };
  A['cl-cf-cancelar'] = () => { est.contrato = null; Sis.desenhar(true); };
  A['cl-cf-depois'] = () => {
    const s = servico(est.contrato.sid);
    if (!s.contrato) s.contrato = { pendente: true, valor: valorDe($('#cf-valor') ? $('#cf-valor').value : 0), forma: '', parcelas: [] };
    s.etapa = 'aprovado';
    salvarServico(s, true);
    est.contrato = null; est.aba = 'c'; Sis.desenhar(true);
  };
  A['cl-cf-salvar'] = () => {
    capturar();
    const r = montarParcelas(est.contrato);
    if (r.erro) { atualizarPrevia(); ui.toast(r.erro); return; }
    const s = servico(est.contrato.sid);
    s.contrato = { valor: valorDe(est.contrato.valor), forma: est.contrato.forma, parcelas: r.parcelas };
    s.etapa = 'aprovado';
    salvarServico(s, true);
    est.contrato = null; est.aba = 'c';
    ui.toast('Contrato registrado.');
    Sis.desenhar(true);
  };
  A['cl-parcela'] = (b) => { const s = servico(b.dataset.id); const p = s && s.contrato.parcelas[+b.dataset.i]; if (p) { marcarParcela(s.id, +b.dataset.i, !p.pago); Sis.desenhar(true); } };
  A['cl-renovar'] = (b) => {
    const s = servico(b.dataset.id);
    criarServico(s.clienteId, s.tipo, { obs: `Renovação ${new Date().getFullYear() + 1} do serviço anterior` });
    est.aba = 'v'; ui.toast('Renovação criada na fila de visitas.'); Sis.desenhar(true);
  };
  A['cl-obs'] = (b) => { est.obs[b.dataset.id] = !est.obs[b.dataset.id]; Sis.desenhar(true); };
  A['cl-obs-salvar'] = (b) => {
    const s = servico(b.dataset.id); const ta = $(`[data-obs="${b.dataset.id}"]`);
    s.obs = (ta ? ta.value : '').trim(); salvarServico(s);
    est.obs[b.dataset.id] = false; Sis.desenhar(true);
  };
  A['cl-excluir'] = (b) => { est.aExcluir = b.dataset.id; Sis.desenhar(true); };
  A['cl-excluir-nao'] = () => { est.aExcluir = null; Sis.desenhar(true); };
  A['cl-excluir-ok'] = (b) => { store.excluir(T, b.dataset.id); est.aExcluir = null; ui.toast('Serviço excluído.'); Sis.desenhar(true); };
  A['cl-convite'] = (b) => {
    const s = servico(b.dataset.id); const c = clientes.get(s.clienteId) || {};
    const titulo = 'Visita Souza Engenharia - ' + s.tipo;
    compartilhar(titulo, linkConvite(titulo, s.dataVisita, s.horaVisita || '09:00', c.endereco || ''));
  };
  A['cl-mapa'] = (b) => { const s = servico(b.dataset.id); ui.abrirMapa(clientes.endereco(s.clienteId)); };
  A['cl-mic'] = (b) => ditar(b, (t) => colocarNaBusca(t));
  A['cl-ia'] = (b) => ditar(b, (fala) => {
    const chave = kvLocal.get('ia-chave', '');
    if (!chave) { colocarNaBusca(fala); ui.toast('Sem chave da IA (em Configurações). Coloquei o ditado na busca.'); return; }
    ui.toast('Entendendo e cadastrando…');
    perguntarIA(fala, chave).then((r) => aplicarIA(r, fala)).catch(() => { colocarNaBusca(fala); ui.toast('A IA não respondeu. Coloquei o ditado na busca.'); });
  });
  A['cl-cad-novo'] = () => Sis.editarCliente(null, () => Sis.desenhar(true));
  A['cl-cad-editar'] = (b) => Sis.editarCliente(b.dataset.id, () => Sis.desenhar(true));
  A['cl-cad-excluir'] = async (b) => {
    const c = clientes.get(b.dataset.id);
    const usos = clientes.usos(c.id);
    if (usos.length) { await ui.alerta({ titulo: 'Cliente em uso', msg: `${c.nome} está em ${usos.map((u) => `${u.n} ${u.n === 1 ? u.rot : u.plural}`).join(', ')}. Para excluir, primeiro remova ou troque o cliente nesses registros.` }); return; }
    if (await ui.confirmar({ titulo: 'Excluir cliente?', msg: `${c.nome} será removido do cadastro.`, ok: 'Excluir', perigo: true })) { store.excluir('clientes', c.id); Sis.desenhar(true); }
  };
  document.addEventListener('input', (e) => { if (e.target.closest && e.target.closest('#cf-marcos')) atualizarPrevia(); });

  Sis.modulo({
    id: 'clientes', nome: 'Clientes', desc: 'Cadastro e orçamentos', icone: 'clientes', sistema: true, render,
    buscar(t) {
      const out = clientes.buscar(t, 4).map((c) => ({ tipo: 'Cliente', titulo: c.nome, sub: c.endereco, rota: '#/clientes?c=' + c.id }));
      servicos().filter((s) => norm(s.tipo).includes(t)).slice(0, 3).forEach((s) => out.push({ tipo: 'Serviço', titulo: s.tipo, sub: clientes.nome(s.clienteId), rota: '#/clientes?c=' + s.clienteId }));
      return out;
    },
  });
  void deISO;
})();
