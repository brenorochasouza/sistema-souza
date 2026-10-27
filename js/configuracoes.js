'use strict';
/* =========================================================
   Sistemas (todos os módulos e a barra do celular),
   Configurações e backup de tudo.
   ========================================================= */
(function () {
  const { $, $$, esc, hojeISO, kvLocal } = Sis.util;
  const { store, ui, icone, kv, sync } = Sis;
  const FS_OK = typeof window.showDirectoryPicker === 'function';
  const MAX_HIST = 30;

  /* ---------------- backup ---------------- */
  const B = { pasta: null, ultimo: null, versao: -1, status: '' };
  async function carregarBackup() {
    if (!FS_OK) return;
    B.pasta = (await kv.get('pastaBackup')) || null;
    const u = await kv.get('ultimoBackup');
    if (u) B.ultimo = new Date(u);
  }
  async function gravarArq(dir, nome, conteudo) {
    const fh = await dir.getFileHandle(nome, { create: true });
    const w = await fh.createWritable();
    await w.write(conteudo); await w.close();
  }
  /** Grava uma cópia de tudo na pasta escolhida e um histórico diário dos últimos 30 dias. */
  async function backupPasta(manual) {
    if (!FS_OK || !B.pasta) return false;
    try {
      let perm = await B.pasta.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        if (!manual) { B.status = 'permissao'; return false; }
        perm = await B.pasta.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') { B.status = 'permissao'; ui.toast('O navegador não liberou a pasta de backup.'); return false; }
      }
      if (!manual && B.versao === store.versao()) return false;
      const v = store.versao();
      const txt = JSON.stringify(store.exportar());
      await gravarArq(B.pasta, 'souza-sistema.json', txt);
      const hist = await B.pasta.getDirectoryHandle('historico', { create: true });
      await gravarArq(hist, `souza-sistema_${hojeISO()}.json`, txt);
      const nomes = [];
      for await (const [nome, h] of hist.entries()) if (h.kind === 'file' && /^souza-sistema_\d{4}-\d{2}-\d{2}\.json$/.test(nome)) nomes.push(nome);
      nomes.sort().reverse();
      for (const n of nomes.slice(MAX_HIST)) { try { await hist.removeEntry(n); } catch { /* ignora */ } }
      B.versao = v; B.ultimo = new Date(); B.status = 'ok';
      await kv.set('ultimoBackup', B.ultimo.toISOString());
      if (manual) ui.toast('Backup gravado na pasta.');
      return true;
    } catch (e) {
      B.status = 'erro';
      if (manual) ui.toast('Falha no backup: ' + e.message, 'erro');
      return false;
    }
  }
  async function escolherPasta() {
    let h;
    try { h = await window.showDirectoryPicker({ id: 'souza-backup', mode: 'readwrite' }); }
    catch (e) { if (e && e.name !== 'AbortError') ui.toast('Não foi possível usar a pasta: ' + e.message, 'erro'); return; }
    B.pasta = h;
    await kv.set('pastaBackup', h);
    await backupPasta(true);
    Sis.desenhar(true);
  }
  function exportarTudo() {
    ui.baixarArquivo(`souza-sistema_${hojeISO()}.json`, JSON.stringify(store.exportar(), null, 1));
    ui.toast('Arquivo de backup gerado.');
  }
  function restaurar() {
    ui.escolherArquivo('.json,application/json', async (f) => {
      let obj;
      try { obj = JSON.parse(await f.text()); } catch { ui.alerta({ titulo: 'Arquivo inválido', msg: 'Não consegui ler esse arquivo.' }); return; }
      try {
        const ok = await ui.confirmar({ titulo: 'Restaurar backup?', msg: `Os registros do arquivo "${f.name}" que forem mais novos que os deste aparelho vão substituir os atuais. O resto não muda.`, ok: 'Restaurar' });
        if (!ok) return;
        const n = store.importar(obj);
        ui.toast(n ? `${n} registros restaurados.` : 'Nada a restaurar: os dados do aparelho já são iguais ou mais novos.');
        Sis.desenhar(true);
      } catch (e) { ui.alerta({ titulo: 'Arquivo inválido', msg: e.message }); }
    });
  }
  window.SisBackup = {
    async automatico() { await carregarBackup(); await backupPasta(false); },
  };
  setInterval(() => backupPasta(false), 30 * 60 * 1000);

  /* ---------------- sistemas ---------------- */
  function renderSistemas(el) {
    const mods = Sis.modulos.filter((m) => m.sistema);
    const fixos = Sis.naBarra();
    el.innerHTML = `<div class="pagehead"><div><h1>Sistemas</h1><p>Todos os sistemas integrados da Souza Engenharia</p></div></div>
      <div class="tiles">
        ${mods.map((m) => `<a class="tile" href="#/${m.id}"><span class="moldura">${icone(m.icone)}</span><span><b>${esc(m.nome)}</b><small>${esc(m.desc || '')}</small></span></a>`).join('')}
        <a class="tile" href="#/configuracoes"><span class="moldura">${icone('config')}</span><span><b>Configurações</b><small>Conta, backup e dados</small></span></a>
        <div class="tile vago"><span class="moldura">${icone('mais')}</span><span><b class="muted">Próximo sistema</b><small>Entra aqui quando for criado</small></span></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="bd" style="padding-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div><b style="font-weight:500">Fixos na barra do celular</b><div class="small muted">${fixos.map((id) => esc(Sis.modPor(id).nome)).join(', ')}</div></div>
        <button class="btn sm" data-a="sis-barra">Alterar</button></div></div>`;
  }
  Sis.acoes['sis-barra'] = () => {
    const mods = Sis.modulos.filter((m) => m.sistema);
    const fixos = Sis.naBarra();
    ui.abrirModal({
      titulo: 'Fixos na barra', sub: 'Escolha até 3 sistemas para a barra inferior do celular. Os outros ficam em Sistemas.', folha: true,
      corpo: mods.map((m) => `<label class="chk"><input type="checkbox" value="${m.id}" ${fixos.includes(m.id) ? 'checked' : ''}> <span>${esc(m.nome)}</span></label>`).join(''),
      botoes: [{ rot: 'Cancelar' }, {
        rot: 'Salvar', classe: 'primary', acao: (m) => {
          const sel = $$('input:checked', m.el).map((i) => i.value);
          if (sel.length > 3) { ui.toast('Escolha no máximo 3.'); return; }
          kvLocal.set('barra', sel);
          m.fechar(); Sis.shell(); Sis.desenhar(true);
        },
      }],
    });
  };

  /* ---------------- configurações ---------------- */
  function renderConfig(el) {
    const st = sync.estado(), info = sync.info();
    const host = info.url ? info.url.replace(/^https?:\/\//, '') : '-';
    const chave = kvLocal.get('ia-chave', '');
    const celular = matchMedia('(max-width: 899px)').matches;
    const obras = Sis.obrasConfig;
    el.innerHTML = `<div class="pagehead"><div><h1>Configurações</h1><p>Conta, sincronização, backup e preferências</p></div></div>
    <div class="cfg">
      <div class="cfg-col">
        <div class="card"><div class="hd"><h3>Conta e sincronização</h3></div><div class="bd">
          <dl class="kv"><dt>Conta</dt><dd>${esc(info.email || '-')}</dd><dt>Projeto</dt><dd>${esc(host)}</dd>
            <dt>Situação</dt><dd>${esc(st.txt)}</dd><dt>Aguardando envio</dt><dd>${info.pendentes}</dd>
            <dt>Última sincronização</dt><dd>${info.ultima ? info.ultima.toLocaleString('pt-BR') : '-'}</dd>
            ${info.erro ? `<dt>Erro</dt><dd class="small" style="color:var(--over);word-break:break-word">${esc(info.erro)}</dd>` : ''}</dl>
          <p class="small muted">Tudo fica guardado no aparelho e no Supabase. Sem internet, o que você lança fica na fila e sobe sozinho quando a conexão volta.</p>
          <div class="actions"><button class="btn primary" data-a="cfg-sync">${icone('nuvem')}Sincronizar agora</button><button class="btn" data-a="cfg-sair">${icone('sair')}Sair da conta</button></div>
        </div></div>
        <div class="card"><div class="hd"><div><h3>Backup</h3><p>Agenda, clientes, orçamentos e obras num arquivo só.</p></div></div><div class="bd">
          ${FS_OK && !celular ? `<dl class="kv"><dt>Pasta</dt><dd>${B.pasta ? `<b>${esc(B.pasta.name)}</b>` : 'Não escolhida'}</dd><dt>Último backup</dt><dd>${B.ultimo ? B.ultimo.toLocaleString('pt-BR') : '-'}</dd>
            ${B.status === 'permissao' ? '<dt>Situação</dt><dd>Aguardando você liberar a pasta nesta sessão</dd>' : ''}</dl>
            <p class="small muted">Escolha a pasta do Google Drive no computador. O sistema grava uma cópia ao abrir e a cada 30 minutos, com histórico diário dos últimos ${MAX_HIST} dias.</p>
            <div class="actions">${B.pasta ? `<button class="btn primary" data-a="cfg-bkp">${icone('pasta')}Fazer backup agora</button>` : ''}<button class="btn ${B.pasta ? '' : 'primary'}" data-a="cfg-pasta">${icone('pasta')}${B.pasta ? 'Trocar pasta' : 'Escolher pasta de backup'}</button></div>`
            : '<p class="small muted">O backup automático na pasta do Drive é feito pelo computador. Aqui você pode baixar uma cópia ou restaurar.</p>'}
          <div class="actions" style="margin-top:10px"><button class="btn" data-a="cfg-exportar">${icone('baixar')}Baixar backup</button><button class="btn" data-a="cfg-restaurar">${icone('enviar')}Restaurar backup</button></div>
        </div></div>
        <div class="card"><div class="hd"><h3>Usar no celular como app</h3></div><div class="bd">
          <ol class="passos"><li>Abra breno.souzaengenharia.com no Chrome do celular e entre.</li><li>Toque no menu de três pontos e escolha "Adicionar à tela inicial" ou "Instalar app".</li><li>O ícone da Souza aparece na tela do celular e abre em tela cheia, também sem internet.</li></ol>
          <p class="small muted" style="margin-top:8px">No iPhone, use o Safari, toque em Compartilhar e escolha "Adicionar à Tela de Início".</p>
        </div></div>
      </div>
      <div class="cfg-col">
        <div class="card"><div class="hd"><div><h3>Ditado com IA</h3><p>Usado em Clientes para cadastrar um serviço falando.</p></div></div><div class="bd">
          <label class="f"><span>Chave da API da Anthropic</span><input class="inp" type="password" id="cfg-ia" value="${esc(chave)}" placeholder="sk-ant-..." autocomplete="off"></label>
          <p class="small muted">Fica guardada só neste aparelho, nunca no código do site.</p>
          <div class="actions"><button class="btn primary" data-a="cfg-ia-salvar">Salvar chave</button>${chave ? '<button class="btn" data-a="cfg-ia-remover">Remover</button>' : ''}</div>
        </div></div>
        ${Sis.orcamentosConfig ? Sis.orcamentosConfig.card() : ''}
        ${obras ? obras.cardCategorias() + obras.cardEmpresa() : ''}
        <p class="tiny muted">Sistema Souza Engenharia, versão ${esc(Sis.VERSAO)}</p>
      </div>
    </div>`;
  }
  const A = Sis.acoes;
  A['cfg-sync'] = async () => { await sync.agora(); Sis.desenhar(true); const st = sync.estado(); ui.toast(st.cls === 'erro' ? 'Erro: ' + (st.title || st.txt) : st.txt); };
  A['cfg-sair'] = () => Sis.sair();
  A['cfg-bkp'] = async () => { await backupPasta(true); Sis.desenhar(true); };
  A['cfg-pasta'] = () => escolherPasta();
  A['cfg-exportar'] = exportarTudo;
  A['cfg-restaurar'] = restaurar;
  A['cfg-ia-salvar'] = () => { const v = $('#cfg-ia').value.trim(); kvLocal.set('ia-chave', v); ui.toast(v ? 'Chave salva neste aparelho.' : 'Chave removida.'); Sis.desenhar(true); };
  A['cfg-ia-remover'] = () => { kvLocal.set('ia-chave', ''); ui.toast('Chave removida.'); Sis.desenhar(true); };

  Sis.modulo({ id: 'sistemas', nome: 'Sistemas', icone: 'sistemas', sistema: false, render: renderSistemas });
  Sis.modulo({ id: 'configuracoes', nome: 'Configurações', icone: 'config', sistema: false, render: (el) => { renderConfig(el); if (FS_OK && !B.pasta) carregarBackup().then(() => { if (B.pasta && Sis.rota().mod === 'configuracoes') renderConfig(el); }); } });
})();
