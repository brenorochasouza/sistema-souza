'use strict';
/* =========================================================
   Painel da obra (Área do cliente): contas e desenho usados
   no sistema e no portal do cliente.
   Fica dentro do serviço (tabela "portal" do projeto do Diário
   de obra), no campo "painel":
     inicio, termino   prazo original (ISO)
     origem            de onde veio a planilha { tipo, nome, em }
     etapas            [{ id, num, desc, valor }] só as etapas principais (a planilha original)
     aditivos          [{ id, numero, data, desc, prazoDias, linhas: [{ id, etapaId, num, desc, valor }] }]
                       etapaId de uma etapa: soma ao valor dela (negativo tira);
                       '*': vale para todas, na proporção do valor (desconto geral);
                       vazio: etapa nova
     medicoes          [{ id, data, pct: { etapaId: 0 a 100 } }] o avanço físico de cada atualização
     comunicados       [{ id, numero, data, titulo, texto, assinatura }]
     rdoObraId         diário de obra ligado (opcional)
   Os pagamentos vêm do contrato da carteira (servico.financeiro).
   ========================================================= */
window.ObraPainel = (function () {
  const R = window.RDO;
  const { esc, dataBR, deISO, isoData, somaDias, difDias } = R;
  const COR_FIS = '#C43E50', COR_FIN = '#2a78d6';
  const RODAPE = 'Souza Engenharia · CNPJ 49.885.935/0001-91 · (71) 99723-7168 · obras@souzaengenharia.com · www.souzaengenharia.com';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const n = (v) => Number(v) || 0;
  const hoje = () => isoData(new Date());
  const ehData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const brl = (v) => n(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = (v, c = 1) => `${n(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`;
  const dataLonga = (iso) => { const d = deISO(iso); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
  const n3 = (x) => String(x || '').padStart(3, '0');
  const tem = (p) => !!(p && Array.isArray(p.etapas) && p.etapas.length);

  /* ---------------- contas ---------------- */
  const porNumero = (a, b) => n(a.numero) - n(b.numero) || String(a.data || '').localeCompare(String(b.data || ''));
  /** Etapas valendo numa data (a planilha mais os aditivos até ela), com o peso de cada uma. */
  function etapas(p, ate) {
    const l = ((p && p.etapas) || []).map((e) => ({ id: e.id, num: e.num || '', desc: e.desc || '', original: n(e.valor), valor: n(e.valor), aditivo: null }));
    const ads = ((p && p.aditivos) || []).filter((a) => !ate || !ehData(a.data) || a.data <= ate).slice().sort(porNumero);
    for (const a of ads) {
      for (const x of a.linhas || []) {
        const v = n(x.valor);
        if (x.etapaId === '*') {
          const base = l.reduce((t, e) => t + Math.max(0, e.valor), 0);
          if (base > 0) l.forEach((e) => { e.valor += (v * Math.max(0, e.valor)) / base; });
        } else if (x.etapaId) {
          const e = l.find((y) => y.id === x.etapaId); if (e) e.valor += v;
        } else l.push({ id: x.id, num: x.num || '', desc: x.desc || 'Serviço do aditivo', original: 0, valor: v, aditivo: a.numero });
      }
    }
    l.forEach((e) => { e.valor = Math.round(e.valor * 100) / 100; });
    const tot = l.reduce((t, e) => t + Math.max(0, e.valor), 0);
    l.forEach((e) => { e.peso = tot > 0 ? Math.max(0, e.valor) / tot : 0; });
    return l;
  }
  const total = (p, ate) => etapas(p, ate).reduce((t, e) => t + Math.max(0, e.valor), 0);
  const totalOriginal = (p) => ((p && p.etapas) || []).reduce((t, e) => t + Math.max(0, n(e.valor)), 0);
  const medicoes = (p) => ((p && p.medicoes) || []).filter((m) => ehData(m.data)).slice().sort((a, b) => a.data.localeCompare(b.data));
  const medicaoAte = (p, ate) => { const l = medicoes(p).filter((m) => !ate || m.data <= ate); return l[l.length - 1] || null; };
  /** Avanço físico de cada etapa na última atualização até a data. */
  function pctEtapas(p, ate) {
    const m = medicaoAte(p, ate), out = new Map();
    etapas(p, ate).forEach((e) => out.set(e.id, Math.max(0, Math.min(100, n(m && m.pct && m.pct[e.id])))));
    return out;
  }
  /** Avanço físico da obra: soma de (peso da etapa x avanço da etapa). */
  function fisico(p, ate = hoje()) {
    const m = medicaoAte(p, ate); if (!m) return 0;
    const ps = pctEtapas(p, ate);
    return etapas(p, ate).reduce((t, e) => t + e.peso * ps.get(e.id), 0);
  }
  /** Parcelas pagas do contrato da carteira, com a data do pagamento. */
  const pagos = (fin) => ((fin && fin.parcelas) || []).filter((x) => x.pago).map((x) => ({ data: ehData(x.dataPago) ? x.dataPago : ehData(x.venc) ? x.venc : '', valor: n(x.valor), desc: x.desc || '' }));
  /** Avanço financeiro: o que já foi pago sobre o valor do contrato com os aditivos. */
  function financeiro(p, fin, ate = hoje()) {
    const t = tem(p) ? total(p, ate) : n(fin && fin.valor);
    const pago = pagos(fin).filter((x) => !x.data || x.data <= ate).reduce((s, x) => s + x.valor, 0);
    return { total: t, pago, aPagar: Math.max(0, t - pago), pct: t > 0 ? (pago / t) * 100 : 0, ligado: !!fin };
  }
  /** Prazo: término com os dias dos aditivos e o dia de hoje na obra. */
  function prazo(p, ref = hoje()) {
    const ini = ehData(p && p.inicio) ? p.inicio : '', fim0 = ehData(p && p.termino) ? p.termino : '';
    const extra = ((p && p.aditivos) || []).reduce((t, a) => t + (Math.round(n(a.prazoDias)) || 0), 0);
    const termino = fim0 ? somaDias(fim0, extra) : '';
    const totalDias = ini && termino ? difDias(termino, ini) + 1 : null;
    const decorrido = ini ? Math.max(0, difDias(ref, ini) + 1) : null;
    return { inicio: ini, termino, original: fim0, extra, totalDias, decorrido, atrasada: !!(termino && ref > termino) };
  }
  /** Datas do gráfico: o início e o fim de cada quinzena (dia 15 e último dia do mês) até a data final. */
  function quinzenas(ini, fim) {
    if (!ehData(ini) || !ehData(fim) || fim < ini) return [];
    const out = [ini];
    let d = deISO(ini);
    for (let guarda = 0; guarda < 400; guarda++) {
      const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const q = isoData(new Date(d.getFullYear(), d.getMonth(), d.getDate() <= 15 ? 15 : ult));
      if (q >= fim) { if (out[out.length - 1] !== fim) out.push(fim); break; }
      if (q !== out[out.length - 1]) out.push(q);
      d = deISO(somaDias(q, 1));
    }
    return out;
  }
  /** Série do gráfico por quinzena: físico e financeiro (%), do início até hoje (ou o fim da obra). */
  function serie(p, fin, { ref = hoje(), concluida = false } = {}) {
    const ms = medicoes(p), pg = pagos(fin).filter((x) => x.data);
    const ini = ehData(p && p.inicio) ? p.inicio : ms.length ? ms[0].data : '';
    if (!ini) return [];
    let fim = ref;
    if (concluida) {
      const ult = [ms.length ? ms[ms.length - 1].data : '', ...pg.map((x) => x.data)].filter(Boolean).sort().pop();
      if (ult && ult < fim) fim = ult;
    }
    return quinzenas(ini, fim < ini ? ini : fim).map((d) => ({ d, f: Math.round(fisico(p, d) * 10) / 10, p: Math.round(financeiro(p, fin, d).pct * 10) / 10 }));
  }

  /* ---------------- gráfico (SVG, com o cursor mostrando os valores) ----------------
     Desenhado na largura real da tela (1 unidade = 1 px), para o texto não encolher no celular. */
  const geo = (w) => { const curto = w < 520; return { w, h: curto ? 210 : 250, l: curto ? 34 : 46, r: curto ? 46 : 108, t: 16, b: 30, curto }; };
  const topoDe = (pts) => { const max = Math.max(100, ...pts.map((x) => Math.max(x.f, x.p))); return max > 100 ? Math.ceil(max / 25) * 25 : 100; };
  function svgGrafico(pts, w, estatico) {
    const G = geo(w), k = pts.length, topo = topoDe(pts);
    const pw = G.w - G.l - G.r, ph = G.h - G.t - G.b;
    const X = (i) => G.l + (k > 1 ? (i * pw) / (k - 1) : pw / 2), Y = (v) => G.t + ph - (Math.max(0, v) / topo) * ph;
    const grade = []; for (let v = 0; v <= topo; v += 25) grade.push(v);
    const passo = Math.max(1, Math.ceil(k / Math.max(2, Math.floor(pw / 64))));
    const rotX = pts.map((x, i) => ({ i, x })).filter(({ i }) => i % passo === 0 || i === k - 1).filter(({ i }) => i === k - 1 || k - 1 - i >= passo * 0.6);
    const linha = (c) => pts.map((x, i) => `${X(i).toFixed(1)},${Y(x[c]).toFixed(1)}`).join(' ');
    const u = pts[k - 1];
    let yf = Y(u.f), yp = Y(u.p);
    if (Math.abs(yf - yp) < 18) { const m = (yf + yp) / 2; if (u.f >= u.p) { yf = m - 9; yp = m + 9; } else { yf = m + 9; yp = m - 9; } }
    const rot = (y, nome, v) => `<text class="og-rot" x="${(X(k - 1) + 10).toFixed(1)}" y="${(y + 4).toFixed(1)}">${G.curto ? '' : nome + ' '}<tspan class="og-rot-v">${pct(v, 0)}</tspan></text>`;
    return `<svg viewBox="0 0 ${G.w} ${G.h}" width="${G.w}" height="${G.h}" role="img" aria-label="Avanço físico ${pct(u.f, 0)} e financeiro ${pct(u.p, 0)} em ${dataBR(u.d)}">
        ${grade.map((v) => `<line class="og-gr" x1="${G.l}" x2="${G.w - G.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="og-ax" x="${G.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v}%</text>`).join('')}
        ${rotX.map(({ i, x }) => `<text class="og-ax" x="${X(i).toFixed(1)}" y="${G.h - 9}" text-anchor="${k === 1 ? 'middle' : i === 0 ? 'start' : i === k - 1 ? 'end' : 'middle'}">${dataBR(x.d).slice(0, 5)}</text>`).join('')}
        ${k > 1 ? `<polyline class="og-l" points="${linha('p')}" stroke="${COR_FIN}"/><polyline class="og-l" points="${linha('f')}" stroke="${COR_FIS}"/>` : ''}
        <circle class="og-pt" cx="${X(k - 1).toFixed(1)}" cy="${Y(u.p).toFixed(1)}" r="4.5" fill="${COR_FIN}"/><circle class="og-pt" cx="${X(k - 1).toFixed(1)}" cy="${Y(u.f).toFixed(1)}" r="4.5" fill="${COR_FIS}"/>
        ${rot(yf, 'Físico', u.f)}${rot(yp, 'Financeiro', u.p)}
        ${estatico ? '' : `<g class="og-cursor" style="display:none"><line class="og-cl" y1="${G.t}" y2="${G.t + ph}"/><circle class="og-pt" r="4.5" fill="${COR_FIN}" data-c="p"/><circle class="og-pt" r="4.5" fill="${COR_FIS}" data-c="f"/></g>
          <rect class="og-alvo" x="${G.l}" y="${G.t}" width="${pw}" height="${ph}" fill="transparent"/>`}
      </svg>`;
  }
  function htmlGrafico(pts, { estatico = false } = {}) {
    if (!pts.length) return '<p class="small muted og-vazio">O gráfico aparece com a primeira atualização do avanço.</p>';
    const u = pts[pts.length - 1];
    const tabela = `<details class="og-tab"><summary>Ver os números</summary><table class="tbl"><thead><tr><th>Até</th><th class="num">Avanço físico</th><th class="num">Avanço financeiro</th></tr></thead>
      <tbody>${pts.map((x) => `<tr><td>${dataBR(x.d)}</td><td class="num">${pct(x.f)}</td><td class="num">${pct(x.p)}</td></tr>`).join('')}</tbody></table></details>`;
    return `<div class="og ${estatico ? 'estatico' : ''}" data-og='${esc(JSON.stringify(pts))}'>
      <div class="og-leg"><span><i style="background:${COR_FIS}"></i>Avanço físico <b>${pct(u.f, 0)}</b></span><span><i style="background:${COR_FIN}"></i>Avanço financeiro (pago) <b>${pct(u.p, 0)}</b></span></div>
      <div class="og-box">${svgGrafico(pts, 720, estatico)}${estatico ? '' : '<div class="og-tip" hidden></div>'}</div>${estatico ? '' : tabela}</div>`;
  }
  /** Redesenha cada gráfico na largura da tela e liga o cursor (mostra a data e os dois valores da quinzena mais perto). */
  function ligar(raiz) {
    (raiz || document).querySelectorAll('.og[data-og]:not(.estatico)').forEach((og) => {
      let pts; try { pts = JSON.parse(og.dataset.og); } catch { return; }
      if (!pts.length) return;
      const box = og.querySelector('.og-box'), w = Math.round(box.clientWidth);
      if (w > 0 && w !== og._w) { og._w = w; box.querySelector('svg').outerHTML = svgGrafico(pts, Math.max(280, w), false); }
      if (og._ligado) return; og._ligado = true;
      const tip = og.querySelector('.og-tip'), k = pts.length;
      const mostrar = (ev) => {
        const svg = og.querySelector('svg'), cur = og.querySelector('.og-cursor'); if (!svg || !cur) return;
        const G = geo(og._w ? Math.max(280, og._w) : 720), topo = topoDe(pts), pw = G.w - G.l - G.r, ph = G.h - G.t - G.b;
        const X = (i) => G.l + (k > 1 ? (i * pw) / (k - 1) : pw / 2), Y = (v) => G.t + ph - (Math.max(0, v) / topo) * ph;
        const r = svg.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * G.w;
        if (sx < G.l - 10 || sx > G.w - G.r + 10) { esconder(); return; }
        const i = k > 1 ? Math.max(0, Math.min(k - 1, Math.round(((sx - G.l) / pw) * (k - 1)))) : 0;
        const x = pts[i];
        cur.style.display = '';
        cur.querySelector('line').setAttribute('x1', X(i)); cur.querySelector('line').setAttribute('x2', X(i));
        cur.querySelectorAll('circle').forEach((c) => { c.setAttribute('cx', X(i)); c.setAttribute('cy', Y(x[c.dataset.c])); });
        tip.hidden = false;
        tip.innerHTML = `<b>${i === 0 ? 'Início' : 'Até'} ${dataBR(x.d)}</b><span><i style="background:${COR_FIS}"></i>Físico ${pct(x.f)}</span><span><i style="background:${COR_FIN}"></i>Financeiro ${pct(x.p)}</span>`;
        const px = (X(i) / G.w) * r.width, larg = tip.offsetWidth;
        tip.style.left = `${Math.max(0, Math.min(r.width - larg, px - larg / 2))}px`;
        tip.style.top = `${Math.max(0, (Math.min(Y(x.f), Y(x.p)) / G.h) * r.height - tip.offsetHeight - 12)}px`;
      };
      const esconder = () => { const cur = og.querySelector('.og-cursor'); if (cur) cur.style.display = 'none'; tip.hidden = true; };
      box.addEventListener('pointermove', mostrar);
      box.addEventListener('pointerdown', mostrar);
      box.addEventListener('pointerleave', esconder);
    });
  }
  let _rz;
  window.addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(() => ligar(document), 150); });

  /* ---------------- comunicado ---------------- */
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  /** Texto do comunicado: parágrafos (linha em branco), quebras de linha, listas (- no começo) e **negrito**. */
  function textoRico(t) {
    return String(t || '').replace(/\r/g, '').trim().split(/\n\s*\n/).map((b) => {
      const ls = b.split('\n');
      if (ls.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${ls.map((l) => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
      return `<p>${ls.map(inline).join('<br>')}</p>`;
    }).join('');
  }
  const tituloCom = (c) => `Comunicado nº ${n3(c.numero)}`;
  /** A folha do comunicado: logo, número e data, destinatário, texto, assinatura, rodapé e marca d'água. */
  function htmlComunicado(c, { cliente = '', obra = '', codigo = '', logo = '', cidade = 'Salvador' } = {}) {
    return `<article class="oc-folha">
      ${logo ? `<img class="oc-marca" src="${esc(logo)}" alt="" aria-hidden="true">` : ''}
      <header class="oc-cab">${logo ? `<img class="oc-logo" src="${esc(logo)}" alt="Souza Engenharia">` : '<b>Souza Engenharia</b>'}
        <div class="oc-cab-t"><b>${tituloCom(c)}</b><span>${esc(cidade)}, ${ehData(c.data) ? dataLonga(c.data) : ''}</span></div></header>
      <div class="oc-ref">${cliente ? `<div><span>Para</span><b>${esc(cliente)}</b></div>` : ''}${obra ? `<div><span>Obra</span><b>${esc(obra)}${codigo ? ` (${esc(codigo)})` : ''}</b></div>` : ''}</div>
      <h1 class="oc-tit">${esc(c.titulo || '')}</h1>
      <div class="oc-corpo">${textoRico(c.texto)}</div>
      <div class="oc-ass"><span>Atenciosamente,</span>${String(c.assinatura || 'Souza Engenharia').split('\n').map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : `<small>${esc(l)}</small>`)).join('')}</div>
      <footer class="oc-rod">${esc(RODAPE)}</footer>
    </article>`;
  }
  /** Mensagem pronta para avisar a gestão de um comunicado novo. */
  function mensagemComunicado(c, { cliente = '', obra = '', link = '' } = {}) {
    return `Olá! A Souza Engenharia publicou o ${tituloCom(c)} da obra ${obra}${cliente ? `, d${artigo(cliente)} ${cliente}` : ''}: "${c.titulo}".\n\nPara ler e imprimir, entre na Área do cliente${link ? `: ${link}` : ''} com o usuário do condomínio, abra a obra e vá em Comunicados.`;
  }
  const artigo = (nome) => (/(a|as|ção|ções|dade|ede)$/i.test(String(nome || '').trim().split(/\s+/)[0] || '') ? 'a' : 'o');

  /* ---------------- relatório de avanço (impressão A4) ---------------- */
  function htmlRelatorio({ s, cliente = '', logo = '', ref = hoje() }) {
    const p = s.painel || {}, es = etapas(p, ref), ps = pctEtapas(p, ref), fis = fisico(p, ref), fin = financeiro(p, s.financeiro, ref), pz = prazo(p, ref);
    const m = medicaoAte(p, ref), ads = (p.aditivos || []).slice().sort(porNumero), ori = totalOriginal(p);
    const pts = serie(p, s.financeiro, { ref, concluida: s.situacao === 'entregue' });
    const parcelas = (s.financeiro && s.financeiro.parcelas) || [];
    return `<div class="rp">
      <div class="rp-head"><div class="rp-logo">${logo ? `<img src="${esc(logo)}" alt="Souza Engenharia">` : '<b>Souza Engenharia</b>'}</div>
        <div class="rp-tit"><h1>Relatório de avanço da obra</h1><div>Posição em ${dataBR(ref)}${m ? `, avanço físico atualizado em ${dataBR(m.data)}` : ''}</div></div></div>
      <div class="rp-obra"><div><b>Obra:</b> ${esc(s.titulo || '')}</div><div><b>Cliente:</b> ${esc(cliente)}</div>
        <div><b>Código:</b> ${esc(s.codigo || '')}</div><div><b>Situação:</b> ${s.situacao === 'entregue' ? 'Concluída' : 'Em andamento'}</div>
        <div><b>Início:</b> ${pz.inicio ? dataBR(pz.inicio) : '-'}</div><div><b>Término previsto:</b> ${pz.termino ? dataBR(pz.termino) : '-'}${pz.extra ? ` (${pz.extra > 0 ? '+' : ''}${pz.extra} dias de aditivos)` : ''}</div></div>
      <div class="rp-kpis"><div><span>Avanço físico</span><b>${pct(fis)}</b></div><div><span>Avanço financeiro (pago)</span><b>${pct(fin.pct)}</b></div>
        <div><span>Valor do contrato</span><b>${brl(fin.total)}</b></div><div><span>Prazo</span><b>${pz.decorrido !== null && pz.totalDias ? `Dia ${Math.min(pz.decorrido, 9999)} de ${pz.totalDias}` : '-'}</b></div></div>
      <h2>Avanço por etapa</h2>
      <table><thead><tr><th>Nº</th><th>Etapa</th><th class="num">Valor</th><th class="num">Peso</th><th class="num">Executado</th></tr></thead>
        <tbody>${es.map((e) => `<tr><td>${esc(e.num)}</td><td>${esc(e.desc)}${e.aditivo ? ` <small>(aditivo nº ${esc(e.aditivo)})</small>` : ''}${e.valor <= 0 ? ' <small>(suprimida)</small>' : ''}</td><td class="num">${brl(Math.max(0, e.valor))}</td><td class="num">${pct(e.peso * 100)}</td><td class="num">${pct(ps.get(e.id))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td></td><td>Total</td><td class="num">${brl(fin.total)}</td><td class="num">100%</td><td class="num">${pct(fis)}</td></tr></tfoot></table>
      ${pts.length > 1 ? `<div class="bloco"><h2>Evolução por quinzena</h2><div class="rp-chart">${htmlGrafico(pts, { estatico: true })}</div></div>` : ''}
      <div class="bloco"><h2>Contrato</h2><table><tbody><tr><td>Valor original</td><td class="num">${brl(ori)}</td></tr>
        ${ads.map((a) => { const v = (a.linhas || []).reduce((t, x) => t + n(x.valor), 0); return `<tr><td>Aditivo nº ${esc(a.numero)} de ${dataBR(a.data)}: ${esc(a.desc || '')}${n(a.prazoDias) ? ` (${n(a.prazoDias) > 0 ? '+' : ''}${n(a.prazoDias)} dias)` : ''}</td><td class="num">${v >= 0 ? '+' : ''}${brl(v)}</td></tr>`; }).join('')}
        <tr class="tot"><td>Valor atual do contrato</td><td class="num">${brl(fin.total)}</td></tr>
        ${fin.ligado ? `<tr><td>Pago até ${dataBR(ref)}</td><td class="num">${brl(fin.pago)}</td></tr><tr><td>A pagar</td><td class="num">${brl(fin.aPagar)}</td></tr>` : ''}</tbody></table></div>
      ${parcelas.length ? `<div class="bloco"><h2>Parcelas</h2><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Situação</th><th class="num">Valor</th></tr></thead><tbody>
        ${parcelas.map((x, i) => `<tr><td>${esc(x.desc || `Parcela ${i + 1}`)}</td><td>${dataBR(x.venc)}</td><td>${x.pago ? `Paga${x.dataPago ? ' em ' + dataBR(x.dataPago) : ''}` : 'Em aberto'}</td><td class="num">${brl(x.valor)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;
  }

  /* ---------------- impressão ---------------- */
  /** Imprime o html numa folha A4 (o navegador oferece "Salvar como PDF"). */
  function imprimir(html, { titulo = '', rodape = '', margem = '12mm 12mm 14mm 12mm' } = {}) {
    const raiz = document.getElementById('print-root'); if (!raiz) return;
    raiz.innerHTML = html;
    let st = document.getElementById('estilo-pagina');
    if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
    const r = String(rodape).replace(/"/g, "'");
    st.textContent = `@page{size:A4 portrait;margin:${margem};${r ? `@bottom-center{content:"${r}";font-family:Arial,sans-serif;font-size:7.5pt;color:#777}` : ''}@bottom-right{content:counter(page) "/" counter(pages);font-family:Arial,sans-serif;font-size:7.5pt;color:#999}}`;
    const ant = document.title;
    if (titulo) document.title = titulo;
    document.body.classList.add('imprimindo');
    const fim = () => { document.body.classList.remove('imprimindo'); document.title = ant; raiz.innerHTML = ''; st.textContent = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    const imgs = Array.from(raiz.querySelectorAll('img'));
    imgs.forEach((i) => { i.loading = 'eager'; i.decoding = 'sync'; });
    const espera = imgs.map((i) => (i.complete && i.naturalWidth ? null : new Promise((ok) => { i.onload = ok; i.onerror = ok; })));
    Promise.race([Promise.all(espera), new Promise((ok) => setTimeout(ok, 15000))]).then(() => setTimeout(() => window.print(), 80));
  }

  return {
    COR_FIS, COR_FIN, RODAPE, tem, etapas, total, totalOriginal, medicoes, medicaoAte, pctEtapas, fisico, pagos, financeiro, prazo, quinzenas, serie,
    htmlGrafico, ligar, textoRico, tituloCom, htmlComunicado, mensagemComunicado, htmlRelatorio, imprimir, brl, pct, dataLonga, n3, hoje, porNumero,
  };
})();
