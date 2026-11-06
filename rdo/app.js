'use strict';
/* =========================================================
   Entrada do Diário de obra (/rdo) para a equipe e os clientes.
   Cada pessoa entra com usuário e senha (ou o código de acesso).
   - engenharia (e o master): o editor do Diário de obra (rdo.js);
   - cliente: a visão de consulta dos diários aprovados (portal.js).
   Não abre nada do resto do sistema da Souza Engenharia.
   ========================================================= */
(function () {
  const B = window.RDOB;
  const { $, esc } = Sis.util;
  const { icone } = Sis;
  const RAIZ = window.SOUZA_RAIZ || '../';
  const LOGO = `${RAIZ}img/logo.png?v=${Sis.VERSAO}`;
  let modo = null; // login | editor | cliente | bloqueado

  const semRede = (e) => e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test((e && e.message) || '');

  function telaLogin(msg = '', login = '') {
    modo = 'login';
    document.body.classList.remove('portal');
    $('#app').innerHTML = `<div class="login"><div class="login-box">
      <img src="${LOGO}" alt="Souza Engenharia" class="login-logo">
      <form class="card" id="rdo-login" onsubmit="return false"><div class="bd">
        <h1>Diário de obra</h1>
        <p class="muted small">Entre com o usuário e o código de acesso que a Souza Engenharia enviou (ou com a senha que você criou).</p>
        <label class="f"><span>Usuário</span><input class="inp" id="rl-usuario" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(login)}"></label>
        <label class="f"><span>Senha ou código de acesso</span><input class="inp" type="password" id="rl-senha" autocomplete="current-password"></label>
        ${msg ? `<p class="aviso-campo">${esc(msg)}</p>` : ''}
        <button class="btn primary grande" type="submit" id="rl-entrar">Entrar</button>
      </div></form>
      <p class="tiny muted" style="text-align:center">Esqueceu a senha? Peça um código novo para a Souza Engenharia.<br>Versão ${esc(Sis.VERSAO)}</p>
    </div></div>`;
    const us = $('#rl-usuario');
    setTimeout(() => (login ? $('#rl-senha') : us).focus(), 30);
    $('#rdo-login').addEventListener('submit', async () => {
      const b = $('#rl-entrar'); b.disabled = true;
      const usuario = us.value.trim(), senha = $('#rl-senha').value;
      try {
        await B.conectar({ usuario, senha });
        history.replaceState(null, '', location.pathname);
        abrir();
      } catch (e) { telaLogin(e.message, usuario); }
    });
  }

  function telaBloqueado() {
    modo = 'bloqueado';
    document.body.classList.remove('portal');
    const eu = B.eu() || {};
    $('#app').innerHTML = `<div class="login"><div class="login-box">
      <img src="${LOGO}" alt="Souza Engenharia" class="login-logo">
      <div class="card"><div class="bd"><h1>Acesso desativado</h1>
        <p class="muted">${eu.nome ? esc(eu.nome.split(/\s+/)[0]) + ', o' : 'O'} seu acesso ao Diário de obra está desativado. Se precisar dele de novo, fale com a Souza Engenharia.</p>
        <button class="btn grande" id="rl-sair">${icone('sair')}Sair</button></div></div></div></div>`;
    $('#rl-sair').addEventListener('click', sair);
  }

  /** Moldura do editor: só o Diário de obra, sem o resto do sistema. */
  function shell() {
    const eu = B.eu() || {};
    const master = B.perfil() === 'master';
    const nome = master ? (B.config().responsavel.nome || B.conta()) : eu.nome;
    const papel = master ? 'Master' : eu.funcao || 'Engenharia';
    $('#app').innerHTML = `<div class="shell rdo-app">
      <aside class="lateral">
        <a class="lat-logo" href="#/rdo"><img src="${LOGO}" alt="Souza Engenharia"></a>
        <nav class="lat-nav" aria-label="Diário de obra">
          <a href="#/rdo" data-nav="rdo">${icone('rdo')}<span>Obras</span></a>
          ${master ? `<a href="#/rdo/acessos" data-rnav="acessos">${icone('chave')}<span>Acessos</span></a><a href="#/rdo/config" data-rnav="config">${icone('config')}<span>Configurações</span></a>` : `<a href="#/rdo/conta" data-rnav="conta">${icone('pessoa')}<span>Minha conta</span></a>`}
        </nav>
        <div class="lat-pe"><div class="rdo-app-eu">${icone('pessoa')}<span><b>${esc(nome || '')}</b><small>${esc(papel)}</small></span></div></div>
      </aside>
      <header class="topo-cel">
        <a href="#/rdo" class="topo-logo"><img src="${LOGO}" alt="Souza Engenharia"></a>
        <div class="topo-acoes"><a class="btn icon" href="${master ? '#/rdo/config' : '#/rdo/conta'}" aria-label="${master ? 'Configurações' : 'Minha conta'}">${icone(master ? 'config' : 'pessoa')}</a></div>
      </header>
      <main id="conteudo" tabindex="-1"></main>
    </div>`;
  }
  function marcarNav() {
    const p = Sis.rota().partes[0] || '';
    document.querySelectorAll('[data-rnav]').forEach((a) => a.classList.toggle('ativo', a.dataset.rnav === p));
    const ob = document.querySelector('.rdo-app [data-nav="rdo"]');
    if (ob) ob.classList.toggle('ativo', !['acessos', 'config', 'conta'].includes(p));
  }

  async function sair() {
    try { await B.desconectar(); } catch { /* ignora */ }
    history.replaceState(null, '', location.pathname);
    telaLogin();
  }

  /** Decide o que abrir pelo perfil de quem entrou. */
  function abrir() {
    if (!B.conectado()) { telaLogin(); return; }
    const p = B.perfil();
    if (!p) { telaBloqueado(); return; }
    if (p === 'cliente') {
      modo = 'cliente';
      document.body.classList.add('portal');
      const eu = B.eu() || {};
      window.Portal.iniciarSessao({
        nome: eu.nome || '',
        rpc: async (fn, corpo) => {
          try { return await B.rpc(fn, corpo || {}); }
          catch (e) { throw new Error(semRede(e) ? 'Sem internet. Conecte-se para ver os diários.' : e.message); }
        },
        trocarSenha: (s) => B.trocarSenha(s),
        sair,
      });
      return;
    }
    modo = 'editor';
    document.body.classList.remove('portal');
    if (!/^#\/rdo(\/|$)/.test(location.hash)) history.replaceState(null, '', '#/rdo');
    shell();
    Sis.desenhar();
    marcarNav();
  }

  window.addEventListener('hashchange', () => {
    if (modo !== 'editor') return;
    if (!/^#\/rdo(\/|$)/.test(location.hash)) { location.replace('#/rdo'); return; }
    marcarNav();
  });
  // mudou o acesso (obras liberadas, perfil ou desativado): reabre do jeito certo
  B.store.ouvir((origem) => {
    if (origem !== 'acesso' && origem !== 'remoto') return;
    if (modo === 'login') return;
    if (!B.conectado()) { telaLogin(); return; }
    const p = B.perfil();
    const quer = !p ? 'bloqueado' : p === 'cliente' ? 'cliente' : 'editor';
    if (quer !== modo) abrir();
  });

  window.RdoApp = { entrada: () => telaLogin(), sair };

  B.iniciar()
    .then(async () => {
      if (B.conectado() && navigator.onLine) { try { await B.atualizarEu(); } catch { /* usa o que está guardado */ } }
      abrir();
    })
    .catch((e) => { $('#app').innerHTML = `<div class="login"><div class="login-box"><div class="card"><div class="bd"><h1>Não foi possível abrir</h1><p class="muted">${esc(e.message || String(e))}</p></div></div></div></div>`; });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('../sw.js').catch(() => {});
})();
