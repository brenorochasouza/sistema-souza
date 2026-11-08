'use strict';
/* =========================================================
   Área do cliente (só você, no seu sistema)
   Clientes com o mesmo número da pasta do Drive, os serviços
   contratados e os links (arquivo ou pasta) que o cliente vê em
   clientes.souzaengenharia.com. No banco ficam só textos e links:
   os arquivos continuam no Google Drive.
   Dados: tabela "portal" do projeto do Diário de obra
     cliente: { nome, numero, obs }
     servico: grupo = cliente; { tipo, codigo, titulo, data, situacao, renovaAnos, itens: [{ id, nome, url }] }
   ========================================================= */
(function () {
  const B = window.RDOB, R = window.RDO;
  const { $, $$, esc, norm, hojeISO, dataBR, uid } = Sis.util;
  const { ui, icone } = Sis;
  const A = Sis.acoes;
  const T = 'portal';
  const URL_CLIENTES = (window.SOUZA_CONFIG && window.SOUZA_CONFIG.portalClientes) || 'https://clientes.souzaengenharia.com/';
  const SITUACOES = [['andamento', 'Em andamento', 'atencao'], ['entregue', 'Entregue', 'ok']];

  const clientes = () => B.store.dados(T, 'cliente').sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const cliente = (id) => { const r = id && B.store.get(T, id); return r && r.tipo === 'cliente' ? Object.assign({ id: r.id }, r.dados) : null; };
  const servicosDe = (cid) => B.store.lista(T, 'servico').filter((r) => r.grupo === cid).map((r) => Object.assign({ id: r.id }, r.dados, { itens: (r.dados.itens || []).slice() }))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const obrasRdo = () => B.store.dados('obras', 'obra').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const rotulo = (c) => `${c.numero ? c.numero + '. ' : ''}${c.nome}`;
  const salvarServico = (s) => { const d = Object.assign({}, s); delete d.id; B.store.salvar(T, s.id, 'servico', d, s.clienteId); };
  const ICONE_ITEM = { arquivo: 'nota', doc: 'nota', pasta: 'pasta', link: 'compartilhar' };
  const NOME_ITEM = { arquivo: 'Arquivo do Drive', doc: 'Documento Google', pasta: 'Pasta do Drive', link: 'Link' };

  /* ---------- telas ---------- */
  function telaLista(el) {
    const q = norm((Sis.rota().params || {}).q || '');
    const todos = clientes();
    const lista = q ? todos.filter((c) => norm(rotulo(c)).includes(q)) : todos;
    const ss = B.store.lista(T, 'servico');
    el.innerHTML = `<div class="pagehead"><div><h1>Área do cliente</h1><p>${todos.length} ${todos.length === 1 ? 'cliente' : 'clientes'} · os clientes entram em <a href="${esc(URL_CLIENTES)}" target="_blank" rel="noopener">${esc(URL_CLIENTES.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></p></div>
      <div class="actions"><a class="btn" href="#/rdo/acessos">${icone('chave')}Acessos</a><button class="btn primary" data-a="ac-cli-novo">${icone('mais')}Novo cliente</button></div></div>
      <div class="ac-busca"><input class="inp" type="search" placeholder="Buscar pelo número ou nome" value="${esc((Sis.rota().params || {}).q || '')}" data-ac-busca></div>
      ${lista.length ? `<div class="ac-clis">${lista.map((c) => {
        const sv = ss.filter((r) => r.grupo === c.id);
        const links = sv.reduce((n, r) => n + ((r.dados.itens || []).length), 0);
        const obs = obrasRdo().filter((o) => o.areaCliente === c.id).length;
        return `<a class="card ac-cli" href="#/area/${esc(c.id)}"><span class="ac-num">${esc(c.numero || '·')}</span><span class="ac-cli-t"><b>${esc(c.nome)}</b>
          <small>${sv.length} ${sv.length === 1 ? 'serviço' : 'serviços'} · ${links} ${links === 1 ? 'link' : 'links'}${obs ? ` · ${obs} ${obs === 1 ? 'obra' : 'obras'}` : ''}</small></span>${icone('dir')}</a>`;
      }).join('')}</div>` : `<div class="card"><div class="empty"><b>${q ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}</b>${q ? '' : 'Cadastre o cliente com o mesmo número da pasta dele no Drive, crie os serviços e cole os links do que ele deve ver.'}</div></div>`}`;
    const bx = $('[data-ac-busca]', el);
    bx.addEventListener('input', () => { clearTimeout(bx._t); bx._t = setTimeout(() => { location.hash = '#/area' + (bx.value.trim() ? '?q=' + encodeURIComponent(bx.value.trim()) : ''); }, 250); });
    if (q) { bx.focus(); bx.setSelectionRange(bx.value.length, bx.value.length); }
  }

  function htmlServico(c, s) {
    const venc = R.vencimento(s), sv = R.situacaoVenc(venc, hojeISO());
    const sit = SITUACOES.find((x) => x[0] === s.situacao) || SITUACOES[0];
    return `<section class="card ac-sv" data-sv="${esc(s.id)}"><div class="hd"><div>
        <h3>${esc(s.titulo || R.nomeTipo(s.tipo))}</h3>
        <p>${esc([R.nomeTipo(s.tipo), s.codigo, s.data && dataBR(s.data)].filter(Boolean).join(' · '))}</p></div>
        <div class="actions"><span class="chip ${sit[2]}">${sit[1]}</span>${venc ? `<span class="chip ${sv.estado === 'vencido' ? 'estourado' : sv.estado === 'perto' ? 'atencao' : 'neutro'}">${sv.estado === 'vencido' ? 'Venceu em' : 'Vence em'} ${dataBR(venc)}</span>` : ''}
          <button class="btn icon sm" data-a="ac-sv-editar" data-id="${esc(s.id)}" aria-label="Editar serviço" title="Editar serviço">${icone('editar')}</button></div></div>
      <div class="bd">${s.itens.length ? `<ul class="ac-itens">${s.itens.map((it, i) => { const d = R.drive(it.url) || { tipo: 'link' };
        return `<li><span class="ac-it-ic">${icone(ICONE_ITEM[d.tipo] || 'nota')}</span><a class="ac-it-n" href="${esc(d.abrir || it.url)}" target="_blank" rel="noopener"><b>${esc(it.nome)}</b><small>${NOME_ITEM[d.tipo]}</small></a>
          <span class="ac-it-a"><button class="btn icon sm" data-a="ac-it-mover" data-sv="${esc(s.id)}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icone('esq')}</button><button class="btn icon sm" data-a="ac-it-mover" data-sv="${esc(s.id)}" data-i="${i}" data-d="1" ${i === s.itens.length - 1 ? 'disabled' : ''} aria-label="Descer">${icone('dir')}</button>
          <button class="btn icon sm" data-a="ac-it-editar" data-sv="${esc(s.id)}" data-i="${i}" aria-label="Editar link">${icone('editar')}</button><button class="btn icon sm" data-a="ac-it-x" data-sv="${esc(s.id)}" data-i="${i}" aria-label="Remover link">${icone('lixo')}</button></span></li>`; }).join('')}</ul>`
        : '<p class="small muted">Nenhum link ainda. Cole o link do arquivo ou da pasta no Drive.</p>'}
        <div class="actions"><button class="btn sm" data-a="ac-it-novo" data-sv="${esc(s.id)}">${icone('mais')}Adicionar link</button></div></div></section>`;
  }

  function telaCliente(el, id) {
    const c = cliente(id);
    if (!c) { el.innerHTML = '<div class="card"><div class="empty"><b>Cliente não encontrado</b><a href="#/area">Voltar</a></div></div>'; return; }
    const sv = servicosDe(c.id);
    const peso = (o) => (o.areaCliente === c.id ? 0 : o.areaCliente ? 3 : o.situacao === 'concluida' ? 2 : 1);
    const obs = obrasRdo().sort((x, y) => peso(x) - peso(y));
    el.innerHTML = `<div class="ob-topo"><a class="btn icon" href="#/area" aria-label="Voltar">${icone('esq')}</a>
        <div class="tit"><b>${esc(rotulo(c))}</b><span>${sv.length} ${sv.length === 1 ? 'serviço' : 'serviços'}${c.obs ? ' · ' + esc(c.obs) : ''}</span></div>
        <div class="actions"><button class="btn" data-a="ac-cli-editar" data-id="${esc(c.id)}">${icone('editar')}<span>Editar</span></button><button class="btn primary" data-a="ac-sv-novo" data-c="${esc(c.id)}">${icone('mais')}<span>Novo serviço</span></button></div></div>
      <p class="small muted ac-dica">${icone('info')}<span>Cada link precisa estar compartilhado no Drive como <b>Qualquer pessoa com o link: Leitor</b>. Compartilhe só o arquivo ou a pasta que vai para o cliente, nunca a pasta numerada inteira.</span></p>
      ${sv.length ? sv.map((s) => htmlServico(c, s)).join('') : '<div class="card"><div class="empty"><b>Nenhum serviço ainda</b>Crie o serviço (laudo, AVCB, perícia...) e cole os links do que o cliente deve ver.</div></div>'}
      <section class="card"><div class="hd"><div><h3>Obras (Diário de obra)</h3><p>As obras marcadas aparecem para o cliente com os diários aprovados.</p></div></div>
        <div class="bd">${obs.length ? `<div class="ac-obras">${obs.map((o) => `<label class="chk"><input type="checkbox" data-ac-obra="${esc(o.id)}" ${o.areaCliente === c.id ? 'checked' : ''} ${o.areaCliente && o.areaCliente !== c.id ? 'disabled' : ''}>
          <span>${esc(o.nome)}${o.contrato ? ` <small class="muted">${esc(o.contrato)}</small>` : ''}${o.areaCliente && o.areaCliente !== c.id ? ` <small class="muted">(ligada a ${esc((cliente(o.areaCliente) || { nome: 'outro cliente' }).nome)})</small>` : ''}</span></label>`).join('')}</div>` : '<p class="small muted">Nenhuma obra no Diário de obra.</p>'}</div></section>
      <section class="card"><div class="hd"><div><h3>Quem acessa</h3><p>Cada pessoa vê tudo o que estiver liberado para este cliente.</p></div>
        <div class="actions"><button class="btn sm" data-a="ac-acesso-novo" data-c="${esc(c.id)}">${icone('mais')}Novo acesso</button></div></div><div class="bd" data-q="quem"><p class="small muted">Carregando…</p></div></section>
      <div class="ac-pe"><button class="btn danger" data-a="ac-cli-x" data-id="${esc(c.id)}">${icone('lixo')}Excluir cliente</button></div>`;
    $$('[data-ac-obra]', el).forEach((cb) => cb.addEventListener('change', () => {
      const r = B.store.get('obras', cb.dataset.acObra); if (!r) return;
      const d = Object.assign({}, r.dados);
      if (cb.checked) d.areaCliente = c.id; else delete d.areaCliente;
      B.store.salvar('obras', r.id, 'obra', d, r.grupo);
      ui.toast(cb.checked ? 'Obra liberada para este cliente.' : 'Obra retirada deste cliente.');
    }));
    pintarQuem(c);
  }
  async function pintarQuem(c) {
    const alvo = () => $('[data-q="quem"]');
    if (!navigator.onLine) { if (alvo()) alvo().innerHTML = '<p class="small muted">Sem internet para mostrar os acessos agora.</p>'; return; }
    try {
      const l = ((await B.rpc('rdo_acessos_lista')) || []).filter((a) => (a.clientes || []).includes(c.id));
      if (!alvo()) return;
      alvo().innerHTML = l.length ? `<div class="r-ac-mini">${l.map((a) => `<span class="r-ac-p ${a.ativo ? '' : 'off'}">${icone('pessoa')}<b>${esc(a.nome)}</b><small>${esc(a.funcao || 'Cliente')}${a.ativo ? '' : ' · desativado'}</small></span>`).join('')}</div>`
        : '<p class="small muted">Ninguém ainda. Use "Novo acesso" para criar o login do síndico ou da administradora.</p>';
    } catch (e) { if (alvo()) alvo().innerHTML = `<p class="small muted">Não foi possível carregar os acessos: ${esc(e.message)}</p>`; }
  }

  /* ---------- cliente ---------- */
  function modalCliente(c) {
    const novo = !c;
    c = c || { nome: '', numero: '', obs: '' };
    ui.abrirModal({
      titulo: novo ? 'Novo cliente' : 'Editar cliente',
      sub: 'Use o mesmo número da pasta do cliente no seu Drive.',
      corpo: `<div class="grid2"><label class="f"><span>Nº da pasta</span><input class="inp" name="numero" inputmode="numeric" value="${esc(c.numero || '')}" placeholder="Ex.: 231"></label>
        <label class="f req"><span>Nome (como o cliente vê)</span><input class="inp" name="nome" value="${esc(c.nome || '')}" placeholder="Ex.: Condomínio Bosque Atlântico" autofocus></label>
        <label class="f span2"><span>Observação interna (o cliente não vê)</span><input class="inp" name="obs" value="${esc(c.obs || '')}"></label></div>`,
      botoes: [{ rot: 'Cancelar' }, { rot: novo ? 'Criar cliente' : 'Salvar', classe: 'primary', acao: (m) => {
        const v = (n) => $(`[name=${n}]`, m.el).value.trim();
        if (!v('nome')) { $('[name=nome]', m.el).classList.add('erro'); return; }
        const num = v('numero').replace(/\D/g, '');
        const dup = num && clientes().find((x) => String(x.numero) === num && x.id !== c.id);
        if (dup) { ui.toast(`O número ${num} já é de ${dup.nome}.`); return; }
        const id = c.id || uid();
        B.store.salvar(T, id, 'cliente', { nome: v('nome'), numero: num, obs: v('obs') }, null);
        m.fechar();
        if (novo) location.hash = '#/area/' + id; else Sis.desenhar(true);
      } }],
    });
  }
  A['ac-cli-novo'] = () => { if (!B.conectado()) return; modalCliente(null); };
  A['ac-cli-editar'] = (b) => { const c = cliente(b.dataset.id); if (c) modalCliente(c); };
  A['ac-cli-x'] = async (b) => {
    const c = cliente(b.dataset.id); if (!c) return;
    const sv = servicosDe(c.id);
    const ok = await ui.confirmar({ titulo: `Excluir ${c.nome}?`, msg: `${sv.length ? `Os ${sv.length} serviços e os links somem da área do cliente. ` : ''}Os arquivos no Drive não são tocados. Quem tinha acesso a este cliente deixa de ver.`, ok: 'Excluir', perigo: true });
    if (!ok) return;
    sv.forEach((s) => B.store.excluir(T, s.id));
    obrasRdo().filter((o) => o.areaCliente === c.id).forEach((o) => { const r = B.store.get('obras', o.id); const d = Object.assign({}, r.dados); delete d.areaCliente; B.store.salvar('obras', r.id, 'obra', d, r.grupo); });
    B.store.excluir(T, c.id);
    location.hash = '#/area';
  };

  /* ---------- serviço ---------- */
  function modalServico(cid, s) {
    const novo = !s;
    s = s || { tipo: 'inspecao_predial', codigo: '', titulo: '', data: hojeISO(), situacao: 'andamento', renovaAnos: '', itens: [] };
    ui.abrirModal({
      titulo: novo ? 'Novo serviço' : 'Editar serviço',
      sub: 'A validade alimenta os vencimentos e o pedido de renovação que o cliente vê.',
      corpo: `<div class="grid2">
        <label class="f"><span>Tipo</span><select class="inp" name="tipo">${R.TIPOS_SERVICO.map(([k, n]) => `<option value="${k}" ${s.tipo === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="f"><span>Código</span><input class="inp" name="codigo" value="${esc(s.codigo || '')}" placeholder="Ex.: SE231.SPDA"></label>
        <label class="f span2"><span>Título (como o cliente vê)</span><input class="inp" name="titulo" value="${esc(s.titulo || '')}" placeholder="Ex.: Laudo de SPDA 2026"></label>
        <label class="f"><span>Data (entrega ou início)</span><input class="inp" type="date" name="data" value="${esc(s.data || '')}"></label>
        <label class="f"><span>Situação</span><select class="inp" name="situacao">${SITUACOES.map(([k, n]) => `<option value="${k}" ${s.situacao === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f"><span>Renova a cada (anos)</span><input class="inp" name="renovaAnos" inputmode="numeric" value="${esc(s.renovaAnos || '')}" placeholder="Em branco: não vence"></label>
        <p class="small muted" data-q="venc" style="align-self:end;margin:0 0 10px"></p></div>`,
      aoAbrir: (el) => {
        const tipo = $('[name=tipo]', el), tit = $('[name=titulo]', el), anos = $('[name=renovaAnos]', el), data = $('[name=data]', el), venc = $('[data-q=venc]', el);
        let mexeuTit = !novo, mexeuAnos = !novo;
        const sugerir = () => {
          if (!mexeuTit) tit.value = `${R.nomeTipo(tipo.value)}${data.value ? ' ' + data.value.slice(0, 4) : ''}`;
          if (!mexeuAnos) { const t = R.TIPOS_SERVICO.find((x) => x[0] === tipo.value); anos.value = t && t[2] ? t[2] : ''; }
          const v = R.vencimento({ data: data.value, renovaAnos: anos.value });
          venc.textContent = v ? `Vence em ${dataBR(v)}` : '';
        };
        tit.addEventListener('input', () => { mexeuTit = true; });
        anos.addEventListener('input', () => { mexeuAnos = true; sugerir(); });
        tipo.addEventListener('change', sugerir); data.addEventListener('change', sugerir); data.addEventListener('input', sugerir);
        sugerir();
      },
      botoes: [
        ...(novo ? [] : [{ rot: 'Excluir serviço', classe: 'danger', esq: true, acao: async (m) => {
          if (!(await ui.confirmar({ titulo: 'Excluir este serviço?', msg: 'Ele e os links somem da área do cliente. Os arquivos no Drive não são tocados.', ok: 'Excluir', perigo: true }))) return;
          B.store.excluir(T, s.id); m.fechar(); Sis.desenhar(true);
        } }]),
        { rot: 'Cancelar' },
        { rot: novo ? 'Criar serviço' : 'Salvar', classe: 'primary', acao: (m) => {
          const v = (n) => $(`[name=${n}]`, m.el).value.trim();
          const d = Object.assign({}, s, { id: s.id || uid(), clienteId: cid, tipo: v('tipo'), codigo: v('codigo'), titulo: v('titulo') || R.nomeTipo(v('tipo')), data: v('data'), situacao: v('situacao'), renovaAnos: v('renovaAnos').replace(/[^\d]/g, '') });
          if (!d.criadoEm) d.criadoEm = new Date().toISOString();
          salvarServico(d);
          m.fechar();
          Sis.desenhar(true);
          if (novo) setTimeout(() => A['ac-it-novo']({ dataset: { sv: d.id } }), 250);
        } },
      ],
    });
  }
  const servico = (id) => { const r = B.store.get(T, id); return r && r.tipo === 'servico' ? Object.assign({ id: r.id, clienteId: r.grupo }, r.dados, { itens: (r.dados.itens || []).slice() }) : null; };
  A['ac-sv-novo'] = (b) => modalServico(b.dataset.c, null);
  A['ac-sv-editar'] = (b) => { const s = servico(b.dataset.id); if (s) modalServico(s.clienteId, s); };

  /* ---------- links ---------- */
  function modalItem(sid, i) {
    const s = servico(sid); if (!s) return;
    const novo = i === undefined || i === null;
    const it = novo ? { nome: '', url: '' } : s.itens[i];
    ui.abrirModal({
      titulo: novo ? 'Adicionar link' : 'Editar link', sub: esc(s.titulo || R.nomeTipo(s.tipo)),
      corpo: `<label class="f req"><span>Link do Drive (arquivo ou pasta)</span><input class="inp" name="url" value="${esc(it.url)}" placeholder="Cole aqui o link copiado no Drive" autocapitalize="off" spellcheck="false" ${novo ? 'autofocus' : ''}></label>
        <p class="small ac-detec" data-q="detec"></p>
        <label class="f req" style="margin-top:10px"><span>Nome (como o cliente vê)</span><input class="inp" name="nome" value="${esc(it.nome)}" placeholder="Ex.: Laudo de SPDA, ART, Fotos da inspeção"></label>
        <p class="small muted" style="margin:12px 0 0">No Drive: botão direito no arquivo ou pasta > Compartilhar > Acesso geral: <b>Qualquer pessoa com o link</b>, como <b>Leitor</b> > Copiar link.</p>`,
      aoAbrir: (el) => {
        const u = $('[name=url]', el), det = $('[data-q=detec]', el), nome = $('[name=nome]', el);
        const ver = () => {
          const d = R.drive(u.value);
          det.className = 'small ac-detec ' + (d ? (d.tipo === 'link' ? 'aviso' : 'ok') : '');
          det.innerHTML = !u.value.trim() ? '' : !d ? 'Isso não parece um link.' : d.tipo === 'pasta' ? `${icone('pasta')}Pasta do Drive: o cliente vê a lista de arquivos dentro do portal.` : d.tipo === 'link' ? `${icone('info')}Não é um link do Google Drive: o cliente abre em outra aba.` : `${icone('nota')}${d.tipo === 'doc' ? 'Documento Google' : 'Arquivo do Drive'}: o cliente abre dentro do portal e pode baixar.`;
          if (!nome.value.trim() && d && d.tipo === 'pasta' && /fotos?/i.test(u.value)) nome.value = 'Fotos';
        };
        u.addEventListener('input', ver); ver();
      },
      botoes: [{ rot: 'Cancelar' }, { rot: novo ? 'Adicionar' : 'Salvar', classe: 'primary', acao: (m) => {
        const url = $('[name=url]', m.el).value.trim(), nome = $('[name=nome]', m.el).value.trim();
        if (!R.drive(url)) { $('[name=url]', m.el).classList.add('erro'); return; }
        if (!nome) { $('[name=nome]', m.el).classList.add('erro'); return; }
        const atual = servico(sid);
        const item = { id: (it && it.id) || uid(), nome, url, em: (it && it.em) || new Date().toISOString() };
        if (novo) atual.itens.push(item); else atual.itens[i] = item;
        salvarServico(atual);
        m.fechar();
        Sis.desenhar(true);
      } }],
    });
  }
  A['ac-it-novo'] = (b) => modalItem(b.dataset.sv, null);
  A['ac-it-editar'] = (b) => modalItem(b.dataset.sv, Number(b.dataset.i));
  A['ac-it-x'] = async (b) => {
    const s = servico(b.dataset.sv); const i = Number(b.dataset.i); if (!s || !s.itens[i]) return;
    if (!(await ui.confirmar({ titulo: `Remover "${s.itens[i].nome}"?`, msg: 'O link some da área do cliente. O arquivo no Drive não é tocado.', ok: 'Remover', perigo: true }))) return;
    s.itens.splice(i, 1); salvarServico(s); Sis.desenhar(true);
  };
  A['ac-it-mover'] = (b) => {
    const s = servico(b.dataset.sv); const i = Number(b.dataset.i), j = i + Number(b.dataset.d); if (!s || j < 0 || j >= s.itens.length) return;
    [s.itens[i], s.itens[j]] = [s.itens[j], s.itens[i]]; salvarServico(s); Sis.desenhar(true);
  };
  A['ac-acesso-novo'] = (b) => { if (window.RdoAcessos) window.RdoAcessos.novo({ perfil: 'cliente', clientes: [b.dataset.c] }); };

  /* ---------- registro ---------- */
  function render(el, partes) {
    if (!B.pronto || !B.pronto()) { el.innerHTML = '<div class="empty">Carregando…</div>'; B.iniciar().then(() => Sis.desenhar(true)).catch(() => {}); return; }
    if (!B.conectado()) { el.innerHTML = `<div class="pagehead"><div><h1>Área do cliente</h1></div></div><div class="card"><div class="empty"><b>Conecte o Diário de obra primeiro</b>A área do cliente usa o mesmo projeto do Diário de obra. <a href="#/rdo">Conectar</a></div></div>`; return; }
    if (B.perfil() !== 'master') { el.innerHTML = '<div class="card"><div class="empty"><b>Só o acesso master gerencia a área do cliente.</b></div></div>'; return; }
    if (partes[0]) telaCliente(el, partes[0]); else telaLista(el);
  }
  B.store.ouvir((origem) => { if (origem === 'remoto' && Sis.rota().mod === 'area' && !document.querySelector('.modal')) Sis.desenhar(true); });
  Sis.modulo({
    id: 'area', nome: 'Área do cliente', desc: 'Documentos e serviços dos clientes', icone: 'pasta', sistema: true,
    render,
    buscar(t) {
      if (!B.conectado() || B.perfil() !== 'master') return [];
      return clientes().filter((c) => norm(rotulo(c)).includes(t)).slice(0, 4).map((c) => ({ tipo: 'Área do cliente', titulo: rotulo(c), sub: `${servicosDe(c.id).length} serviços`, rota: `#/area/${c.id}` }));
    },
  });
})();
