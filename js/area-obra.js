'use strict';
/* =========================================================
   Área do cliente > painel da obra (só você, no seu sistema)
   Num serviço com obra: a planilha do contrato (Excel ou orçamento),
   o avanço físico por etapa principal com o histórico, os aditivos
   (acréscimos, supressões e descontos, com prazo), os comunicados
   numerados e o Diário de obra ligado, se você quiser.
   Os dados ficam no próprio serviço (campo "painel"); as contas e o
   desenho, em obra-painel.js, iguais aos do portal do cliente.
   ========================================================= */
(function () {
  const B = window.RDOB, R = window.RDO, P = window.ObraPainel;
  const { $, $$, esc, hojeISO, dataBR, uid, norm } = Sis.util;
  const { ui, icone } = Sis;
  const A = Sis.acoes;
  const T = 'portal';
  const AC = () => Sis.areaCliente;
  const URL_PORTAL = (window.SOUZA_CONFIG && window.SOUZA_CONFIG.portal) || 'https://portal.souzaengenharia.com/';
  const logo = () => `img/logo.png?v=${Sis.VERSAO}`;
  const brl = P.brl, pct = P.pct;
  const ID_CFG = 'config-obra';
  const ASSINATURA = 'Eng. Breno Rocha Souza\nEngenheiro Civil, CREA-BA 052098151-0\nSouza Engenharia';

  /* ---------- números ---------- */
  /** Lê valores como 1.234,56 / 1234.56 / -500 / (500) / R$ 12.000. */
  function lerValor(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    let t = String(s ?? '').replace(/R\$|\s/gi, '');
    if (!t) return null;
    const neg = /^-/.test(t) || /^\(.*\)$/.test(t);
    t = t.replace(/[()+-]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    if (!/^\d*\.?\d+$/.test(t)) return null;
    return neg ? -Number(t) : Number(t);
  }
  const fmtV = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtP = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

  /* ---------- dados ---------- */
  const novoPainel = (s) => ({ inicio: s.data || hojeISO(), termino: '', etapas: [], aditivos: [], medicoes: [], comunicados: [], rdoObraId: '' });
  const painelDe = (s) => Object.assign(novoPainel(s), s.painel || {});
  function salvar(s, p) { s.painel = p; AC().salvarServico(s); }
  const cfg = () => { const r = B.store.get(T, ID_CFG); return (r && r.dados) || {}; };
  const salvarCfg = (d) => B.store.salvar(T, ID_CFG, 'config', Object.assign({}, cfg(), d), null);
  const rdoObra = (id) => { const r = id && B.store.get('obras', id); return r && r.tipo === 'obra' ? Object.assign({ id: r.id }, r.dados) : null; };
  const aprovados = (oid) => B.store.lista('diarios', 'diario').filter((r) => r.grupo === oid && r.dados.status === 'aprovado').length;

  /* ---------- planilha do Excel: nº, descrição, quantidade, unidade, preço unitário, valor total ---------- */
  const colIdx = (L) => L.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const colNome = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  /** Etapas principais (1, 2, 3...) com o valor de cada uma, somando os itens (1.1, 1.1.1...) quando a etapa não traz o total. */
  function lerPlanilhaObra(linhas) {
    const txt = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
    let cols = { n: 'A', d: 'B', t: 'F' };
    const head = linhas.find((l) => Object.values(l.cel).some((v) => typeof v === 'string' && /descri/.test(norm(v))));
    if (head) {
      const c = {};
      Object.entries(head.cel).sort((a, b) => colIdx(a[0]) - colIdx(b[0])).forEach(([k, v]) => {
        const t = norm(String(v));
        if (/descri/.test(t)) { if (!c.d) c.d = k; } else if (/total/.test(t)) c.t = k;
        else if (/unit|^preco|^p\.? ?u/.test(t)) c.pu = c.pu || k;
        else if (/^quant|^qtd|^qde/.test(t)) c.q = c.q || k;
        else if (/^unid|^und|^un\.?$/.test(t)) c.u = c.u || k;
        else if (/^item|^n\W|^n$|^no?\.?$|^num|^cod/.test(t)) c.n = c.n || k;
        else if (/^valor/.test(t)) c.t = c.t || k;
      });
      if (c.d) { const di = colIdx(c.d); cols = { n: c.n || colNome(Math.max(0, di - 1)), d: c.d, t: c.t || colNome(di + 4) }; }
    }
    const numero = (v) => {
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v).replace(/0+$/, '');
      return txt(v).replace(/\s/g, '').replace(/\.$/, '');
    };
    const rows = [];
    let total = null;
    for (const l of linhas) {
      if (head && l.r <= head.r) continue;
      const nm = numero(l.cel[cols.n]), ds = txt(l.cel[cols.d]), vt = lerValor(l.cel[cols.t]);
      if (/^\d+(\.\d+)*$/.test(nm)) { rows.push({ num: nm, desc: ds, total: vt }); continue; }
      // linhas de total no fim da planilha: a última vale como o valor do contrato
      const rot = norm(`${nm} ${ds}`);
      if (vt !== null && /total|valor final|valor global/.test(rot) && !/sub ?total/.test(rot)) total = vt;
    }
    const etapas = [], avisos = [];
    for (const r of rows.filter((x) => !x.num.includes('.'))) {
      const filhos = rows.filter((x) => x.num.startsWith(r.num + '.'));
      const folhas = filhos.filter((x) => !rows.some((y) => y.num.startsWith(x.num + '.')) && x.total !== null);
      const soma = Math.round(folhas.reduce((t, x) => t + x.total, 0) * 100) / 100;
      let valor = r.total !== null ? r.total : soma;
      if (r.total !== null && folhas.length && Math.abs(r.total - soma) > 1) avisos.push(`Etapa ${r.num}: o total da etapa (${brl(r.total)}) é diferente da soma dos itens (${brl(soma)}). Ficou o total da etapa.`);
      if (r.total === null && !folhas.length) valor = 0;
      etapas.push({ num: r.num, desc: r.desc || `Etapa ${r.num}`, valor: Math.round(valor * 100) / 100 });
    }
    // planilha sem linha de etapa (só 1.1, 1.2...): agrupa pelo primeiro número
    if (!etapas.length && rows.length) {
      const grupos = [...new Set(rows.map((x) => x.num.split('.')[0]))];
      grupos.forEach((g) => {
        const fs = rows.filter((x) => x.num.split('.')[0] === g && !rows.some((y) => y.num.startsWith(x.num + '.')) && x.total !== null);
        etapas.push({ num: g, desc: `Etapa ${g}`, valor: Math.round(fs.reduce((t, x) => t + x.total, 0) * 100) / 100 });
      });
      avisos.push('A planilha não tem as linhas das etapas principais (1, 2, 3...). Os itens foram somados pelo primeiro número; confira os nomes das etapas.');
    }
    return { etapas, total, avisos, itens: rows.length - etapas.length };
  }

  /* ---------- importar: Excel, orçamento ou digitando ---------- */
  function importarExcel(sid) {
    if (!Sis.orcamentos || !Sis.orcamentos.lerLinhasXlsx) { ui.toast('O leitor de planilhas não carregou. Atualize a página.'); return; }
    ui.escolherArquivo('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', async (f) => {
      let r;
      try { r = lerPlanilhaObra(await Sis.orcamentos.lerLinhasXlsx(f)); } catch (e) { console.error(e); ui.alerta({ titulo: 'Não consegui ler a planilha', msg: e.message }); return; }
      if (!r.etapas.length) { ui.alerta({ titulo: 'Nenhuma etapa encontrada', msg: 'A planilha precisa ter as colunas na ordem: nº (1, 1.1, 1.1.1...), descrição, quantidade, unidade, preço unitário e valor total.' }); return; }
      conferir(sid, { etapas: r.etapas, total: r.total, avisos: r.avisos, origem: { tipo: 'excel', nome: f.name, em: hojeISO() }, nota: `${r.etapas.length} etapas principais e ${r.itens} itens lidos de ${f.name}.` });
    });
  }
  function importarOrcamento(sid) {
    const s = AC().servico(sid); if (!s) return;
    const O = Sis.orcamentos;
    const lista = O ? O.lista().filter((o) => !O.ehServ(o) && (o.etapas || []).length) : [];
    if (!lista.length) { ui.alerta({ titulo: 'Nenhum orçamento com etapas', msg: 'Monte o orçamento no módulo de Orçamentos ou importe a planilha do Excel.' }); return; }
    const c = AC().cliente(s.clienteId) || {};
    const doCli = (o) => !!(c.carteiraId && o.clienteId === c.carteiraId);
    lista.sort((a, b) => (doCli(b) - doCli(a)) || String(b.atualizadoEm || b.data || '').localeCompare(String(a.atualizadoEm || a.data || '')));
    ui.abrirModal({
      titulo: 'Usar um orçamento do sistema', sub: 'As etapas do orçamento viram as etapas da obra, com o valor final (BDI e imposto distribuídos na proporção de cada etapa).',
      corpo: `<div class="r-perfis ac-cts">${lista.slice(0, 40).map((o, i) => { const f = O.calcular(o).final; return `<label class="r-perfil"><input type="radio" name="orc" value="${esc(o.id)}" ${i === 0 ? 'checked' : ''}><span><b>${esc([o.codigo, o.titulo].filter(Boolean).join(' · '))}</b><small>${esc(Sis.clientes.nome(o.clienteId) || 'Sem cliente')} · ${o.etapas.length} etapas · ${brl(f)}${doCli(o) ? ' · deste cliente' : ''}</small></span></label>`; }).join('')}</div>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Continuar', classe: 'primary', acao: (m) => {
        const r = $('[name=orc]:checked', m.el); if (!r) return;
        const o = lista.find((x) => x.id === r.value), calc = O.calcular(o);
        const fator = calc.direto > 0 ? calc.final / calc.direto : 1;
        const etapas = o.etapas.map((e, i) => ({ num: String(i + 1), desc: e.titulo || `Etapa ${i + 1}`, valor: Math.round(calc.etapas[i].tot * fator * 100) / 100 }));
        m.fechar();
        conferir(sid, { etapas, total: Math.round(calc.final * 100) / 100, avisos: [], origem: { tipo: 'orcamento', nome: [o.codigo, o.titulo].filter(Boolean).join(' · '), orcId: o.id, em: hojeISO() }, nota: `Orçamento ${o.codigo || o.titulo}: ${etapas.length} etapas.` });
      } }],
    });
  }
  /** Confere as etapas lidas antes de gravar: valor do contrato (a planilha pode ter BDI e imposto no fim) e o prazo. */
  function conferir(sid, { etapas, total, avisos, origem, nota }) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s);
    const soma = Math.round(etapas.reduce((t, e) => t + e.valor, 0) * 100) / 100;
    const ja = P.tem(p);
    const linhas = (fator) => etapas.map((e) => `<tr><td>${esc(e.num)}</td><td>${esc(e.desc)}</td><td class="num">${brl(e.valor * fator)}</td><td class="num">${pct(soma > 0 ? (e.valor / soma) * 100 : 0)}</td></tr>`).join('');
    ui.abrirModal({
      titulo: 'Conferir a planilha do contrato', sub: esc(nota), largo: true,
      corpo: `${avisos.length ? `<div class="op-avisos">${avisos.map((a) => `<p>${icone('alerta')}<span>${esc(a)}</span></p>`).join('')}</div>` : ''}
        <div class="tblwrap op-conf"><table class="tbl"><thead><tr><th>Nº</th><th>Etapa</th><th class="num">Valor</th><th class="num">Peso</th></tr></thead><tbody data-q="linhas">${linhas(1)}</tbody>
          <tfoot><tr><td></td><td>Soma das etapas</td><td class="num">${brl(soma)}</td><td class="num">100%</td></tr></tfoot></table></div>
        <div class="grid2" style="margin-top:14px">
          <label class="f"><span>Valor do contrato (R$)</span><input class="inp money" name="total" inputmode="decimal" value="${esc(fmtV(total !== null && total > 0 ? total : soma))}"></label>
          <p class="small muted" data-q="fator" style="align-self:end;margin:0 0 10px"></p>
          <label class="f"><span>Início da obra</span><input class="inp" type="date" name="inicio" value="${esc(p.inicio || '')}"></label>
          <label class="f"><span>Término previsto</span><input class="inp" type="date" name="termino" value="${esc(p.termino || '')}"></label></div>
        ${ja ? `<p class="small muted" style="margin:10px 0 0">${icone('info')} As etapas atuais são trocadas por estas. O avanço já lançado e os aditivos continuam nas etapas com o mesmo número.</p>` : ''}`,
      aoAbrir: (el) => {
        const tot = $('[name=total]', el), fat = $('[data-q=fator]', el), corpo = $('[data-q=linhas]', el);
        const ver = () => {
          const v = lerValor(tot.value);
          if (v === null || v <= 0 || Math.abs(v - soma) < 0.01) { fat.textContent = v !== null && v > 0 ? 'Igual à soma das etapas.' : ''; corpo.innerHTML = linhas(1); return; }
          fat.textContent = `${v > soma ? 'Maior' : 'Menor'} que a soma das etapas (BDI, imposto ou desconto): cada etapa é ajustada na mesma proporção (${pct((v / soma) * 100)}).`;
          corpo.innerHTML = linhas(v / soma);
        };
        tot.addEventListener('input', ver); ver();
      },
      botoes: [{ rot: 'Cancelar' }, { rot: ja ? 'Trocar as etapas' : 'Usar estas etapas', classe: 'primary', acao: (m) => {
        const v = lerValor($('[name=total]', m.el).value);
        if (v === null || v <= 0) { $('[name=total]', m.el).classList.add('erro'); return; }
        const ini = $('[name=inicio]', m.el).value, fim = $('[name=termino]', m.el).value;
        if (ini && fim && fim < ini) { $('[name=termino]', m.el).classList.add('erro'); ui.toast('O término vem antes do início.'); return; }
        const fator = soma > 0 ? v / soma : 1;
        const porNum = new Map((p.etapas || []).map((e) => [e.num, e.id]));
        const novas = etapas.map((e) => ({ id: porNum.get(e.num) || 'e' + uid().slice(0, 8), num: e.num, desc: e.desc, valor: Math.round(e.valor * fator * 100) / 100 }));
        // centavos do arredondamento ficam na maior etapa, para a soma bater com o contrato
        const dif = Math.round((v - novas.reduce((t, e) => t + e.valor, 0)) * 100) / 100;
        if (dif && novas.length) { const mx = novas.reduce((a, b) => (b.valor > a.valor ? b : a)); mx.valor = Math.round((mx.valor + dif) * 100) / 100; }
        const ids = new Set(novas.map((e) => e.id));
        const perdidas = (p.etapas || []).filter((e) => !ids.has(e.id));
        Object.assign(p, { etapas: novas, origem, inicio: ini || p.inicio, termino: fim || p.termino });
        // avanço de etapas que sumiram não conta mais
        p.medicoes = (p.medicoes || []).map((md) => { const x = Object.assign({}, md, { pct: Object.assign({}, md.pct) }); perdidas.forEach((e) => delete x.pct[e.id]); return x; });
        salvar(s, p); m.fechar();
        ui.toast(perdidas.length ? `Planilha trocada. ${perdidas.length} ${perdidas.length === 1 ? 'etapa antiga saiu' : 'etapas antigas saíram'}.` : 'Planilha do contrato pronta.');
        Sis.desenhar(true);
      } }],
    });
  }
  /** Editar as etapas à mão (corrigir nome ou valor, incluir ou tirar). */
  function modalEtapas(sid) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s);
    const linha = (e) => `<div class="op-et" data-id="${esc(e.id || '')}"><input class="inp" name="num" value="${esc(e.num || '')}" aria-label="Nº" inputmode="numeric"><input class="inp" name="desc" value="${esc(e.desc || '')}" placeholder="Nome da etapa" aria-label="Etapa">
      <input class="inp money" name="valor" value="${esc(fmtV(e.valor))}" inputmode="decimal" placeholder="0,00" aria-label="Valor"><button type="button" class="btn icon sm" data-op="x" aria-label="Tirar etapa">${icone('lixo')}</button></div>`;
    ui.abrirModal({
      titulo: 'Etapas do contrato', sub: 'O valor de cada etapa define o peso dela no avanço físico. Acréscimos e descontos depois do contrato entram como aditivo.', largo: true,
      corpo: `<div class="op-et op-et-cab"><span>Nº</span><span>Etapa</span><span>Valor (R$)</span><span></span></div><div data-q="ets">${(p.etapas.length ? p.etapas : [{ num: '1' }]).map(linha).join('')}</div>
        <div class="op-et-pe"><button type="button" class="btn sm" data-op="mais">${icone('mais')}Etapa</button><span class="small muted" data-q="soma"></span></div>`,
      aoAbrir: (el) => {
        const box = $('[data-q=ets]', el);
        const somar = () => { const t = $$('[name=valor]', box).reduce((a, i) => a + (lerValor(i.value) || 0), 0); $('[data-q=soma]', el).textContent = `Valor do contrato: ${brl(t)}`; };
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-op]'); if (!b) return;
          if (b.dataset.op === 'mais') { const nn = $$('.op-et', box).length + 1; box.insertAdjacentHTML('beforeend', linha({ num: String(nn) })); $('.op-et:last-child [name=desc]', box).focus(); }
          if (b.dataset.op === 'x') b.closest('.op-et').remove();
          somar();
        });
        box.addEventListener('input', somar);
        box.addEventListener('focusout', (ev) => { if (ev.target.name === 'valor') { const v = lerValor(ev.target.value); if (v !== null) ev.target.value = fmtV(v); } });
        somar();
      },
      botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar etapas', classe: 'primary', acao: (m) => {
        const out = [];
        for (const row of $$('[data-q=ets] .op-et', m.el)) {
          const num = $('[name=num]', row).value.trim(), desc = $('[name=desc]', row).value.trim(), v = lerValor($('[name=valor]', row).value);
          if (!num && !desc && v === null) continue;
          if (!desc) { $('[name=desc]', row).classList.add('erro'); return; }
          if (v === null || v < 0) { $('[name=valor]', row).classList.add('erro'); return; }
          out.push({ id: row.dataset.id || 'e' + uid().slice(0, 8), num: num || String(out.length + 1), desc, valor: Math.round(v * 100) / 100 });
        }
        if (!out.length) { ui.toast('Inclua pelo menos uma etapa.'); return; }
        if (new Set(out.map((e) => e.num)).size !== out.length) { ui.toast('Há etapas com o mesmo número.'); return; }
        p.etapas = out;
        if (!p.origem) p.origem = { tipo: 'manual', nome: '', em: hojeISO() };
        salvar(s, p); m.fechar(); Sis.desenhar(true);
      } }],
    });
  }

  /* ---------- avanço físico ---------- */
  function modalAvanco(sid) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s);
    if (!P.tem(p)) { ui.toast('Primeiro, a planilha do contrato.'); return; }
    const hoje = hojeISO(), es = P.etapas(p, hoje), atual = P.pctEtapas(p, hoje), ult = P.medicaoAte(p, null);
    ui.abrirModal({
      titulo: 'Atualizar o avanço físico', sub: 'Quanto de cada etapa já foi executado. O avanço da obra é a soma do peso de cada etapa vezes o executado dela.', largo: true,
      corpo: `<div class="grid2"><label class="f"><span>Data da atualização</span><input class="inp" type="date" name="data" value="${hoje}" max="${hoje}"></label><div class="op-av-tot"><span>Avanço da obra</span><b data-q="tot"></b></div></div>
        <div class="op-av">${es.map((e) => `<div class="op-av-l ${e.valor <= 0 ? 'off' : ''}"><span class="op-av-n">${esc(e.num)}</span><span class="op-av-t"><b>${esc(e.desc)}</b><small>Peso ${pct(e.peso * 100)}${e.aditivo ? ` · aditivo nº ${esc(e.aditivo)}` : ''}${e.valor <= 0 ? ' · suprimida' : ''}</small></span>
          <input class="op-av-r" type="range" min="0" max="100" step="1" value="${atual.get(e.id)}" data-id="${esc(e.id)}" aria-label="Executado da etapa ${esc(e.num)}" ${e.valor <= 0 ? 'disabled' : ''}>
          <span class="op-av-i"><input class="inp" name="p-${esc(e.id)}" inputmode="decimal" value="${esc(fmtP(atual.get(e.id)))}" data-id="${esc(e.id)}" ${e.valor <= 0 ? 'disabled' : ''}>%</span></div>`).join('')}</div>
        ${ult ? `<p class="small muted" style="margin:10px 0 0">Última atualização em ${dataBR(ult.data)}. Na mesma data, esta substitui a anterior.</p>` : ''}`,
      aoAbrir: (el) => {
        const tot = () => { let t = 0; es.forEach((e) => { const i = $(`.op-av-i input[data-id="${CSS.escape(e.id)}"]`, el); t += e.peso * Math.max(0, Math.min(100, lerValor(i.value) || 0)); }); $('[data-q=tot]', el).textContent = pct(t); };
        el.addEventListener('input', (ev) => {
          const id = ev.target.dataset.id; if (!id) { tot(); return; }
          if (ev.target.type === 'range') $(`.op-av-i input[data-id="${CSS.escape(id)}"]`, el).value = ev.target.value;
          else { const v = lerValor(ev.target.value); $(`.op-av-r[data-id="${CSS.escape(id)}"]`, el).value = v === null ? 0 : Math.max(0, Math.min(100, v)); }
          tot();
        });
        tot();
      },
      botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar avanço', classe: 'primary', acao: (m) => {
        const data = $('[name=data]', m.el).value;
        if (!data || data > hoje) { $('[name=data]', m.el).classList.add('erro'); ui.toast('Escolha uma data até hoje.'); return; }
        const pc = {};
        for (const e of es) {
          const i = $(`.op-av-i input[data-id="${CSS.escape(e.id)}"]`, m.el), v = lerValor(i.value);
          if (i.value.trim() && (v === null || v < 0 || v > 100)) { i.classList.add('erro'); ui.toast('O executado vai de 0 a 100%.'); return; }
          if (v) pc[e.id] = Math.round(v * 10) / 10;
        }
        p.medicoes = (p.medicoes || []).filter((x) => x.data !== data).concat([{ id: 'm' + uid().slice(0, 8), data, pct: pc }]).sort((a, b) => a.data.localeCompare(b.data));
        salvar(s, p); m.fechar();
        ui.toast(`Avanço da obra: ${pct(P.fisico(p, hoje))}.`);
        Sis.desenhar(true);
      } }],
    });
  }
  function modalHistorico(sid) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s), ms = P.medicoes(p).reverse();
    ui.abrirModal({
      titulo: 'Histórico do avanço físico', sub: `${ms.length} ${ms.length === 1 ? 'atualização' : 'atualizações'}. O gráfico do cliente usa estas datas.`,
      corpo: ms.length ? `<ul class="op-hist">${ms.map((x) => `<li><span><b>${dataBR(x.data)}</b><small>Avanço da obra ${pct(P.fisico(p, x.data))}</small></span><button class="btn sm ghost" data-op="x" data-id="${esc(x.id)}">${icone('lixo')}Excluir</button></li>`).join('')}</ul>` : '<p class="small muted">Nenhuma atualização ainda.</p>',
      aoAbrir: (el, m) => el.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-op=x]'); if (!b) return;
        const x = ms.find((y) => y.id === b.dataset.id);
        if (!(await ui.confirmar({ titulo: `Excluir a atualização de ${dataBR(x.data)}?`, msg: 'O avanço volta a ser o da atualização anterior nesta data.', ok: 'Excluir', perigo: true }))) return;
        p.medicoes = (p.medicoes || []).filter((y) => y.id !== x.id);
        salvar(s, p); m.fechar(); Sis.desenhar(true); modalHistorico(sid);
      }),
      botoes: [{ rot: 'Fechar' }],
    });
  }

  /* ---------- aditivos ---------- */
  function modalAditivo(sid, aid) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s);
    if (!P.tem(p)) { ui.toast('Primeiro, a planilha do contrato.'); return; }
    const ads = p.aditivos || [];
    const a = aid ? JSON.parse(JSON.stringify(ads.find((x) => x.id === aid) || {})) : { id: 'a' + uid().slice(0, 8), numero: ads.reduce((t, x) => Math.max(t, Number(x.numero) || 0), 0) + 1, data: hojeISO(), desc: '', prazoDias: 0, linhas: [] };
    if (!a.id) return;
    // etapas que já existem antes deste aditivo (as novas dos aditivos anteriores também)
    const antes = P.etapas({ etapas: p.etapas, aditivos: ads.filter((x) => Number(x.numero) < Number(a.numero)) });
    const proxNum = () => String(Math.max(0, ...antes.map((e) => parseInt(e.num, 10) || 0)) + 1);
    const opcoes = (sel) => `<option value="*" ${sel === '*' ? 'selected' : ''}>Todas as etapas (na proporção do valor)</option>${antes.map((e) => `<option value="${esc(e.id)}" ${sel === e.id ? 'selected' : ''}>${esc(e.num)}. ${esc(e.desc)}</option>`).join('')}<option value="" ${sel === '' ? 'selected' : ''}>Etapa nova</option>`;
    const linha = (x) => `<div class="op-adl" data-id="${esc(x.id)}" data-num="${esc(x.num || '')}"><select class="inp" name="et" aria-label="Onde">${opcoes(x.etapaId === undefined ? (antes[0] ? antes[0].id : '') : x.etapaId)}</select>
      <input class="inp" name="desc" value="${esc(x.desc || '')}" placeholder="Nome da etapa nova" aria-label="Nome da etapa nova">
      <input class="inp money" name="valor" value="${esc(fmtV(x.valor))}" inputmode="decimal" placeholder="Ex.: 5.000,00 ou -2.000,00" aria-label="Valor"><button type="button" class="btn icon sm" data-op="x" aria-label="Tirar linha">${icone('lixo')}</button></div>`;
    ui.abrirModal({
      titulo: aid ? `Aditivo nº ${a.numero}` : `Novo aditivo (nº ${a.numero})`, largo: true,
      sub: 'Valor positivo acrescenta, negativo tira (supressão ou desconto). O valor do contrato e o peso das etapas se ajustam; a planilha original fica guardada.',
      corpo: `<div class="grid2"><label class="f"><span>Data</span><input class="inp" type="date" name="data" value="${esc(a.data || '')}"></label>
          <label class="f"><span>Prazo (dias a mais; negativo encurta)</span><input class="inp" name="prazo" inputmode="numeric" value="${esc(a.prazoDias ? String(a.prazoDias) : '')}" placeholder="0"></label>
          <label class="f span2 req"><span>Descrição (o cliente vê)</span><input class="inp" name="desc" value="${esc(a.desc || '')}" placeholder="Ex.: Inclusão dos rufos da platibanda e desconto negociado"></label></div>
        <div class="op-adl op-adl-cab"><span>Onde</span><span>Etapa nova</span><span>Valor (R$)</span><span></span></div><div data-q="ls">${(a.linhas.length ? a.linhas : [{ id: 'l' + uid().slice(0, 8) }]).map(linha).join('')}</div>
        <div class="op-et-pe"><button type="button" class="btn sm" data-op="mais">${icone('mais')}Linha</button><span class="small" data-q="res"></span></div>`,
      aoAbrir: (el) => {
        const box = $('[data-q=ls]', el);
        const ver = () => {
          $$('.op-adl', box).forEach((r) => { const nova = $('[name=et]', r).value === ''; $('[name=desc]', r).disabled = !nova; r.classList.toggle('nova', nova); });
          const t = $$('[name=valor]', box).reduce((x, i) => x + (lerValor(i.value) || 0), 0), dias = parseInt($('[name=prazo]', el).value, 10) || 0;
          const atual = P.total(p);
          $('[data-q=res]', el).innerHTML = `Este aditivo: <b class="${t < 0 ? 'neg' : ''}">${t >= 0 ? '+' : ''}${brl(t)}</b>${dias ? `, ${dias > 0 ? '+' : ''}${dias} dias` : ''}. Contrato ${aid ? 'com ele' : 'passa a'}: ${brl(atual + t - (aid ? (ads.find((x) => x.id === aid).linhas || []).reduce((y, l) => y + (Number(l.valor) || 0), 0) : 0))}`;
        };
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-op]'); if (!b) return;
          if (b.dataset.op === 'mais') box.insertAdjacentHTML('beforeend', linha({ id: 'l' + uid().slice(0, 8) }));
          if (b.dataset.op === 'x') b.closest('.op-adl').remove();
          ver();
        });
        el.addEventListener('input', ver); el.addEventListener('change', ver);
        box.addEventListener('focusout', (ev) => { if (ev.target.name === 'valor') { const v = lerValor(ev.target.value); if (v !== null) ev.target.value = fmtV(v); } });
        ver();
      },
      botoes: [...(aid ? [{ rot: 'Excluir aditivo', classe: 'danger', esq: true, acao: async (m) => {
        if (!(await ui.confirmar({ titulo: `Excluir o aditivo nº ${a.numero}?`, msg: 'O valor do contrato, o prazo e o peso das etapas voltam a ser os de antes dele. O avanço lançado em etapas novas deste aditivo deixa de contar.', ok: 'Excluir', perigo: true }))) return;
        p.aditivos = ads.filter((x) => x.id !== aid); salvar(s, p); m.fechar(); Sis.desenhar(true);
      } }] : []), { rot: 'Cancelar' }, { rot: aid ? 'Salvar aditivo' : 'Criar aditivo', classe: 'primary', acao: (m) => {
        const desc = $('[name=desc]', m.el).value.trim(), data = $('[name=data]', m.el).value;
        if (!desc) { $('[name=desc]', m.el).classList.add('erro'); return; }
        if (!data) { $('[name=data]', m.el).classList.add('erro'); return; }
        const pz = $('[name=prazo]', m.el).value.trim();
        if (pz && !/^[+-]?\d+$/.test(pz)) { $('[name=prazo]', m.el).classList.add('erro'); return; }
        const ls = [];
        let prox = Number(proxNum());
        for (const r of $$('[data-q=ls] .op-adl', m.el)) {
          const et = $('[name=et]', r).value, v = lerValor($('[name=valor]', r).value), d = $('[name=desc]', r).value.trim();
          if (v === null && !d) continue;
          if (v === null || v === 0) { $('[name=valor]', r).classList.add('erro'); return; }
          if (et === '' && !d) { $('[name=desc]', r).classList.add('erro'); return; }
          if (et === '' && v < 0) { $('[name=valor]', r).classList.add('erro'); ui.toast('Etapa nova começa com valor positivo.'); return; }
          const x = { id: r.dataset.id, etapaId: et, valor: Math.round(v * 100) / 100 };
          if (et === '') { x.desc = d; x.num = r.dataset.num || String(prox++); }
          ls.push(x);
        }
        if (!ls.length && !parseInt(pz, 10)) { ui.toast('Inclua um valor ou um prazo no aditivo.'); return; }
        Object.assign(a, { desc, data, prazoDias: parseInt(pz, 10) || 0, linhas: ls });
        const teste = Object.assign({}, p, { aditivos: ads.filter((x) => x.id !== a.id).concat([a]) });
        if (P.etapas(teste).some((e) => e.valor < -0.005)) { ui.toast('Uma etapa ficaria com valor negativo. Confira os valores.'); return; }
        p.aditivos = teste.aditivos.sort(P.porNumero);
        salvar(s, p); m.fechar(); ui.toast(aid ? 'Aditivo salvo.' : `Aditivo nº ${a.numero} criado.`); Sis.desenhar(true);
      } }],
    });
  }

  /* ---------- comunicados ---------- */
  function ctxCom(s) { const c = AC().cliente(s.clienteId) || {}; return { cliente: c.nome || '', obra: s.titulo || '', codigo: s.codigo || '', logo: logo() }; }
  function modalComunicado(sid, cid) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s), cs = p.comunicados || [];
    const c = cid ? Object.assign({}, cs.find((x) => x.id === cid)) : { id: 'c' + uid().slice(0, 8), numero: cs.reduce((t, x) => Math.max(t, Number(x.numero) || 0), 0) + 1, data: hojeISO(), titulo: '', texto: '', assinatura: cfg().assinatura || ASSINATURA };
    if (!c.id) return;
    ui.abrirModal({
      titulo: cid ? `Comunicado nº ${P.n3(c.numero)}` : `Novo comunicado (nº ${P.n3(c.numero)})`, largo: true,
      sub: 'Sai como uma página com a logo, a numeração, o rodapé e a marca d\'água da Souza. A gestão abre na Área do cliente e pode imprimir.',
      corpo: `<div class="grid2"><label class="f span2 req"><span>Assunto</span><input class="inp" name="titulo" value="${esc(c.titulo)}" placeholder="Ex.: Interdição parcial da garagem" autofocus></label>
          <label class="f"><span>Data</span><input class="inp" type="date" name="data" value="${esc(c.data || '')}"></label><div></div>
          <label class="f span2 req"><span>Texto</span><textarea class="inp op-com-tx" name="texto" rows="11" placeholder="Prezados,&#10;&#10;Informamos que...">${esc(c.texto)}</textarea></label>
          <p class="small muted span2" style="margin:-4px 0 0">Linha em branco separa os parágrafos. Linhas começando com "- " viram lista. **assim** fica em negrito.</p>
          <label class="f span2"><span>Assinatura</span><textarea class="inp" name="assinatura" rows="3">${esc(c.assinatura || '')}</textarea></label></div>`,
      botoes: [...(cid ? [{ rot: 'Excluir', classe: 'danger', esq: true, acao: async (m) => {
        if (!(await ui.confirmar({ titulo: `Excluir o comunicado nº ${P.n3(c.numero)}?`, msg: 'Ele some da Área do cliente. A numeração dos outros não muda.', ok: 'Excluir', perigo: true }))) return;
        p.comunicados = cs.filter((x) => x.id !== cid); salvar(s, p); m.fechar(); Sis.desenhar(true);
      } }] : []), { rot: 'Cancelar' }, { rot: 'Ver como fica', acao: (m) => { const x = ler(m); if (x) verComunicado(s, x, { previa: true }); } },
      { rot: cid ? 'Salvar' : 'Publicar', classe: 'primary', acao: (m) => {
        const x = ler(m); if (!x) return;
        p.comunicados = cs.filter((y) => y.id !== x.id).concat([x]).sort(P.porNumero);
        if (x.assinatura !== (cfg().assinatura || ASSINATURA)) salvarCfg({ assinatura: x.assinatura });
        salvar(s, p); m.fechar(); Sis.desenhar(true);
        if (!cid) publicado(sid, x.id);
      } }],
    });
    function ler(m) {
      const v = (k) => $(`[name=${k}]`, m.el).value.trim();
      if (!v('titulo')) { $('[name=titulo]', m.el).classList.add('erro'); return null; }
      if (!v('texto')) { $('[name=texto]', m.el).classList.add('erro'); return null; }
      if (!v('data')) { $('[name=data]', m.el).classList.add('erro'); return null; }
      return Object.assign({}, c, { titulo: v('titulo'), texto: $('[name=texto]', m.el).value.replace(/\s+$/, ''), data: v('data'), assinatura: v('assinatura') });
    }
  }
  const linkWhatsCom = (s, c) => `https://wa.me/?text=${encodeURIComponent(P.mensagemComunicado(c, Object.assign(ctxCom(s), { link: URL_PORTAL })))}`;
  function publicado(sid, cid) {
    const s = AC().servico(sid); const c = s && (painelDe(s).comunicados || []).find((x) => x.id === cid); if (!c) return;
    ui.abrirModal({
      titulo: `Comunicado nº ${P.n3(c.numero)} publicado`, sub: 'Já aparece para a gestão na Área do cliente.',
      corpo: `<p class="msg" style="margin-top:0">Avise o síndico ou o grupo do condomínio com a mensagem pronta:</p><pre class="op-msg">${esc(P.mensagemComunicado(c, Object.assign(ctxCom(s), { link: URL_PORTAL })))}</pre>`,
      botoes: [{ rot: 'Fechar' }, { rot: 'Ver e imprimir', acao: (m) => { m.fechar(); verComunicado(s, c); } }, { rot: 'Avisar no WhatsApp', classe: 'primary', icone: 'compartilhar', acao: (m) => { window.open(linkWhatsCom(s, c), '_blank', 'noopener'); m.fechar(); } }],
    });
  }
  function verComunicado(s, c, { previa = false } = {}) {
    ui.abrirModal({
      titulo: `${P.tituloCom(c)}${previa ? ' (prévia)' : ''}`, largo: true,
      corpo: `<div class="oc-papel">${P.htmlComunicado(c, ctxCom(s))}</div>`,
      botoes: [{ rot: 'Fechar' }, ...(previa ? [] : [{ rot: 'Avisar no WhatsApp', icone: 'compartilhar', acao: () => window.open(linkWhatsCom(s, c), '_blank', 'noopener') }]),
        { rot: 'Imprimir', classe: 'primary', icone: 'imprimir', acao: () => imprimirComunicado(s, c) }],
    });
  }
  function imprimirComunicado(s, c) {
    P.imprimir(`<div class="oc-imp">${P.htmlComunicado(c, ctxCom(s))}</div>`, { titulo: `${s.codigo ? s.codigo + ' - ' : ''}Comunicado ${P.n3(c.numero)} - ${c.titulo}`, rodape: P.RODAPE, margem: '16mm 16mm 18mm 16mm' });
  }

  /* ---------- diário de obra ligado ---------- */
  function modalDiario(sid) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s);
    const obs = AC().obrasRdo().filter((o) => !o.areaCliente || o.areaCliente === s.clienteId);
    ui.abrirModal({
      titulo: 'Ligar o Diário de obra', sub: 'Os diários aprovados desta obra aparecem para o cliente dentro do painel. O avanço do painel continua sendo o que você lança aqui.',
      corpo: obs.length ? `<div class="r-perfis ac-cts">${obs.map((o) => `<label class="r-perfil"><input type="radio" name="ob" value="${esc(o.id)}" ${p.rdoObraId === o.id ? 'checked' : ''}><span><b>${esc(o.nome)}</b><small>${esc([o.contrato, `${aprovados(o.id)} diários aprovados`, o.situacao === 'concluida' ? 'concluída' : ''].filter(Boolean).join(' · '))}</small></span></label>`).join('')}</div>`
        : '<p class="small muted">Nenhuma obra livre no Diário de obra. Cadastre a obra lá primeiro.</p>',
      botoes: [...(p.rdoObraId ? [{ rot: 'Desligar', classe: 'danger', esq: true, acao: (m) => {
        const o = B.store.get('obras', p.rdoObraId);
        if (o && o.dados.areaCliente === s.clienteId) { const d = Object.assign({}, o.dados); delete d.areaCliente; B.store.salvar('obras', o.id, 'obra', d, o.grupo); }
        p.rdoObraId = ''; salvar(s, p); m.fechar(); ui.toast('Diário de obra desligado. Ele deixa de aparecer para o cliente.'); Sis.desenhar(true);
      } }] : []), { rot: 'Cancelar' }, ...(obs.length ? [{ rot: 'Ligar', classe: 'primary', acao: (m) => {
        const r = $('[name=ob]:checked', m.el); if (!r) { ui.toast('Escolha a obra.'); return; }
        const o = B.store.get('obras', r.value); if (!o) return;
        if (p.rdoObraId && p.rdoObraId !== o.id) { const v = B.store.get('obras', p.rdoObraId); if (v && v.dados.areaCliente === s.clienteId) { const d = Object.assign({}, v.dados); delete d.areaCliente; B.store.salvar('obras', v.id, 'obra', d, v.grupo); } }
        // o cliente só lê os diários das obras liberadas para ele
        if (o.dados.areaCliente !== s.clienteId) B.store.salvar('obras', o.id, 'obra', Object.assign({}, o.dados, { areaCliente: s.clienteId }), o.grupo);
        p.rdoObraId = o.id; salvar(s, p); m.fechar(); ui.toast('Diário de obra ligado ao painel.'); Sis.desenhar(true);
      } }] : [])],
    });
  }
  function modalDados(sid) {
    const s = AC().servico(sid); if (!s) return;
    const p = painelDe(s);
    ui.abrirModal({
      titulo: 'Prazo da obra', sub: 'O prazo original. Os dias a mais ou a menos entram pelos aditivos.',
      corpo: `<div class="grid2"><label class="f"><span>Início</span><input class="inp" type="date" name="inicio" value="${esc(p.inicio || '')}"></label><label class="f"><span>Término previsto</span><input class="inp" type="date" name="termino" value="${esc(p.termino || '')}"></label></div>`,
      botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar', classe: 'primary', acao: (m) => {
        const ini = $('[name=inicio]', m.el).value, fim = $('[name=termino]', m.el).value;
        if (!ini) { $('[name=inicio]', m.el).classList.add('erro'); return; }
        if (fim && fim < ini) { $('[name=termino]', m.el).classList.add('erro'); ui.toast('O término vem antes do início.'); return; }
        Object.assign(p, { inicio: ini, termino: fim }); salvar(s, p); m.fechar(); Sis.desenhar(true);
      } }],
    });
  }
  function imprimirRelatorio(sid) {
    const s = AC().servico(sid); if (!s) return;
    const c = AC().cliente(s.clienteId) || {};
    P.imprimir(P.htmlRelatorio({ s: Object.assign({}, s, { painel: painelDe(s) }), cliente: c.nome || '', logo: logo() }), { titulo: `${s.codigo ? s.codigo + ' - ' : ''}Relatório de avanço - ${dataBR(hojeISO()).replace(/\//g, '-')}`, rodape: P.RODAPE });
  }

  /* ---------- tela ---------- */
  const barra = (v, cor) => `<div class="op-bar"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(1)}%;background:${cor}"></i></div>`;
  function tela(el, cid, sid) {
    const c = AC().cliente(cid), s = AC().servico(sid);
    if (!c || !s || s.clienteId !== cid) { el.innerHTML = '<div class="card"><div class="empty"><b>Obra não encontrada</b><a href="#/area">Voltar</a></div></div>'; return; }
    const p = painelDe(s), hoje = hojeISO(), temP = P.tem(p);
    const es = temP ? P.etapas(p, hoje) : [], ps = P.pctEtapas(p, hoje), fis = P.fisico(p, hoje), fin = P.financeiro(p, s.financeiro, hoje), pz = P.prazo(p, hoje);
    const ult = P.medicaoAte(p, null), ms = P.medicoes(p), ads = (p.aditivos || []).slice().sort(P.porNumero), coms = (p.comunicados || []).slice().sort(P.porNumero).reverse();
    const ori = P.totalOriginal(p), rdo = rdoObra(p.rdoObraId);
    const pts = P.serie(p, s.financeiro, { ref: hoje, concluida: s.situacao === 'entregue' });
    const parado = ult && R.difDias(hoje, ult.data) > 15 && s.situacao !== 'entregue';
    const difCart = s.financeiro && temP && Math.abs(Number(s.financeiro.valor || 0) - fin.total) > 1 ? Number(s.financeiro.valor || 0) : null;
    const base = `data-sv="${esc(s.id)}"`;
    el.innerHTML = `<div class="ob-topo"><a class="btn icon" href="#/area/${esc(cid)}" aria-label="Voltar">${icone('esq')}</a>
        <div class="tit"><b>${esc(s.titulo || AC().nomeTipo(s.tipo))}</b><span>Painel da obra · ${esc([c.nome, s.codigo].filter(Boolean).join(' · '))}</span></div>
        <div class="actions"><button class="btn" data-a="op-prazo" ${base}>${icone('agenda')}<span>Prazo</span></button>${temP ? `<button class="btn" data-a="op-rel" ${base}>${icone('imprimir')}<span>Relatório</span></button><button class="btn primary" data-a="op-avanco" ${base}>${icone('repetir')}<span>Atualizar avanço</span></button>` : ''}</div></div>
      ${temP ? `<div class="op-kpis">
        <div><span>Avanço físico</span><b>${pct(fis)}</b>${barra(fis, P.COR_FIS)}<small>${ult ? `Atualizado em ${dataBR(ult.data)}` : 'Ainda sem atualização'}</small></div>
        <div><span>Avanço financeiro (pago)</span><b>${fin.ligado ? pct(fin.pct) : '-'}</b>${barra(fin.pct, P.COR_FIN)}<small>${fin.ligado ? `${brl(fin.pago)} de ${brl(fin.total)}` : 'Contrato não ligado à carteira'}</small></div>
        <div><span>Valor do contrato</span><b>${brl(fin.total)}</b><small>${ads.length ? `Original ${brl(ori)}, ${ads.length} ${ads.length === 1 ? 'aditivo' : 'aditivos'}` : 'Sem aditivos'}</small></div>
        <div><span>Prazo</span><b>${pz.decorrido !== null && pz.totalDias ? `Dia ${pz.decorrido} de ${pz.totalDias}` : '-'}</b><small>${pz.termino ? `Término ${dataBR(pz.termino)}${pz.extra ? ` (${pz.extra > 0 ? '+' : ''}${pz.extra} dias)` : ''}` : 'Sem término definido'}${pz.atrasada && s.situacao !== 'entregue' ? ' · <span class="neg">passou do prazo</span>' : ''}</small></div></div>
      ${parado ? `<p class="op-alerta">${icone('alerta')}<span>O avanço não é atualizado há ${R.difDias(hoje, ult.data)} dias. O cliente vê a data da última atualização.</span></p>` : ''}` : ''}
      <div class="op-grid"><div class="op-col">
        ${temP ? `<section class="card"><div class="hd"><div><h3>Avanço por etapa</h3><p>Peso pelo valor de cada etapa. Você lança só as etapas principais.</p></div><div class="actions">${ms.length ? `<button class="btn sm ghost" data-a="op-hist" ${base}>${icone('lista')}Histórico (${ms.length})</button>` : ''}</div></div>
          <div class="bd flush tblwrap"><table class="tbl op-tbl"><thead><tr><th>Nº</th><th>Etapa</th><th class="num op-v">Valor</th><th class="num">Peso</th><th>Executado</th></tr></thead><tbody>
          ${es.map((e) => `<tr class="${e.valor <= 0 ? 'off' : ''}"><td>${esc(e.num)}</td><td>${esc(e.desc)}${e.aditivo ? ` <span class="chip neutro">aditivo nº ${esc(e.aditivo)}</span>` : ''}${e.valor <= 0 ? ' <span class="chip neutro">suprimida</span>' : ''}</td><td class="num op-v">${brl(Math.max(0, e.valor))}</td><td class="num">${pct(e.peso * 100)}</td><td class="op-ex"><span>${pct(ps.get(e.id), 0)}</span>${barra(ps.get(e.id), P.COR_FIS)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td></td><td>Obra</td><td class="num op-v">${brl(fin.total)}</td><td class="num">100%</td><td class="op-ex"><span>${pct(fis, 1)}</span></td></tr></tfoot></table></div></section>
        <section class="card"><div class="hd"><div><h3>Evolução por quinzena</h3><p>O mesmo gráfico que o cliente vê.</p></div></div><div class="bd">${P.htmlGrafico(pts)}</div></section>
        <section class="card"><div class="hd"><div><h3>Aditivos</h3><p>Acréscimos, supressões e descontos, com o prazo.</p></div><div class="actions"><button class="btn sm" data-a="op-adit" ${base}>${icone('mais')}Aditivo</button></div></div>
          <div class="bd">${ads.length ? `<ul class="op-lista">${ads.map((a) => { const v = (a.linhas || []).reduce((t, x) => t + (Number(x.valor) || 0), 0); return `<li><button class="op-li" data-a="op-adit" ${base} data-id="${esc(a.id)}"><span class="op-li-t"><b>Aditivo nº ${esc(a.numero)}</b><small>${dataBR(a.data)} · ${esc(a.desc)}</small></span><span class="op-li-v"><b class="${v < 0 ? 'neg' : ''}">${v >= 0 ? '+' : ''}${brl(v)}</b>${a.prazoDias ? `<small>${a.prazoDias > 0 ? '+' : ''}${a.prazoDias} dias</small>` : ''}</span>${icone('editar')}</button></li>`; }).join('')}
            <li class="op-li-tot"><span>Contrato original ${brl(ori)}</span><b>Atual ${brl(fin.total)}</b></li></ul>` : '<p class="small muted">Nenhum aditivo. O contrato está como na planilha.</p>'}</div></section>
        <section class="card"><div class="hd"><div><h3>Planilha do contrato</h3><p>${p.origem ? `${p.origem.tipo === 'excel' ? `Importada do Excel (${esc(p.origem.nome)})` : p.origem.tipo === 'orcamento' ? `Do orçamento ${esc(p.origem.nome)}` : 'Digitada'}${p.origem.em ? ` em ${dataBR(p.origem.em)}` : ''}. ` : ''}${p.etapas.length} etapas, ${brl(ori)}.</p></div>
          <div class="actions"><button class="btn sm ghost" data-a="op-etapas" ${base}>${icone('editar')}Editar etapas</button><button class="btn sm ghost" data-a="op-excel" ${base}>${icone('baixar')}Excel</button><button class="btn sm ghost" data-a="op-orc" ${base}>${icone('orcamento')}Orçamento</button></div></div></section>`
        : `<section class="card op-comeco"><div class="bd"><h3>Comece pela planilha do contrato</h3><p>As etapas principais e o valor de cada uma. O peso de cada etapa no avanço físico sai do valor dela. Do Excel, a leitura segue as colunas: nº (1, 1.1, 1.1.1...), descrição, quantidade, unidade, preço unitário e valor total.</p>
          <div class="actions"><button class="btn primary" data-a="op-excel" ${base}>${icone('baixar')}Importar do Excel</button><button class="btn" data-a="op-orc" ${base}>${icone('orcamento')}Usar um orçamento</button><button class="btn ghost" data-a="op-etapas" ${base}>Digitar as etapas</button></div></div></section>`}
      </div><div class="op-col">
        <section class="card"><div class="hd"><div><h3>Comunicados</h3><p>Numerados e datados, com logo, rodapé e marca d'água.</p></div><div class="actions"><button class="btn sm primary" data-a="op-com" ${base}>${icone('mais')}Comunicado</button></div></div>
          <div class="bd">${coms.length ? `<ul class="op-lista">${coms.map((x) => `<li><div class="op-li op-li-com"><span class="op-com-n">nº ${P.n3(x.numero)}</span><span class="op-li-t"><b>${esc(x.titulo)}</b><small>${dataBR(x.data)}</small></span>
            <span class="op-li-a"><button class="btn icon sm" data-a="op-com-ver" ${base} data-id="${esc(x.id)}" aria-label="Ver e imprimir" title="Ver e imprimir">${icone('imprimir')}</button><a class="btn icon sm" href="${esc(linkWhatsCom(s, x))}" target="_blank" rel="noopener" aria-label="Avisar no WhatsApp" title="Avisar no WhatsApp">${icone('compartilhar')}</a><button class="btn icon sm" data-a="op-com" ${base} data-id="${esc(x.id)}" aria-label="Editar" title="Editar">${icone('editar')}</button></span></div></li>`).join('')}</ul>` : '<p class="small muted">Nenhum comunicado ainda.</p>'}</div></section>
        <section class="card"><div class="hd"><div><h3>Diário de obra</h3><p>${rdo ? 'Os diários aprovados aparecem no painel do cliente.' : 'Opcional: ligue a obra do Diário de obra.'}</p></div><div class="actions"><button class="btn sm ${rdo ? 'ghost' : ''}" data-a="op-rdo" ${base}>${rdo ? 'Trocar' : `${icone('mais')}Ligar`}</button></div></div>
          ${rdo ? `<div class="bd"><a class="op-rdo" href="#/rdo/${esc(rdo.id)}">${icone('rdo')}<span><b>${esc(rdo.nome)}</b><small>${aprovados(rdo.id)} diários aprovados</small></span>${icone('dir')}</a></div>` : ''}</section>
        <section class="card"><div class="hd"><div><h3>Contrato e pagamentos</h3><p>O financeiro do cliente vem das parcelas da carteira.</p></div></div><div class="bd">${AC().htmlFinanceiro(s)}
          ${difCart !== null ? `<p class="op-alerta" style="margin:10px 0 0">${icone('info')}<span>Na carteira o contrato está com ${brl(difCart)}; a planilha com os aditivos soma ${brl(fin.total)}. O cliente vê o percentual pago sobre ${brl(fin.total)}.</span></p>` : ''}</div></section>
        <section class="card"><div class="hd"><div><h3>Documentos da obra</h3><p>Os links do Drive que a gestão vê.</p></div></div><div class="bd">
          ${s.estrutura.length ? `<ul class="ac-arvore">${AC().htmlArvore(s.estrutura, 's:' + s.id, false)}</ul>` : '<p class="small muted">Nenhuma pasta ou documento ainda.</p>'}
          <div class="actions"><button class="btn sm" data-a="ac-no-novo" data-t="doc" data-dono="s:${esc(s.id)}">${icone('mais')}Documento</button><button class="btn sm" data-a="ac-no-novo" data-t="pasta" data-dono="s:${esc(s.id)}">${icone('mais')}Pasta</button>
            ${s.estrutura.length ? `<button class="btn sm ghost" data-a="ac-sv-pag" data-id="${esc(s.id)}">${icone('cadeado')}Liberar com o pagamento${R.travadosPorPagamento(s.estrutura) ? ` (${R.travadosPorPagamento(s.estrutura)})` : ''}</button>` : ''}</div></div></section>
      </div></div>`;
    P.ligar(el);
  }

  A['op-avanco'] = (b) => modalAvanco(b.dataset.sv);
  A['op-hist'] = (b) => modalHistorico(b.dataset.sv);
  A['op-adit'] = (b) => modalAditivo(b.dataset.sv, b.dataset.id || null);
  A['op-etapas'] = (b) => modalEtapas(b.dataset.sv);
  A['op-excel'] = (b) => importarExcel(b.dataset.sv);
  A['op-orc'] = (b) => importarOrcamento(b.dataset.sv);
  A['op-com'] = (b) => modalComunicado(b.dataset.sv, b.dataset.id || null);
  A['op-com-ver'] = (b) => { const s = AC().servico(b.dataset.sv); const c = s && (painelDe(s).comunicados || []).find((x) => x.id === b.dataset.id); if (c) verComunicado(s, c); };
  A['op-rdo'] = (b) => modalDiario(b.dataset.sv);
  A['op-prazo'] = (b) => modalDados(b.dataset.sv);
  A['op-rel'] = (b) => imprimirRelatorio(b.dataset.sv);
  A['op-abrir'] = (b) => {
    const s = AC().servico(b.dataset.sv); if (!s) return;
    if (!s.painel) salvar(s, painelDe(s));
    location.hash = `#/area/${s.clienteId}/obra/${s.id}`;
  };

  Sis.areaObra = { tela, lerPlanilhaObra, lerValor, painelDe };
})();
