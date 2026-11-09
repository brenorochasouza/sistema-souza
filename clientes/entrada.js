/* =========================================================
   Entrada da Área do cliente (clientes.souzaengenharia.com).
   A página de lá só carrega este arquivo; ele traz o sistema
   daqui (mesmo código do Diário de obra), então qualquer
   atualização vale para as duas entradas.
   ========================================================= */
(function () {
  var V = '1.4.8';
  var RAIZ = new URL('..', document.currentScript.src).href;
  window.SOUZA_RAIZ = RAIZ;
  window.PORTAL_SESSAO = true;
  window.SOUZA_SEM_SW = true;
  window.SOUZA_AREA = true;
  var css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = RAIZ + 'css/estilo.css?v=' + V;
  document.head.appendChild(css);
  var js = ['js/config.js', 'js/nucleo.js', 'js/rdo-relatorio.js', 'js/rdo-dados.js', 'js/rdo.js', 'clientesobras/portal.js', 'rdo/app.js'];
  function falhou() {
    var a = document.getElementById('app');
    if (a) a.innerHTML = '<p style="padding:48px 16px;text-align:center;font-family:sans-serif;color:#555">Não foi possível carregar a Área do cliente. Confira a internet e tente de novo.</p>';
  }
  (function prox(i) {
    if (i >= js.length) return;
    var s = document.createElement('script');
    s.src = RAIZ + js[i] + '?v=' + V;
    s.onload = function () { prox(i + 1); };
    s.onerror = falhou;
    document.head.appendChild(s);
  })(0);
})();
