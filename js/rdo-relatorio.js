'use strict';
/* =========================================================
   Diário de obra (RDO): listas, cálculos e o documento do
   diário. Usado pelo sistema e pelo portal do cliente
   (/clientesobras), por isso não depende do núcleo.
   ========================================================= */
window.RDO = (function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p2 = (n) => String(n).padStart(2, '0');
  const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return d && m && a ? `${d}/${m}/${a}` : ''; };
  const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
  const isoData = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const somaDias = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return isoData(d); };
  const difDias = (a, b) => Math.round((deISO(a) - deISO(b)) / 86400000);
  const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diaSemana = (iso) => (iso ? DIAS[deISO(iso).getDay()] : '');
  const dataHora = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(v) ? null : Number(v));
  const fmtPct = (v, casas = 0) => (num(v) === null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%');
  const dias = (n) => `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;

  /* ---------------- listas ---------------- */
  const TEMPOS = [['claro', 'Claro'], ['parcial', 'Parcialmente nublado'], ['nublado', 'Nublado'], ['chuvoso', 'Chuvoso'], ['forte', 'Chuva forte']];
  const CHUVA = new Set(['chuvoso', 'forte']);
  const CONDICOES = [['praticavel', 'Praticável'], ['parcial', 'Parcialmente praticável'], ['impraticavel', 'Impraticável']];
  const PERIODOS = [['manha', 'Manhã'], ['tarde', 'Tarde']];
  const OCORRENCIAS = [['clima', 'Chuva ou clima'], ['material', 'Falta de material'], ['maodeobra', 'Falta de mão de obra'], ['paralisacao', 'Paralisação'],
    ['contratante', 'Solicitação do contratante'], ['projeto', 'Mudança de projeto'], ['acidente', 'Acidente ou incidente'], ['visita', 'Visita técnica'],
    ['fiscalizacao', 'Fiscalização'], ['outro', 'Outra']];
  const IMPACTOS = [['nenhum', 'Sem impacto no prazo'], ['atraso', 'Atraso'], ['aditivo', 'Aditivo de prazo']];
  const PAPEIS = [['responsavel', 'Responsável da obra'], ['fiscal', 'Fiscal da obra'], ['contratante', 'Contratante']];
  const nomeDe = (lista, k) => { const x = lista.find((i) => i[0] === k); return x ? x[1] : ''; };
  const GRUPOS_PADRAO = [
    ['Equipe técnica', ['Engenheiro', 'Assistente de engenharia', 'Mestre de obras', 'Encarregado']],
    ['Mão de obra própria', ['Pedreiro', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor', 'Ajudante']],
    ['Terceirizados', []],
  ];

  const ICL = {
    claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    parcial: '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.61"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    nublado: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    chuvoso: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 14v6M8 14v6M12 16v6"/>',
    forte: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="m13 12-3 5h4l-3 5"/>',
  };
  const iconeTempo = (k) => (ICL[k] ? `<svg class="rdo-ict" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICL[k]}</svg>` : '');

  /* ---------------- serviços e avanço ---------------- */
  /** Lista plana dos serviços, na ordem do contrato. */
  function servicos(obra) {
    const out = [];
    (obra.etapas || []).forEach((e, ie) => (e.servicos || []).forEach((s, is) => out.push(Object.assign({}, s, { etapa: e, ordem: ie * 1000 + is }))));
    return out;
  }
  const rotServ = (s) => (s ? `${s.num ? s.num + ' - ' : ''}${s.desc || 'Serviço sem nome'}` : 'Geral da obra');
  const rotEtapa = (e) => (e ? `${e.num ? e.num + ' - ' : ''}${e.titulo || 'Etapa'}` : '');
  const statusPct = (p) => (p >= 100 ? 'Concluído' : p > 0 ? 'Em andamento' : 'Não iniciado');
  const ordemDiario = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.numero || 0) - (b.numero || 0));

  /** Horas entre início e fim ("08:00", "17:00"). */
  function horas(ini, fim) {
    if (!ini || !fim) return 0;
    const m = (t) => { const [h, mm] = String(t).split(':').map(Number); return (h || 0) * 60 + (mm || 0); };
    const d = m(fim) - m(ini);
    return d > 0 ? d / 60 : 0;
  }
  const fmtHoras = (h) => (h ? (Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h${p2(Math.round((h % 1) * 60))}`) : '');
  const horario = (a) => (a.ini && a.fim ? `${a.ini} até ${a.fim}${horas(a.ini, a.fim) ? ` (${fmtHoras(horas(a.ini, a.fim))})` : ''}` : a.ini ? `A partir de ${a.ini}` : '');

  /**
   * Avanço de cada serviço, de cada etapa e da obra.
   * O % de um serviço é o último % acumulado informado nos diários.
   * Etapa e obra: média ponderada pelos pesos dos serviços (se nenhum
   * serviço tiver peso, todos pesam igual).
   */
  function progresso(obra, diarios, { ate = null } = {}) {
    const lista = servicos(obra);
    const por = new Map(lista.map((s) => [s.id, { pct: 0, horas: 0, inicio: null, fim: null, hist: [] }]));
    const ds = (diarios || []).filter((d) => !ate || d.data <= ate).slice().sort(ordemDiario);
    for (const d of ds) {
      const doDia = new Map();
      const entrada = (sid) => {
        if (!doDia.has(sid)) {
          const p = por.get(sid);
          doDia.set(sid, { diarioId: d.id, data: d.data, numero: d.numero, de: p.pct, para: p.pct, horas: 0, descs: [], fotos: [] });
        }
        return doDia.get(sid);
      };
      for (const a of d.atividades || []) {
        if (!a.servicoId || !por.has(a.servicoId)) continue;
        const p = por.get(a.servicoId), e = entrada(a.servicoId);
        const h = horas(a.ini, a.fim);
        e.horas += h; p.horas += h;
        if (a.desc) e.descs.push(a.desc);
        const v = num(a.pct);
        if (v !== null) {
          e.para = Math.max(0, Math.min(100, v));
          p.pct = e.para;
          if (!p.inicio && e.para > 0) p.inicio = d.data;
          if (e.para >= 100 && !p.fim) p.fim = d.data;
        }
      }
      for (const f of d.fotos || []) if (f.servicoId && por.has(f.servicoId)) entrada(f.servicoId).fotos.push(f);
      doDia.forEach((e, sid) => por.get(sid).hist.push(e));
    }
    const totalPeso = lista.reduce((s, x) => s + (num(x.peso) || 0), 0);
    const igual = totalPeso <= 0;
    const peso = (s) => (igual ? 1 : num(s.peso) || 0);
    const media = (xs) => { const w = xs.reduce((s, x) => s + peso(x), 0); return w > 0 ? xs.reduce((s, x) => s + peso(x) * por.get(x.id).pct, 0) / w : (xs.length ? xs.reduce((s, x) => s + por.get(x.id).pct, 0) / xs.length : 0); };
    const etapas = new Map((obra.etapas || []).map((e) => [e.id, media(lista.filter((s) => s.etapa.id === e.id))]));
    const cont = { nao: 0, andamento: 0, concluido: 0 };
    lista.forEach((s) => { const p = por.get(s.id).pct; if (p >= 100) cont.concluido++; else if (p > 0) cont.andamento++; else cont.nao++; });
    return { servicos: lista, por, etapas, geral: lista.length ? media(lista) : 0, pesoIgual: igual, totalPeso, semPeso: igual ? 0 : lista.filter((s) => !num(s.peso)).length, cont };
  }

  /** Prazo na data de um diário: contratual, aditivos, decorrido, a vencer e término. */
  function prazo(obra, diarios, data) {
    const contratual = num(obra.prazoDias) || 0;
    let aditivos = 0, atraso = 0;
    for (const d of diarios || []) {
      if (data && d.data > data) continue;
      for (const o of d.ocorrencias || []) {
        if (o.impacto === 'aditivo') aditivos += num(o.dias) || 0;
        if (o.impacto === 'atraso') atraso += num(o.dias) || 0;
      }
    }
    const atual = contratual + aditivos;
    const inicio = obra.dataInicio || '';
    const decorrido = inicio && data ? Math.max(0, difDias(data, inicio) + 1) : null;
    return { contratual, aditivos, atraso, atual, inicio, decorrido, aVencer: decorrido === null ? null : atual - decorrido, termino: inicio && atual ? somaDias(inicio, atual - 1) : '' };
  }

  // data de referência do prazo: hoje, ou o último diário quando a obra já terminou
  function dataRef(obra, diarios) {
    const ult = (diarios || []).reduce((m, d) => (d.data > m ? d.data : m), '');
    return obra && obra.situacao === 'concluida' && ult ? ult : isoData(new Date());
  }

  const choveu = (d) => PERIODOS.some(([k]) => d.clima && d.clima[k] && CHUVA.has(d.clima[k].tempo)) || (num(d.clima && d.clima.chuvaMm) || 0) > 0;
  const impraticavel = (d) => PERIODOS.some(([k]) => d.clima && d.clima[k] && d.clima[k].cond === 'impraticavel');
  const totalMao = (obra, d) => (obra.grupos || []).reduce((s, g) => s + (g.funcoes || []).reduce((t, f) => t + (num(d.mao && d.mao[f.id]) || 0), 0), 0);

  /** Aprovação do fiscal ou do contratante que vale para a versão aprovada do diário. */
  function aprovacao(aprovacoes, diario, papel) {
    return (aprovacoes || []).find((a) => a && a.diarioId === diario.id && a.papel === papel && (!diario.aprovadoEm || !a.versao || a.versao === diario.aprovadoEm || a.em >= diario.aprovadoEm)) || null;
  }

  function impactoTxt(o) {
    const n = num(o.dias) || 0;
    if (o.impacto === 'atraso') return n ? `Atraso de ${dias(n)}` : 'Atraso';
    if (o.impacto === 'aditivo') return n ? `Aditivo de prazo de ${dias(n)}` : 'Aditivo de prazo';
    return 'Sem impacto no prazo';
  }

  /* ---------------- documento do diário ---------------- */
  /**
   * HTML do diário no modelo da Souza Engenharia.
   * ctx: { obra, diario, diarios, aprovacoes, empresa, logoSouza, fotoSrc(f), quebra }
   */
  function diarioHTML(ctx) {
    const { obra, diario: d } = ctx;
    const empresa = ctx.empresa || {};
    const lista = servicos(obra);
    const serv = new Map(lista.map((s) => [s.id, s]));
    const pz = prazo(obra, ctx.diarios || [d], d.data);
    const aprovado = d.status === 'aprovado';
    const prog = progresso(obra, ctx.diarios || [d], { ate: d.data });

    const cab = `<table class="rdo-cab"><colgroup><col style="width:12%"><col style="width:31%"><col style="width:11%"><col style="width:15%"><col style="width:17%"><col style="width:14%"></colgroup>
      <tr><td colspan="4" rowspan="3" class="rdo-logos"><div><img src="${esc(ctx.logoSouza || '')}" alt="${esc(empresa.nome || 'Souza Engenharia')}">${obra.logoCliente && obra.logoCliente.url ? `<img src="${esc(obra.logoCliente.url)}" alt="Logo do cliente">` : ''}</div></td>
        <th>Relatório nº</th><td><b>${esc(d.numero)}</b></td></tr>
      <tr><th>Data do relatório</th><td><b>${dataBR(d.data)}</b></td></tr>
      <tr><th>Dia da semana</th><td>${diaSemana(d.data)}</td></tr>
      <tr><td colspan="4" class="rdo-titulo">Relatório Diário de Obra (RDO)</td><th>Contrato</th><td>${esc(obra.contrato || '-')}</td></tr>
      <tr><th>Obra</th><td colspan="3"><b>${esc(obra.nome)}</b></td><th>Prazo contratual</th><td>${pz.contratual ? dias(pz.contratual) : '-'}${pz.aditivos ? `<small>+ ${dias(pz.aditivos)} de aditivo</small>` : ''}</td></tr>
      <tr><th>Local</th><td colspan="3">${esc(obra.local || '-')}</td><th>Prazo decorrido</th><td>${pz.decorrido === null ? '-' : dias(pz.decorrido)}</td></tr>
      <tr><th>Contratante</th><td>${esc(obra.contratante || '-')}</td><th>Responsável</th><td>${esc(obra.responsavel || (obra.assinantes && obra.assinantes.responsavel && obra.assinantes.responsavel.nome) || '-')}</td><th>Prazo a vencer</th><td>${pz.aVencer === null ? '-' : pz.aVencer < 0 ? `<span class="rdo-neg">${dias(-pz.aVencer)} vencido</span>` : dias(pz.aVencer)}</td></tr>
    </table>`;

    const clima = d.clima || {};
    const blocoClima = `<table class="rdo-tab"><colgroup><col style="width:34%"><col style="width:33%"><col style="width:33%"></colgroup>
      <thead><tr><th>Condição climática</th><th>Tempo</th><th>Condição</th></tr></thead><tbody>
      ${PERIODOS.map(([k, n]) => { const c = clima[k] || {}; return `<tr><td>${n}</td><td>${c.tempo ? `${iconeTempo(c.tempo)} ${nomeDe(TEMPOS, c.tempo)}` : '-'}</td><td class="${c.cond === 'impraticavel' ? 'rdo-neg' : ''}">${nomeDe(CONDICOES, c.cond) || '-'}</td></tr>`; }).join('')}
      ${num(clima.chuvaMm) ? `<tr><td>Chuva no dia</td><td colspan="2">${String(clima.chuvaMm).replace('.', ',')} mm</td></tr>` : ''}
      </tbody></table>`;

    const totalMO = totalMao(obra, d);
    const grupos = (obra.grupos || []).filter((g) => (g.funcoes || []).length);
    const blocoMao = grupos.length ? `<div class="rdo-bloco"><div class="rdo-bt">Mão de obra (${totalMO})</div>
      ${grupos.map((g) => { const t = g.funcoes.reduce((s, f) => s + (num(d.mao && d.mao[f.id]) || 0), 0); return `<div class="rdo-mo"><div class="rdo-mo-fs">${g.funcoes.map((f) => `<div><span>${esc(f.nome)}</span><b>${num(d.mao && d.mao[f.id]) || 0}</b></div>`).join('')}</div><div class="rdo-mo-g">${esc(g.nome)}<b>(${t})</b></div></div>`; }).join('')}
    </div>` : '';

    const equips = (obra.equipamentos || []).filter((e) => num(d.equip && d.equip[e.id]));
    const blocoEquip = equips.length ? `<div class="rdo-bloco"><div class="rdo-bt">Equipamentos (${equips.reduce((s, e) => s + num(d.equip[e.id]), 0)})</div>
      <div class="rdo-mo"><div class="rdo-mo-fs">${equips.map((e) => `<div><span>${esc(e.nome)}</span><b>${num(d.equip[e.id])}</b></div>`).join('')}</div></div></div>` : '';

    const ativs = d.atividades || [];
    let etapaAnt = null;
    const blocoAtiv = `<div class="rdo-bloco"><div class="rdo-bt">Atividades (${ativs.length})</div>
      ${ativs.length ? ativs.map((a) => {
        const s = a.servicoId ? serv.get(a.servicoId) : null;
        const et = s ? s.etapa : null;
        const mostraEt = et && et !== etapaAnt;
        etapaAnt = et || etapaAnt;
        const v = num(a.pct);
        const pctTxt = v === null ? '' : `${fmtPct(v)} - ${statusPct(v)}`;
        return `<div class="rdo-at">
          <div class="rdo-at-l">${mostraEt ? `<small>${esc(rotEtapa(et))}</small>` : ''}<b>${esc(s ? rotServ(s) : a.titulo || 'Atividade')}</b></div>
          <div class="rdo-at-r">${horario(a) ? `<small>${esc(horario(a))}</small>` : ''}${pctTxt ? `<span>${pctTxt}</span>` : ''}</div>
          ${a.desc ? `<p>${esc(a.desc)}</p>` : ''}</div>`;
      }).join('') : '<div class="rdo-vazio">Nenhuma atividade registrada.</div>'}
    </div>`;

    const ocs = d.ocorrencias || [];
    const blocoOc = ocs.length ? `<div class="rdo-bloco"><div class="rdo-bt">Ocorrências (${ocs.length})</div>
      ${ocs.map((o) => `<div class="rdo-oc"><div><b>${esc(nomeDe(OCORRENCIAS, o.tipo) || 'Ocorrência')}</b><span class="${o.impacto && o.impacto !== 'nenhum' ? 'rdo-neg' : ''}">${impactoTxt(o)}</span></div>${o.desc ? `<p>${esc(o.desc)}</p>` : ''}</div>`).join('')}
    </div>` : '';

    const blocoObs = (d.obs || '').trim() ? `<div class="rdo-bloco"><div class="rdo-bt">Observações</div><div class="rdo-obs">${esc(d.obs.trim())}</div></div>` : '';

    const ordem = (f) => { const s = f.servicoId && serv.get(f.servicoId); return s ? s.ordem : 1e9; };
    const fotos = (d.fotos || []).map((f, i) => ({ f, i })).sort((a, b) => ordem(a.f) - ordem(b.f) || a.i - b.i).map((x) => x.f);
    const blocoFotos = fotos.length ? `<div class="rdo-bloco rdo-fotos-b"><div class="rdo-bt">Fotos (${fotos.length})${d.drivePasta ? `<a href="${esc(d.drivePasta)}" target="_blank" rel="noopener">Ver em alta qualidade</a>` : ''}</div>
      <div class="rdo-fotos">${fotos.map((f) => `<figure><div class="rdo-ft"><img src="${esc(ctx.fotoSrc ? ctx.fotoSrc(f) : f.url || '')}" alt="" loading="lazy"></div><figcaption>${esc(f.legenda || rotServ(f.servicoId && serv.get(f.servicoId)))}</figcaption></figure>`).join('')}</div>
    </div>` : '';

    const ass = obra.assinantes || {};
    const colunas = PAPEIS.filter(([k]) => ass[k] && ass[k].nome).map(([k, rot]) => {
      const p = ass[k];
      const dadosP = (x) => [x.nome && `<b>${esc(x.nome)}</b>`, x.email && esc(x.email), x.cargo && esc(x.cargo), x.registro && esc(x.registro)].filter(Boolean).join('<br>');
      if (k === 'responsavel') {
        const ap = d.aprovador || p;
        return `<div class="rdo-as">${aprovado && ap.assinatura ? `<img src="${esc(ap.assinatura)}" alt="Assinatura">` : '<div class="rdo-as-vazio"></div>'}
          ${aprovado ? `<div class="rdo-ok"><i>Aprovado</i> ${dataHora(d.aprovadoEm)}</div>` : '<div class="rdo-as-linha"></div>'}
          <div class="rdo-as-p">${dadosP(aprovado ? ap : p)}</div><div class="rdo-as-rot">${rot}</div></div>`;
      }
      const a = aprovado ? aprovacao(ctx.aprovacoes, d, k) : null;
      return `<div class="rdo-as"><div class="rdo-as-vazio"></div>
        ${a ? `<div class="rdo-ok"><i>Aprovado online</i> ${dataHora(a.em)}</div>` : '<div class="rdo-as-linha"></div>'}
        <div class="rdo-as-p">${dadosP(a && a.nome ? a : p)}</div><div class="rdo-as-rot">${rot}</div></div>`;
    });
    const blocoAss = colunas.length ? `<div class="rdo-assin">${colunas.join('')}</div>` : '';

    return `<article class="rdo-doc ${ctx.quebra ? 'rdo-quebra' : ''}">
      <div class="rdo-topo"><span>Relatório <b>${dataBR(d.data)}</b> nº <b>${esc(d.numero)}</b></span><span class="rdo-st ${aprovado ? 'ok' : ''}">${aprovado ? 'Aprovado' : 'Rascunho'}</span></div>
      ${cab}
      ${blocoClima}
      ${blocoMao}
      ${blocoEquip}
      ${blocoAtiv}
      ${blocoOc}
      ${blocoObs}
      ${blocoFotos}
      ${blocoAss}
      ${ctx.rodape !== false ? `<div class="rdo-rod">${esc([empresa.nome, empresa.telefone, empresa.email, empresa.site].filter(Boolean).join(' · '))}${prog.servicos.length ? ` · Avanço da obra até este dia: ${fmtPct(prog.geral, 1)}` : ''}</div>` : ''}
    </article>`;
  }

  /** No celular, reduz o documento para caber na largura da tela (sem rolagem para o lado). */
  function ajustarZoom(raiz) {
    (raiz ? [raiz] : Array.from(document.querySelectorAll('[data-papel]'))).forEach((box) => {
      const w = box.clientWidth - (parseFloat(getComputedStyle(box).paddingLeft) || 0) * 2;
      box.querySelectorAll('.rdo-doc').forEach((d) => { d.style.zoom = w > 0 && w < 718 ? String(Math.max(0.42, w / 718)) : ''; });
    });
  }
  let _zt;
  window.addEventListener('resize', () => { clearTimeout(_zt); _zt = setTimeout(() => ajustarZoom(), 120); });

  return {
    ajustarZoom,
    esc, dataBR, deISO, isoData, somaDias, difDias, diaSemana, dataHora, num, fmtPct, dias,
    TEMPOS, CHUVA, CONDICOES, PERIODOS, OCORRENCIAS, IMPACTOS, PAPEIS, GRUPOS_PADRAO, nomeDe, iconeTempo,
    servicos, rotServ, rotEtapa, statusPct, ordemDiario, horas, fmtHoras, horario,
    progresso, prazo, dataRef, choveu, impraticavel, totalMao, aprovacao, impactoTxt, diarioHTML,
  };
})();
