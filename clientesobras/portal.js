'use strict';
/* =========================================================
   Visão do cliente: diários de obra aprovados (só consulta).
   Dois jeitos de entrar:
   - clientes.souzaengenharia.com (ou /rdo) com usuário e senha
     (Portal.iniciarSessao): área do cliente com os serviços, os
     documentos do Drive (rdo_area), as obras (rdo_cliente_obras e
     rdo_cliente_obra), os vencimentos e as ofertas;
   - /clientesobras com o código antigo da obra: portal_entrar.
   O banco só devolve o que é das obras liberadas.
   ========================================================= */
(function () {
  const R = window.RDO;
  const { esc, dataBR } = R;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const cfg = window.SOUZA_CONFIG || {};
  const BASE = String(cfg.rdoUrl || '').replace(/\/+$/, '');
  const CHAVE = cfg.rdoChave || '';
  const LOGO = `${window.SOUZA_RAIZ || '../'}img/logo.png?v=1.4.21`;
  const est = { codigo: '', dados: null, aba: 'diarios', aberto: null, sessao: null, obras: null };
  const guardar = { get() { try { return localStorage.getItem('rdo.portal.codigo') || ''; } catch { return ''; } }, set(v) { try { if (v) localStorage.setItem('rdo.portal.codigo', v); else localStorage.removeItem('rdo.portal.codigo'); } catch { /* sem armazenamento */ } } };

  const icone = (path) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const IC = {
    esq: '<path d="m15 6-6 6 6 6"/>',
    imprimir: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    galeria: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    aprovar: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    obras: '<path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/>',
    dir: '<path d="m9 6 6 6-6 6"/>',
    nota: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    pasta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    baixar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    externo: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  /** "o" ou "a" antes do nome do cliente: "para o Condomínio...", "para a Associação...". */
  const art = (n) => (/(a|as|ção|ções|dade|ede)$/i.test(String(n || '').trim().split(/\s+/)[0] || '') ? 'a' : 'o');
  IC.check = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
  IC.aviso = '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16 9a3.5 3.5 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11"/>';
  const OP = () => window.ObraPainel;
  const temPainel = (s) => !!(s && s.painel && OP());
  IC.whats = '<path d="M20.5 11.6A8.6 8.6 0 0 1 8 19.2L3.5 20.5l1.3-4.4A8.6 8.6 0 1 1 20.5 11.6z"/>';

  /** Página explicativa de cada serviço oferecido (o "Saiba mais" da vitrine). */
  const PAGINAS = {
    atc: {
      lead: 'Um engenheiro acompanhando o condomínio o ano todo, para o síndico decidir com segurança sobre manutenção, obras e contratações.',
      serve: 'A ATC coloca a Souza Engenharia ao lado da gestão do condomínio de forma contínua. Em vez de chamar um engenheiro só quando o problema aparece, o síndico passa a contar com orientação técnica para planejar a manutenção, avaliar o que precisa ser feito e acompanhar as obras, evitando gastos desnecessários e retrabalho.',
      quando: ['O condomínio tem manutenções e obras frequentes e precisa de alguém para orientar as decisões.', 'O síndico quer um plano de manutenção organizado e cumprido ao longo do ano.', 'O condomínio precisa de laudos com ART com regularidade, como SPDA, inspeção predial e fachadas.'],
      recebe: ['Orientação técnica contínua na manutenção e nas obras do condomínio.', 'Inspeção anual das fachadas com drone.', '25% de desconto nos laudos com ART da Souza Engenharia.', 'Relatórios e documentos reunidos aqui na Área do cliente.'],
      passos: ['Conversa inicial para entender o condomínio e as prioridades da gestão.', 'Proposta com o escopo e a mensalidade adequados ao porte do condomínio.', 'Visita técnica de reconhecimento e organização das pendências.', 'Acompanhamento contínuo, atendendo às demandas do síndico.'],
      base: 'ABNT NBR 5674 (manutenção de edificações) e ABNT NBR 16747 (inspeção predial).',
    },
    inspecao_predial: {
      lead: 'Uma avaliação completa do condomínio, que mostra o estado de conservação de cada sistema e o que precisa ser feito primeiro.',
      serve: 'A inspeção predial avalia as condições técnicas, de uso e de manutenção da edificação: estrutura, fachadas, coberturas, impermeabilizações, instalações e áreas comuns. O laudo classifica cada problema encontrado pelo grau de urgência e indica a correção, para o síndico planejar a manutenção e as obras com base técnica e prestar contas aos condôminos.',
      quando: ['Para montar ou revisar o plano de manutenção do condomínio.', 'Antes de definir as obras do ano e a previsão orçamentária.', 'Na troca de gestão, para o novo síndico conhecer a situação real do prédio.', 'Ao surgirem infiltrações, fissuras, desplacamentos ou outros sinais de desgaste.'],
      recebe: ['Laudo técnico em PDF, com ART.', 'Cada anomalia com registro fotográfico, causa provável, consequência e recomendação técnica.', 'Prioridades de correção, do mais urgente ao que pode ser planejado.', 'Pasta com todas as fotos em alta qualidade.'],
      passos: ['Levantamento dos documentos e conversa com o síndico sobre o histórico do prédio.', 'Vistoria técnica das áreas comuns e dos sistemas da edificação.', 'Análise das anomalias e elaboração do laudo.', 'Entrega aqui na Área do cliente, com os esclarecimentos que a gestão precisar.'],
      base: 'ABNT NBR 16747 (inspeção predial) e ABNT NBR 5674 (manutenção de edificações).',
    },
    fachada: {
      lead: 'O mapeamento completo das fachadas, para o condomínio saber o que precisa ser recuperado, como fazer e quanto deve custar antes de contratar a obra.',
      serve: 'Com acesso por alpinismo industrial, a equipe percorre as fachadas e registra cada anomalia: fissuras, desplacamentos, falhas de rejunte e de vedação, infiltrações e corrosão. O resultado é um laudo com o diagnóstico e o plano de recuperação, que serve de base para a assembleia e para pedir propostas às empresas de forma justa e comparável.',
      quando: ['O condomínio quer recuperar a fachada e precisa saber por onde começar.', 'Apareceram peças soltas, quedas de revestimento ou infiltrações pelas paredes externas.', 'A obra precisa ser levada para aprovação em assembleia.'],
      recebe: ['Laudo em PDF com o mapeamento das anomalias e as causas prováveis.', 'Detalhamento executivo da recuperação.', 'Planilha com o escopo da obra e a previsão de custo pelos valores praticados no mercado.', 'Termo de referência para contratar as empresas.', 'Pasta com todas as fotos em alta qualidade.'],
      passos: ['Visita para avaliar os acessos e planejar a inspeção.', 'Inspeção das fachadas com alpinistas, acompanhada pela engenharia e pela segurança do trabalho.', 'Elaboração do laudo, da planilha e do termo de referência.', 'Entrega aqui na Área do cliente.'],
      base: 'ABNT NBR 16747 (inspeção predial) e ABNT NBR 13755 (revestimento cerâmico de fachadas).',
    },
    spda: {
      lead: 'A inspeção do para-raios do condomínio, com laudo e ART, pedida pelo Corpo de Bombeiros na renovação do AVCB.',
      serve: 'O SPDA (sistema de proteção contra descargas atmosféricas) protege o prédio e as pessoas quando cai um raio. Com o tempo, conexões se soltam, peças oxidam e o aterramento perde eficiência. A inspeção verifica se o sistema continua funcionando como deve e aponta o que precisa ser corrigido.',
      quando: ['Na renovação do AVCB, quando o Corpo de Bombeiros pede o laudo do SPDA.', 'Periodicamente, como prevê a ABNT NBR 5419.', 'Depois de obras na cobertura ou na fachada, ou quando um raio atinge o prédio.'],
      recebe: ['Laudo técnico em PDF, com ART.', 'Inspeção de captores, descidas, conexões e aterramento, com registro fotográfico.', 'Medições de continuidade elétrica do sistema.', 'Lista do que precisa ser corrigido, quando houver.'],
      passos: ['Agendamento da visita com a administração do condomínio.', 'Inspeção e medições no local.', 'Elaboração do laudo com ART.', 'Entrega aqui na Área do cliente.'],
      base: 'ABNT NBR 5419 (proteção contra descargas atmosféricas).',
    },
    avcb: {
      lead: 'O projeto de segurança contra incêndio e todo o acompanhamento até o condomínio receber o AVCB do Corpo de Bombeiros.',
      serve: 'O AVCB (Auto de Vistoria do Corpo de Bombeiros) atesta que a edificação tem as medidas de segurança contra incêndio e pânico exigidas. Sem ele, o condomínio fica irregular, e a responsabilidade recai sobre o síndico. A Souza Engenharia faz o projeto, aprova no Corpo de Bombeiros e acompanha as adequações até a vistoria.',
      quando: ['O condomínio não tem AVCB ou ele está vencido.', 'Reformas ou mudanças de uso alteraram as exigências do prédio.', 'O Corpo de Bombeiros notificou o condomínio.'],
      recebe: ['Levantamento das medidas de segurança existentes e do que falta.', 'Projeto de segurança contra incêndio e pânico, e projeto de SPDA quando exigido.', 'Acompanhamento da análise e da aprovação no Corpo de Bombeiros.', 'Orientação nas adequações e acompanhamento da vistoria até a emissão do AVCB.', 'Projeto aprovado e documentos reunidos aqui na Área do cliente.'],
      passos: ['Vistoria no condomínio e levantamento da documentação.', 'Elaboração do projeto.', 'Protocolo e aprovação no Corpo de Bombeiros.', 'Adequações no prédio, com orientação técnica.', 'Vistoria do Corpo de Bombeiros e emissão do AVCB.'],
      base: 'Lei Estadual nº 12.929/2013, Decreto nº 16.302/2015 e instruções técnicas do Corpo de Bombeiros Militar da Bahia.',
    },
    impermeabilizacao: {
      lead: 'Do diagnóstico da infiltração à obra concluída, com projeto, execução e acompanhamento técnico.',
      serve: 'Infiltrações em coberturas, piscinas, playgrounds, jardins e garagens comprometem a estrutura e geram reclamações dos moradores. A Souza Engenharia identifica a origem do problema, define o sistema de impermeabilização adequado para cada área e executa a obra com controle técnico, para resolver de vez e não apenas remendar.',
      quando: ['Há infiltrações, manchas ou goteiras abaixo de lajes, piscinas e jardins.', 'A impermeabilização chegou ao fim da vida útil.', 'O condomínio vai reformar pisos e revestimentos de áreas molhadas ou externas.'],
      recebe: ['Diagnóstico da origem das infiltrações.', 'Manual executivo com o sistema de impermeabilização e as etapas da obra.', 'Execução com equipe especializada e engenheiro responsável.', 'Teste de estanqueidade antes da proteção final.', 'Diário de obra com fotos, acompanhado aqui na Área do cliente.'],
      passos: ['Vistoria e diagnóstico.', 'Proposta com o escopo e o manual executivo.', 'Execução da obra, com diário de obra no portal.', 'Teste de estanqueidade e entrega.'],
      base: 'ABNT NBR 9575 (projeto de impermeabilização) e ABNT NBR 9574 (execução de impermeabilização).',
    },
    carro_eletrico: {
      lead: 'A avaliação técnica que mostra se a instalação elétrica do condomínio comporta carregadores, quantos e em que condições.',
      serve: 'Cada vez mais moradores pedem para instalar carregador na garagem. Sem uma avaliação, o condomínio corre o risco de sobrecarregar a instalação, criar risco de incêndio ou negar um pedido sem base técnica. O laudo mostra a capacidade disponível, as adequações necessárias e as regras de segurança para as instalações.',
      quando: ['Um morador pediu para instalar um carregador.', 'O tema vai para a assembleia ou o condomínio quer criar regras de uso.', 'O condomínio quer planejar vagas com recarga para o futuro.'],
      recebe: ['Avaliação da entrada de energia, dos quadros e da demanda da instalação.', 'Capacidade para carregadores e as adequações necessárias.', 'Requisitos de segurança para as instalações individuais e coletivas.', 'Laudo técnico com ART.'],
      passos: ['Levantamento dos documentos e das informações da instalação.', 'Vistoria técnica nas instalações elétricas e na garagem.', 'Análise da capacidade e elaboração do laudo.', 'Entrega aqui na Área do cliente.'],
      base: 'ABNT NBR 5410 (instalações elétricas de baixa tensão), ABNT NBR 17019 (recarga de veículos elétricos) e exigências do Corpo de Bombeiros da Bahia.',
    },
    fiscalizacao: {
      lead: 'Um engenheiro do lado do condomínio, conferindo se a obra contratada está sendo feita como deve.',
      serve: 'Quando o condomínio contrata uma empresa para uma obra, alguém precisa garantir que o serviço segue o escopo, a qualidade e o prazo combinados. A fiscalização acompanha a execução, confere as medições antes de cada pagamento e registra tudo, para o síndico pagar pelo que foi feito e receber a obra com segurança.',
      quando: ['Obras de fachada, impermeabilização, reforma de áreas comuns ou recuperação estrutural.', 'O contrato prevê pagamentos por etapa ou por medição.', 'O síndico precisa prestar contas da obra aos condôminos.'],
      recebe: ['Visitas técnicas periódicas à obra.', 'Conferência das medições antes dos pagamentos.', 'Registro das não conformidades e acompanhamento das correções.', 'Diário de obra com fotos, acompanhado aqui na Área do cliente.', 'Acompanhamento até o recebimento final da obra.'],
      passos: ['Análise do contrato, do escopo e do cronograma.', 'Acompanhamento da execução e das medições.', 'Relatórios e diário de obra no portal.', 'Vistoria de recebimento da obra.'],
      base: '',
    },
  };

  const _brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (n) => _brl.format(Number(n) || 0).replace(/\u00a0/g, ' ');

  function toast(msg, erro) {
    let w = $('.toast-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; w.setAttribute('aria-live', 'polite'); document.body.appendChild(w); }
    const t = document.createElement('div'); t.className = 'toast ' + (erro ? 'erro' : ''); t.textContent = msg; w.appendChild(t);
    setTimeout(() => t.remove(), erro ? 7000 : 3800);
  }
  function confirmar(titulo, msg, ok) {
    return new Promise((res) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div><h2>${esc(titulo)}</h2></div></div><div class="mb"><p class="msg">${esc(msg)}</p></div>
        <div class="mf"><button class="btn" data-r="0">Cancelar</button><button class="btn primary" data-r="1">${esc(ok)}</button></div></div>`;
      document.body.appendChild(bg);
      bg.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b || e.target === bg) { bg.remove(); res(!!(b && b.dataset.r === '1')); } });
    });
  }

  async function rpc(fn, corpo) {
    if (est.sessao) { const j = await est.sessao.rpc(fn, corpo); if (j && j.erro) throw new Error(j.erro); return j; }
    if (!BASE || !CHAVE) throw new Error('O portal ainda não foi configurado.');
    let res;
    try { res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: CHAVE, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); }
    catch { throw new Error('Sem conexão. Confira a internet e tente de novo.'); }
    const txt = await res.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* sem json */ }
    if (!res.ok) throw new Error((j && (j.message || j.msg)) || 'Não foi possível acessar agora. Tente de novo em instantes.');
    if (j && j.erro) throw new Error(j.erro);
    return j;
  }
  const fotoSrc = (f) => (f.path ? `${BASE}/storage/v1/object/public/rdo-fotos/${f.path.split('/').map(encodeURIComponent).join('/')}` : '');
  const fmtCod = (v) => { const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return s.length > 4 ? s.slice(0, 4) + '-' + s.slice(4) : s; };

  /* ---------------- entrada ---------------- */
  function telaEntrada(msg = '') {
    $('#app').innerHTML = `<div class="login pt-login"><div class="login-box">
      <img src="${LOGO}" alt="Souza Engenharia" class="login-logo">
      <form class="card" id="pt-form" onsubmit="return false"><div class="bd">
        <h1>Diários de obra</h1>
        <p class="muted small">Digite o código da obra que a Souza Engenharia enviou para você.</p>
        <label class="f"><span>Código da obra</span><input class="inp pt-cod" id="pt-cod" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" maxlength="9" value="${esc(est.codigo)}" autofocus></label>
        ${msg ? `<p class="aviso-campo">${esc(msg)}</p>` : ''}
        <button class="btn primary grande" type="submit" id="pt-entrar">Ver os diários</button>
        <p class="small muted pt-alt">Recebeu usuário e senha? <a href="../rdo/">Entre por aqui</a>.</p>
      </div></form>
      <p class="tiny muted" style="text-align:center">Souza Engenharia · obras@souzaengenharia.com</p>
    </div></div>`;
    const inp = $('#pt-cod');
    inp.addEventListener('input', () => { const p = inp.selectionStart, a = inp.value.length; inp.value = fmtCod(inp.value); const d = inp.value.length - a; inp.setSelectionRange(p + d, p + d); });
    $('#pt-form').addEventListener('submit', () => entrar(inp.value));
  }
  async function entrar(codigo, silencioso) {
    const cod = fmtCod(codigo);
    if (cod.replace('-', '').length < 8) { if (!silencioso) telaEntrada('O código tem 8 letras e números, como ABCD-2345.'); else telaEntrada(); return; }
    const b = $('#pt-entrar'); if (b) b.disabled = true;
    try {
      const j = await rpc('portal_entrar', { p_codigo: cod });
      est.codigo = cod; est.dados = j; guardar.set(cod);
      const h = location.hash.match(/^#\/d\/(.+)$/);
      est.aberto = h ? decodeURIComponent(h[1]) : null;
      desenhar();
    } catch (e) {
      if (silencioso) guardar.set('');
      est.codigo = cod;
      telaEntrada(e.message);
    }
  }
  function sair() {
    if (est.sessao) { est.sessao.sair(); return; }
    guardar.set(''); est.dados = null; est.codigo = ''; history.replaceState(null, '', location.pathname); telaEntrada();
  }

  /* ---------------- área do cliente (usuário e senha) ---------------- */
  // Rotas: #/ início · #/c/<cliente> · #/c/<cliente>/s/<serviço> · …/s/<serviço>/p/<pasta> · …/s/<serviço>/v/<documento|contrato>
  //        #/o/<obra> · #/o/<obra>/d/<diário>
  const topo = (o) => `<header class="pt-topo"><img class="pt-logo" src="${LOGO}" alt="Souza Engenharia">${o && o.logoCliente && o.logoCliente.url ? `<img class="pt-logo-cli" src="${esc(o.logoCliente.url)}" alt="">` : ''}
    <span class="pt-topo-a">${est.sessao ? `<button class="btn ghost sm" data-p="senha">${icone(IC.chave)}<span>Senha</span></button>` : ''}<button class="btn ghost sm" data-p="sair">${icone(IC.sair)}Sair</button></span></header>`;
  const dec = (x) => decodeURIComponent(x);
  const enc = (x) => encodeURIComponent(x);
  const clientesSessao = () => (est.area && est.area.clientes) || [];
  const clienteSessao = (id) => clientesSessao().find((c) => c.id === id);
  const obrasDo = (cid) => (est.obras || []).filter((o) => o.cliente === cid);
  const obrasAvulsas = () => (est.obras || []).filter((o) => !o.cliente || !clienteSessao(o.cliente));
  const primeiroNome = () => String((est.sessao && est.sessao.nome) || '').split(/\s+/)[0];
  async function iniciarSessao(sessao) {
    est.sessao = sessao;
    $('#app').innerHTML = '<div class="pt-carregando">Carregando…</div>';
    try {
      const [area, obras] = await Promise.all([
        rpc('rdo_area').catch((e) => { if (/Could not find|does not exist|schema cache|404/i.test(e.message || '')) return { clientes: [] }; throw e; }),
        rpc('rdo_cliente_obras'),
      ]);
      est.area = area || { clientes: [] };
      est.obras = obras || [];
    } catch (e) { telaErro(e.message); return; }
    rota();
  }
  async function rota() {
    const h = location.hash;
    est.anterior = est.atual; est.atual = h;
    let m = h.match(/^#\/o\/([^/]+)(?:\/d\/(.+))?$/);
    if (m && !m[2]) { const pn = painelDaObra(dec(m[1])); if (pn) { location.replace(`${baseSv(pn.c, pn.s)}/a/diarios`); return; } }
    if (m) {
      const id = dec(m[1]);
      if (!est.dados || est.dados.obra.id !== id) {
        $('#app').innerHTML = '<div class="pt-carregando">Carregando…</div>';
        try { est.dados = await rpc('rdo_cliente_obra', { p_obra: id }); est.aba = 'diarios'; }
        catch (e) { toast(e.message, true); location.hash = '#/'; return; }
      }
      est.aberto = m[2] ? dec(m[2]) : null;
      desenhar();
      return;
    }
    est.dados = null; est.aberto = null;
    m = h.match(/^#\/c\/([^/]+)\/doc\/([^/]+)\/([^/]+)$/); // endereço antigo de documento
    if (m) { location.replace(`#/c/${m[1]}/s/${m[2]}/v/${m[3]}`); return; }
    m = h.match(/^#\/c\/([^/]+)\/s\/([^/]+)(?:\/(p|v|a|com)\/([^/]+))?$/);
    if (m) {
      const c = clienteSessao(dec(m[1])), s = c && (c.servicos || []).find((x) => x.id === dec(m[2]));
      if (!s) { location.replace(c ? '#/c/' + m[1] : '#/'); return; }
      if (m[3] === 'v') telaDoc(c, s, dec(m[4]));
      else if (m[3] === 'com' && temPainel(s)) telaComunicado(c, s, dec(m[4]));
      else if (m[3] === 'p') telaServico(c, s, dec(m[4]));
      else if (temPainel(s)) telaObra(c, s, m[3] === 'a' ? dec(m[4]) : 'avanco');
      else telaServico(c, s, null);
      return;
    }
    m = h.match(/^#\/c\/([^/]+)\/conheca\/([^/]+)$/);
    if (m && clienteSessao(dec(m[1]))) { telaConheca(clienteSessao(dec(m[1])), dec(m[2])); return; }
    m = h.match(/^#\/c\/([^/]+)$/);
    if (m && clienteSessao(dec(m[1]))) { telaCliente(dec(m[1])); return; }
    telaInicio();
  }
  /** Serviço com painel que tem esta obra do diário ligada. */
  function painelDaObra(oid) {
    for (const c of clientesSessao()) for (const s of c.servicos || []) if (temPainel(s) && s.painel.rdoObraId === oid) return { c, s };
    return null;
  }
  /** Para onde volta quem está numa obra: o painel dela, o cliente, a lista ou nada. */
  function voltarDaObra(o) {
    const pn = o && painelDaObra(o.id);
    if (pn) return { href: `${baseSv(pn.c, pn.s)}/a/diarios`, rot: nomeSv(pn.s) };
    if (o && o.cliente && clienteSessao(o.cliente)) return { href: '#/c/' + enc(o.cliente), rot: clienteSessao(o.cliente).nome };
    if (clientesSessao().length + obrasAvulsas().length > 1) return { href: '#/', rot: 'Início' };
    return null;
  }
  function telaErro(msg) {
    $('#app').innerHTML = `<div class="pt">${topo()}<div class="card"><div class="empty"><b>Não foi possível abrir a área do cliente</b>${esc(msg)}<div class="actions" style="justify-content:center;margin-top:12px"><button class="btn" data-p="recarregar">Tentar de novo</button></div></div></div></div>`;
  }
  const cardObra = (o) => `<a class="card r-obra pt-obra" href="#/o/${enc(o.id)}"><div class="r-obra-l">
      <div class="r-obra-t"><b>${esc(o.nome || 'Obra')}</b>${o.contrato ? `<span class="chip neutro">${esc(o.contrato)}</span>` : ''}</div>
      <small>${esc([o.contratante, o.local].filter(Boolean).join(' · ') || ' ')}</small>
      <div class="r-obra-m"><span>${o.diarios} ${Number(o.diarios) === 1 ? 'diário aprovado' : 'diários aprovados'}</span><span>${o.ultimo ? `Último em ${dataBR(o.ultimo)}` : 'Nenhum ainda'}</span></div></div></a>`;
  function telaInicio() {
    const cs = clientesSessao(), av = obrasAvulsas();
    if (cs.length === 1 && !av.length) { history.replaceState(null, '', '#/c/' + enc(cs[0].id)); telaCliente(cs[0].id); return; }
    if (!cs.length && av.length === 1) { location.replace('#/o/' + enc(av[0].id)); return; }
    $('#app').innerHTML = `<div class="pt">${topo()}
      <div class="pagehead"><div><h1>Área do cliente</h1><p>${primeiroNome() ? `Olá, ${esc(primeiroNome())}.` : ''}</p></div></div>
      ${cs.length ? `<div class="pt-clis">${cs.map((c) => { const n = (c.servicos || []).length, no = obrasDo(c.id).length; return `<a class="card pt-cli" href="#/c/${enc(c.id)}"><b>${esc(c.nome)}</b><small>${n} ${n === 1 ? 'serviço' : 'serviços'}${no ? ` · ${no} ${no === 1 ? 'obra' : 'obras'}` : ''}</small></a>`; }).join('')}</div>` : ''}
      ${av.length ? `${cs.length ? '<h2 class="pt-h2">Obras</h2>' : ''}<div class="r-obras">${av.map(cardObra).join('')}</div>` : ''}
      ${!cs.length && !av.length ? '<div class="card"><div class="empty"><b>Nada liberado ainda</b>Quando a Souza Engenharia liberar os documentos e as obras do seu condomínio, eles aparecem aqui.</div></div>' : ''}
    </div>`;
  }
  /* ----- serviços: pastas, documentos, contrato e pagamentos ----- */
  const bloqueado = (n) => !!(n.bloqueio && n.bloqueio.ativo);
  /** Aparece para o cliente: bloqueado (com o aviso), com conteúdo, ou vazio marcado "Em elaboração". */
  const visivel = (n) => bloqueado(n) || R.temConteudo(n) || n.vazio !== 'oculta';
  const docsProntos = (l) => (l || []).reduce((t, n) => t + (bloqueado(n) ? 0 : (n.url ? 1 : 0) + (n.tipo === 'pasta' ? docsProntos(n.filhos) : 0)), 0);
  /** Pasta que só tem o link do Drive (nada dentro dela no portal): abre direto a pasta do Drive. */
  const soLink = (n) => !!n.url && !(n.filhos || []).some(R.temConteudo);
  const caminho = (s, pais) => [nomeSv(s)].concat(pais.map((p) => p.nome)).join(' › ');
  const temElab = (l) => (l || []).some((n) => !bloqueado(n) && (n.tipo === 'pasta' ? (!R.temConteudo(n) && n.vazio !== 'oculta') || temElab(n.filhos) : !n.url && n.vazio !== 'oculta'));
  const baseSv = (c, s) => `#/c/${enc(c.id)}/s/${enc(s.id)}`;
  const nomeSv = (s) => s.titulo || R.tipoDe(s);
  const hojeISO = () => (R.isoData ? R.isoData(new Date()) : new Date().toISOString().slice(0, 10));
  function linhaNo(n, base, fin) {
    if (bloqueado(n)) {
      // travado até o pagamento total: mostra quanto já foi pago
      const pg = n.bloqueio.pagamento && fin && (fin.parcelas || []).length ? R.resumoFinanceiro(fin) : null;
      return `<li class="bloq${n.bloqueio.pagamento ? ' pag' : ''}"><div>${icone(IC.cadeado)}<span><b>${esc(n.nome)}</b><small>${esc(n.bloqueio.msg || (n.bloqueio.pagamento ? R.MSG_PAGAMENTO : R.MSG_PRELIMINAR))}</small>${pg ? `<em class="pt-pg"><i style="width:${Math.min(100, pg.pct).toFixed(1)}%"></i></em><small class="pt-pg-t">Pagamento ${Math.floor(pg.pct)}% concluído</small>` : ''}</span></div></li>`;
    }
    if (!R.temConteudo(n)) return `<li class="elab"><div>${icone(n.tipo === 'pasta' ? IC.pasta : IC.nota)}<span><b>${esc(n.nome)}</b><small>Em elaboração</small></span>${icone(IC.relogio)}</div></li>`;
    if (n.tipo === 'pasta' && !soLink(n)) {
      const k = (n.filhos || []).filter(visivel).length + (n.url ? 1 : 0);
      return `<li><a href="${base}/p/${enc(n.id)}">${icone(IC.pasta)}<span><b>${esc(n.nome)}</b><small>${k} ${k === 1 ? 'item' : 'itens'}</small></span>${icone(IC.dir)}</a></li>`;
    }
    const d = R.drive(n.url) || { tipo: 'link', abrir: n.url };
    return d.tipo === 'link'
      ? `<li><a href="${esc(d.abrir)}" target="_blank" rel="noopener">${icone(IC.externo)}<span><b>${esc(n.nome)}</b><small>Abre em outra aba</small></span></a></li>`
      : `<li><a href="${base}/v/${enc(n.id)}">${icone(d.tipo === 'pasta' ? IC.pasta : IC.nota)}<span><b>${esc(n.nome)}</b><small>${d.tipo === 'pasta' ? 'Pasta com arquivos' : 'Documento'}</small></span>${icone(IC.dir)}</a></li>`;
  }
  const htmlNos = (lista, base, fin) => { const l = (lista || []).filter(visivel); return l.length ? `<ul class="pt-docs">${l.map((n) => linhaNo(n, base, fin)).join('')}</ul>` : ''; };
  /** Contrato e pagamentos: o link do contrato e as parcelas (copiadas da carteira da Souza). */
  function htmlContrato(c, s) {
    const f = s.financeiro, temF = f && ((f.parcelas || []).length || f.valor);
    if (!s.contratoUrl && !temF) return '';
    const r = temF ? R.resumoFinanceiro(f) : null, hoje = hojeISO();
    const dc = s.contratoUrl ? R.drive(s.contratoUrl) || { tipo: 'link', abrir: s.contratoUrl } : null;
    const estP = (p) => (p.pago ? ['ok', p.dataPago ? `Paga em ${dataBR(p.dataPago)}` : 'Paga'] : p.venc && p.venc < hoje ? ['estourado', `Venceu em ${dataBR(p.venc)}`] : ['neutro', p.venc ? `Vence em ${dataBR(p.venc)}` : 'A vencer']);
    return `<section class="card pt-ct"><div class="hd"><div><h3>Contrato e pagamentos</h3>${r ? `<p>${r.parcelas.filter((p) => p.pago).length} de ${r.parcelas.length} ${r.parcelas.length === 1 ? 'parcela paga' : 'parcelas pagas'}</p>` : ''}</div>
        ${dc ? `<a class="btn sm" href="${dc.tipo === 'link' ? esc(dc.abrir) : baseSv(c, s) + '/v/contrato'}" ${dc.tipo === 'link' ? 'target="_blank" rel="noopener"' : ''}>${icone(IC.nota)}Ver o contrato</a>` : ''}</div>
      ${r ? `<div class="bd"><div class="pt-ct-k"><div><span>Valor do contrato</span><b>${brl(r.total)}</b></div><div><span>Pago</span><b class="pt-ok">${brl(r.pago)}</b></div><div><span>A pagar</span><b>${brl(r.aPagar)}</b></div></div>
        <div class="r-bar ok pt-ct-bar" role="img" aria-label="${r.pct.toFixed(0)}% pago"><i style="width:${Math.min(100, r.pct).toFixed(1)}%"></i></div>
        ${r.parcelas.length ? `<ul class="pt-pc">${r.parcelas.map((p, i) => { const [cls, txt] = estP(p); return `<li><span class="pt-pc-t"><b>${esc(p.desc || `Parcela ${i + 1}`)}</b><small>${esc(txt)}</small></span><span class="pt-pc-v">${brl(p.valor)}</span><span class="chip ${cls}">${p.pago ? 'Paga' : cls === 'estourado' ? 'Em aberto' : 'A vencer'}</span></li>`; }).join('')}</ul>` : ''}</div>` : ''}</section>`;
  }
  function cardServico(c, s) {
    const n = docsProntos(R.estruturaDe(s)), el = temElab(R.estruturaDe(s));
    const f = s.financeiro, ps = (f && f.parcelas) || [];
    const partes = [n ? `${n} ${n === 1 ? 'documento disponível' : 'documentos disponíveis'}` : el ? 'Documentos em elaboração' : 'Documentos ainda não entregues'];
    if (n && el) partes.push('outros em elaboração');
    if (ps.length) partes.push(`${ps.filter((p) => p.pago).length} de ${ps.length} parcelas pagas`);
    return `<a class="card pt-sv" href="${baseSv(c, s)}"><span class="pt-sv-ic">${icone(IC.pasta)}</span><span class="pt-sv-t"><b>${esc(nomeSv(s))}</b>
      <small>${esc([R.tipoDe(s), s.codigo, s.data && dataBR(s.data)].filter(Boolean).join(' · '))}</small><small>${esc(partes.join(' · '))}</small></span>
      <span class="chip ${s.situacao === 'entregue' ? 'ok' : 'atencao'}">${s.situacao === 'entregue' ? 'Entregue' : 'Em andamento'}</span>${icone(IC.dir)}</a>`;
  }
  function telaCliente(cid) {
    const c = clienteSessao(cid);
    const sv = c.servicos || [];
    const hoje = hojeISO();
    // cada cliente é um prédio: o serviço novo do mesmo tipo é a renovação do anterior
    const sucessor = (x) => sv.filter((y) => y.id !== x.id && y.tipo === x.tipo && String(y.data || '') > String(x.data || '')).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    const vencs = sv.map((s) => ({ s, v: R.vencimento(s), novo: sucessor(s) }))
      .filter((x) => x.v && !(x.novo && x.novo.situacao === 'entregue')) // já renovado: vale o vencimento do novo
      .map((x) => Object.assign(x, R.situacaoVenc(x.v, hoje), { renovando: !!x.s.renovando || !!x.novo }))
      .sort((a, b) => a.v.localeCompare(b.v));
    const emDia = new Set(sv.filter((s) => { const v = R.vencimento(s); return !v || R.situacaoVenc(v, hoje).estado === 'emdia'; }).map((s) => s.tipo));
    const ofertas = R.OFERTAS.filter((o) => !emDia.has(o.tipo) && !vencs.some((x) => x.s.tipo === o.tipo)).slice(0, 6);
    const paineis = sv.filter(temPainel);
    const ligadas = new Set(paineis.map((s) => s.painel.rdoObraId).filter(Boolean));
    const obras = obrasDo(cid).filter((o) => !ligadas.has(o.id));
    const quem = primeiroNome() ? `Sou ${primeiroNome()}, d${art(c.nome)} ${c.nome}.` : `Sou d${art(c.nome)} ${c.nome}.`;
    const varios = clientesSessao().length + obrasAvulsas().length > 1;
    $('#app').innerHTML = `<div class="pt pt-area">${topo()}
      ${varios ? `<a class="btn ghost sm pt-voltar" href="#/">${icone(IC.esq)}Início</a>` : ''}
      <div class="pagehead"><div><h1>${esc(c.nome)}</h1><p>${primeiroNome() ? `Olá, ${esc(primeiroNome())}. ` : ''}Documentos e serviços da Souza Engenharia.</p></div></div>
      ${vencs.length ? `<section class="card pt-venc"><div class="hd"><div><h3>Vencimentos</h3><p>Quando cada laudo precisa ser renovado.</p></div></div><div class="bd"><ul>${vencs.map((x) => `<li class="${x.renovando ? 'renovando' : x.estado}">
          <span class="pt-venc-t"><b>${esc(nomeSv(x.s))}</b><small>${x.estado === 'vencido' ? `Venceu em ${dataBR(x.v)}` : `Vence em ${dataBR(x.v)}`}${x.estado === 'perto' && !x.renovando ? ` · faltam ${x.dias} ${x.dias === 1 ? 'dia' : 'dias'}` : ''}</small></span>
          ${x.renovando ? '<span class="chip info">Renovação em andamento</span>' : x.estado === 'emdia' ? '<span class="chip ok">Em dia</span>' : `<a class="btn sm ${x.estado === 'vencido' ? 'primary' : ''}" href="${esc(R.linkWhats(`Olá! ${quem} O ${nomeSv(x.s)}${x.s.codigo ? ' (' + x.s.codigo + ')' : ''} ${x.estado === 'vencido' ? 'venceu' : 'vence'} em ${dataBR(x.v)}. Gostaria de agendar a renovação.`))}" target="_blank" rel="noopener">Pedir renovação</a>`}</li>`).join('')}</ul></div></section>` : ''}
      ${paineis.length || obras.length ? `<h2 class="pt-h2">Obras</h2>${paineis.length ? `<div class="po-cards">${paineis.map((s) => cardPainel(c, s)).join('')}</div>` : ''}${obras.length ? `<div class="r-obras">${obras.map(cardObra).join('')}</div>` : ''}` : ''}
      ${sv.length > paineis.length || !paineis.length ? `<h2 class="pt-h2">Serviços</h2>
      ${sv.length > paineis.length ? `<div class="pt-svs">${sv.filter((s) => !temPainel(s)).map((s) => cardServico(c, s)).join('')}</div>` : '<div class="card"><div class="empty">Nenhum serviço liberado ainda.</div></div>'}` : ''}
      ${ofertas.length ? `<section class="pt-vit" aria-labelledby="pt-vit-t"><div class="pt-vit-h"><h2 id="pt-vit-t">Outros serviços da Souza Engenharia para ${art(c.nome)} ${esc(c.nome)}</h2>
          <p>A mesma equipe técnica que cuida dos documentos do seu condomínio. Escolha o serviço e peça o orçamento pelo WhatsApp.</p></div>
        <div class="pt-ofs">${ofertas.map((o) => `<div class="card pt-of ${o.tipo === 'atc' ? 'destaque' : ''}">${o.tipo === 'atc' ? '<span class="pt-of-tag">Recomendado</span>' : ''}<b>${esc(o.titulo)}</b><p>${esc(o.texto)}</p>
          <div class="pt-of-ac"><a class="btn sm ${o.tipo === 'atc' ? 'primary' : ''}" href="${esc(R.linkWhats(`Olá! ${quem} Tenho interesse em ${o.titulo}. Podem me enviar uma proposta?`))}" target="_blank" rel="noopener">Quero um orçamento</a>
          ${PAGINAS[o.tipo] ? `<a class="btn sm ghost pt-of-mais" href="#/c/${enc(c.id)}/conheca/${enc(o.tipo)}">Saiba mais${icone(IC.dir)}</a>` : ''}</div></div>`).join('')}</div></section>` : ''}
    </div>`;
    window.scrollTo(0, 0);
  }
  /** Página que explica um serviço oferecido, com o pedido de orçamento no começo e no fim. */
  function telaConheca(c, tipo) {
    const o = R.OFERTAS.find((x) => x.tipo === tipo), pg = PAGINAS[tipo];
    if (!o || !pg) { location.replace('#/c/' + enc(c.id)); return; }
    const quem = primeiroNome() ? `Sou ${primeiroNome()}, d${art(c.nome)} ${c.nome}.` : `Sou d${art(c.nome)} ${c.nome}.`;
    const zap = esc(R.linkWhats(`Olá! ${quem} Vi no portal o serviço de ${o.titulo} e gostaria de uma proposta.`));
    const duvida = esc(R.linkWhats(`Olá! ${quem} Tenho uma dúvida sobre ${o.titulo}.`));
    const lista = (l, cls, ic) => `<ul class="${cls}">${l.map((x) => `<li>${ic ? icone(ic) : ''}<span>${esc(x)}</span></li>`).join('')}</ul>`;
    $('#app').innerHTML = `<div class="pt pt-area pt-lp">${topo()}
      <a class="btn ghost sm pt-voltar" href="#/c/${enc(c.id)}">${icone(IC.esq)}${esc(c.nome)}</a>
      <header class="pt-lp-hero"><h1>${esc(o.titulo)}</h1><p>${esc(pg.lead)}</p>
        <div class="pt-lp-cta"><a class="btn primary" href="${zap}" target="_blank" rel="noopener">${icone(IC.whats)}Quero um orçamento</a><a class="btn ghost" href="${duvida}" target="_blank" rel="noopener">Tirar uma dúvida</a></div></header>
      <section class="card pt-lp-bl pt-lp-serve"><h2>Para que serve</h2><p>${esc(pg.serve)}</p></section>
      <div class="pt-lp-2">
        <section class="card pt-lp-bl"><h2>Quando fazer</h2>${lista(pg.quando, 'pt-lp-ul')}</section>
        <section class="card pt-lp-bl"><h2>O que você recebe</h2>${lista(pg.recebe, 'pt-lp-ck', IC.check)}</section>
      </div>
      <section class="card pt-lp-bl"><h2>Como funciona</h2><ol class="pt-lp-passos">${pg.passos.map((x) => `<li><span>${esc(x)}</span></li>`).join('')}</ol></section>
      ${pg.base ? `<p class="pt-lp-base"><b>Base técnica:</b> ${esc(pg.base)}</p>` : ''}
      <section class="pt-vit pt-lp-fim"><div class="pt-vit-h"><h2>Quer saber quanto fica para ${art(c.nome)} ${esc(c.nome)}?</h2>
        <p>Mande uma mensagem pelo WhatsApp e a Souza Engenharia prepara uma proposta para o seu condomínio.</p></div>
        <a class="btn primary" href="${zap}" target="_blank" rel="noopener">${icone(IC.whats)}Quero um orçamento</a></section>
    </div>`;
    window.scrollTo(0, 0);
  }
  /* ----- obra com painel: avanço, financeiro, comunicados, diários e documentos ----- */
  const barraP = (v, cor) => `<div class="op-bar"><i style="width:${Math.max(0, Math.min(100, v || 0)).toFixed(1)}%;background:${cor}"></i></div>`;
  function cardPainel(c, s) {
    const P = OP(), p = s.painel, h = hojeISO(), fis = P.fisico(p, h), fin = P.financeiro(p, s.financeiro, h);
    const cs = (p.comunicados || []).slice().sort(P.porNumero), ult = cs[cs.length - 1];
    return `<a class="card po-card" href="${baseSv(c, s)}"><span class="po-card-t"><b>${esc(nomeSv(s))}</b><small>${esc([s.codigo, s.situacao === 'entregue' ? 'Concluída' : 'Em andamento'].filter(Boolean).join(' · '))}</small></span>
      ${P.tem(p) ? `<span class="po-card-k"><span><small>Físico</small><b>${P.pct(fis, 0)}</b>${barraP(fis, P.COR_FIS)}</span><span><small>Financeiro</small><b>${fin.ligado ? P.pct(fin.pct, 0) : '-'}</b>${barraP(fin.pct, P.COR_FIN)}</span></span>` : ''}
      ${ult ? `<span class="po-card-c">${icone(IC.aviso)}<span>Último comunicado: nº ${P.n3(ult.numero)}, ${esc(ult.titulo)}</span></span>` : ''}${icone(IC.dir)}</a>`;
  }
  const ABAS = [['avanco', 'Avanço'], ['financeiro', 'Financeiro'], ['comunicados', 'Comunicados'], ['diarios', 'Diários de obra'], ['documentos', 'Documentos']];
  function telaObra(c, s, aba) {
    const P = OP(), p = s.painel, h = hojeISO(), base = baseSv(c, s);
    const temP = P.tem(p), es = temP ? P.etapas(p, h) : [], ps = P.pctEtapas(p, h), fis = P.fisico(p, h), fin = P.financeiro(p, s.financeiro, h), pz = P.prazo(p, h), ult = P.medicaoAte(p, null);
    const coms = (p.comunicados || []).slice().sort(P.porNumero).reverse(), ads = (p.aditivos || []).slice().sort(P.porNumero);
    const abas = ABAS.filter(([k]) => k !== 'diarios' || p.rdoObraId);
    if (!abas.some(([k]) => k === aba)) aba = 'avanco';
    const n = { comunicados: coms.length };
    let corpo = '';
    if (aba === 'avanco') {
      corpo = temP ? `<section class="card"><div class="hd"><div><h3>Evolução por quinzena</h3><p>${ult ? `Avanço físico atualizado em ${dataBR(ult.data)}.` : 'Ainda sem atualização do avanço.'} O financeiro é o que já foi pago do contrato.</p></div></div>
          <div class="bd">${P.htmlGrafico(P.serie(p, s.financeiro, { ref: h, concluida: s.situacao === 'entregue' }))}</div></section>
        <section class="card"><div class="hd"><div><h3>Avanço por etapa</h3><p>O peso de cada etapa é a parte dela no valor do contrato.</p></div></div>
          <div class="bd flush tblwrap"><table class="tbl op-tbl"><thead><tr><th>Nº</th><th>Etapa</th><th class="num">Peso</th><th>Executado</th></tr></thead><tbody>
          ${es.map((e) => `<tr class="${e.valor <= 0 ? 'off' : ''}"><td>${esc(e.num)}</td><td>${esc(e.desc)}${e.aditivo ? ` <span class="chip neutro">aditivo nº ${esc(e.aditivo)}</span>` : ''}${e.valor <= 0 ? ' <span class="chip neutro">suprimida</span>' : ''}</td><td class="num">${P.pct(e.peso * 100)}</td><td class="op-ex"><span>${P.pct(ps.get(e.id), 0)}</span>${barraP(ps.get(e.id), P.COR_FIS)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td></td><td>Obra</td><td class="num">100%</td><td class="op-ex"><span>${P.pct(fis)}</span></td></tr></tfoot></table></div></section>`
        : '<div class="card"><div class="empty">O avanço da obra aparece aqui assim que a Souza Engenharia lançar a planilha do contrato.</div></div>';
    } else if (aba === 'financeiro') {
      const parcelas = (s.financeiro && s.financeiro.parcelas) || [];
      const estP = (x) => (x.pago ? ['ok', 'Paga', x.dataPago ? `Paga em ${dataBR(x.dataPago)}` : 'Paga'] : x.venc && x.venc < h ? ['estourado', 'Em aberto', `Venceu em ${dataBR(x.venc)}`] : ['neutro', 'A vencer', x.venc ? `Vence em ${dataBR(x.venc)}` : 'A vencer']);
      const dc = s.contratoUrl ? R.drive(s.contratoUrl) || { tipo: 'link', abrir: s.contratoUrl } : null;
      corpo = `<section class="card"><div class="hd"><div><h3>Contrato</h3><p>${ads.length ? `Valor original e ${ads.length} ${ads.length === 1 ? 'aditivo' : 'aditivos'}.` : 'Valor do contrato, sem aditivos.'}</p></div>
          ${dc ? `<a class="btn sm" href="${dc.tipo === 'link' ? esc(dc.abrir) : base + '/v/contrato'}" ${dc.tipo === 'link' ? 'target="_blank" rel="noopener"' : ''}>${icone(IC.nota)}Ver o contrato</a>` : ''}</div>
        <div class="bd"><ul class="po-ct">${temP ? `<li><span>Valor original</span><b>${P.brl(P.totalOriginal(p))}</b></li>${ads.map((a) => { const v = (a.linhas || []).reduce((t, x) => t + (Number(x.valor) || 0), 0); return `<li><span>Aditivo nº ${esc(a.numero)} de ${dataBR(a.data)}<small>${esc(a.desc || '')}${a.prazoDias ? ` · prazo ${a.prazoDias > 0 ? '+' : ''}${a.prazoDias} dias` : ''}</small></span><b class="${v < 0 ? 'neg' : ''}">${v === 0 ? '-' : (v > 0 ? '+' : '') + P.brl(v)}</b></li>`; }).join('')}` : ''}
          <li class="tot"><span>Valor atual do contrato</span><b>${P.brl(fin.total)}</b></li></ul></div></section>
        ${fin.ligado ? `<section class="card"><div class="hd"><div><h3>Pagamentos</h3><p>O que já foi pago e o que falta.</p></div></div><div class="bd">
          <div class="pt-ct-k"><div><span>Pago</span><b class="pt-ok">${P.brl(fin.pago)}</b></div><div><span>A pagar</span><b>${P.brl(fin.aPagar)}</b></div><div><span>Avanço financeiro</span><b>${P.pct(fin.pct)}</b></div></div>
          ${barraP(fin.pct, P.COR_FIN)}
          ${parcelas.length ? `<ul class="pt-pc">${parcelas.map((x, i) => { const [cls, rot, txt] = estP(x); return `<li><span class="pt-pc-t"><b>${esc(x.desc || `Parcela ${i + 1}`)}</b><small>${esc(txt)}</small></span><span class="pt-pc-v">${P.brl(x.valor)}</span><span class="chip ${cls}">${rot}</span></li>`; }).join('')}</ul>` : ''}</div></section>` : ''}`;
    } else if (aba === 'comunicados') {
      corpo = coms.length ? `<div class="po-coms">${coms.map((x) => `<a class="card po-com" href="${base}/com/${enc(x.id)}"><span class="po-com-n">nº ${P.n3(x.numero)}</span><span class="po-com-t"><b>${esc(x.titulo)}</b><small>${dataBR(x.data)}</small><span>${esc(String(x.texto || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 150))}${String(x.texto || '').length > 150 ? '…' : ''}</span></span>${icone(IC.dir)}</a>`).join('')}</div>`
        : '<div class="card"><div class="empty">Nenhum comunicado ainda. Quando a Souza Engenharia publicar um, ele aparece aqui.</div></div>';
    } else if (aba === 'diarios') {
      corpo = '<section class="card"><div class="bd" data-q="diarios"><p class="small muted">Carregando os diários…</p></div></section>';
    } else {
      const docs = htmlNos(R.estruturaDe(s), base, s.financeiro);
      corpo = `<section class="card pt-sv-docs"><div class="bd">${docs || '<p class="small muted">Os documentos da obra aparecem aqui assim que forem liberados.</p>'}</div></section>`;
    }
    $('#app').innerHTML = `<div class="pt pt-area po">${topo()}
      <div class="ob-topo"><a class="btn icon" href="#/c/${enc(c.id)}" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>${esc(nomeSv(s))}</b><span>${esc([s.codigo, c.nome].filter(Boolean).join(' · '))}</span></div>
        <div class="actions"><span class="chip ${s.situacao === 'entregue' ? 'ok' : 'atencao'}">${s.situacao === 'entregue' ? 'Concluída' : 'Em andamento'}</span>${temP ? `<button class="btn" data-p="op-rel">${icone(IC.imprimir)}<span>Imprimir</span></button>` : ''}</div></div>
      ${temP ? `<div class="op-kpis">
        <div><span>Avanço físico</span><b>${P.pct(fis)}</b>${barraP(fis, P.COR_FIS)}<small>${ult ? `Atualizado em ${dataBR(ult.data)}` : 'Ainda sem atualização'}</small></div>
        <div><span>Avanço financeiro</span><b>${fin.ligado ? P.pct(fin.pct) : '-'}</b>${barraP(fin.pct, P.COR_FIN)}<small>${fin.ligado ? `${P.brl(fin.pago)} pagos` : ' '}</small></div>
        <div><span>Valor do contrato</span><b>${P.brl(fin.total)}</b><small>${ads.length ? `${ads.length} ${ads.length === 1 ? 'aditivo' : 'aditivos'}` : 'Sem aditivos'}</small></div>
        <div><span>Prazo</span><b>${pz.decorrido !== null && pz.totalDias ? `Dia ${pz.decorrido} de ${pz.totalDias}` : '-'}</b><small>${pz.termino ? `Término previsto ${dataBR(pz.termino)}` : ' '}</small></div></div>` : ''}
      ${coms.length && aba !== 'comunicados' ? `<a class="po-ult" href="${base}/com/${enc(coms[0].id)}">${icone(IC.aviso)}<span><small>Último comunicado · ${dataBR(coms[0].data)}</small><b>nº ${P.n3(coms[0].numero)}: ${esc(coms[0].titulo)}</b></span><span class="po-ult-l">Ler</span></a>` : ''}
      <nav class="ob-abas po-abas">${abas.map(([k, r]) => `<a href="${base}/a/${k}" class="${aba === k ? 'ativo' : ''}">${r}${n[k] ? ` <span class="po-n">${n[k]}</span>` : ''}</a>`).join('')}</nav>
      ${corpo}
    </div>`;
    P.ligar($('#app'));
    if (aba === 'diarios') pintarDiarios(p.rdoObraId);
    // trocar de aba mantém a rolagem; chegar de outra tela começa do topo
    const ant = est.anterior || '';
    if (!(ant === base || ant.startsWith(base + '/a/'))) window.scrollTo(0, 0);
  }
  async function pintarDiarios(oid) {
    const alvo = () => $('[data-q="diarios"]');
    try {
      if (!est.dados || est.dados.obra.id !== oid) est.dados = await rpc('rdo_cliente_obra', { p_obra: oid });
      if (!alvo()) return;
      const ds = (est.dados.diarios || []).slice().sort(R.ordemDiario).reverse();
      alvo().innerHTML = ds.length ? `<ul class="pt-docs po-ds">${ds.map((d) => `<li><a href="#/o/${enc(oid)}/d/${enc(d.id)}">${icone(IC.nota)}<span><b>RDO nº ${esc(d.numero)}</b><small>${R.diaSemana(d.data)}, ${dataBR(d.data)}${(d.fotos || []).length ? ` · ${d.fotos.length} ${d.fotos.length === 1 ? 'foto' : 'fotos'}` : ''}</small></span>${icone(IC.dir)}</a></li>`).join('')}</ul>`
        : '<p class="small muted">Nenhum diário aprovado ainda.</p>';
    } catch (e) { if (alvo()) alvo().innerHTML = `<p class="small muted">Não foi possível carregar os diários agora: ${esc(e.message)}</p>`; }
  }
  function telaComunicado(c, s, id) {
    const P = OP(), cs = (s.painel.comunicados || []).slice().sort(P.porNumero), i = cs.findIndex((x) => x.id === id), base = baseSv(c, s);
    if (i < 0) { location.replace(`${base}/a/comunicados`); return; }
    const x = cs[i];
    $('#app').innerHTML = `<div class="pt pt-area po">${topo()}
      <div class="ob-topo"><a class="btn icon" href="${base}/a/comunicados" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>${P.tituloCom(x)}</b><span>${dataBR(x.data)} · ${esc(nomeSv(s))}</span></div>
        <div class="actions"><button class="btn primary" data-p="op-com-imp" data-id="${esc(x.id)}">${icone(IC.imprimir)}<span>Imprimir</span></button></div></div>
      <div class="oc-papel">${P.htmlComunicado(x, { cliente: c.nome, obra: nomeSv(s), codigo: s.codigo, logo: LOGO })}</div>
      <div class="pt-nav">${i > 0 ? `<a class="btn" href="${base}/com/${enc(cs[i - 1].id)}">${icone(IC.esq)}nº ${P.n3(cs[i - 1].numero)}</a>` : '<span></span>'}${i < cs.length - 1 ? `<a class="btn" href="${base}/com/${enc(cs[i + 1].id)}">nº ${P.n3(cs[i + 1].numero)} ›</a>` : ''}</div>
    </div>`;
    window.scrollTo(0, 0);
  }
  /** Serviço e cliente da página aberta (para imprimir). */
  function abertoAgora() {
    const m = location.hash.match(/^#\/c\/([^/]+)\/s\/([^/]+)/);
    const c = m && clienteSessao(dec(m[1])), s = c && (c.servicos || []).find((x) => x.id === dec(m[2]));
    return s ? { c, s } : null;
  }

  /** Página do serviço (pid vazio) ou de uma pasta dele. */
  function telaServico(c, s, pid) {
    const raiz = R.estruturaDe(s), base = baseSv(c, s);
    let lista = raiz, titulo = nomeSv(s), sub = [R.tipoDe(s), s.codigo, s.data && dataBR(s.data)].filter(Boolean).join(' · '), volta = '#/c/' + enc(c.id);
    if (pid) {
      const a = R.acharNo(raiz, pid);
      if (!a || a.no.tipo !== 'pasta' || bloqueado(a.no) || a.pais.some(bloqueado)) { location.replace(base); return; }
      lista = a.no.filhos || []; titulo = a.no.nome;
      // pasta com o link do Drive e mais coisas dentro: a pasta do Drive vem primeiro
      if (a.no.url) lista = [{ id: a.no.id, tipo: 'doc', nome: 'Arquivos da pasta', url: a.no.url }].concat(lista);
      sub = caminho(s, a.pais);
      volta = a.pais.length ? `${base}/p/${enc(a.pais[a.pais.length - 1].id)}` : temPainel(s) ? `${base}/a/documentos` : base;
    }
    const docs = htmlNos(lista, base, s.financeiro);
    $('#app').innerHTML = `<div class="pt pt-area">${topo()}
      <div class="ob-topo"><a class="btn icon" href="${volta}" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>${esc(titulo)}</b><span>${esc(sub)}${pid ? '' : ` · ${esc(c.nome)}`}</span></div>
        ${pid ? '' : `<div class="actions"><span class="chip ${s.situacao === 'entregue' ? 'ok' : 'atencao'}">${s.situacao === 'entregue' ? 'Entregue' : 'Em andamento'}</span></div>`}</div>
      ${pid ? '' : htmlContrato(c, s)}
      ${pid ? '' : '<h2 class="pt-h2">Documentos</h2>'}
      <section class="card pt-sv-docs"><div class="bd">${docs || `<p class="small muted">${pid ? 'Esta pasta está vazia.' : 'Os documentos aparecem aqui assim que forem entregues.'}</p>`}</div></section>
    </div>`;
    window.scrollTo(0, 0);
  }
  function telaDoc(c, s, nid) {
    const raiz = R.estruturaDe(s), base = baseSv(c, s);
    let url = '', nome = '', volta = base, onde = nomeSv(s);
    if (nid === 'contrato') { url = s.contratoUrl; nome = 'Contrato'; }
    else {
      const a = R.acharNo(raiz, nid);
      if (a && a.no.url && !bloqueado(a.no) && !a.pais.some(bloqueado)) {
        url = a.no.url; nome = a.no.nome; onde = caminho(s, a.pais);
        if (a.no.tipo === 'pasta' && !soLink(a.no)) volta = `${base}/p/${enc(a.no.id)}`;
        else if (a.pais.length) volta = `${base}/p/${enc(a.pais[a.pais.length - 1].id)}`;
      }
    }
    if (!url) { location.replace(base); return; }
    if (volta === base && temPainel(s)) volta = `${base}/a/documentos`;
    const d = R.drive(url) || { tipo: 'link', abrir: url };
    $('#app').innerHTML = `<div class="pt pt-docv">${topo()}
      <div class="ob-topo"><a class="btn icon" href="${volta}" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>${esc(nome)}</b><span>${esc(onde)}</span></div>
        <div class="actions">${d.baixar ? `<a class="btn" href="${esc(d.baixar)}" target="_blank" rel="noopener">${icone(IC.baixar)}<span>Baixar</span></a>` : ''}<a class="btn" href="${esc(d.abrir)}" target="_blank" rel="noopener">${icone(IC.externo)}<span>Abrir no Drive</span></a></div></div>
      ${d.preview ? `<div class="pt-frame ${d.tipo}"><iframe src="${esc(d.preview)}" title="${esc(nome)}" loading="lazy" allow="autoplay" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
        <p class="small muted pt-doc-dica">${d.tipo === 'pasta' ? 'Toque num arquivo para abrir. ' : ''}Se não aparecer, use "Abrir no Drive".</p>` : ''}
    </div>`;
    window.scrollTo(0, 0);
  }
  function modalSenha() {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div><h2>Trocar a senha</h2><p>Use pelo menos 8 caracteres.</p></div></div>
      <div class="mb"><label class="f"><span>Senha nova</span><input class="inp" type="password" name="s1" autocomplete="new-password"></label>
        <label class="f" style="margin-top:10px"><span>Repita a senha nova</span><input class="inp" type="password" name="s2" autocomplete="new-password"></label></div>
      <div class="mf"><button class="btn" data-r="0">Cancelar</button><button class="btn primary" data-r="1">Trocar a senha</button></div></div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== bg) return;
      if (!b || b.dataset.r === '0') { bg.remove(); return; }
      const s1 = $('[name=s1]', bg).value, s2 = $('[name=s2]', bg).value;
      if (s1 !== s2) { toast('As duas senhas não são iguais.', true); return; }
      b.disabled = true;
      try { await est.sessao.trocarSenha(s1); bg.remove(); toast('Senha trocada.'); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    });
    setTimeout(() => { const i = $('[name=s1]', bg); if (i) i.focus(); }, 50);
  }

  /* ---------------- obra ---------------- */
  function desenhar() {
    const j = est.dados; if (!j) { if (est.sessao) telaInicio(); else telaEntrada(); return; }
    if (est.aberto) { telaDiario(est.aberto); return; }
    const o = j.obra, ds = (j.diarios || []).slice().sort(R.ordemDiario);
    const prog = R.progresso(o, ds), pz = R.prazo(o, ds, R.dataRef(o, ds));
    const clima = (d) => R.PERIODOS.map(([k]) => (d.clima && d.clima[k] && d.clima[k].tempo ? `<span title="${esc(R.nomeDe(R.TEMPOS, d.clima[k].tempo))}">${R.iconeTempo(d.clima[k].tempo)}</span>` : '<span class="r-sem">-</span>')).join('');
    const barra = (p, cls = '') => `<div class="r-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, p || 0)).toFixed(1)}%"></i></div>`;
    const volta = est.sessao ? voltarDaObra((est.obras || []).find((x) => x.id === o.id) || o) : null;
    $('#app').innerHTML = `<div class="pt">${topo(o)}
      ${volta ? `<a class="btn ghost sm pt-voltar" href="${esc(volta.href)}">${icone(IC.esq)}${esc(volta.rot)}</a>` : ''}
      <div class="pagehead"><div><h1>${esc(o.nome)}</h1><p>${esc([o.contrato && 'Contrato ' + o.contrato, o.contratante, o.local].filter(Boolean).join(' · '))}</p></div></div>
      <div class="r-kpis">
        <div><span>Avanço da obra</span><b>${R.fmtPct(prog.geral, 1)}</b>${barra(prog.geral)}</div>
        <div><span>Prazo</span><b>${pz.decorrido !== null && pz.atual ? `Dia ${pz.decorrido} de ${pz.atual}` : '-'}</b><small>${pz.termino ? `Término previsto ${dataBR(pz.termino)}` : ''}</small></div>
        <div><span>Diários</span><b>${ds.length}</b><small>aprovados pela Souza</small></div>
        <div><span>Último diário</span><b>${ds.length ? `nº ${esc(ds[ds.length - 1].numero)}` : '-'}</b><small>${ds.length ? dataBR(ds[ds.length - 1].data) : ''}</small></div>
      </div>
      <nav class="ob-abas"><a href="#" data-p="aba" data-v="diarios" class="${est.aba === 'diarios' ? 'ativo' : ''}">Diários</a><a href="#" data-p="aba" data-v="avanco" class="${est.aba === 'avanco' ? 'ativo' : ''}">Avanço dos serviços</a>${o.drivePasta ? `<a href="${esc(o.drivePasta)}" target="_blank" rel="noopener">${icone(IC.galeria)}Fotos em alta qualidade</a>` : ''}</nav>
      ${est.aba === 'avanco' ? (prog.servicos.length ? `<div class="card"><div class="bd flush tblwrap"><table class="tbl r-tsv"><thead><tr><th>Item</th><th>Serviço</th><th>Executado</th></tr></thead><tbody>
          ${(o.etapas || []).map((e) => `<tr class="r-et"><td class="r-num">${esc(e.num || '')}</td><td>${esc(e.titulo || 'Etapa')}</td><td class="r-pc"><span>${R.fmtPct(prog.etapas.get(e.id), 1)}</span>${barra(prog.etapas.get(e.id))}</td></tr>
            ${(e.servicos || []).map((s) => { const x = prog.por.get(s.id); return `<tr class="r-svp"><td class="r-num">${esc(s.num || '')}</td><td>${esc(s.desc)}</td><td class="r-pc"><span>${R.fmtPct(x.pct)}</span>${barra(x.pct, x.pct >= 100 ? 'ok' : x.pct > 0 ? 'and' : '')}</td></tr>`; }).join('')}`).join('')}
          </tbody></table></div></div>` : '<div class="card"><div class="empty">Sem serviços cadastrados.</div></div>')
        : ds.length ? `<div class="card r-dlist">${ds.slice().reverse().map((d) => `<a class="r-dl pt-dl" href="#/d/${encodeURIComponent(d.id)}" data-p="abrir" data-id="${esc(d.id)}">
            <span class="r-dl-n">nº ${esc(d.numero)}</span><span class="r-dl-d"><b>${dataBR(d.data)}</b><small>${R.diaSemana(d.data)}</small></span><span class="r-dl-c">${clima(d)}</span>
            <span class="r-dl-i"><span>${(d.atividades || []).length} ${(d.atividades || []).length === 1 ? 'atividade' : 'atividades'}</span><span>${(d.fotos || []).length} ${(d.fotos || []).length === 1 ? 'foto' : 'fotos'}</span></span>
            <span class="chip ok">Aprovado</span></a>`).join('')}</div>`
          : '<div class="card"><div class="empty"><b>Nenhum diário aprovado ainda</b>Os diários aparecem aqui assim que forem aprovados pela Souza Engenharia.</div></div>'}
    </div>`;
  }

  /* ---------------- diário ---------------- */
  function telaDiario(id) {
    const j = est.dados;
    const ds = (j.diarios || []).slice().sort(R.ordemDiario);
    const d = ds.find((x) => x.id === id);
    if (!d) { est.aberto = null; history.replaceState(null, '', location.pathname); desenhar(); return; }
    const o = j.obra;
    const i = ds.indexOf(d);
    $('#app').innerHTML = `<div class="pt">${topo(o)}
      <div class="ob-topo"><a class="btn icon" href="#" data-p="voltar" aria-label="Voltar">${icone(IC.esq)}</a>
        <div class="tit"><b>RDO nº ${esc(d.numero)}</b><span>${R.diaSemana(d.data)}, ${dataBR(d.data)} · ${esc(o.nome)}</span></div>
        <div class="actions">${d.drivePasta ? `<a class="btn" href="${esc(d.drivePasta)}" target="_blank" rel="noopener">${icone(IC.galeria)}<span>Fotos em alta</span></a>` : ''}<button class="btn" data-p="pdf">${icone(IC.imprimir)}<span>Baixar PDF</span></button></div></div>
      <div class="r-papel" data-papel>${R.diarioHTML({ obra: o, diario: d, diarios: ds, aprovacoes: j.aprovacoes, empresa: j.empresa, logoSouza: LOGO, fotoSrc })}</div>
      <div class="pt-nav">${i > 0 ? `<a class="btn" href="#/d/${encodeURIComponent(ds[i - 1].id)}" data-p="abrir" data-id="${esc(ds[i - 1].id)}">${icone(IC.esq)}nº ${esc(ds[i - 1].numero)}</a>` : '<span></span>'}${i < ds.length - 1 ? `<a class="btn" href="#/d/${encodeURIComponent(ds[i + 1].id)}" data-p="abrir" data-id="${esc(ds[i + 1].id)}">nº ${esc(ds[i + 1].numero)} ›</a>` : ''}</div>
    </div>`;
    R.ajustarZoom($('[data-papel]'));
    window.scrollTo(0, 0);
  }
  function pdf() {
    const j = est.dados, d = (j.diarios || []).find((x) => x.id === est.aberto); if (!d) return;
    const ds = (j.diarios || []).slice().sort(R.ordemDiario);
    $('#print-root').innerHTML = R.diarioHTML({ obra: j.obra, diario: d, diarios: ds, aprovacoes: j.aprovacoes, empresa: j.empresa, logoSouza: LOGO, fotoSrc });
    let st = $('#estilo-pagina');
    if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
    const rod = `Relatório ${dataBR(d.data)} nº ${d.numero} · ${j.obra.nome}`.replace(/"/g, "'");
    st.textContent = `@page{size:A4 portrait;margin:10mm 10mm 12mm 10mm;@bottom-left{content:"${rod}";font-family:Arial,sans-serif;font-size:7.5pt;color:#777}@bottom-right{content:"Página " counter(page) " de " counter(pages);font-family:Arial,sans-serif;font-size:7.5pt;color:#777}}`;
    const ant = document.title;
    document.title = `${j.obra.contrato ? j.obra.contrato + ' - ' : ''}RDO nº ${String(d.numero).padStart(3, '0')} - ${dataBR(d.data).replace(/\//g, '-')}`;
    document.body.classList.add('imprimindo');
    const fim = () => { document.body.classList.remove('imprimindo'); document.title = ant; $('#print-root').innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    // a página impressa fica escondida até imprimir: as fotos precisam carregar antes (sem "lazy")
    const imgs = $$('#print-root img');
    const espera = imgs.map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => { i.onload = r; i.onerror = r; })));
    imgs.forEach((i) => { i.loading = 'eager'; i.decoding = 'sync'; });
    const decodificar = () => Promise.all(imgs.map((i) => (i.naturalWidth && i.decode ? i.decode().catch(() => {}) : null)));
    Promise.race([Promise.all(espera).then(decodificar), new Promise((r) => setTimeout(r, 60000))])
      .then(() => setTimeout(() => window.print(), 80));
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const a = b.dataset.p;
    if (a === 'sair') { e.preventDefault(); sair(); }
    if (a === 'aba') { e.preventDefault(); est.aba = b.dataset.v; desenhar(); }
    const base = () => (est.sessao && est.dados ? '#/o/' + encodeURIComponent(est.dados.obra.id) : '');
    if (a === 'abrir') { e.preventDefault(); if (est.sessao) { location.hash = base() + '/d/' + encodeURIComponent(b.dataset.id); return; } est.aberto = b.dataset.id; history.pushState(null, '', '#/d/' + encodeURIComponent(b.dataset.id)); telaDiario(b.dataset.id); }
    if (a === 'voltar') { e.preventDefault(); if (est.sessao) { location.hash = base(); return; } est.aberto = null; history.pushState(null, '', location.pathname); desenhar(); }
    if (a === 'pdf') { e.preventDefault(); pdf(); }
    if (a === 'op-rel' || a === 'op-com-imp') {
      e.preventDefault();
      const x = abertoAgora(); if (!x || !temPainel(x.s)) return;
      const P = OP();
      if (a === 'op-rel') P.imprimir(P.htmlRelatorio({ s: x.s, cliente: x.c.nome, logo: LOGO }), { titulo: `${x.s.codigo ? x.s.codigo + ' - ' : ''}Relatório de avanço - ${dataBR(hojeISO()).replace(/\//g, '-')}`, rodape: P.RODAPE });
      else { const cm = (x.s.painel.comunicados || []).find((y) => y.id === b.dataset.id); if (cm) P.imprimir(`<div class="oc-imp">${P.htmlComunicado(cm, { cliente: x.c.nome, obra: nomeSv(x.s), codigo: x.s.codigo, logo: LOGO })}</div>`, { titulo: `${x.s.codigo ? x.s.codigo + ' - ' : ''}Comunicado ${P.n3(cm.numero)} - ${cm.titulo}`, rodape: P.RODAPE, margem: '16mm 16mm 18mm 16mm' }); }
    }
    if (a === 'senha') { e.preventDefault(); modalSenha(); }
    if (a === 'recarregar') { e.preventDefault(); iniciarSessao(est.sessao); }
  });
  window.addEventListener('hashchange', () => { if (est.sessao && est.area) rota(); });
  window.addEventListener('popstate', () => {
    if (est.sessao) return;
    if (!est.dados) return;
    const h = location.hash.match(/^#\/d\/(.+)$/);
    est.aberto = h ? decodeURIComponent(h[1]) : null;
    desenhar();
  });

  window.Portal = { iniciarSessao };
  if (!window.PORTAL_SESSAO) {
    const salvo = guardar.get();
    if (salvo) entrar(salvo, true); else telaEntrada();
  }

  /* Foto que ainda não está disponível: um aviso no lugar da imagem quebrada. */
  document.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.semfoto || !/\/storage\/v1\/object\/public\/rdo-fotos\//.test(img.src)) return;
    img.dataset.semfoto = '1';
    const ph = document.createElement('div');
    ph.className = 'r-semfoto';
    ph.innerHTML = '<b>Foto indisponível no momento</b><span>Tente de novo mais tarde</span>';
    img.replaceWith(ph);
  }, true);
})();
