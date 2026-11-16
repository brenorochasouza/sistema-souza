'use strict';
/* =========================================================
   Início: o dia e os avisos de todos os módulos, por área.
   Em cima, o que pede atenção (do mais urgente para o menos);
   embaixo, cada área com os detalhes e as ações rápidas.
   ========================================================= */
(function () {
  const { $, esc, brl, brl0, hojeISO, deISO, DIAS, dataCurta, dataBR, minutos, hhmm, duracaoTexto, diasDesde, dataLonga } = Sis.util;
  const { icone, clientes, ui } = Sis;

  Object.assign(Sis.ICONES, {
    dinheiro: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    maleta: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>',
  });

  const NIVEL = { alta: 0, media: 1, info: 2 };
  const ROT_NIVEL = { alta: 'Urgente', media: 'Atenção', info: 'Para saber' };
  const ORDEM_BASE = ['fin', 'ren', 'rdo', 'com', 'obr', 'sis'];
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const soma = (l, k) => l.reduce((a, x) => a + (+x[k] || 0), 0);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /** "hoje", "amanhã", "na quinta" ou "em 24/11". */
  function quando(iso) {
    const d = deISO(iso), diff = Math.round((d - deISO(hojeISO())) / 86400000);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff > 1 && diff < 7) return (d.getDay() === 0 || d.getDay() === 6 ? 'no ' : 'na ') + DIAS[d.getDay()];
    return 'em ' + dataCurta(iso);
  }
  const nomes = (l, max = 2) => { const u = [...new Set(l)]; return u.slice(0, max).join(', ') + (u.length > max ? ` e mais ${u.length - max}` : ''); };
  const mais = (n, rota, txt) => (n > 0 ? `<div class="ini-prox"><a href="${rota}">${txt}</a></div>` : '');

  /* ---------------- áreas ---------------- */
  function areaFin() {
    const v = Sis.comercial.parcelasVencidas(), p = Sis.comercial.parcelasAVencer(7);
    const tv = soma(v, 'valor'), tp = soma(p, 'valor');
    const linha = (x, vencida) => `<div class="lin"><button class="ck" data-a="ini-parcela" data-id="${esc(x.servicoId)}" data-i="${x.i}" aria-label="Marcar como recebida" title="Marcar como recebida">${icone('check')}</button>
      <div class="ini-tx"><div class="tit">${esc(clientes.nome(x.clienteId))}</div><div class="sub">${esc(x.desc)}, ${vencida ? `venceu em ${dataCurta(x.venc)}` : `vence ${quando(x.venc)}`}</div></div><div class="dir n">${brl(x.valor)}</div></div>`;
    const a = { id: 'fin', nome: 'Financeiro', ic: 'dinheiro', rota: '#/clientes?aba=c', rotaTxt: 'Contratos', nivel: null, corpo: '' };
    if (v.length) {
      a.nivel = 'alta';
      a.titulo = pl(v.length, 'parcela vencida', 'parcelas vencidas');
      a.detalhe = `${brl(tv)} a receber${p.length ? `. Mais ${pl(p.length, 'vence', 'vencem')} nos próximos 7 dias` : ''}`;
      a.valor = brl0(tv);
    } else if (p.length) {
      a.nivel = 'info';
      a.titulo = `${pl(p.length, 'parcela vence', 'parcelas vencem')} nos próximos 7 dias`;
      a.detalhe = `${brl(tp)}, a primeira ${quando(p[0].venc)}`;
      a.valor = brl0(tp);
    }
    if (v.length) {
      a.corpo += `<div class="ini-total"><b>${brl(tv)}</b><span>vencido em ${pl(v.length, 'parcela', 'parcelas')}</span></div>
        ${v.slice(0, 6).map((x) => linha(x, true)).join('')}${mais(v.length - 6, '#/clientes?aba=c', `Mais ${pl(v.length - 6, 'parcela vencida', 'parcelas vencidas')}`)}`;
    }
    if (p.length) a.corpo += `<div class="subt"><span>Vencem nos próximos 7 dias</span><span class="n">${brl(tp)}</span></div>${p.slice(0, 5).map((x) => linha(x, false)).join('')}${mais(p.length - 5, '#/clientes?aba=c', `Mais ${p.length - 5}`)}`;
    return a;
  }

  function areaRen() {
    if (!Sis.renovacoes) return null;
    const p = Sis.renovacoes.pendentes();
    if (!Sis.renovacoes.laudos().length) return null;
    const venc = p.filter((x) => x.vencido), prox = p.filter((x) => !x.vencido), sem = p.filter((x) => !x.contatoEm);
    const a = { id: 'ren', nome: 'Renovações', ic: 'repetir', rota: '#/renovacoes', rotaTxt: 'Laudos', nivel: null, corpo: '' };
    if (!p.length) return a;
    a.nivel = venc.some((x) => !x.contatoEm) ? 'alta' : sem.length ? 'media' : 'info';
    const partes = [];
    if (venc.length) partes.push(pl(venc.length, 'laudo vencido', 'laudos vencidos'));
    if (prox.length) partes.push(venc.length ? `${prox.length} vencendo` : pl(prox.length, 'laudo vencendo', 'laudos vencendo'));
    a.titulo = partes.join(' e ');
    a.detalhe = !sem.length ? 'Todos contatados, aguardando o retorno' : sem.length === p.length ? (p.length === 1 ? 'Ainda sem contato' : 'Nenhum contatado ainda') : `${sem.length} ainda sem contato`;
    a.corpo = p.slice(0, 6).map((x) => `<div class="lin ini-ren">
        <div class="ini-tx"><div class="tit">${esc(x.cliente)}</div><div class="ini-meta"><span class="chip ${x.cls}">${esc(x.vencido ? x.txt : 'Vence em ' + dataBR(x.renovacao))}</span><span class="sub">${esc(x.tipo)}${x.contatoEm ? `, contatado em ${dataBR(x.contatoEm)}` : ''}</span></div></div>
        ${x.contatoEm ? '' : `<button class="btn sm" data-a="rn-contato" data-id="${esc(x.id)}">Registrar contato</button>`}</div>`).join('')
      + mais(p.length - 6, '#/renovacoes', `Ver todos os ${p.length}`);
    return a;
  }

  function areaRdo() {
    const B = window.RDOB;
    if (!B || !B.projetoFixo || !B.projetoFixo() || !Sis.rdoPendencias || !B.pronto()) return null;
    const r = Sis.rdoPendencias();
    const a = { id: 'rdo', nome: 'Diário de obra', ic: 'rdo', rota: '#/rdo', rotaTxt: 'Obras', nivel: null, corpo: '' };
    if (!r) {
      a.nivel = 'info'; a.titulo = 'Diário de obra desconectado'; a.detalhe = 'Abra uma vez para ver os diários que esperam a sua aprovação';
      a.corpo = `<div class="ini-vazio">Sem conexão com o Diário de obra neste aparelho. <a href="#/rdo">Abrir o Diário de obra</a></div>`;
      return a;
    }
    if (r.erro) { a.nivel = 'alta'; a.titulo = 'O envio de fotos deu erro'; a.detalhe = r.erro.slice(0, 90); }
    else if (r.aprovar.length) { a.nivel = 'media'; a.titulo = pl(r.aprovar.length, 'diário para aprovar', 'diários para aprovar'); a.detalhe = nomes(r.aprovar.map((d) => d.obra)); }
    else if (r.fotos) { a.nivel = 'info'; a.titulo = pl(r.fotos, 'foto esperando envio', 'fotos esperando envio'); a.detalhe = 'Deste aparelho. Sobem sozinhas quando houver internet'; }
    if (r.aprovar.length && (r.erro || r.fotos) && a.nivel !== 'media') a.detalhe = `${pl(r.aprovar.length, 'diário para aprovar', 'diários para aprovar')}. ${a.detalhe}`;
    if (r.aprovar.length) {
      a.corpo += `<div class="subt"><span>Aguardando a sua aprovação</span></div>${r.aprovar.slice(0, 6).map((d) => `<a class="lin ini-link" href="#/rdo/${esc(d.obraId)}/d/${esc(d.id)}">
        <span class="ini-rdo-n n">nº ${esc(String(d.numero || ''))}</span>
        <div class="ini-tx"><div class="tit">${esc(d.obra)}</div><div class="sub">Diário de ${dataBR(d.data)}${d.por ? `, enviado por ${esc(d.por)}` : ''}</div></div>${icone('dir', 'ini-seta')}</a>`).join('')}
        ${mais(r.aprovar.length - 6, '#/rdo', `Mais ${r.aprovar.length - 6}`)}`;
    }
    if (r.fotos || r.erro) {
      a.corpo += `<div class="ini-fotos ${r.erro ? 'erro' : ''}">${icone(r.erro ? 'alerta' : 'nuvem')}<div class="ini-tx"><b>${r.fotos ? pl(r.fotos, 'foto deste aparelho ainda não subiu', 'fotos deste aparelho ainda não subiram') : 'O último envio de fotos deu erro'}</b>
        ${r.erro ? `<small>${esc(r.erro)}</small>` : '<small>Deixe o sistema aberto com internet ou envie agora.</small>'}</div>
        ${r.fotos ? `<button class="btn sm" data-a="rdo-fotos-enviar">${icone('nuvem')}Enviar agora</button>` : ''}</div>`;
    }
    return a;
  }

  function areaCom() {
    const sv = Sis.comercial.servicos();
    if (!sv.length) return null;
    const r = Sis.comercial.resumo();
    const enviar = sv.filter((s) => s.etapa === 'enviar').sort((a, b) => String(a.mudouEm).localeCompare(String(b.mudouEm)));
    const marcar = sv.filter((s) => s.etapa === 'agendar');
    const a = { id: 'com', nome: 'Comercial', ic: 'maleta', rota: '#/clientes', rotaTxt: 'Clientes', nivel: null, corpo: '' };
    a.nivel = enviar.length ? 'media' : r.parados.length || marcar.length ? 'info' : null;
    const partes = [];
    if (enviar.length) partes.push(pl(enviar.length, 'orçamento a enviar', 'orçamentos a enviar'));
    if (marcar.length) partes.push(pl(marcar.length, 'visita a marcar', 'visitas a marcar'));
    a.titulo = partes.join(' e ') || (r.parados.length ? `${pl(r.parados.length, 'orçamento parado', 'orçamentos parados')} há mais de 7 dias` : '');
    a.detalhe = partes.length && r.parados.length ? `${r.parados.length} em aberto há mais de 7 dias sem resposta` : partes.length ? `${r.aberto} em aberto` : 'Vale um contato para saber a decisão';
    const linhaSv = (s, dir) => `<a class="lin ini-link" href="#/clientes?c=${esc(s.clienteId)}"><div class="ini-tx"><div class="tit">${esc(clientes.rotulo ? clientes.rotulo(s.clienteId) : clientes.nome(s.clienteId))}</div><div class="sub">${esc(s.tipo)}</div></div><div class="dir sub n">${dir}</div></a>`;
    a.corpo = `<div class="nums3"><a href="#/clientes?aba=v"><b>${r.aMarcar}</b><span>visitas a marcar</span></a><a href="#/clientes?aba=e"><b>${r.enviar}</b><span>orçamentos a enviar</span></a><a href="#/clientes?aba=a"><b>${r.aberto}</b><span>em aberto</span></a></div>
      ${enviar.length ? `<div class="subt"><span>A enviar</span></div>${enviar.slice(0, 4).map((s) => linhaSv(s, s.mudouEm ? `há ${pl(diasDesde(s.mudouEm), 'dia', 'dias')}` : '')).join('')}${mais(enviar.length - 4, '#/clientes?aba=e', `Mais ${enviar.length - 4} a enviar`)}` : ''}
      ${r.parados.length ? `<div class="subt"><span>Em aberto há mais de 7 dias</span></div>${r.parados.slice(0, 4).map((s) => linhaSv(s, `${diasDesde(s.mudouEm)} dias`)).join('')}${mais(r.parados.length - 4, '#/clientes?aba=a', `Mais ${r.parados.length - 4} em aberto há mais de 7 dias`)}` : ''}`;
    return a;
  }

  function areaObr() {
    const l = Sis.obrasResumo ? Sis.obrasResumo() : [];
    if (!l.length) return null;
    const pagar = l.filter((o) => o.aPagar7 > 0.004), acima = l.filter((o) => o.orcado > 0 && o.lancado > o.orcado + 0.004);
    const a = { id: 'obr', nome: 'Obras', ic: 'obras', rota: '#/obras', rotaTxt: `${l.length} em andamento`, nivel: null };
    if (acima.length) { a.nivel = 'media'; a.titulo = `${pl(acima.length, 'obra passou', 'obras passaram')} do orçado`; a.detalhe = nomes(acima.map((o) => o.nome)); }
    else if (pagar.length) { a.nivel = 'info'; a.titulo = `${brl(soma(pagar, 'aPagar7'))} a pagar nos próximos 7 dias`; a.detalhe = nomes(pagar.map((o) => o.nome)); }
    a.corpo = l.map((o) => `<a class="ini-obra" href="#/obras/${esc(o.id)}/painel">
        <div class="ini-obra-l"><div class="ini-tx"><div class="tit">${esc(o.nome)}</div><div class="sub">${esc(o.cliente)}</div></div><b class="n ${o.orcado > 0 && o.lancado > o.orcado + 0.004 ? 'neg' : ''}">${Math.round(o.pct * 100)}%</b></div>
        <div class="barra-prog ${o.pct > 1 ? 'acima' : ''}"><i style="width:${Math.min(100, o.pct * 100)}%"></i></div>
        <div class="sub n">${brl0(o.lancado)} lançados de ${brl0(o.orcado)}</div>
        ${o.aPagar7 > 0.004 ? `<div class="sub n ini-pagar">${brl(o.aPagar7)} a pagar nos próximos 7 dias</div>` : ''}</a>`).join('');
    return a;
  }

  function areaSis() {
    const i = Sis.sync.info();
    const a = { id: 'sis', nome: 'Sistema', ic: 'nuvem', rota: '#/configuracoes', rotaTxt: 'Configurações', nivel: null, corpo: '' };
    if (i.erro) {
      a.nivel = 'alta'; a.titulo = 'A sincronização falhou'; a.detalhe = 'Os dados estão guardados no aparelho. Tente de novo';
      a.corpo = `<div class="ini-fotos erro">${icone('alerta')}<div class="ini-tx"><b>Não foi possível sincronizar com o Supabase</b><small>${esc(String(i.erro).slice(0, 160))}</small></div><button class="btn sm" data-a="ini-sync">${icone('repetir')}Tentar de novo</button></div>`;
    } else if (i.ausentes && i.ausentes.length) {
      a.nivel = 'media'; a.titulo = 'Falta criar tabela no Supabase'; a.detalhe = i.ausentes.join(', ');
      a.corpo = `<div class="ini-fotos">${icone('info')}<div class="ini-tx"><b>Falta criar no Supabase: ${esc(i.ausentes.join(', '))}</b><small>Rode o script da tabela no SQL Editor. Enquanto isso, os dados ficam guardados no aparelho.</small></div></div>`;
    } else if (!navigator.onLine && i.pendentes) {
      a.nivel = 'info'; a.titulo = 'Sem internet'; a.detalhe = `${pl(i.pendentes, 'alteração guardada', 'alterações guardadas')} no aparelho. Sobem quando a conexão voltar`;
      a.corpo = `<div class="ini-fotos">${icone('nuvem')}<div class="ini-tx"><b>${pl(i.pendentes, 'alteração guardada', 'alterações guardadas')} neste aparelho</b><small>Sobem sozinhas quando a internet voltar.</small></div></div>`;
    }
    return a;
  }

  function areas() {
    return [areaFin, areaRen, areaRdo, areaCom, areaObr, areaSis].map((f) => { try { return f(); } catch (e) { console.error(e); return null; } }).filter(Boolean)
      .sort((a, b) => ((a.nivel ? NIVEL[a.nivel] : 9) - (b.nivel ? NIVEL[b.nivel] : 9)) || ORDEM_BASE.indexOf(a.id) - ORDEM_BASE.indexOf(b.id));
  }

  /* ---------------- quadros ---------------- */
  function quadroAtencao(lista) {
    const alerta = lista.filter((a) => a.nivel), emDia = lista.filter((a) => !a.nivel);
    const linhas = alerta.map((a) => `<button class="ia ${a.nivel}" data-a="ini-ir" data-c="${a.id}" type="button">
        <span class="ia-ic">${icone(a.ic)}</span>
        <span class="ia-tx"><span class="ia-cat">${esc(a.nome)}<span class="sr">, ${ROT_NIVEL[a.nivel]}</span></span><b>${esc(a.titulo)}</b>${a.detalhe ? `<span class="ia-d">${esc(a.detalhe)}</span>` : ''}</span>
        ${icone('dir', 'ia-seta')}</button>`).join('');
    return `<section class="card ini-atencao o-1" aria-labelledby="ini-at-t"><div class="ini-h"><h2 id="ini-at-t">${alerta.length ? 'Pede atenção' : 'Tudo em dia'}</h2></div>
      ${alerta.length ? `<div class="ia-lista">${linhas}</div>` : `<div class="ia-ok-tudo">${icone('check')}<span>Nenhum aviso agora. Parcelas, renovações, diários e orçamentos estão em dia.</span></div>`}
      ${alerta.length && emDia.length ? `<div class="ia-emdia">${icone('check')}<span>Em dia: ${emDia.map((a) => esc(a.nome)).join(', ')}</span></div>` : ''}</section>`;
  }

  function quadroArea(a, i) {
    return `<section class="card ini-area" id="ini-s-${a.id}" style="order:${10 + i}"><div class="ini-h"><h2><span class="ini-hic ${a.nivel || 'ok'}">${icone(a.ic)}</span>${esc(a.nome)}</h2><a href="${a.rota}">${esc(a.rotaTxt)}</a></div>
      <div class="bd">${a.corpo}</div></section>`;
  }

  function quadroHoje() {
    const hoje = hojeISO();
    const lista = Sis.agenda.doDia(hoje);
    const agora = new Date().getHours() * 60 + new Date().getMinutes();
    const linhas = lista.map((e) => {
      const c = Sis.agenda.cat(e.categoria);
      const fim = minutos(e.inicio) + e.duracao;
      const sub = e.clienteId ? clientes.nome(e.clienteId) : e.local;
      const agoraSim = minutos(e.inicio) <= agora && fim >= agora;
      return `<div class="lin ini-ev ${fim < agora ? 'passou' : ''} ${agoraSim ? 'agora' : ''}" role="button" tabindex="0" data-a="ini-ev" data-id="${esc(e.id)}">
        <div class="hora"><b>${e.inicio}</b><small>${duracaoTexto(e.duracao)}</small></div><span class="ini-cor" style="background:${c.cor}"></span>
        <div class="ini-tx"><div class="tit">${esc(e.titulo)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}<span class="cat-et">${esc(c.nome)}${agoraSim ? '<span class="chip info">Agora</span>' : ''}</span></div></div>`;
    }).join('');
    const prox = Sis.agenda.proximo(hoje);
    const txtProx = prox ? `Próximo: ${quando(prox.data)} às ${prox.inicio}, ${esc(prox.titulo)}` : '';
    return `<section class="card ini-hoje o-2"><div class="ini-h"><h2><span class="ini-hic neutro">${icone('agenda')}</span>Hoje</h2><a href="#/agenda">${lista.length ? pl(lista.length, 'compromisso', 'compromissos') : 'Agenda'}</a></div>
      <div class="bd">${linhas || `<div class="ini-vazio">Nenhum compromisso hoje. <button class="link" data-a="ini-novo">Marcar um compromisso</button></div>`}
      ${txtProx ? `<div class="ini-prox">${txtProx}</div>` : ''}</div></section>`;
  }

  function quadroTarefas() {
    const { pendentes } = Sis.agenda.tarefas();
    const mostrar = pendentes.slice(0, 6);
    return `<section class="card ini-fazer o-3" id="ini-s-fazer"><div class="ini-h"><h2><span class="ini-hic neutro">${icone('check')}</span>A fazer</h2><a href="#/agenda/tarefas">${pendentes.length ? pl(pendentes.length, 'tarefa', 'tarefas') : 'Abrir'}</a></div>
      <div class="bd"><form class="ini-add" data-ini-tf onsubmit="return false"><input class="inp" id="ini-tf" placeholder="Anotar uma tarefa" autocomplete="off" enterkeyhint="done" aria-label="Nova tarefa"><button class="btn sm" type="submit" aria-label="Adicionar tarefa">${icone('mais')}</button></form>
      ${mostrar.map((t) => `<div class="lin"><button class="ck" data-a="ini-tarefa" data-id="${esc(t.id)}" aria-label="Concluir">${icone('check')}</button><div class="ini-tx">${esc(t.texto)}</div></div>`).join('')}
      ${mais(pendentes.length - 6, '#/agenda/tarefas', `Mais ${pl(pendentes.length - 6, 'tarefa', 'tarefas')}`)}
      ${!pendentes.length ? '<div class="ini-vazio">Nada pendente.</div>' : ''}</div></section>`;
  }

  /* ---------------- tela ---------------- */
  let assinatura = '';
  function assinar() {
    const r = Sis.rdoPendencias ? Sis.rdoPendencias() : null;
    const B = window.RDOB;
    return JSON.stringify([B && B.pronto && B.pronto(), r && r.aprovar.map((d) => d.id), r && r.fotos, r && r.erro]);
  }

  function render(el) {
    const B = window.RDOB;
    if (B && B.projetoFixo && B.projetoFixo() && !B.pronto()) B.iniciar().then(redesenharSeMudou).catch(() => {});
    const lista = areas();
    const alerta = lista.filter((a) => a.nivel).length;
    const nHoje = Sis.agenda.doDia(hojeISO()).length;
    const h = new Date().getHours();
    const nome = (window.SOUZA_CONFIG && SOUZA_CONFIG.nome) || 'Breno';
    // as áreas vão para a coluna mais curta, na ordem de urgência (no celular, uma embaixo da outra nessa ordem)
    const linhas = (html) => (html.match(/class="(lin|ini-obra|ini-fotos|nums3|ini-total|subt)\b/g) || []).length;
    const col = { esq: [], dir: [] };
    let hE = alerta * 1.4 + 2, hD = Math.max(1, nHoje) + Math.min(6, Sis.agenda.tarefas().pendentes.length) + 5;
    lista.filter((a) => a.corpo).forEach((a, i) => {
      const alt = linhas(a.corpo) + 1.5, html = quadroArea(a, i);
      if (hE <= hD) { col.esq.push(html); hE += alt; } else { col.dir.push(html); hD += alt; }
    });
    const frase = cap([nHoje ? pl(nHoje, 'compromisso hoje', 'compromissos hoje') : 'agenda livre hoje', alerta ? pl(alerta, 'área pede atenção', 'áreas pedem atenção') : 'tudo em dia'].join(', '));
    el.innerHTML = `<div class="ini-topo"><div class="ini-ola"><h1>${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${esc(nome)}</h1><p>${dataLonga(new Date())}. ${frase}.</p></div>
        <div class="busca">${icone('busca')}<input class="inp" id="ini-busca" placeholder="Buscar cliente, obra ou nota" autocomplete="off"><div class="busca-caixa" id="ini-caixa" hidden></div></div></div>
      <div class="ini-acoes" role="group" aria-label="Criar">
        <button class="btn" data-a="ini-novo" type="button">${icone('agenda')}Compromisso</button>
        <button class="btn" data-a="ini-tf-foco" type="button">${icone('check')}Tarefa</button>
        <button class="btn" data-a="cl-cad-novo" type="button">${icone('clientes')}Cliente</button>
        <button class="btn" data-a="orc-novo" type="button">${icone('orcamento')}Orçamento</button>
      </div>
      <div class="ini">
        <div class="ini-col">${quadroAtencao(lista)}${col.esq.join('')}</div>
        <div class="ini-col">${quadroHoje()}${quadroTarefas()}${col.dir.join('')}</div>
      </div>`;
    Sis.ligarBusca($('#ini-busca', el), $('#ini-caixa', el));
    $('[data-ini-tf]', el).addEventListener('submit', () => {
      const inp = $('#ini-tf', el), texto = inp.value.trim();
      if (!texto) { inp.focus(); return; }
      Sis.agenda.novaTarefa(texto);
      Sis.desenhar(true);
      const novo = $('#ini-tf'); if (novo) novo.focus();
    });
    assinatura = assinar();
  }

  const digitando = () => { const a = document.activeElement; return a && (a.id === 'ini-busca' || a.id === 'ini-tf') && a.value; };
  const podeRedesenhar = () => Sis.rota().mod === 'inicio' && !ui.modalAberto() && !digitando();
  let tRed = null;
  function redesenharSeMudou() {
    clearTimeout(tRed);
    tRed = setTimeout(() => { if (podeRedesenhar() && assinar() !== assinatura) Sis.desenhar(true); }, 1200);
  }
  if (window.RDOB && window.RDOB.ouvirEstado) window.RDOB.ouvirEstado(redesenharSeMudou);

  const A = Sis.acoes;
  A['ini-tarefa'] = (b) => { Sis.agenda.alternarTarefa(b.dataset.id); ui.toast('Tarefa concluída.'); Sis.desenhar(true); };
  A['ini-parcela'] = (b) => { Sis.comercial.marcarParcela(b.dataset.id, +b.dataset.i, true); ui.toast('Parcela marcada como recebida.'); Sis.desenhar(true); };
  A['ini-ev'] = (b) => Sis.agenda.abrir(b.dataset.id);
  A['ini-novo'] = () => Sis.agenda.novoCompromisso({ data: hojeISO(), hora: hhmm(Math.min(20 * 60, Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * 60)) });
  A['ini-tf-foco'] = () => { const i = $('#ini-tf'); if (!i) return; i.scrollIntoView({ block: 'center', behavior: rapido() ? 'auto' : 'smooth' }); i.focus({ preventScroll: true }); };
  A['ini-sync'] = () => { Sis.sync.agora(); ui.toast('Sincronizando…'); };
  const rapido = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  A['ini-ir'] = (b) => {
    const s = $('#ini-s-' + b.dataset.c);
    if (!s) { const a = areas().find((x) => x.id === b.dataset.c); if (a) location.hash = a.rota; return; }
    s.scrollIntoView({ block: 'start', behavior: rapido() ? 'auto' : 'smooth' });
    s.classList.remove('ini-foco'); void s.offsetWidth; s.classList.add('ini-foco');
    setTimeout(() => s.classList.remove('ini-foco'), 1600);
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.a === 'ini-ev') A['ini-ev'](e.target); });

  Sis.modulo({ id: 'inicio', nome: 'Início', icone: 'inicio', sistema: false, render });
  setInterval(() => { if (podeRedesenhar() && !(document.activeElement && document.activeElement.id === 'ini-busca')) Sis.desenhar(true); }, 60000);
})();
