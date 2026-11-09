'use strict';
/* =========================================================
   Acessos: módulo próprio no sistema. Os logins da engenharia
   (Diário de obra) e dos clientes (Área do cliente) ficam no
   projeto do Diário de obra; a tela é a mesma do rdo.js.
   ========================================================= */
(function () {
  const B = window.RDOB;
  Sis.modulo({
    id: 'acessos', nome: 'Acessos', desc: 'Logins da engenharia e dos clientes', icone: 'chave', sistema: true,
    render(el) {
      if (!B.pronto || !B.pronto()) { el.innerHTML = '<div class="empty">Carregando…</div>'; B.iniciar().then(() => Sis.desenhar(true)).catch(() => {}); return; }
      if (!B.conectado()) { el.innerHTML = '<div class="pagehead"><div><h1>Acessos</h1></div></div><div class="card"><div class="empty"><b>Conecte o Diário de obra primeiro</b>Os acessos ficam no mesmo projeto do Diário de obra. <a href="#/rdo">Conectar</a></div></div>'; return; }
      window.RdoAcessos.tela(el, { modulo: true });
    },
  });
})();
