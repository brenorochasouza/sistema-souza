'use strict';
/* =========================================================
   Área do cliente (só você, no seu sistema)
   Clientes com o mesmo número da pasta do Drive, os serviços
   contratados organizados em pastas e documentos (modelos de
   AVCB, inspeção predial, inspeção de fachadas ou do seu jeito),
   contrato e pagamentos (copiados da carteira de clientes).
   No banco ficam só textos e links: os arquivos ficam no Drive.
   Tabela "portal" do projeto do Diário de obra:
     cliente: { nome, numero, carteiraId, obs }
     servico: grupo = cliente; { tipo, codigo, titulo, data, situacao, renovaAnos,
              estrutura: [nós], contratoUrl, contratoId, financeiro }
     modelo:  { nome, tipoPadrao, estrutura }   (id "modelo-<tipo>" muda um modelo pronto)
   ========================================================= */
(function () {
  const B = window.RDOB, R = window.RDO;
  const { $, $$, esc, norm, hojeISO, dataBR, uid, brl } = Sis.util;
  const { ui, icone } = Sis;
  const A = Sis.acoes;
  const T = 'portal';
  const URL_CLIENTES = (window.SOUZA_CONFIG && window.SOUZA_CONFIG.portalClientes) || 'https://clientes.souzaengenharia.com/';
  const SITUACOES = [['andamento', 'Em andamento', 'atencao'], ['entregue', 'Entregue', 'ok']];
  const NOME_LINK = { arquivo: 'Arquivo do Drive', doc: 'Documento Google', pasta: 'Pasta do Drive', link: 'Link' };

  /* ---------- dados ---------- */
  const clientes = () => B.store.dados(T, 'cliente').sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const cliente = (id) => { const r = id && B.store.get(T, id); return r && r.tipo === 'cliente' ? Object.assign({ id: r.id }, r.dados) : null; };
  const servico = (id) => { const r = id && B.store.get(T, id); return r && r.tipo === 'servico' ? Object.assign({ id: r.id, clienteId: r.grupo }, JSON.parse(JSON.stringify(r.dados)), { estrutura: JSON.parse(JSON.stringify(R.estruturaDe(r.dados))) }) : null; };
  const servicosDe = (cid) => B.store.lista(T, 'servico').filter((r) => r.grupo === cid).map((r) => servico(r.id)).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  function salvarServico(s) { const d = Object.assign({}, s); delete d.id; delete d.clienteId; delete d.itens; B.store.salvar(T, s.id, 'servico', d, s.clienteId); }
  const obrasRdo = () => B.store.dados('obras', 'obra').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const rotulo = (c) => `${c.numero ? c.numero + '. ' : ''}${c.nome}`;

  /* ---------- modelos ---------- */
  const modelosSalvos = () => B.store.dados(T, 'modelo');
  /** Modelos disponíveis: os prontos (com a sua versão, se você mudou) e os que você salvou. */
  function modelos() {
    const salvos = modelosSalvos();
    const prontos = Object.keys(R.MODELOS).map((k) => {
      const meu = salvos.find((m) => m.id === 'modelo-' + k);
      return meu ? Object.assign({ pronto: k, mudado: true }, meu) : { id: 'modelo-' + k, pronto: k, nome: R.MODELOS[k].nome, tipoPadrao: k, estrutura: R.MODELOS[k].estrutura };
    });
    return prontos.concat(salvos.filter((m) => !/^modelo-/.test(m.id)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')));
  }
  const modelo = (id) => modelos().find((m) => m.id === id) || null;
  /** Modelo usado quando se cria um serviço deste tipo. */
  const modeloDoTipo = (tipo) => { const l = modelos().filter((m) => m.tipoPadrao === tipo); return l.find((m) => !m.pronto) || l[0] || null; };

  /* ---------- financeiro (carteira de clientes, outro projeto) ---------- */
  /** Resumo do contrato da carteira que vai para a área do cliente (só o necessário). */
  function finDe(cs) {
    if (!cs || !cs.contrato) return null;
    const ps = (cs.contrato.parcelas || []).map((p) => ({ desc: p.desc || '', valor: Number(p.valor) || 0, venc: p.venc || '', pago: !!p.pago, dataPago: p.pago ? p.dataPago || '' : '' }));
    return { valor: Number(cs.contrato.valor) || ps.reduce((t, p) => t + p.valor, 0), parcelas: ps };
  }
  const contratosCarteira = () => (Sis.comercial ? Sis.comercial.servicos().filter((s) => s.contrato && (s.etapa === 'aprovado' || (s.contrato.parcelas || []).length)) : []);
  /** Copia para a área do cliente o que mudou nos contratos ligados (roda no seu aparelho). */
  function sincronizarFinanceiro() {
    if (!Sis.comercial || !B.conectado || !B.conectado() || B.perfil() !== 'master') return 0;
    let n = 0;
    for (const r of B.store.lista(T, 'servico')) {
      if (!r.dados.contratoId) continue;
      const f = finDe(Sis.comercial.servico(r.dados.contratoId));
      if (JSON.stringify(f) !== JSON.stringify(r.dados.financeiro || null)) {
        B.store.salvar(T, r.id, 'servico', Object.assign({}, r.dados, { financeiro: f }), r.grupo);
        n++;
      }
    }
    return n;
  }
  /* ---------- renovações (módulo do projeto principal) ----------
     Serviço entregue, com data e "renova a cada" vira um laudo nas Renovações (areaId = serviço).
     Mudou o serviço: o laudo acompanha. Voltou para "em andamento", perdeu a validade ou foi
     excluído: o laudo sai (se foi criado daqui) ou volta a ser avulso (se já existia).
     Um ciclo novo do mesmo laudo para o mesmo cliente fecha o anterior como renovado. */
  const TIPO_RENOV = { spda: 'Laudo de SPDA', inspecao_predial: 'Inspeção Predial', fachada: 'Inspeção de Fachada', avcb: 'AVCB' };
  const tipoRenov = (k) => TIPO_RENOV[k] || R.nomeTipo(k);
  const PERTO = 180; // dias: entregas mais próximas que isso são o mesmo ciclo
  const diasEntre = (a, b) => Math.round((Sis.util.deISO(b) - Sis.util.deISO(a)) / 86400000);
  const renova = (d) => !!(d && d.situacao === 'entregue' && /^\d{4}-\d{2}-\d{2}$/.test(d.data || '') && Number(d.renovaAnos) >= 1);
  const laudoDo = (sid) => (Sis.renovacoes && Sis.renovacoes.laudos ? Sis.renovacoes.laudos().find((l) => l.areaId === sid) : null);
  /** Cliente do cadastro único ligado ao cliente da área: liga pelo nome ou cadastra, se ainda não tiver. */
  function carteiraDe(cid) {
    const r = B.store.get(T, cid); if (!r) return '';
    if (r.dados.carteiraId && Sis.clientes.get(r.dados.carteiraId)) return r.dados.carteiraId;
    const c = Sis.clientes.porNome(r.dados.nome);
    const id = c ? c.id : Sis.clientes.criar(r.dados.nome);
    B.store.salvar(T, r.id, 'cliente', Object.assign({}, r.dados, { carteiraId: id }), r.grupo);
    return id;
  }
  function sincronizarRenovacoes() {
    const RN = Sis.renovacoes;
    // só com os dois lados já sincronizados nesta sessão, para não duplicar nada
    if (!RN || !RN.salvar || !B.conectado || !B.conectado() || B.perfil() !== 'master' || !B.ultima() || !Sis.sync.info().ultima) return null;
    const out = { criados: [], atualizados: 0, removidos: 0 };
    const CAMPOS = ['clienteId', 'tipo', 'entrega', 'anos', 'renovacao', 'areaCliente'];
    for (const r of B.store.lista(T, 'servico')) {
      const d = r.dados;
      if (!renova(d)) continue;
      const clienteId = carteiraDe(r.grupo); if (!clienteId) continue;
      const anos = Number(d.renovaAnos);
      const quer = { clienteId, tipo: tipoRenov(d.tipo), entrega: d.data, anos, renovacao: RN.somaAnos(d.data, anos), areaId: r.id, areaCliente: r.grupo };
      const ls = RN.laudos();
      const meu = ls.find((l) => l.areaId === r.id);
      if (meu) {
        if (RN.ativo(meu) && CAMPOS.some((k) => meu[k] !== quer[k])) { RN.salvar(Object.assign(meu, quer)); out.atualizados++; }
        continue;
      }
      const mesmo = (l) => RN.ativo(l) && l.clienteId === clienteId && norm(l.tipo) === norm(quer.tipo);
      // o mesmo laudo já registrado à mão (avulso ou "Registrar renovação"): passa a seguir o serviço
      const avulso = ls.find((l) => !l.areaId && mesmo(l) && Math.abs(diasEntre(l.entrega, quer.entrega)) <= PERTO);
      if (avulso) { RN.salvar(Object.assign(avulso, quer)); out.atualizados++; continue; }
      // já existe um ciclo mais novo: este serviço é de um ciclo passado e não entra
      if (ls.some((l) => mesmo(l) && diasEntre(quer.entrega, l.entrega) > PERTO)) continue;
      const anterior = ls.filter((l) => mesmo(l) && diasEntre(l.entrega, quer.entrega) > PERTO).sort((a, b) => String(b.entrega).localeCompare(String(a.entrega)))[0];
      const id = Sis.util.idCurto();
      const novo = Object.assign({ id, situacao: 'ativo', origem: 'area', criadoEm: new Date().toISOString() }, quer, d.codigo ? { obs: d.codigo } : {}, anterior ? { anteriorId: anterior.id } : {});
      RN.salvar(novo);
      if (anterior) RN.salvar(Object.assign(anterior, { situacao: 'renovado', renovadoEm: quer.entrega, proximoId: id }));
      out.criados.push(novo);
    }
    // serviços que deixaram de valer: excluídos, de volta a "em andamento" ou sem validade
    for (const l of RN.laudos()) {
      if (!l.areaId || !RN.ativo(l)) continue;
      const r = B.store.bruto(T, l.areaId);
      if (!r || (!r.excluido && renova(r.dados))) continue; // ainda não chegou a este aparelho, ou continua valendo
      if (l.origem === 'area') {
        RN.excluir(l.id);
        const ant = l.anteriorId && RN.laudo(l.anteriorId);
        if (ant && ant.situacao === 'renovado' && ant.proximoId === l.id) { Object.assign(ant, { situacao: 'ativo' }); delete ant.renovadoEm; delete ant.proximoId; RN.salvar(ant); }
      } else { delete l.areaId; delete l.areaCliente; RN.salvar(l); }
      out.removidos++;
    }
    return out;
  }
  let _tFin = null;
  const agendarFin = () => { clearTimeout(_tFin); _tFin = setTimeout(() => { sincronizarFinanceiro(); sincronizarRenovacoes(); }, 1500); };

  /* ---------- árvore (serviço ou modelo) ---------- */
  const descreverNo = (n, modelo) => {
    if (n.bloqueio && (modelo || n.bloqueio.ativo)) return { txt: modelo ? 'Começa bloqueado em cada serviço' : 'Bloqueado para o cliente', cls: 'bloq' };
    const k = (n.filhos || []).length, itens = `${k} ${k === 1 ? 'item' : 'itens'}`;
    if (n.url) { const d = R.drive(n.url); return { txt: (d ? NOME_LINK[d.tipo] : 'Link') + (n.tipo === 'pasta' && k ? ` · mais ${itens}` : ''), cls: 'ok' }; }
    if (n.tipo === 'pasta' && R.temConteudo(n)) return { txt: itens, cls: 'ok' };
    const vazio = n.vazio === 'oculta' ? 'oculta enquanto vazia' : 'aparece "Em elaboração"';
    return { txt: modelo ? (n.tipo === 'pasta' ? `Pasta · ${vazio}` : `Documento · ${vazio}`) : `${n.tipo === 'pasta' ? 'Vazia' : 'Sem link'} · ${vazio}`, cls: 'vazio' };
  };
  function htmlArvore(lista, dono, modelo, nivel = 0) {
    return (lista || []).map((n, i) => {
      const dsc = descreverNo(n, modelo), k = (n.filhos || []).length;
      const base = `data-dono="${esc(dono)}" data-no="${esc(n.id)}"`;
      return `<li class="ac-no ${n.tipo} ${dsc.cls}" style="--n:${nivel}">
        <span class="ac-no-ic">${icone(n.bloqueio && n.bloqueio.ativo ? 'cadeado' : n.tipo === 'pasta' ? 'pasta' : 'nota')}</span>
        <span class="ac-no-t">${n.url ? `<a href="${esc((R.drive(n.url) || {}).abrir || n.url)}" target="_blank" rel="noopener"><b>${esc(n.nome)}</b></a>` : `<b>${esc(n.nome)}</b>`}<small>${esc(dsc.txt)}</small></span>
        <span class="ac-no-a">
          ${n.bloqueio && !modelo ? `<button class="btn sm ${n.bloqueio.ativo ? '' : 'ghost'}" data-a="ac-no-bloq" ${base}>${n.bloqueio.ativo ? 'Liberar para o cliente' : 'Bloquear de novo'}</button>` : ''}
          ${!modelo ? `<button class="btn sm ${n.url || (n.tipo === 'pasta' && k) ? 'ghost' : ''}" data-a="ac-no-link" ${base} title="${n.tipo === 'pasta' ? 'Link da pasta no Drive: o cliente abre a pasta direto' : 'Link do arquivo ou da pasta no Drive'}">${n.url ? 'Trocar link' : 'Colar link'}</button>` : ''}
          ${n.tipo === 'pasta' ? `<button class="btn sm ghost" data-a="ac-no-novo" data-t="doc" ${base} title="Documento dentro desta pasta">${icone('mais')}Documento</button><button class="btn sm ghost" data-a="ac-no-novo" data-t="pasta" ${base} title="Pasta dentro desta pasta">${icone('mais')}Pasta</button>` : ''}
          <button class="btn icon sm" data-a="ac-no-mover" data-d="-1" ${base} ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icone('esq')}</button><button class="btn icon sm" data-a="ac-no-mover" data-d="1" ${base} ${i === lista.length - 1 ? 'disabled' : ''} aria-label="Descer">${icone('dir')}</button>
          <button class="btn icon sm" data-a="ac-no-editar" ${base} aria-label="Editar">${icone('editar')}</button></span></li>
        ${n.tipo === 'pasta' && (n.filhos || []).length ? htmlArvore(n.filhos, dono, modelo, nivel + 1) : ''}`;
    }).join('');
  }
  /** Dono da árvore: um serviço ("s:<id>") ou um modelo ("m:<id>"). */
  function dono(ref) {
    const [k, id] = String(ref).split(':');
    if (k === 's') {
      const s = servico(id); if (!s) return null;
      return { modelo: false, estrutura: s.estrutura, salvar: (e) => { s.estrutura = e; salvarServico(s); } };
    }
    const m = modelo(id); if (!m) return null;
    return { modelo: true, estrutura: JSON.parse(JSON.stringify(m.estrutura || [])), salvar: (e) => salvarModelo(Object.assign({}, m, { estrutura: e })) };
  }
  function salvarModelo(m) {
    const d = { nome: m.nome, tipoPadrao: m.tipoPadrao || '', estrutura: m.estrutura || [] };
    B.store.salvar(T, m.id, 'modelo', d, null);
  }
  /** Janela de uma posição: nova (documento, link ou pasta) ou editar. */
  function modalNo(ref, { noId = null, paiId = null, tipo = null } = {}) {
    const d = dono(ref); if (!d) return;
    const est = d.estrutura;
    const achado = noId ? R.acharNo(est, noId) : null;
    const n = achado ? achado.no : { id: R.idNo(), tipo: tipo === 'pasta' ? 'pasta' : 'doc', nome: '', url: '', vazio: 'elaboracao', filhos: tipo === 'pasta' ? [] : undefined };
    const novo = !noId;
    const titulo = novo ? (n.tipo === 'pasta' ? 'Nova pasta' : 'Novo documento') : `Editar "${n.nome}"`;
    ui.abrirModal({
      titulo,
      sub: d.modelo ? (n.tipo === 'pasta' ? 'Pasta: agrupa documentos e outras pastas. Os links são colados em cada serviço.' : 'Posição de documento: o link é colado em cada serviço.')
        : n.tipo === 'pasta' ? 'Cole o link da pasta do Drive e o cliente abre direto nela. Também dá para pôr documentos e pastas dentro.' : 'Cole o link do arquivo ou da pasta no Drive.',
      corpo: `<label class="f req"><span>Nome (como o cliente vê)</span><input class="inp" name="nome" value="${esc(n.nome)}" placeholder="${n.tipo === 'pasta' ? 'Ex.: Projeto aprovado' : 'Ex.: Laudo, ART, Fotos da inspeção'}" ${novo ? 'autofocus' : ''}></label>
        ${!d.modelo ? `<label class="f" style="margin-top:10px"><span>${n.tipo === 'pasta' ? 'Link da pasta no Drive' : 'Link do Drive (arquivo ou pasta)'}: pode ficar em branco por enquanto</span><input class="inp" name="url" value="${esc(n.url || '')}" placeholder="Cole aqui o link copiado no Drive" autocapitalize="off" spellcheck="false"></label><p class="small ac-detec" data-q="detec"></p>` : ''}
        ${`<div class="f" style="margin-top:12px"><span class="small" style="font-weight:500;color:var(--ink-2)">Enquanto estiver vazio</span><div class="ac-vazio">
          <label><input type="radio" name="vazio" value="elaboracao" ${n.vazio !== 'oculta' ? 'checked' : ''}> Aparece "Em elaboração"</label><label><input type="radio" name="vazio" value="oculta" ${n.vazio === 'oculta' ? 'checked' : ''}> Fica oculto</label></div></div>`}
        ${n.bloqueio && d.modelo ? '<p class="small muted" style="margin:12px 0 0">Em cada serviço novo esta pasta começa bloqueada. Você libera no próprio serviço, quando quiser.</p>' : ''}
        ${n.bloqueio && !d.modelo ? `<label class="chk" style="margin-top:12px"><input type="checkbox" name="bloq" ${n.bloqueio.ativo ? 'checked' : ''}> <span>Bloqueado para o cliente (os links não saem do sistema)</span></label>` : ''}${n.bloqueio ? `
          <label class="f" style="margin-top:8px"><span>Mensagem do bloqueio</span><textarea class="inp" name="msg" rows="3">${esc(n.bloqueio.msg || R.MSG_PRELIMINAR)}</textarea></label>` : ''}
        ${!d.modelo ? '<p class="small muted" style="margin:12px 0 0">No Drive: botão direito > Compartilhar > Acesso geral: <b>Qualquer pessoa com o link</b>, como <b>Leitor</b> > Copiar link.</p>' : ''}`,
      aoAbrir: (el) => {
        const u = $('[name=url]', el), det = $('[data-q=detec]', el), nome = $('[name=nome]', el);
        if (u && !novo) setTimeout(() => u.focus(), 30);
        if (!u) return;
        const ver = () => {
          const x = R.drive(u.value);
          det.className = 'small ac-detec ' + (x ? (x.tipo === 'link' ? 'aviso' : 'ok') : '');
          det.innerHTML = !u.value.trim() ? '' : !x ? 'Isso não parece um link.' : x.tipo === 'pasta' ? `${icone('pasta')}Pasta do Drive: o cliente vê a lista de arquivos dentro do portal.` : x.tipo === 'link' ? `${icone('info')}Não é do Google Drive: o cliente abre em outra aba.` : `${icone('nota')}${x.tipo === 'doc' ? 'Documento Google' : 'Arquivo do Drive'}: o cliente abre dentro do portal e pode baixar.`;
          if (!nome.value.trim() && x && x.tipo === 'pasta' && /fotos?/i.test(u.value)) nome.value = 'Fotos';
        };
        u.addEventListener('input', ver); ver();
      },
      botoes: [
        ...(novo ? [] : [{ rot: n.tipo === 'pasta' ? 'Excluir pasta' : 'Excluir', classe: 'danger', esq: true, acao: async (m) => {
          if (n.tipo === 'pasta' && R.temConteudo(n) && !(await ui.confirmar({ titulo: `Excluir a pasta "${n.nome}"?`, msg: 'Os links dentro dela também saem da área do cliente. Os arquivos no Drive não são tocados.', ok: 'Excluir', perigo: true }))) return;
          achado.lista.splice(achado.lista.indexOf(n), 1); d.salvar(est); m.fechar(); Sis.desenhar(true);
        } }]),
        { rot: 'Cancelar' },
        { rot: novo ? 'Adicionar' : 'Salvar', classe: 'primary', acao: (m) => {
          const v = (k) => ($(`[name=${k}]`, m.el) ? $(`[name=${k}]`, m.el).value.trim() : '');
          if (!v('nome')) { $('[name=nome]', m.el).classList.add('erro'); return; }
          const url = v('url');
          if (!d.modelo && url && !R.drive(url)) { $('[name=url]', m.el).classList.add('erro'); return; }
          n.nome = v('nome');
          if (!d.modelo) n.url = url;
          const vz = $('[name=vazio]:checked', m.el); if (vz) n.vazio = vz.value;
          if (n.bloqueio) n.bloqueio = { ativo: d.modelo ? true : !!($('[name=bloq]', m.el) || {}).checked, msg: v('msg') || R.MSG_PRELIMINAR };
          if (novo) {
            if (paiId) { const p = R.acharNo(est, paiId); if (!p) return; (p.no.filhos = p.no.filhos || []).push(n); } else est.push(n);
          }
          d.salvar(est); m.fechar(); Sis.desenhar(true);
        } },
      ],
    });
  }
  A['ac-no-novo'] = (b) => modalNo(b.dataset.dono, { paiId: b.dataset.no || null, tipo: b.dataset.t });
  A['ac-no-editar'] = (b) => modalNo(b.dataset.dono, { noId: b.dataset.no });
  A['ac-no-link'] = (b) => modalNo(b.dataset.dono, { noId: b.dataset.no });
  A['ac-no-mover'] = (b) => {
    const d = dono(b.dataset.dono); if (!d) return;
    const a = R.acharNo(d.estrutura, b.dataset.no); if (!a) return;
    const i = a.lista.indexOf(a.no), j = i + Number(b.dataset.d);
    if (j < 0 || j >= a.lista.length) return;
    [a.lista[i], a.lista[j]] = [a.lista[j], a.lista[i]];
    d.salvar(d.estrutura); Sis.desenhar(true);
  };
  A['ac-no-bloq'] = async (b) => {
    const d = dono(b.dataset.dono); if (!d) return;
    const a = R.acharNo(d.estrutura, b.dataset.no); if (!a || !a.no.bloqueio) return;
    if (a.no.bloqueio.ativo && !d.modelo && !(await ui.confirmar({ titulo: `Liberar "${a.no.nome}" para o cliente?`, msg: 'O cliente passa a ver e abrir o que estiver nesta posição.', ok: 'Liberar' }))) return;
    a.no.bloqueio.ativo = !a.no.bloqueio.ativo;
    d.salvar(d.estrutura); Sis.desenhar(true);
    ui.toast(a.no.bloqueio.ativo ? 'Bloqueado de novo para o cliente.' : 'Liberado para o cliente.');
  };

  /* ---------- telas ---------- */
  function telaLista(el) {
    const q = norm((Sis.rota().params || {}).q || '');
    const todos = clientes();
    const lista = q ? todos.filter((c) => norm(rotulo(c)).includes(q)) : todos;
    const ss = B.store.lista(T, 'servico');
    el.innerHTML = `<div class="pagehead"><div><h1>Área do cliente</h1><p>${todos.length} ${todos.length === 1 ? 'cliente' : 'clientes'} · os clientes entram em <a href="${esc(URL_CLIENTES)}" target="_blank" rel="noopener">${esc(URL_CLIENTES.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></p></div>
      <div class="actions"><a class="btn" href="#/area/modelos">${icone('lista')}Modelos</a><a class="btn" href="#/rdo/acessos">${icone('chave')}Acessos</a><button class="btn primary" data-a="ac-cli-novo">${icone('mais')}Novo cliente</button></div></div>
      <div class="ac-busca"><input class="inp" type="search" placeholder="Buscar pelo número ou nome" value="${esc((Sis.rota().params || {}).q || '')}" data-ac-busca></div>
      ${lista.length ? `<div class="ac-clis">${lista.map((c) => {
        const sv = ss.filter((r) => r.grupo === c.id);
        const obs = obrasRdo().filter((o) => o.areaCliente === c.id).length;
        return `<a class="card ac-cli" href="#/area/${esc(c.id)}"><span class="ac-num">${esc(c.numero || '·')}</span><span class="ac-cli-t"><b>${esc(c.nome)}</b>
          <small>${sv.length} ${sv.length === 1 ? 'serviço' : 'serviços'}${obs ? ` · ${obs} ${obs === 1 ? 'obra' : 'obras'}` : ''}${c.carteiraId ? ' · ligado à carteira' : ''}</small></span>${icone('dir')}</a>`;
      }).join('')}</div>` : `<div class="card"><div class="empty"><b>${q ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}</b>${q ? '' : 'Cadastre o cliente com o mesmo número da pasta dele no Drive e crie os serviços.'}</div></div>`}`;
    const bx = $('[data-ac-busca]', el);
    bx.addEventListener('input', () => { clearTimeout(bx._t); bx._t = setTimeout(() => { location.hash = '#/area' + (bx.value.trim() ? '?q=' + encodeURIComponent(bx.value.trim()) : ''); }, 250); });
    if (q) { bx.focus(); bx.setSelectionRange(bx.value.length, bx.value.length); }
  }

  function htmlFinanceiro(s) {
    const f = s.financeiro;
    const cs = s.contratoId && Sis.comercial ? Sis.comercial.servico(s.contratoId) : null;
    const contrato = s.contratoUrl ? `<a href="${esc((R.drive(s.contratoUrl) || {}).abrir || s.contratoUrl)}" target="_blank" rel="noopener">Contrato</a>` : '<span class="muted">Contrato sem link</span>';
    let fin = '<span class="muted">Pagamentos: não ligado à carteira</span>';
    if (s.contratoId && f) {
      const r = R.resumoFinanceiro(f);
      fin = `<span>Pago ${brl(r.pago)} de ${brl(r.total)} (${r.pct.toFixed(0)}%) · ${r.parcelas.filter((p) => p.pago).length} de ${r.parcelas.length} parcelas${cs ? '' : ' · contrato não encontrado na carteira'}</span>`;
    } else if (s.contratoId) fin = '<span class="muted">Ligado à carteira, aguardando os dados</span>';
    return `<div class="ac-fin">${icone('nota')}<span class="ac-fin-t">${contrato}<small>${fin}</small></span>
      <span class="ac-no-a"><button class="btn sm ghost" data-a="ac-contrato-link" data-sv="${esc(s.id)}">${s.contratoUrl ? 'Trocar link' : 'Colar link'}</button><button class="btn sm ghost" data-a="ac-contrato-carteira" data-sv="${esc(s.id)}">${s.contratoId ? 'Trocar contrato' : 'Ligar à carteira'}</button></span></div>`;
  }
  function htmlServico(s) {
    const venc = R.vencimento(s), sv = R.situacaoVenc(venc, hojeISO());
    const sit = SITUACOES.find((x) => x[0] === s.situacao) || SITUACOES[0];
    return `<section class="card ac-sv" data-sv="${esc(s.id)}"><div class="hd"><div>
        <h3>${esc(s.titulo || R.nomeTipo(s.tipo))}</h3>
        <p>${esc([R.nomeTipo(s.tipo), s.codigo, s.data && dataBR(s.data)].filter(Boolean).join(' · '))}</p></div>
        <div class="actions"><span class="chip ${sit[2]}">${sit[1]}</span>${venc ? (() => { const cls = `chip ${sv.estado === 'vencido' ? 'estourado' : sv.estado === 'perto' ? 'atencao' : 'neutro'}`, txt = `${sv.estado === 'vencido' ? 'Venceu em' : 'Vence em'} ${dataBR(venc)}`; return laudoDo(s.id) ? `<a class="${cls} ac-renov" href="#/renovacoes" title="Está nas Renovações">${icone('repetir')}${txt}</a>` : `<span class="${cls}">${txt}</span>`; })() : ''}
          <button class="btn icon sm" data-a="ac-sv-editar" data-id="${esc(s.id)}" aria-label="Editar serviço" title="Editar serviço">${icone('editar')}</button></div></div>
      <div class="bd">${htmlFinanceiro(s)}
        ${s.estrutura.length ? `<ul class="ac-arvore">${htmlArvore(s.estrutura, 's:' + s.id, false)}</ul>` : '<p class="small muted">Nenhuma pasta ou documento ainda.</p>'}
        <div class="actions"><button class="btn sm" data-a="ac-no-novo" data-t="doc" data-dono="s:${esc(s.id)}">${icone('mais')}Documento</button><button class="btn sm" data-a="ac-no-novo" data-t="pasta" data-dono="s:${esc(s.id)}">${icone('mais')}Pasta</button>
          <button class="btn sm ghost" data-a="ac-sv-modelo" data-id="${esc(s.id)}">${icone('copiar')}Salvar como modelo</button></div></div></section>`;
  }

  function telaCliente(el, id) {
    const c = cliente(id);
    if (!c) { el.innerHTML = '<div class="card"><div class="empty"><b>Cliente não encontrado</b><a href="#/area">Voltar</a></div></div>'; return; }
    const sv = servicosDe(c.id);
    const peso = (o) => (o.areaCliente === c.id ? 0 : o.areaCliente ? 3 : o.situacao === 'concluida' ? 2 : 1);
    const obs = obrasRdo().sort((x, y) => peso(x) - peso(y));
    el.innerHTML = `<div class="ob-topo"><a class="btn icon" href="#/area" aria-label="Voltar">${icone('esq')}</a>
        <div class="tit"><b>${esc(rotulo(c))}</b><span>${sv.length} ${sv.length === 1 ? 'serviço' : 'serviços'}${c.carteiraId ? ' · ' + esc(Sis.clientes.nome(c.carteiraId) || 'cliente da carteira') : ''}${c.obs ? ' · ' + esc(c.obs) : ''}</span></div>
        <div class="actions"><button class="btn" data-a="ac-cli-editar" data-id="${esc(c.id)}">${icone('editar')}<span>Editar</span></button><button class="btn primary" data-a="ac-sv-novo" data-c="${esc(c.id)}">${icone('mais')}<span>Novo serviço</span></button></div></div>
      <p class="small muted ac-dica">${icone('info')}<span>Cada link precisa estar compartilhado no Drive como <b>Qualquer pessoa com o link: Leitor</b>. Compartilhe só o arquivo ou a pasta que vai para o cliente, nunca a pasta numerada inteira.</span></p>
      ${sv.length ? sv.map(htmlServico).join('') : '<div class="card"><div class="empty"><b>Nenhum serviço ainda</b>Crie o serviço (AVCB, inspeção, laudo...): a organização do modelo já vem pronta.</div></div>'}
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

  function telaModelos(el) {
    const ms = modelos();
    el.innerHTML = `<div class="ob-topo"><a class="btn icon" href="#/area" aria-label="Voltar">${icone('esq')}</a><div class="tit"><b>Modelos de organização</b><span>A estrutura que já vem pronta quando você cria um serviço</span></div>
        <div class="actions"><button class="btn primary" data-a="ac-mod-novo">${icone('mais')}<span>Novo modelo</span></button></div></div>
      <div class="ac-clis">${ms.map((m) => `<a class="card ac-cli" href="#/area/modelos/${esc(m.id)}"><span class="ac-num">${icone(m.pronto ? 'check' : 'lista')}</span><span class="ac-cli-t"><b>${esc(m.nome)}</b>
        <small>${m.tipoPadrao ? `Padrão para ${esc(R.nomeTipo(m.tipoPadrao))}` : 'Escolhido na hora de criar o serviço'} · ${contar(m.estrutura)} posições${m.pronto ? (m.mudado ? ' · modelo pronto, alterado por você' : ' · modelo pronto') : ''}</small></span>${icone('dir')}</a>`).join('')}</div>
      <p class="small muted" style="margin-top:12px">Mudanças num modelo valem para os próximos serviços. Os serviços já criados não mudam.</p>`;
  }
  const contar = (l) => (l || []).reduce((t, n) => t + 1 + (n.tipo === 'pasta' ? contar(n.filhos) : 0), 0);
  function telaModelo(el, id) {
    const m = modelo(id);
    if (!m) { el.innerHTML = '<div class="card"><div class="empty"><b>Modelo não encontrado</b><a href="#/area/modelos">Voltar</a></div></div>'; return; }
    el.innerHTML = `<div class="ob-topo"><a class="btn icon" href="#/area/modelos" aria-label="Voltar">${icone('esq')}</a><div class="tit"><b>${esc(m.nome)}</b><span>${m.tipoPadrao ? `Padrão para ${esc(R.nomeTipo(m.tipoPadrao))}` : 'Modelo seu'}</span></div>
        <div class="actions"><button class="btn" data-a="ac-mod-editar" data-id="${esc(m.id)}">${icone('editar')}<span>Nome e tipo</span></button></div></div>
      <section class="card"><div class="hd"><div><h3>Estrutura</h3><p>O que o cliente vai encontrar. Os links são colados em cada serviço.</p></div></div><div class="bd">
        ${(m.estrutura || []).length ? `<ul class="ac-arvore">${htmlArvore(m.estrutura, 'm:' + m.id, true)}</ul>` : '<p class="small muted">Vazio.</p>'}
        <div class="actions"><button class="btn sm" data-a="ac-no-novo" data-t="doc" data-dono="m:${esc(m.id)}">${icone('mais')}Documento</button><button class="btn sm" data-a="ac-no-novo" data-t="pasta" data-dono="m:${esc(m.id)}">${icone('mais')}Pasta</button></div></div></section>
      <div class="ac-pe">${m.pronto ? (m.mudado ? `<button class="btn" data-a="ac-mod-x" data-id="${esc(m.id)}">${icone('repetir')}Voltar ao modelo original</button>` : '') : `<button class="btn danger" data-a="ac-mod-x" data-id="${esc(m.id)}">${icone('lixo')}Excluir modelo</button>`}</div>`;
  }
  function modalModelo(m, aoSalvar) {
    const novo = !m || !m.id;
    m = m || { nome: '', tipoPadrao: '', estrutura: [] };
    ui.abrirModal({
      titulo: novo ? 'Novo modelo' : 'Nome e tipo do modelo',
      corpo: `<label class="f req"><span>Nome do modelo</span><input class="inp" name="nome" value="${esc(m.nome || '')}" placeholder="Ex.: Laudo de SPDA" autofocus></label>
        <label class="f" style="margin-top:10px"><span>Usar como padrão para</span><select class="inp" name="tipo"><option value="">Nenhum tipo (escolho na hora)</option>${R.TIPOS_SERVICO.map(([k, n]) => `<option value="${k}" ${m.tipoPadrao === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`,
      botoes: [{ rot: 'Cancelar' }, { rot: novo ? 'Criar modelo' : 'Salvar', classe: 'primary', acao: (x) => {
        const nome = $('[name=nome]', x.el).value.trim(); if (!nome) { $('[name=nome]', x.el).classList.add('erro'); return; }
        const tipo = $('[name=tipo]', x.el).value;
        const id = m.id || uid();
        salvarModelo({ id, nome, tipoPadrao: tipo, estrutura: m.estrutura || [] });
        x.fechar();
        if (aoSalvar) aoSalvar(id); else Sis.desenhar(true);
      } }],
    });
  }
  A['ac-mod-novo'] = () => modalModelo(null, (id) => { location.hash = '#/area/modelos/' + id; });
  A['ac-mod-editar'] = (b) => { const m = modelo(b.dataset.id); if (m) modalModelo(m); };
  A['ac-mod-x'] = async (b) => {
    const m = modelo(b.dataset.id); if (!m) return;
    const ok = await ui.confirmar(m.pronto ? { titulo: 'Voltar ao modelo original?', msg: 'As suas mudanças neste modelo são desfeitas. Os serviços já criados não mudam.', ok: 'Voltar ao original' } : { titulo: `Excluir o modelo "${m.nome}"?`, msg: 'Os serviços já criados não mudam.', ok: 'Excluir', perigo: true });
    if (!ok) return;
    B.store.excluir(T, m.id);
    location.hash = '#/area/modelos';
  };
  A['ac-sv-modelo'] = (b) => {
    const s = servico(b.dataset.id); if (!s) return;
    modalModelo({ nome: s.titulo || R.nomeTipo(s.tipo), tipoPadrao: R.MODELOS[s.tipo] ? '' : s.tipo, estrutura: R.copiarEstrutura(s.estrutura, { semLinks: true }) }, () => { ui.toast('Modelo salvo. Ele aparece na hora de criar um serviço.'); Sis.desenhar(true); });
  };

  /* ---------- cliente ---------- */
  function modalCliente(c) {
    const novo = !c;
    c = c || { nome: '', numero: '', obs: '', carteiraId: '' };
    let sel = null;
    ui.abrirModal({
      titulo: novo ? 'Novo cliente' : 'Editar cliente',
      sub: 'Use o mesmo número da pasta do cliente no seu Drive.',
      corpo: `<div class="grid2"><label class="f"><span>Nº da pasta</span><input class="inp" name="numero" inputmode="numeric" value="${esc(c.numero || '')}" placeholder="Ex.: 231"></label>
        <label class="f req"><span>Nome (como o cliente vê)</span><input class="inp" name="nome" value="${esc(c.nome || '')}" placeholder="Ex.: Condomínio Bosque Atlântico" autofocus></label>
        <div class="span2" data-q="cart"></div>
        <label class="f span2"><span>Observação interna (o cliente não vê)</span><input class="inp" name="obs" value="${esc(c.obs || '')}"></label></div>`,
      aoAbrir: (el) => {
        const r = $('[data-q=cart]', el);
        if (r && Sis.seletorCliente) sel = Sis.seletorCliente(r, { clienteId: c.carteiraId || '', rotulo: 'Cliente na carteira (para ligar os contratos)', aoMudar: (id) => { const nm = $('[name=nome]', el); if (id && !nm.value.trim()) nm.value = Sis.clientes.nome(id); } });
      },
      botoes: [{ rot: 'Cancelar' }, { rot: novo ? 'Criar cliente' : 'Salvar', classe: 'primary', acao: (m) => {
        const v = (n) => $(`[name=${n}]`, m.el).value.trim();
        if (!v('nome')) { $('[name=nome]', m.el).classList.add('erro'); return; }
        const num = v('numero').replace(/\D/g, '');
        const dup = num && clientes().find((x) => String(x.numero) === num && x.id !== c.id);
        if (dup) { ui.toast(`O número ${num} já é de ${dup.nome}.`); return; }
        const id = c.id || uid();
        B.store.salvar(T, id, 'cliente', { nome: v('nome'), numero: num, obs: v('obs'), carteiraId: sel ? sel.valor().clienteId || '' : c.carteiraId || '' }, null);
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
    const ok = await ui.confirmar({ titulo: `Excluir ${c.nome}?`, msg: `${sv.length ? `Os ${sv.length} serviços somem da área do cliente. ` : ''}Os arquivos no Drive não são tocados. Quem tinha acesso a este cliente deixa de ver.`, ok: 'Excluir', perigo: true });
    if (!ok) return;
    sv.forEach((s) => B.store.excluir(T, s.id));
    obrasRdo().filter((o) => o.areaCliente === c.id).forEach((o) => { const r = B.store.get('obras', o.id); const d = Object.assign({}, r.dados); delete d.areaCliente; B.store.salvar('obras', r.id, 'obra', d, r.grupo); });
    B.store.excluir(T, c.id);
    location.hash = '#/area';
  };

  /* ---------- serviço ---------- */
  function modalServico(cid, s) {
    const novo = !s;
    s = s || { tipo: 'inspecao_predial', codigo: '', titulo: '', data: hojeISO(), situacao: 'andamento', renovaAnos: '', estrutura: [] };
    const ms = modelos();
    ui.abrirModal({
      titulo: novo ? 'Novo serviço' : 'Editar serviço',
      sub: 'A validade alimenta os vencimentos e o pedido de renovação que o cliente vê.',
      corpo: `<div class="grid2">
        <label class="f"><span>Tipo</span><select class="inp" name="tipo">${R.TIPOS_SERVICO.map(([k, n]) => `<option value="${k}" ${s.tipo === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="f"><span>Código</span><input class="inp" name="codigo" value="${esc(s.codigo || '')}" placeholder="Ex.: SE231.AVCB"></label>
        <label class="f span2"><span>Título (como o cliente vê)</span><input class="inp" name="titulo" value="${esc(s.titulo || '')}" placeholder="Ex.: AVCB 2026"></label>
        <label class="f"><span>Data (entrega ou início)</span><input class="inp" type="date" name="data" value="${esc(s.data || '')}"></label>
        <label class="f"><span>Situação</span><select class="inp" name="situacao">${SITUACOES.map(([k, n]) => `<option value="${k}" ${s.situacao === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f"><span>Renova a cada (anos)</span><input class="inp" name="renovaAnos" inputmode="numeric" value="${esc(s.renovaAnos || '')}" placeholder="Em branco: não vence"></label>
        <p class="small muted" data-q="venc" style="align-self:end;margin:0 0 10px"></p>
        ${novo ? `<label class="f span2"><span>Organização</span><select class="inp" name="modelo"><option value="">Vazia (organizo do meu jeito)</option>${ms.map((m) => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('')}</select></label>` : ''}</div>`,
      aoAbrir: (el) => {
        const tipo = $('[name=tipo]', el), tit = $('[name=titulo]', el), anos = $('[name=renovaAnos]', el), data = $('[name=data]', el), venc = $('[data-q=venc]', el), mod = $('[name=modelo]', el), sit = $('[name=situacao]', el);
        let mexeuTit = !novo, mexeuAnos = !novo, mexeuMod = false;
        if (mod) mod.addEventListener('change', () => { mexeuMod = true; });
        const sugerir = () => {
          if (!mexeuTit) tit.value = `${R.nomeTipo(tipo.value)}${data.value ? ' ' + data.value.slice(0, 4) : ''}`;
          if (!mexeuAnos) { const t = R.TIPOS_SERVICO.find((x) => x[0] === tipo.value); anos.value = t && t[2] ? t[2] : ''; }
          if (mod && !mexeuMod) { const m = modeloDoTipo(tipo.value); mod.value = m ? m.id : ''; }
          const v = R.vencimento({ data: data.value, renovaAnos: anos.value });
          venc.textContent = v ? `Vence em ${dataBR(v)}. ${sit.value === 'entregue' ? 'Entra nas Renovações.' : 'Entra nas Renovações quando estiver Entregue.'}` : '';
        };
        sit.addEventListener('change', sugerir);
        tit.addEventListener('input', () => { mexeuTit = true; });
        anos.addEventListener('input', () => { mexeuAnos = true; sugerir(); });
        tipo.addEventListener('change', sugerir); data.addEventListener('change', sugerir); data.addEventListener('input', sugerir);
        sugerir();
      },
      botoes: [
        ...(novo ? [] : [{ rot: 'Excluir serviço', classe: 'danger', esq: true, acao: async (m) => {
          if (!(await ui.confirmar({ titulo: 'Excluir este serviço?', msg: 'Ele e os links somem da área do cliente. Os arquivos no Drive não são tocados.', ok: 'Excluir', perigo: true }))) return;
          B.store.excluir(T, s.id); m.fechar(); sincronizarRenovacoes(); Sis.desenhar(true);
        } }]),
        { rot: 'Cancelar' },
        { rot: novo ? 'Criar serviço' : 'Salvar', classe: 'primary', acao: (m) => {
          const v = (n) => ($(`[name=${n}]`, m.el) ? $(`[name=${n}]`, m.el).value.trim() : '');
          const d = Object.assign({}, s, { id: s.id || uid(), clienteId: cid, tipo: v('tipo'), codigo: v('codigo'), titulo: v('titulo') || R.nomeTipo(v('tipo')), data: v('data'), situacao: v('situacao'), renovaAnos: v('renovaAnos').replace(/[^\d]/g, '') });
          if (novo) { const md = modelo(v('modelo')); d.estrutura = md ? R.copiarEstrutura(md.estrutura, { semLinks: true }) : []; d.criadoEm = new Date().toISOString(); }
          salvarServico(d);
          m.fechar();
          const rs = sincronizarRenovacoes();
          Sis.desenhar(true);
          if (rs && rs.criados.length) ui.toast(`Entrou nas Renovações: renovação em ${dataBR(rs.criados[0].renovacao)}.`);
        } },
      ],
    });
  }
  A['ac-sv-novo'] = (b) => modalServico(b.dataset.c, null);
  A['ac-sv-editar'] = (b) => { const s = servico(b.dataset.id); if (s) modalServico(s.clienteId, s); };

  /* ---------- contrato e pagamentos ---------- */
  A['ac-contrato-link'] = (b) => {
    const s = servico(b.dataset.sv); if (!s) return;
    ui.abrirModal({
      titulo: 'Link do contrato', sub: esc(s.titulo || R.nomeTipo(s.tipo)),
      corpo: `<label class="f"><span>Link do contrato no Drive (PDF assinado)</span><input class="inp" name="url" value="${esc(s.contratoUrl || '')}" placeholder="Cole aqui o link copiado no Drive" autocapitalize="off" spellcheck="false" autofocus></label>`,
      botoes: [...(s.contratoUrl ? [{ rot: 'Tirar o link', classe: 'danger', esq: true, acao: (m) => { s.contratoUrl = ''; salvarServico(s); m.fechar(); Sis.desenhar(true); } }] : []), { rot: 'Cancelar' }, { rot: 'Salvar', classe: 'primary', acao: (m) => {
        const url = $('[name=url]', m.el).value.trim();
        if (url && !R.drive(url)) { $('[name=url]', m.el).classList.add('erro'); return; }
        s.contratoUrl = url; salvarServico(s); m.fechar(); Sis.desenhar(true);
      } }],
    });
  };
  A['ac-contrato-carteira'] = (b) => {
    const s = servico(b.dataset.sv); if (!s) return;
    if (!Sis.comercial) { ui.toast('A carteira de clientes não está disponível neste aparelho.'); return; }
    const c = cliente(s.clienteId) || {};
    const todos = contratosCarteira();
    const doCliente = c.carteiraId ? todos.filter((x) => x.clienteId === c.carteiraId) : [];
    const lista = doCliente.length ? doCliente : todos;
    const linha = (x) => { const f = finDe(x), r = R.resumoFinanceiro(f); return `<label class="r-perfil"><input type="radio" name="ct" value="${esc(x.id)}" ${s.contratoId === x.id ? 'checked' : ''}><span><b>${esc(x.tipo || 'Serviço')} · ${esc(Sis.clientes.nome(x.clienteId) || 'Cliente')}</b><small>${brl(r.total)} · ${r.parcelas.filter((p) => p.pago).length} de ${r.parcelas.length} parcelas pagas${x.obs ? ' · ' + esc(String(x.obs).slice(0, 60)) : ''}</small></span></label>`; };
    ui.abrirModal({
      titulo: 'Ligar ao contrato da carteira', sub: 'As parcelas pagas e pendentes passam a aparecer para o cliente e se atualizam sozinhas quando você marca um pagamento na carteira.',
      corpo: lista.length ? `${!doCliente.length && c.carteiraId ? '<p class="small muted">Nenhum contrato deste cliente na carteira. Mostrando todos.</p>' : !c.carteiraId ? '<p class="small muted">Dica: ligue este cliente ao cadastro da carteira (Editar) para ver só os contratos dele.</p>' : ''}<div class="r-perfis ac-cts">${lista.map(linha).join('')}</div>`
        : '<p class="small muted">Nenhum contrato fechado na carteira de clientes.</p>',
      botoes: [...(s.contratoId ? [{ rot: 'Desligar', classe: 'danger', esq: true, acao: (m) => { s.contratoId = ''; s.financeiro = null; salvarServico(s); m.fechar(); Sis.desenhar(true); } }] : []), { rot: 'Cancelar' }, ...(lista.length ? [{ rot: 'Ligar', classe: 'primary', acao: (m) => {
        const r = $('[name=ct]:checked', m.el); if (!r) { ui.toast('Escolha o contrato.'); return; }
        s.contratoId = r.value; s.financeiro = finDe(Sis.comercial.servico(r.value));
        salvarServico(s); m.fechar(); Sis.desenhar(true); ui.toast('Contrato ligado.');
      } }] : [])],
    });
  };
  A['ac-acesso-novo'] = (b) => { if (window.RdoAcessos) window.RdoAcessos.novo({ perfil: 'cliente', clientes: [b.dataset.c] }); };

  /* ---------- registro ---------- */
  function render(el, partes) {
    if (!B.pronto || !B.pronto()) { el.innerHTML = '<div class="empty">Carregando…</div>'; B.iniciar().then(() => Sis.desenhar(true)).catch(() => {}); return; }
    if (!B.conectado()) { el.innerHTML = `<div class="pagehead"><div><h1>Área do cliente</h1></div></div><div class="card"><div class="empty"><b>Conecte o Diário de obra primeiro</b>A área do cliente usa o mesmo projeto do Diário de obra. <a href="#/rdo">Conectar</a></div></div>`; return; }
    if (B.perfil() !== 'master') { el.innerHTML = '<div class="card"><div class="empty"><b>Só o acesso master gerencia a área do cliente.</b></div></div>'; return; }
    sincronizarFinanceiro(); sincronizarRenovacoes();
    if (partes[0] === 'modelos') { if (partes[1]) telaModelo(el, partes[1]); else telaModelos(el); return; }
    if (partes[0]) telaCliente(el, partes[0]); else telaLista(el);
  }
  B.store.ouvir((origem) => {
    agendarFin();
    if (origem !== 'remoto') return;
    if (Sis.rota().mod === 'area' && !document.querySelector('.modal')) Sis.desenhar(true);
  });
  if (Sis.store && Sis.store.ouvir) Sis.store.ouvir(() => agendarFin());
  Sis.areaCliente = { sincronizarFinanceiro, sincronizarRenovacoes };
  Sis.modulo({
    id: 'area', nome: 'Área do cliente', desc: 'Documentos e serviços dos clientes', icone: 'pasta', sistema: true,
    render,
    buscar(t) {
      if (!B.conectado() || B.perfil() !== 'master') return [];
      return clientes().filter((c) => norm(rotulo(c)).includes(t)).slice(0, 4).map((c) => ({ tipo: 'Área do cliente', titulo: rotulo(c), sub: `${servicosDe(c.id).length} serviços`, rota: `#/area/${c.id}` }));
    },
  });
})();
