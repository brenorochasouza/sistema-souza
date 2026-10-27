'use strict';
/* =========================================================
   Obras: controle financeiro (etapas, orçamento, notas,
   receitas e relatórios). Portado do Sistema Financeiro de
   Obras e ligado ao núcleo e ao cadastro único de clientes.
   ========================================================= */
(function () {

/* =========================================================
   Sistema Financeiro de Obras · Souza Engenharia
   Núcleo: constantes, utilidades, modelo de dados e cálculos
   ========================================================= */

const VERSAO_APP = '2.3';
const MAX_BACKUPS = 30;

const CATEGORIAS = [
  ['material', 'Material'],
  ['mao_obra', 'Mão de obra'],
  ['equipamento', 'Equipamento'],
  ['servico', 'Serviço'],
  ['administracao', 'Administração'],
];
const CATEGORIAS_PADRAO = CATEGORIAS.map((c) => c.slice());
const CAT_NOME = Object.fromEntries(CATEGORIAS);
/** Substitui a lista de categorias mantendo as mesmas referências usadas no sistema. */
function definirCategorias(lista) {
  const validas = (lista || []).filter((c) => c && c[0] && String(c[1] || '').trim());
  if (!validas.length) return;
  CATEGORIAS.length = 0;
  validas.forEach((c) => CATEGORIAS.push([String(c[0]), String(c[1]).trim()]));
  Object.keys(CAT_NOME).forEach((k) => { if (!CATEGORIAS.some((c) => c[0] === k)) delete CAT_NOME[k]; });
  CATEGORIAS.forEach(([k, v]) => { CAT_NOME[k] = v; });
}
const nomeCat = (k) => CAT_NOME[k] || (k ? 'Categoria removida' : 'Sem categoria');
const catPadrao = () => (CATEGORIAS[0] ? CATEGORIAS[0][0] : 'material');
/** Categorias da lista atual mais as que aparecem nos lançamentos e já não estão na lista. */
function categoriasComValores(mapa) {
  const out = CATEGORIAS.slice();
  Object.keys(mapa || {}).forEach((k) => { if (!CAT_NOME[k] && mapa[k] && Math.abs(mapa[k].lancado || 0) > EPS) out.push([k, nomeCat(k)]); });
  return out;
}
const STATUS_OBRA = [
  ['a_iniciar', 'A iniciar'],
  ['em_andamento', 'Em andamento'],
  ['concluida', 'Concluída'],
];
const STATUS_NOME = Object.fromEntries(STATUS_OBRA);
const TIPO_NOME = { previsto: 'Previsto', aditivo: 'Aditivo' };
const LOGO_PADRAO = 'img/logo.png';

const EMPRESA_PADRAO = {
  nome: 'Souza Engenharia',
  cnpj: '49.885.935/0001-91',
  responsavel: 'Eng. Breno Rocha Souza',
  registro: 'CREA-BA 052098151-0',
  contato: '(71) 99723-7168 · obras@souzaengenharia.com · www.souzaengenharia.com',
};

/* ---------- utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
/** Identificador único no formato UUID (exigido pelo banco de dados). */
function uid() {
  if (window.crypto && typeof crypto.randomUUID === 'function') { try { return crypto.randomUUID(); } catch { /* contexto sem suporte */ } }
  const b = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.005;

const _fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const _fmtNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (n) => _fmtBRL.format(r2(n)).replace(/ /g, ' ');
const numBR = (n) => _fmtNum.format(r2(n));
const pct = (x, casas = 0) => (isFinite(x) ? (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas }) + '%' : '∞');
function brlCurto(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (a >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e4 ? 0 : 1 }) + ' mil';
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
}
/** Converte "1.234,56", "1234,56", "1234.56", "R$ 1.234" em número. Retorna NaN se inválido. */
function parseValor(str) {
  if (typeof str === 'number') return str;
  let s = String(str || '').trim().replace(/R\$|\s/g, '');
  if (!s) return NaN;
  const neg = s.startsWith('-');
  s = s.replace(/^-/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
  const v = parseFloat(s);
  return isNaN(v) ? NaN : r2(neg ? -v : v);
}
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
}
function dataHoraBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesDe = (iso) => (iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null);
function mesRotulo(k, longo = false) {
  const [y, m] = k.split('-').map(Number);
  return longo ? `${MESES_LONGOS[m - 1]} de ${y}` : `${MESES[m - 1]}/${String(y).slice(2)}`;
}
function mesesEntre(a, b) {
  const out = [];
  let [y, m] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  let guard = 0;
  while ((y < yb || (y === yb && m <= mb)) && guard++ < 240) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
const slug = (s) => String(s || 'obra').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'obra';
const nomeArquivoSeguro = (s) => String(s || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 80);

/* ---------- ícones (traço) ---------- */
const ICONES = {
  painel: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  obra: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  etapas: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  notas: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  relatorios: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M8 18v-2"/><path d="M12 18v-4"/><path d="M16 18v-6"/>',
  backup: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>',
  imprimir: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  mais: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  lixo: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  cima: '<path d="m18 15-6-6-6 6"/>',
  baixo: '<path d="m6 9 6 6 6-6"/>',
  copiar: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  pasta: '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
  pastaMais: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  fechar: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clipe: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  restaurar: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  olho: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  abrir: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  cadeado: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  receita: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  voltar: '<path d="m15 18-6-6 6-6"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  nuvem: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  ajustes: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  arquivo: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="ic">${ICONES[n] || ''}</svg>`;

/* ---------- modelo de dados ---------- */
const REGIMES = [
  ['', 'Não informado'],
  ['administracao', 'Por administração'],
  ['medicao', 'Por medição'],
];
const REGIME_NOME = Object.fromEntries(REGIMES);

/** Configuração dos dois tipos de lançamento: despesas (notas) e receitas. */
const LANC = {
  despesa: {
    chave: 'despesa', col: 'notas', seq: 'nota', prefixo: 'NF', data: 'dataPagamento',
    nome: 'nota', Nome: 'Nota', plural: 'notas', artigo: 'a',
    dataRot: 'Data de pagamento', okRot: 'Paga', pendRot: 'A pagar', verbo: 'pagamento',
    temFornecedor: true, temCategoria: true, filtros: 'filtrosDesp',
  },
  receita: {
    chave: 'receita', col: 'receitas', seq: 'receita', prefixo: 'REC', data: 'dataRecebimento',
    nome: 'receita', Nome: 'Receita', plural: 'receitas', artigo: 'a',
    dataRot: 'Data de recebimento', okRot: 'Recebida', pendRot: 'A receber', verbo: 'recebimento',
    temFornecedor: false, temCategoria: false, filtros: 'filtrosRec',
  },
};

function novaObraDados(campos = {}) {
  const agora = new Date().toISOString();
  return {
    app: 'sistema-financeiro-obras',
    versao: 2,
    obra: {
      nome: campos.nome || '',
      cliente: campos.cliente || '',
      endereco: campos.endereco || '',
      dataInicio: campos.dataInicio || '',
      status: campos.status || 'a_iniciar',
      regime: campos.regime || '',
      clienteId: campos.clienteId || '',
      dataConclusao: '',
      observacoes: '',
    },
    etapas: [],
    orcamentoBase: null,
    historico: [],
    notas: [],
    receitas: [],
    seq: { nota: 0, receita: 0 },
    meta: { criadoEm: agora, atualizadoEm: agora, revisao: 0 },
  };
}

/** Normaliza dados vindos de arquivo (versões anteriores, campos ausentes). */
function migrar(d) {
  if (!d || typeof d !== 'object') throw new Error('Arquivo sem dados válidos.');
  if (!Array.isArray(d.etapas) || !Array.isArray(d.notas) || !d.obra) throw new Error('O arquivo não parece ser um registro deste sistema.');
  const out = Object.assign(novaObraDados(), d);
  out.versao = 2;
  if (d.id) out.id = d.id;
  out.obra = Object.assign(novaObraDados().obra, d.obra || {});
  out.meta = Object.assign({ criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), revisao: 0 }, d.meta || {});
  out.historico = Array.isArray(d.historico) ? d.historico : [];
  out.seq = Object.assign({ nota: 0, receita: 0 }, d.seq || {});
  out.etapas = d.etapas.map((e) => ({ id: e.id || uid(), nome: e.nome || '', tipo: e.tipo === 'aditivo' ? 'aditivo' : 'previsto', valor: r2(e.valor), criadaEm: e.criadaEm || null }));
  const tipoEtapa = (id) => ((out.etapas.find((e) => e.id === id) || {}).tipo) || 'previsto';
  const lanc = (n, cfg) => {
    const o = {
      id: n.id || uid(),
      numero: Number(n.numero) || 0,
      codigo: n.codigo || '',
      [cfg.data]: n[cfg.data] || n.dataLancamento || '',
      descricao: n.descricao || '',
      alocacoes: (n.alocacoes || []).map((a) => {
        const x = { id: a.id || uid(), etapaId: a.etapaId, tipo: a.tipo === 'aditivo' || a.tipo === 'previsto' ? a.tipo : tipoEtapa(a.etapaId), valor: r2(a.valor) };
        if (cfg.temCategoria) x.categoria = a.categoria || catPadrao();
        return x;
      }),
      criadaEm: n.criadaEm || null,
      atualizadaEm: n.atualizadaEm || null,
    };
    if (cfg.temFornecedor) o.fornecedor = n.fornecedor || '';
    return o;
  };
  out.notas = d.notas.map((n) => lanc(n, LANC.despesa));
  out.receitas = (Array.isArray(d.receitas) ? d.receitas : []).map((n) => lanc(n, LANC.receita));
  for (const cfg of [LANC.despesa, LANC.receita]) {
    const lista = out[cfg.col];
    const maxNum = lista.reduce((m, n) => Math.max(m, n.numero), 0);
    if (out.seq[cfg.seq] < maxNum) out.seq[cfg.seq] = maxNum;
    lista.forEach((n) => { if (!n.codigo) n.codigo = codigoLanc(cfg, n.numero); });
  }
  return out;
}

const codigoLanc = (cfg, n, largura = 2) => cfg.prefixo + String(Math.floor(n)).padStart(largura, '0');
/** Mantém o padrão de dígitos já usado na obra (ex.: NF001 continua NF064). */
function larguraCodigo(lista) {
  let w = 2;
  for (const n of lista) { const m = String(n.codigo || '').match(/\d+/); if (m) w = Math.max(w, m[0].length); }
  return w;
}
const proximoNumero = (seq) => Math.floor(Number(seq) || 0) + 1;
/** Forma usada para comparar códigos: sem espaços e em maiúsculas (nf 05 = NF05). */
const chaveCodigo = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
/** Número usado para ordenar e para seguir a sequência automática (primeiro grupo de dígitos do código). */
function numeroDoCodigo(codigo) { const m = String(codigo || '').match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
/** Lançamento da obra que já usa o código (ignorando o próprio lançamento em edição). */
function codigoEmUso(lista, codigo, ignorarId) {
  const k = chaveCodigo(codigo);
  return lista.find((n) => n.id !== ignorarId && chaveCodigo(n.codigo) === k) || null;
}
/** Próximo código automático livre, no padrão de dígitos já usado na obra. */
function proximoCodigo(cfg, d, desde) {
  const lista = d[cfg.col];
  const larg = larguraCodigo(lista);
  let n = proximoNumero(desde === undefined ? d.seq[cfg.seq] : desde);
  while (codigoEmUso(lista, codigoLanc(cfg, n, larg))) n++;
  return { numero: n, codigo: codigoLanc(cfg, n, larg) };
}
const codigoNota = (n) => codigoLanc(LANC.despesa, n);
const totalNota = (n) => r2(n.alocacoes.reduce((s, a) => s + (a.valor || 0), 0));
const etapaPorId = (d, id) => d.etapas.find((e) => e.id === id);
/** Regra de situação: data até hoje = paga/recebida; data futura = a pagar/a receber. */
const realizado = (data, hoje = hojeISO()) => !!data && data <= hoje;

function statusEtapa(previsto, lancado) {
  if (lancado > previsto + EPS) return 'estourado';
  if (lancado <= EPS) return 'sem_lancamento';
  if (previsto > 0 && lancado >= 0.9 * previsto) return 'atencao';
  return 'ok';
}
const STATUS_ETAPA = {
  estourado: { rot: 'Acima do previsto', ic: 'alerta', cls: 'estourado' },
  atencao: { rot: 'Acima de 90%', ic: 'info', cls: 'atencao' },
  ok: { rot: 'Dentro do previsto', ic: 'ok', cls: 'ok' },
  sem_lancamento: { rot: 'Sem lançamentos', ic: '', cls: 'neutro' },
};
function chipStatus(st) {
  const s = STATUS_ETAPA[st];
  return `<span class="chip ${s.cls}">${s.ic ? ic(s.ic) : ''}${s.rot}</span>`;
}
const chipTipo = (t) => `<span class="chip ${t}">${TIPO_NOME[t]}</span>`;

/**
 * Cálculo central. Toda tela e relatório usa este resultado.
 * Custos (notas): lançado = todas as linhas; pago = data de pagamento até hoje; a pagar = data futura.
 * Receitas: lançada = todas as linhas; recebida = data até hoje; a receber = data futura.
 * O tipo (Previsto/Aditivo) de cada linha é o informado no lançamento.
 * Orçamento original: valores fixados das etapas Previsto (antes da fixação, os valores atuais).
 */
function calcular(d, hoje = hojeISO()) {
  const base = d.orcamentoBase;
  const E = {};
  for (const e of d.etapas) {
    const original = base ? (base.etapas[e.id] || 0) : (e.tipo === 'previsto' ? e.valor : 0);
    E[e.id] = { etapa: e, previsto: e.valor, original, lancado: 0, pago: 0, aPagar: 0, cat: {}, nAloc: 0, receita: 0, recebido: 0, aReceber: 0, nRec: 0 };
  }
  const tipoZero = () => ({ lancado: 0, pago: 0, aPagar: 0, receita: 0, recebido: 0, aReceber: 0 });
  const PT = { previsto: tipoZero(), aditivo: tipoZero() };
  const T = { lancado: 0, pago: 0, aPagar: 0, receita: 0, recebido: 0, aReceber: 0 };
  const M = {}, cat = {}, forn = {};
  const mes = (k) => M[k] || (M[k] = { k, pago: 0, aPagar: 0, recebido: 0, aReceber: 0 });
  const pendentes = [], aReceber = [];
  for (const c of CATEGORIAS) cat[c[0]] = { lancado: 0, pago: 0, aPagar: 0 };
  for (const n of d.notas) {
    const ok = realizado(n.dataPagamento, hoje);
    if (!ok) pendentes.push(n);
    const fk = (n.fornecedor || '').trim() || '(sem fornecedor)';
    if (!forn[fk]) forn[fk] = { nome: fk, lancado: 0, pago: 0, aPagar: 0, notas: 0 };
    forn[fk].notas++;
    const mk = mesDe(n.dataPagamento);
    for (const a of n.alocacoes) {
      const v = a.valor || 0;
      const r = E[a.etapaId];
      const tipo = a.tipo === 'aditivo' ? 'aditivo' : 'previsto';
      if (r) {
        r.lancado += v; r.nAloc++;
        if (ok) r.pago += v; else r.aPagar += v;
        r.cat[a.categoria] = (r.cat[a.categoria] || 0) + v;
      }
      T.lancado += v; PT[tipo].lancado += v;
      if (ok) { T.pago += v; PT[tipo].pago += v; } else { T.aPagar += v; PT[tipo].aPagar += v; }
      const c = cat[a.categoria] || (cat[a.categoria] = { lancado: 0, pago: 0, aPagar: 0 });
      c.lancado += v; if (ok) c.pago += v; else c.aPagar += v;
      forn[fk].lancado += v; if (ok) forn[fk].pago += v; else forn[fk].aPagar += v;
      if (mk) { if (ok) mes(mk).pago += v; else mes(mk).aPagar += v; }
    }
  }
  for (const n of d.receitas || []) {
    const ok = realizado(n.dataRecebimento, hoje);
    if (!ok) aReceber.push(n);
    const mk = mesDe(n.dataRecebimento);
    for (const a of n.alocacoes) {
      const v = a.valor || 0;
      const r = E[a.etapaId];
      const tipo = a.tipo === 'aditivo' ? 'aditivo' : 'previsto';
      if (r) { r.receita += v; r.nRec++; if (ok) r.recebido += v; else r.aReceber += v; }
      T.receita += v; PT[tipo].receita += v;
      if (ok) { T.recebido += v; PT[tipo].recebido += v; } else { T.aReceber += v; PT[tipo].aReceber += v; }
      if (mk) { if (ok) mes(mk).recebido += v; else mes(mk).aReceber += v; }
    }
  }
  let excedente = 0;
  const etapas = d.etapas.map((e) => {
    const r = E[e.id];
    r.saldo = r.previsto - r.lancado;
    r.pct = r.previsto > 0 ? r.lancado / r.previsto : (r.lancado > 0 ? Infinity : 0);
    r.status = statusEtapa(r.previsto, r.lancado);
    r.resultado = r.receita - r.lancado;
    if (r.lancado > r.previsto) excedente += r.lancado - r.previsto;
    return r;
  });
  const previstoAtual = d.etapas.filter((e) => e.tipo === 'previsto').reduce((s, e) => s + e.valor, 0);
  const aditivos = d.etapas.filter((e) => e.tipo === 'aditivo').reduce((s, e) => s + e.valor, 0);
  const orcOriginal = base ? base.total : previstoAtual;
  const orcAtualizado = previstoAtual + aditivos;
  PT.previsto.orcado = previstoAtual; PT.aditivo.orcado = aditivos;
  for (const t of ['previsto', 'aditivo']) {
    const p = PT[t];
    p.saldo = p.orcado - p.lancado;
    p.pct = p.orcado > 0 ? p.lancado / p.orcado : (p.lancado > 0 ? Infinity : 0);
    p.status = statusEtapa(p.orcado, p.lancado);
    p.resultado = p.receita - p.lancado;
    p.margem = p.receita > EPS ? p.resultado / p.receita : null;
  }
  const chaves = Object.keys(M).sort();
  const meses = chaves.length ? mesesEntre(chaves[0], chaves[chaves.length - 1]).map((k) => M[k] || { k, pago: 0, aPagar: 0, recebido: 0, aReceber: 0 }) : [];
  const mesAtual = hoje.slice(0, 7);
  let acum = 0;
  meses.forEach((m) => {
    m.saidas = m.pago + m.aPagar; m.entradas = m.recebido + m.aReceber;
    m.saldoMes = m.entradas - m.saidas; acum += m.saldoMes; m.acumulado = acum;
    m.futuro = m.k > mesAtual;
  });
  const fornecedores = Object.values(forn).sort((a, b) => b.lancado - a.lancado);
  const resultado = T.receita - T.lancado;
  return {
    etapas, porId: E, porTipo: PT, hoje,
    totais: Object.assign(T, {
      orcOriginal, previstoAtual, aditivos, ajustes: previstoAtual - orcOriginal, orcAtualizado,
      saldo: orcAtualizado - T.lancado, excedente,
      lancadoPrev: PT.previsto.lancado, lancadoAdit: PT.aditivo.lancado,
      resultado, margem: T.receita > EPS ? resultado / T.receita : null, caixa: T.recebido - T.pago,
      nNotas: d.notas.length, nPendentes: pendentes.length,
      nReceitas: (d.receitas || []).length, nAReceber: aReceber.length,
    }),
    meses, categorias: cat, fornecedores,
    pendentes: pendentes.sort((a, b) => (a.dataPagamento || '').localeCompare(b.dataPagamento || '') || a.numero - b.numero),
    aReceber: aReceber.sort((a, b) => (a.dataRecebimento || '').localeCompare(b.dataRecebimento || '') || a.numero - b.numero),
  };
}

/* ---------- regras de alteração de etapas e orçamento ---------- */
function registrarHistorico(d, reg) {
  if (!d.orcamentoBase) return; // antes da fixação, o orçamento ainda está em montagem
  d.historico.push(Object.assign({ id: uid(), data: new Date().toISOString() }, reg));
}
function fixarOrcamento(d, refixar = false) {
  const etapas = {}, nomes = {};
  let total = 0;
  d.etapas.filter((e) => e.tipo === 'previsto').forEach((e) => { etapas[e.id] = e.valor; nomes[e.id] = e.nome; total += e.valor; });
  const anterior = d.orcamentoBase ? d.orcamentoBase.total : null;
  d.orcamentoBase = { fixadoEm: new Date().toISOString(), total: r2(total), etapas, nomes };
  d.historico.push({ id: uid(), data: new Date().toISOString(), etapaId: null, etapaNome: 'Orçamento da obra', acao: refixar ? 'refixacao' : 'fixacao', de: anterior, para: r2(total), motivo: refixar ? 'Orçamento original redefinido' : 'Orçamento original fixado' });
}
const ACAO_HIST = {
  valor: 'Valor previsto alterado', tipo: 'Tipo alterado', nome: 'Nome alterado', inclusao: 'Etapa incluída',
  exclusao: 'Etapa excluída', fixacao: 'Orçamento original fixado', refixacao: 'Orçamento original redefinido',
};


/* =========================================================
   Armazenamento: usa o núcleo do sistema (tabela "obras").
   Cada obra, etapa, nota, receita e registro de histórico é uma
   linha com grupo = id da obra.
   ========================================================= */
const TAB = 'obras';
const S = {
  data: null, modo: 'nuvem', view: 'painel', snap: null,
  config: { empresa: Object.assign({}, EMPRESA_PADRAO), logo: null },
  recarregar: false, filtrosDesp: null, filtrosRec: null,
  get rows() { return Sis.store.mapa(TAB); },
};
function filtrosPadrao() {
  return { busca: '', de: '', ate: '', etapa: '', fornecedor: '', categoria: '', situacao: '', tipo: '' };
}
async function carregarConfig() {
  const c = await Sis.kv.get('obras-config');
  if (c) S.config = { empresa: Object.assign({}, EMPRESA_PADRAO, c.empresa || {}), logo: c.logo || null };
}
const salvarConfig = () => Sis.kv.set('obras-config', S.config);
carregarConfig();

/* ---------- categorias (valem para todas as obras) ----------
   Ficam num registro próprio, fora de qualquer obra, e sincronizam
   como os demais. Não exige alteração no banco de dados. */
const ID_CONFIG_OBRA = 'config';
const ID_CATEGORIAS = 'config-categorias';
function aplicarCategoriasDosRegistros() {
  const r = S.rows.get(ID_CATEGORIAS);
  if (r && !r.excluido && r.dados && Array.isArray(r.dados.lista) && r.dados.lista.length) definirCategorias(r.dados.lista);
  else definirCategorias(CATEGORIAS_PADRAO);
}
function salvarCategorias(lista) {
  definirCategorias(lista);
  if (S.modo !== 'nuvem') return;
  gravarLocal([{ id: ID_CATEGORIAS, grupo: ID_CONFIG_OBRA, tipo: 'config', dados: { lista: CATEGORIAS.map((c) => c.slice()) }, atualizado_em: new Date().toISOString(), excluido: false }]);
}
/** Quantas linhas de notas usam a categoria, e em quantas obras. */
function usoDaCategoria(k) {
  let linhas = 0; const obras = new Set();
  const conta = (obraId, alocs) => (alocs || []).forEach((a) => { if (a.categoria === k) { linhas++; obras.add(obraId); } });
  if (S.modo === 'nuvem') { for (const r of S.rows.values()) if (r.tipo === 'nota' && !r.excluido && r.dados) conta(r.grupo, r.dados.alocacoes); }
  else if (S.data) S.data.notas.forEach((n) => conta(S.data.id, n.alocacoes));
  return { linhas, obras: obras.size };
}
/** Passa todas as linhas de notas de uma categoria para outra, em todas as obras. */
function moverCategoriaNasNotas(de, para) {
  if (S.modo !== 'nuvem') {
    if (S.data) S.data.notas.forEach((n) => n.alocacoes.forEach((a) => { if (a.categoria === de) a.categoria = para; }));
    return;
  }
  const agora = new Date().toISOString();
  const linhas = [];
  for (const r of S.rows.values()) {
    if (r.tipo !== 'nota' || r.excluido || !r.dados || !(r.dados.alocacoes || []).some((a) => a.categoria === de)) continue;
    const dados = copia(r.dados);
    dados.alocacoes.forEach((a) => { if (a.categoria === de) a.categoria = para; });
    linhas.push(Object.assign({}, r, { dados, atualizado_em: agora }));
  }
  gravarLocal(linhas);
  if (S.data) recarregarObraAtual();
}

/* ---------- registros <-> obra ---------- */
function ordenarChaves(v) {
  if (Array.isArray(v)) return v.map(ordenarChaves);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = ordenarChaves(v[k]); }); return o; }
  return v;
}
const estavel = (v) => JSON.stringify(ordenarChaves(v));
const copia = (v) => JSON.parse(JSON.stringify(v));

function mapaEntidades(d) {
  const m = new Map();
  const put = (id, tipo, dados) => { const j = estavel(dados); m.set(id, { tipo, j }); };
  const sem = (o) => { const x = Object.assign({}, o); delete x.id; return x; };
  const obraGravar = Object.assign({}, d.obra); delete obraGravar.cliente; delete obraGravar.endereco;
  put(d.id, 'obra', { obra: obraGravar, orcamentoBase: d.orcamentoBase || null, criadoEm: d.meta.criadoEm || null });
  d.etapas.forEach((e, i) => put(e.id, 'etapa', { nome: e.nome, tipo: e.tipo, valor: e.valor, criadaEm: e.criadaEm || null, ordem: i }));
  d.notas.forEach((n) => put(n.id, 'nota', sem(n)));
  d.receitas.forEach((n) => put(n.id, 'receita', sem(n)));
  d.historico.forEach((h) => put(h.id, 'historico', sem(h)));
  return m;
}
function agruparPorObra() {
  const g = new Map();
  for (const r of S.rows.values()) { if (!g.has(r.grupo)) g.set(r.grupo, []); g.get(r.grupo).push(r); }
  return g;
}
function montarDoc(obraId, grupo) {
  const rows = grupo || [...S.rows.values()].filter((r) => r.grupo === obraId);
  const ob = rows.find((r) => r.tipo === 'obra' && !r.excluido);
  if (!ob) return null;
  const vivos = rows.filter((r) => !r.excluido);
  const de = (tipo) => vivos.filter((r) => r.tipo === tipo).map((r) => Object.assign(copia(r.dados), { id: r.id }));
  const maxNum = (tipo) => rows.filter((r) => r.tipo === tipo).reduce((m, r) => Math.max(m, Number(r.dados && r.dados.numero) || 0), 0);
  const o = copia(ob.dados);
  const etapas = de('etapa').sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.criadaEm || '').localeCompare(String(b.criadaEm || '')));
  const ultima = rows.reduce((m, r) => (Date.parse(r.atualizado_em) > m ? Date.parse(r.atualizado_em) : m), 0);
  const doc = {
    id: obraId, obra: o.obra || {}, orcamentoBase: o.orcamentoBase || null,
    etapas, notas: de('nota'), receitas: de('receita'),
    historico: de('historico').sort((a, b) => String(a.data || '').localeCompare(String(b.data || ''))),
    seq: { nota: maxNum('nota'), receita: maxNum('receita') },
    meta: { criadoEm: o.criadoEm || ob.atualizado_em, atualizadoEm: ultima ? new Date(ultima).toISOString() : ob.atualizado_em, revisao: 0 },
  };
  const d = migrar(doc);
  d.id = obraId;
  d.obra.cliente = Sis.clientes.nome(d.obra.clienteId) || '';
  d.obra.endereco = Sis.clientes.endereco(d.obra.clienteId) || '';
  return d;
}
function listaObras() {
  const g = agruparPorObra();
  const ordem = { em_andamento: 0, a_iniciar: 1, concluida: 2 };
  const out = [];
  for (const [id, rows] of g) { if (id === ID_CONFIG_OBRA) continue; const d = montarDoc(id, rows); if (d) out.push(d); }
  return out.sort((a, b) => (ordem[a.obra.status] ?? 9) - (ordem[b.obra.status] ?? 9) || a.obra.nome.localeCompare(b.obra.nome, 'pt-BR'));
}


/* ---------- gravação ---------- */
function gravarLocal(linhas) {
  if (!linhas.length) return;
  Sis.store.gravar(TAB, linhas.map((r) => ({ id: r.id, tipo: r.tipo, grupo: r.grupo, dados: r.dados, atualizado_em: r.atualizado_em, excluido: !!r.excluido })));
}
/** Compara a obra aberta com a última versão conhecida e grava só o que mudou. */
function registrarMudancas() {
  if (!S.data) return;
  const atual = mapaEntidades(S.data);
  const ant = S.snap || new Map();
  const agora = new Date().toISOString();
  const linhas = [];
  for (const [id, e] of atual) {
    const a = ant.get(id);
    if (!a || a.j !== e.j) linhas.push({ id, grupo: S.data.id, tipo: e.tipo, dados: JSON.parse(e.j), atualizado_em: agora, excluido: false });
  }
  for (const [id, a] of ant) {
    if (!atual.has(id)) linhas.push({ id, grupo: S.data.id, tipo: a.tipo, dados: JSON.parse(a.j), atualizado_em: agora, excluido: true });
  }
  S.snap = atual;
  gravarLocal(linhas);
}
function alterado(rerender = true) {
  if (!S.data) return;
  S.data.meta.atualizadoEm = new Date().toISOString();
  registrarMudancas();
  if (rerender) render();
}
function atualizarIndicador() { /* a situação da sincronização fica no menu do sistema */ }
function atualizarRecenteAtual() { /* nada a fazer: a lista de obras é montada na hora */ }
function recarregarObraAtual() {
  if (!S.data) return;
  const d = montarDoc(S.data.id);
  if (!d) { S.data = null; toast('Esta obra foi excluída em outro aparelho.'); Sis.ir('#/obras'); return; }
  S.data = d;
  S.snap = mapaEntidades(d);
  corrigirNumeracao();
  render();
}
/** Duas notas (ou receitas) com o mesmo número só acontecem se dois aparelhos lançarem sem internet ao mesmo tempo. */
function corrigirNumeracao() {
  const d = S.data;
  let mudou = false;
  for (const cfg of [LANC.despesa, LANC.receita]) {
    const todos = [...S.rows.values()].filter((r) => r.grupo === d.id && r.tipo === cfg.chave.replace('despesa', 'nota'));
    let max = todos.reduce((m, r) => Math.max(m, Number(r.dados && r.dados.numero) || 0), 0);
    const porCod = new Map();
    d[cfg.col].forEach((n) => { const k = chaveCodigo(n.codigo); if (!porCod.has(k)) porCod.set(k, []); porCod.get(k).push(n); });
    for (const [, lista] of porCod) {
      if (lista.length < 2) continue;
      lista.sort((a, b) => String(a.criadaEm || '').localeCompare(String(b.criadaEm || '')));
      for (const n of lista.slice(1)) {
        const antes = n.codigo;
        const novo = proximoCodigo(cfg, d, max);
        max = novo.numero; n.numero = novo.numero; n.codigo = novo.codigo;
        toast(`${antes} foi lançada em dois aparelhos ao mesmo tempo. A mais recente passou a ser ${n.codigo}.`);
        mudou = true;
      }
    }
    d.seq[cfg.seq] = Math.max(d.seq[cfg.seq], max);
  }
  if (mudou) registrarMudancas();
}

/* ---------- abrir, criar e excluir obras ---------- */
function abrirObra(id) { Sis.ir('#/obras/' + encodeURIComponent(id) + '/painel'); }
/** Monta a obra a partir dos registros gravados (chamado a cada vez que a tela da obra abre). */
function carregarObra(id) {
  const d = montarDoc(id);
  if (!d) return false;
  const mesma = S.data && S.data.id === id;
  S.data = d; S.snap = mapaEntidades(d);
  if (!mesma || !S.filtrosDesp) { S.filtrosDesp = filtrosPadrao(); S.filtrosRec = filtrosPadrao(); }
  corrigirNumeracao();
  return true;
}
function criarObra(campos) {
  const d = novaObraDados(campos);
  d.id = uid();
  S.data = d; S.snap = new Map();
  S.filtrosDesp = filtrosPadrao(); S.filtrosRec = filtrosPadrao();
  registrarMudancas();
  Sis.ir('#/obras/' + d.id + '/etapas');
  toast('Obra criada. Agora cadastre as etapas e os custos previstos.');
}
async function excluirObra() {
  const d = S.data;
  const ok = await confirmar({ titulo: 'Excluir esta obra?', msg: `A obra "${d.obra.nome}" e todos os seus lançamentos (${d.notas.length} notas e ${d.receitas.length} receitas) serão excluídos de todos os aparelhos.\nFaça antes uma exportação se quiser guardar uma cópia.`, ok: 'Excluir obra', perigo: true });
  if (!ok) return;
  const agora = new Date().toISOString();
  const linhas = [...S.rows.values()].filter((r) => r.grupo === d.id && !r.excluido).map((r) => Object.assign({}, r, { excluido: true, atualizado_em: agora }));
  S.data = null; S.snap = null;
  gravarLocal(linhas);
  Sis.ir('#/obras');
  toast('Obra excluída.');
}

/* ---------- exportar / importar ---------- */
function baixarArquivo(nome, conteudo, tipo = 'application/json') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function escolherArquivoLocal(accept, multiplo, cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.multiple = !!multiplo; inp.style.display = 'none';
  inp.addEventListener('change', () => { if (inp.files && inp.files.length) cb(Array.from(inp.files)); inp.remove(); });
  document.body.appendChild(inp);
  inp.click();
}
function exportarDados() {
  baixarArquivo(`${slug(S.data.obra.nome)}_${hojeISO()}.json`, JSON.stringify(Object.assign({}, S.data, { categorias: CATEGORIAS }), null, 1));
}
/** Gera novos identificadores para todos os itens (usado ao importar como cópia ou arquivos da versão local). */
function novosIds(d) {
  const mapa = new Map();
  const novo = (velho) => { if (!velho) return uid(); if (!mapa.has(velho)) mapa.set(velho, uid()); return mapa.get(velho); };
  d.id = uid();
  d.etapas.forEach((e) => { e.id = novo(e.id); });
  const lancs = (lista) => lista.forEach((n) => { n.id = uid(); n.alocacoes.forEach((a) => { a.id = uid(); a.etapaId = novo(a.etapaId); }); });
  lancs(d.notas); lancs(d.receitas);
  d.historico.forEach((h) => { h.id = uid(); if (h.etapaId) h.etapaId = novo(h.etapaId); });
  if (d.orcamentoBase) {
    const et = {}, nm = {};
    Object.keys(d.orcamentoBase.etapas || {}).forEach((k) => { et[novo(k)] = d.orcamentoBase.etapas[k]; });
    Object.keys(d.orcamentoBase.nomes || {}).forEach((k) => { nm[novo(k)] = d.orcamentoBase.nomes[k]; });
    d.orcamentoBase.etapas = et; d.orcamentoBase.nomes = nm;
  }
  return d;
}
function importarObra() {
  escolherArquivoLocal('.json,application/json', false, async (files) => {
    let d;
    try {
      const j = JSON.parse(await files[0].text());
      d = migrar(j);
      if (!d.obra.clienteId && d.obra.cliente) { const c = Sis.clientes.porNome(d.obra.cliente); d.obra.clienteId = c ? c.id : Sis.clientes.criar(d.obra.cliente, d.obra.endereco || ''); }
      if (j.id) d.id = j.id;
      const novas = (Array.isArray(j.categorias) ? j.categorias : []).filter((c) => Array.isArray(c) && c[0] && !CAT_NOME[c[0]]);
      if (novas.length) { salvarCategorias(CATEGORIAS.concat(novas)); toast(`Categorias incluídas pelo arquivo: ${novas.map((c) => c[1]).join(', ')}`); }
    } catch (e) { alerta({ titulo: 'Arquivo inválido', msg: e.message }); return; }
    d.historico.forEach((h) => { if (!h.id) h.id = uid(); });
    const idsOk = d.id && UUID_RE.test(d.id) && d.etapas.every((e) => UUID_RE.test(e.id)) && d.notas.concat(d.receitas).every((n) => UUID_RE.test(n.id));
    const existe = idsOk && montarDoc(d.id);
    if (existe) {
      const op = await escolher({ titulo: 'Esta obra já existe', msg: `O arquivo "${files[0].name}" é da obra "${d.obra.nome}", que já está cadastrada.\nSubstituir os dados atuais pelos do arquivo, ou criar uma cópia separada?`, opcoes: [{ v: 'substituir', rot: 'Substituir os dados atuais', primario: true }, { v: 'copia', rot: 'Criar cópia' }] });
      if (!op) return;
      if (op === 'substituir') {
        S.data = d; S.snap = mapaEntidades(existe);
        registrarMudancas(); abrirObra(d.id);
        toast('Dados da obra substituídos pelo arquivo.');
        return;
      }
    }
    if (!idsOk || existe) novosIds(d);
    if (existe) d.obra.nome += ' (cópia)';
    S.data = d; S.snap = new Map();
    S.filtrosDesp = filtrosPadrao(); S.filtrosRec = filtrosPadrao();
    registrarMudancas(); abrirObra(d.id);
    toast(`Obra "${d.obra.nome}" importada.`);
  });
}


/* =========================================================
   Interface: janelas e avisos vêm do núcleo do sistema
   ========================================================= */
const abrirModal = (o) => Sis.ui.abrirModal(o);
const confirmar = (o) => Sis.ui.confirmar(o);
const alerta = (o) => Sis.ui.alerta(o);
const escolher = (o) => Sis.ui.escolher(o);
const toast = (m, t) => Sis.ui.toast(m, t);

/* ---------- dica flutuante dos gráficos (mouse e toque) ---------- */
const _tip = document.createElement('div');
_tip.className = 'tip';
function mostrarTip(el, x, y) {
  if (_tip._el !== el) { _tip.innerHTML = el.getAttribute('data-tip'); _tip._el = el; }
  const w = _tip.offsetWidth, h = _tip.offsetHeight;
  let px = x + 14, py = y + 14;
  if (px + w > innerWidth - 8) px = Math.max(8, x - w - 14);
  if (py + h > innerHeight - 8) py = Math.max(8, y - h - 14);
  _tip.style.left = px + 'px'; _tip.style.top = py + 'px';
  _tip.classList.add('on');
}
document.addEventListener('mousemove', (e) => {
  if (matchMedia('(hover: none)').matches) return;
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) { _tip.classList.remove('on'); return; }
  mostrarTip(el, e.clientX, e.clientY);
});
let _tipTimer = null;
document.addEventListener('click', (e) => {
  if (!matchMedia('(hover: none)').matches) return;
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el || e.target.closest('[data-act]')) { _tip.classList.remove('on'); return; }
  _tip._el = null;
  mostrarTip(el, e.clientX, e.clientY);
  clearTimeout(_tipTimer); _tipTimer = setTimeout(() => _tip.classList.remove('on'), 3500);
});
document.addEventListener('scroll', () => _tip.classList.remove('on'), true);
const tipLinha = (cor, rot, val) => `<div class="r"><span>${cor ? `<i class="k" style="background:${cor}"></i>` : ''}${esc(rot)}</span><b>${esc(val)}</b></div>`;

/* ---------- ações (delegação de cliques) ---------- */
const ACOES = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACOES[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

/* ---------- marca ---------- */
const logoAtual = () => S.config.logo || LOGO_PADRAO;
const marcaHTML = () => `<img src="${logoAtual()}" alt="${esc(S.config.empresa.nome)}">`;


/* ---------- estrutura ---------- */
const VIEWS = [
  ['painel', 'Painel', 'painel'],
  ['obra', 'Dados da obra', 'obra'],
  ['etapas', 'Etapas e orçamento', 'etapas'],
  ['notas', 'Notas e despesas', 'notas'],
  ['receitas', 'Receitas', 'receita'],
  ['relatorios', 'Relatórios', 'relatorios'],
];
let raiz = null;
function render() {
  if (!raiz || Sis.rota().mod !== 'obras' || !document.body.contains(raiz)) { Sis.desenhar(true); return; }
  if (!S.data) { raiz.innerHTML = telaObras(); return; }
  const o = S.data.obra;
  const viewFn = { painel: viewPainel, obra: viewObra, etapas: viewEtapas, notas: viewNotas, receitas: viewReceitas, relatorios: viewRelatorios }[S.view] || viewPainel;
  raiz.innerHTML = `<div class="ob-topo"><a class="btn icon" href="#/obras" aria-label="Voltar para a lista de obras">${ic('voltar')}</a>
      <div class="tit"><b>${esc(o.nome || 'Obra sem nome')}</b><span>${esc([o.cliente, o.endereco].filter(Boolean).join(', ') || 'Cadastre os dados da obra')}</span></div>
      <span class="chip st-${o.status} so-pc">${STATUS_NOME[o.status]}</span></div>
    <nav class="ob-abas" aria-label="Seções da obra">${VIEWS.map(([k, rot, i]) => `<a href="#/obras/${encodeURIComponent(S.data.id)}/${k}" class="${S.view === k ? 'ativo' : ''}">${ic(i)}${rot}</a>`).join('')}</nav>
    <div class="ob-view">${viewFn()}</div>`;
  posRender();
}
const irView = (v) => { if (S.data) Sis.ir('#/obras/' + encodeURIComponent(S.data.id) + '/' + v); };
ACOES.ir = (el) => irView(el.dataset.v);

/* ---------- lista de obras ---------- */
function telaObras() {
  const obras = listaObras();
  const cards = obras.map((d) => {
    const c = calcular(d);
    const t = c.totais;
    const w = t.orcAtualizado > 0 ? Math.min(100, (t.lancado / t.orcAtualizado) * 100) : 0;
    const wP = t.orcAtualizado > 0 ? Math.min(w, (t.pago / t.orcAtualizado) * 100) : 0;
    const alertas = c.etapas.filter((r) => r.status === 'estourado').length;
    return `<button class="obra-card" data-act="abrir-obra" data-id="${d.id}">
      <div class="oc-top"><b>${esc(d.obra.nome || 'Obra sem nome')}</b><span class="chip st-${d.obra.status}">${STATUS_NOME[d.obra.status]}</span></div>
      <span class="oc-sub">${esc([d.obra.cliente, REGIME_NOME[d.obra.regime] && d.obra.regime ? REGIME_NOME[d.obra.regime] : ''].filter(Boolean).join(', ') || 'Sem cliente informado')}</span>
      <div class="oc-num"><span>Custo lançado <b>${brl(t.lancado)}</b> de ${brl(t.orcAtualizado)}</span></div>
      <div class="meter"><i class="p" style="width:${wP}%"></i><i class="a" style="left:${wP}%;width:${w - wP}%"></i></div>
      <div class="oc-pe"><span>${t.receita > EPS ? `Resultado <b class="${t.resultado < -EPS ? 'neg' : ''}">${brl(t.resultado)}</b>` : `${d.etapas.length} etapa(s), ${d.notas.length} nota(s)`}</span>${alertas ? `<span class="chip estourado">${ic('alerta')}${alertas} acima do previsto</span>` : ''}</div>
    </button>`;
  }).join('');
  return `<div class="pagehead"><div><h1>Obras</h1><p>${obras.length ? `${obras.length} ${obras.length === 1 ? 'obra cadastrada' : 'obras cadastradas'}` : 'Nenhuma obra cadastrada ainda'}</p></div>
      <div class="actions"><button class="btn" data-act="importar" title="Importar uma obra exportada em .json">${ic('enviar')}Importar obra</button><button class="btn primary" data-act="nova-obra">${ic('mais')}Nova obra</button></div></div>
    ${obras.length ? `<div class="obras-grid">${cards}</div>` : `<div class="card"><div class="empty"><b>Comece cadastrando a primeira obra</b>Depois cadastre as etapas com o custo previsto e lance as notas e receitas.</div></div>`}`;
}
ACOES['abrir-obra'] = (el) => abrirObra(el.dataset.id);
ACOES['nova-obra'] = () => modalNovaObra();

function modalNovaObra() {
  let sel;
  const corpo = `<div class="grid2">
    <label class="f req span2"><span>Nome da obra</span><input class="inp" name="nome" autofocus placeholder="Impermeabilização da cobertura"></label>
    <div class="span2" data-q="cliente"></div>
    <label class="f"><span>Data de início</span><input class="inp" type="date" name="dataInicio"></label>
    <label class="f"><span>Status</span><select class="inp" name="status">${STATUS_OBRA.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="f span2"><span>Regime de contratação</span><select class="inp" name="regime">${REGIMES.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
  </div>`;
  abrirModal({
    titulo: 'Nova obra', corpo,
    aoAbrir: (el) => { sel = Sis.seletorCliente($('[data-q=cliente]', el), { obrigatorio: true }); },
    botoes: [
      { rot: 'Cancelar' },
      {
        rot: 'Criar obra', classe: 'primary', icone: 'check',
        acao: (m) => {
          const campos = Object.fromEntries($$('[name]', m.el).map((i) => [i.name, i.value.trim()]));
          if (!campos.nome) { $('[name=nome]', m.el).classList.add('erro'); $('[name=nome]', m.el).focus(); return; }
          const erro = sel.validar();
          if (erro) { toast(erro); sel.focar(); return; }
          campos.clienteId = sel.valor().clienteId;
          m.fechar();
          criarObra(campos);
        },
      },
    ],
  });
}

/* =========================================================
   Gráficos (HTML puro, funcionam off-line e na impressão)
   Cores: pago #C43E50 · a pagar #E58A97 · lançado #3D6FA8
   ========================================================= */

function passoBonito(x) {
  if (x <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
/** Escolhe entre 4 e 5 divisões a escala que deixa menos espaço vazio acima do maior valor. */
function escalaBonita(max) {
  const m = Math.max(max, 1);
  let melhor = null;
  for (const div of [4, 5]) {
    const passo = passoBonito(m / div);
    const topo = passo * Math.ceil(m / passo);
    if (!melhor || topo < melhor.topo - EPS) melhor = { topo, passo };
  }
  const ticks = [];
  for (let v = 0; v <= melhor.topo + melhor.passo / 2; v += melhor.passo) ticks.push(v);
  return { topo: melhor.topo, ticks };
}
const COR = { pago: '#C43E50', aPagar: '#E58A97', lancado: '#3D6FA8', previsto: '#1F2328' };

function legendaEtapas() {
  return `<div class="legend"><span><i class="sw p"></i>Pago</span><span><i class="sw a"></i>Lançado a pagar</span><span><i class="sw t"></i>Valor previsto</span><span><i class="sw h"></i>Acima do previsto</span></div>`;
}

/** Barras horizontais tipo "bullet": trilho = previsto, marca vertical = previsto, preenchimento = pago + a pagar. */
function graficoEtapas(calc, rows) {
  const lista = rows || calc.etapas;
  if (!lista.length) return '<div class="empty">Nenhuma etapa cadastrada.</div>';
  const max = Math.max(1, ...lista.map((r) => Math.max(r.previsto, r.lancado)));
  const esc_ = escalaBonita(max);
  const temAditivo = lista.some((r) => r.etapa.tipo === 'aditivo');
  let html = '<div class="hbars">';
  for (const [t, rot] of [['previsto', 'Escopo original'], ['aditivo', 'Aditivos (serviços solicitados pelo cliente)']]) {
    const grupo = lista.filter((r) => r.etapa.tipo === t);
    if (!grupo.length) continue;
    if (temAditivo) html += `<div class="hb-grp">${rot}</div>`;
    for (const r of grupo) html += barraEtapa(r, esc_.topo);
  }
  html += '</div>' + eixoX(esc_);
  return html;
}
function barraEtapa(r, topo, comValores = false) {
  const w = (v) => Math.max(0, (v / topo) * 100).toFixed(3) + '%';
  const tip = `<b>${esc(r.etapa.nome)}</b> · ${TIPO_NOME[r.etapa.tipo]}`
    + tipLinha('', 'Previsto', brl(r.previsto))
    + tipLinha(COR.pago, 'Pago', brl(r.pago))
    + tipLinha(COR.aPagar, 'A pagar', brl(r.aPagar))
    + tipLinha('', 'Lançado', brl(r.lancado))
    + tipLinha('', r.saldo >= 0 ? 'Saldo' : 'Excedente', brl(Math.abs(r.saldo)))
    + tipLinha('', 'Consumo', r.previsto > 0 ? pct(r.pct) : 'sem previsto');
  let segs = '';
  if (r.previsto > 0) segs += `<div class="bg" style="width:${w(r.previsto)}"></div>`;
  const temAPagar = r.aPagar > EPS;
  if (r.pago > EPS) segs += `<div class="sg p ${temAPagar ? '' : 'end'}" style="left:0;width:${w(r.pago)}"></div>`;
  if (temAPagar) segs += `<div class="sg a end" style="left:${w(r.pago)};width:${w(r.aPagar)}"></div>`;
  if (r.lancado > r.previsto + EPS) segs += `<div class="ov" style="left:${w(r.previsto)};width:${w(r.lancado - r.previsto)}"></div>`;
  if (r.previsto > 0) segs += `<div class="tg" style="left:${w(r.previsto)}"></div>`;
  let linha2;
  if (r.status === 'estourado') linha2 = `<span class="chip estourado">${ic('alerta')}Excedeu ${brl(r.lancado - r.previsto)}</span>`;
  else if (r.status === 'atencao') linha2 = `<span class="chip atencao">${ic('info')}Saldo ${brl(r.saldo)}</span>`;
  else linha2 = `<span class="muted">Saldo ${brl(r.saldo)}</span>`;
  const linha1 = r.previsto > 0 ? `<span><b>${pct(r.pct)}</b> <span class="muted">do previsto</span></span>` : `<span class="muted">Sem valor previsto</span>`;
  const nome = comValores ? `<div class="nm2"><b>${esc(r.etapa.nome)}</b><small>${brl(r.lancado)} de ${brl(r.previsto)}</small></div>` : `<div class="nm" title="${esc(r.etapa.nome)}">${esc(r.etapa.nome)}</div>`;
  return `<div class="hb" data-tip="${esc(tip)}">${nome}<div class="trk">${segs}</div><div class="vals">${linha1}${linha2}</div></div>`;
}
function eixoX(esc_) {
  return `<div class="axis-x"><div></div><div class="ticks">${esc_.ticks.map((v) => `<span style="left:${((v / esc_.topo) * 100).toFixed(2)}%">${v === 0 ? '0' : brlCurto(v)}</span>`).join('')}</div><div></div></div>`;
}

/** Totais por tipo (Previsto x Aditivo): custo previsto x custo lançado com o mesmo tipo. */
function graficoTipos(calc) {
  const P = calc.porTipo;
  const rows = [['previsto', 'Escopo original'], ['aditivo', 'Aditivos']].map(([t, nome]) => {
    const p = P[t];
    return { etapa: { nome, tipo: t }, previsto: p.orcado, lancado: p.lancado, pago: p.pago, aPagar: p.aPagar, saldo: p.saldo, pct: p.pct, status: p.status };
  });
  const topo = Math.max(1, ...rows.map((r) => Math.max(r.previsto, r.lancado)));
  return '<div class="hbars tipos">' + rows.map((r) => barraEtapa(r, topo, true)).join('') + '</div>';
}

const COR_FLUXO = { recebido: '#3D6FA8', aReceber: '#93B1D6', pago: '#C43E50', aPagar: '#E58A97' };
function legendaFluxo() {
  return `<div class="legend"><span><i class="sw r"></i>Recebido</span><span><i class="sw rl"></i>A receber</span><span><i class="sw p"></i>Pago</span><span><i class="sw a"></i>A pagar</span></div>`;
}
/** Fluxo mensal: por mês, uma coluna de entradas (recebido + a receber) e uma de saídas (pago + a pagar). */
function graficoFluxo(calc, ultimos = 0) {
  let meses = calc.meses;
  if (!meses.length) return '<div class="empty">Ainda não há lançamentos.</div>';
  if (ultimos && meses.length > ultimos) meses = meses.slice(-ultimos);
  const max = Math.max(1, ...meses.map((m) => Math.max(m.entradas, m.saidas)));
  const e = escalaBonita(max);
  const grid = e.ticks.map((v) => `<div class="yg" style="top:calc((100% - 24px) * ${1 - v / e.topo})"><span>${v === 0 ? '0' : brlCurto(v)}</span></div>`).join('');
  const pilha = (cls, solido, claro) => {
    const tot = solido + claro;
    if (tot <= EPS) return `<div class="stk" style="height:0"></div>`;
    const segs = (claro > EPS ? `<div class="s ${cls}l" style="flex-grow:${claro}"></div>` : '') + (solido > EPS ? `<div class="s ${cls}" style="flex-grow:${solido}"></div>` : '');
    return `<div class="stk" style="height:${(tot / e.topo) * 100}%">${segs}</div>`;
  };
  const cols = meses.map((m) => {
    const tip = `<b>${mesRotulo(m.k, true)}${m.futuro ? ' (previsto)' : ''}</b>` + tipLinha(COR_FLUXO.recebido, 'Recebido', brl(m.recebido)) + tipLinha(COR_FLUXO.aReceber, 'A receber', brl(m.aReceber)) + tipLinha(COR_FLUXO.pago, 'Pago', brl(m.pago)) + tipLinha(COR_FLUXO.aPagar, 'A pagar', brl(m.aPagar)) + tipLinha('', 'Saldo do mês', brl(m.saldoMes)) + tipLinha('', 'Saldo acumulado', brl(m.acumulado));
    return `<div class="cg" data-tip="${esc(tip)}">${pilha('r', m.recebido, m.aReceber)}${pilha('p', m.pago, m.aPagar)}</div>`;
  }).join('');
  const rot = meses.map((m) => `<span class="${m.futuro ? 'fut' : ''}">${mesRotulo(m.k)}</span>`).join('');
  return `${legendaFluxo()}<div class="colchart">${grid}<div class="cols">${cols}</div><div class="xl">${rot}</div></div>`;
}

/** Categorias: barras horizontais (pago + a pagar), escala comum. */
function graficoCategorias(calc) {
  const total = calc.totais.lancado;
  const linhas = categoriasComValores(calc.categorias).map(([k, nome]) => Object.assign({ k, nome }, calc.categorias[k] || { lancado: 0, pago: 0, aPagar: 0 }));
  const topo = Math.max(1, ...linhas.map((l) => l.lancado));
  const w = (v) => ((v / topo) * 100).toFixed(3) + '%';
  return '<div class="hbars cat">' + linhas.map((l) => {
    const tip = `<b>${l.nome}</b>` + tipLinha(COR.pago, 'Pago', brl(l.pago)) + tipLinha(COR.aPagar, 'A pagar', brl(l.aPagar)) + tipLinha('', 'Lançado', brl(l.lancado)) + tipLinha('', 'Participação', total ? pct(l.lancado / total, 1) : '0%');
    const temA = l.aPagar > EPS;
    let segs = '';
    if (l.pago > EPS) segs += `<div class="sg p ${temA ? '' : 'end'}" style="left:0;width:${w(l.pago)}"></div>`;
    if (temA) segs += `<div class="sg a end" style="left:${w(l.pago)};width:${w(l.aPagar)}"></div>`;
    return `<div class="hb" data-tip="${esc(tip)}"><div class="nm">${l.nome}</div><div class="trk">${segs}</div><div class="vals"><b>${brl(l.lancado)}</b><span class="muted">${total ? pct(l.lancado / total, 1) : '0%'} do total</span></div></div>`;
  }).join('') + '</div>';
}

/* =========================================================
   Telas: Painel, Obra, Etapas, Relatórios, Backup
   (Notas e Receitas ficam em lancamentos.js)
   ========================================================= */

const normTxt = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sinal = (v) => (v > EPS ? '+ ' : v < -EPS ? '− ' : '') + brl(Math.abs(v));
const pctOuTraco = (v) => (v === null || v === undefined || !isFinite(v) ? '-' : pct(v, 1));

/* ======================= PAINEL ======================= */
function viewPainel() {
  const d = S.data;
  if (!d.etapas.length) {
    return `<div class="pagehead"><div><h1>Painel financeiro</h1><p>Resumo do orçamento, dos custos e das receitas da obra.</p></div></div>
      <div class="card"><div class="empty"><b>Comece pelas etapas da obra</b>Cadastre as etapas macro e o custo previsto de cada uma. Depois lance as notas e as receitas.<br><br>
      <button class="btn primary" data-act="ir" data-v="etapas">${ic('etapas')}Cadastrar etapas</button></div></div>`;
  }
  const c = calcular(d);
  const t = c.totais;
  const consumo = t.orcAtualizado > 0 ? t.lancado / t.orcAtualizado : 0;
  const wP = t.orcAtualizado > 0 ? Math.min(100, (t.pago / t.orcAtualizado) * 100) : 0;
  const wA = t.orcAtualizado > 0 ? Math.min(100 - wP, (t.aPagar / t.orcAtualizado) * 100) : 0;
  const ajuste = Math.abs(t.ajustes) > EPS ? `<span>Ajustes no escopo <b>${sinal(t.ajustes)}</b></span>` : '';
  const kpis = `<div class="kpis">
    <div class="kpi hero"><div class="lb">Orçamento de custo atualizado</div><div class="vl">${brl(t.orcAtualizado)}</div>
      <div class="comp"><span>Original <b>${brl(t.orcOriginal)}</b></span>${ajuste}<span>Aditivos <b>${brl(t.aditivos)}</b></span></div>
      <div class="meter" data-tip="${esc(`<b>Consumo do orçamento de custo</b>${tipLinha(COR.pago, 'Pago', pct(t.pago / (t.orcAtualizado || 1), 1))}${tipLinha(COR.aPagar, 'A pagar', pct(t.aPagar / (t.orcAtualizado || 1), 1))}`)}"><i class="p" style="width:${wP}%"></i><i class="a" style="left:${wP}%;width:${wA}%"></i></div>
      <div class="sb">${pct(consumo, 1)} do orçamento já lançado${d.orcamentoBase ? '' : ' · orçamento original ainda não fixado'}</div></div>
    <div class="kpi"><div class="lb">Custo lançado</div><div class="vl">${brl(t.lancado)}</div><div class="sb">${t.nNotas} nota${t.nNotas === 1 ? '' : 's'} registrada${t.nNotas === 1 ? '' : 's'}</div></div>
    <div class="kpi"><div class="lb">Pago</div><div class="vl">${brl(t.pago)}</div><div class="sb">Notas com data de pagamento até hoje</div></div>
    <div class="kpi"><div class="lb">A pagar</div><div class="vl">${brl(t.aPagar)}</div><div class="sb">${t.nPendentes} nota${t.nPendentes === 1 ? '' : 's'} com data futura</div></div>
    <div class="kpi"><div class="lb">Saldo do orçamento</div><div class="vl ${t.saldo < -EPS ? 'neg' : ''}">${brl(t.saldo)}</div><div class="sb">Orçamento atualizado menos custo lançado</div></div>
  </div>`;

  return `<div class="pagehead"><div><h1>Painel financeiro</h1><p>Atualizado em ${dataHoraBR(d.meta.atualizadoEm)}</p></div>
      <div class="actions"><button class="btn" data-act="nova-lanc" data-k="despesa">${ic('mais')}Lançar nota</button><button class="btn" data-act="nova-lanc" data-k="receita">${ic('mais')}Lançar receita</button><button class="btn primary so-pc" data-act="imprimir" data-tipo="gerencial">${ic('imprimir')}Imprimir relatório gerencial</button></div></div>
    ${kpis}
    <div class="cards">
      <div class="row2b">
        <div class="card"><div class="hd"><div><h3>Previsto x realizado por tipo</h3><p>Custo previsto das etapas comparado ao custo lançado como Previsto ou Aditivo nas notas</p></div></div>
          <div class="bd">${legendaEtapas()}<div style="margin-top:8px">${graficoTipos(c)}</div></div></div>
        <div class="card"><div class="hd"><div><h3>Resultado da obra</h3><p>Receitas lançadas menos custos lançados</p></div><button class="btn sm" data-act="ir" data-v="receitas">Ver receitas</button></div>
          <div class="bd">${resultadoHTML(c)}</div></div>
      </div>
      <div class="card"><div class="hd"><div><h3>Orçado x executado por etapa</h3><p>Barra preenchida = custo lançado (pago + a pagar). Traço vertical = custo previsto atual da etapa.</p></div>${legendaEtapas()}</div>
        <div class="bd">${graficoEtapas(c)}</div></div>
      <div class="row2">
        <div class="card"><div class="hd"><h3>Alertas de orçamento</h3></div><div class="bd">${alertasHTML(c)}</div></div>
        <div class="card"><div class="hd"><div><h3>Contas a pagar</h3><p>Notas com data de pagamento futura</p></div>${c.pendentes.length ? `<button class="btn sm" data-act="ver-pendentes">Ver todas</button>` : ''}</div>
          <div class="bd flush">${tabelaPendentes(c.pendentes.slice(0, 8), true)}</div></div>
      </div>
      <div class="row2b">
        <div class="card"><div class="hd"><div><h3>Fluxo mensal</h3><p>Entradas (receitas) e saídas (notas) pela data de pagamento ou recebimento</p></div></div><div class="bd">${graficoFluxo(c, 18)}</div></div>
        <div class="card"><div class="hd"><div><h3>Custos por categoria</h3><p>Custo lançado, dividido em pago e a pagar</p></div><div class="legend"><span><i class="sw p"></i>Pago</span><span><i class="sw a"></i>A pagar</span></div></div><div class="bd">${graficoCategorias(c)}</div></div>
      </div>
      <div class="card"><div class="hd"><div><h3>Principais fornecedores</h3><p>Ordenados pelo custo lançado</p></div><button class="btn sm" data-act="ir" data-v="relatorios">Ver todos</button></div>
        <div class="bd flush">${tabelaFornecedores(c.fornecedores.slice(0, 8))}</div></div>
    </div>`;
}

function resultadoHTML(c, impressao = false) {
  const t = c.totais, P = c.porTipo;
  const box = (rot, val, sub, neg) => `<div class="res-it"><span>${rot}</span><b class="${neg ? 'neg' : ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const topo = `<div class="res-grid">
    ${box('Receitas lançadas', brl(t.receita), `Recebido ${brl(t.recebido)} · a receber ${brl(t.aReceber)}`)}
    ${box('Custos lançados', brl(t.lancado), `Pago ${brl(t.pago)} · a pagar ${brl(t.aPagar)}`)}
    ${box('Resultado', brl(t.resultado), t.margem === null ? 'Sem receitas lançadas' : `Margem de ${pct(t.margem, 1)} sobre as receitas`, t.resultado < -EPS)}
    ${box('Caixa realizado', brl(t.caixa), 'Recebido menos pago até hoje', t.caixa < -EPS)}
  </div>`;
  const linha = (rot, p) => `<tr><td>${rot}</td><td class="num">${brl(p.receita)}</td><td class="num">${brl(p.lancado)}</td><td class="num ${p.resultado < -EPS ? 'neg' : ''}">${brl(p.resultado)}</td><td class="num">${pctOuTraco(p.margem)}</td></tr>`;
  const tabela = `<div class="tblwrap" style="margin-top:12px"><table class="${impressao ? '' : 'tbl'}"><thead><tr><th>Tipo</th><th class="num">Receita</th><th class="num">Custo</th><th class="num">Resultado</th><th class="num">Margem</th></tr></thead><tbody>
    ${linha('Escopo original (Previsto)', P.previsto)}${linha('Aditivos', P.aditivo)}</tbody>
    <tfoot><tr class="tot"><td>Total</td><td class="num">${brl(t.receita)}</td><td class="num">${brl(t.lancado)}</td><td class="num ${t.resultado < -EPS ? 'neg' : ''}">${brl(t.resultado)}</td><td class="num">${pctOuTraco(t.margem)}</td></tr></tfoot></table></div>`;
  return topo + tabela;
}

function alertasHTML(c) {
  const est = c.etapas.filter((r) => r.status === 'estourado').sort((a, b) => (b.lancado - b.previsto) - (a.lancado - a.previsto));
  const at = c.etapas.filter((r) => r.status === 'atencao');
  const pa = c.porTipo.aditivo;
  const aditEstourado = pa.lancado > pa.orcado + EPS;
  let h = '<div class="alertas">';
  for (const r of est) h += `<div class="alerta estourado">${ic('alerta')}<div><b>${esc(r.etapa.nome)}</b>${r.etapa.tipo === 'aditivo' ? ' (aditivo)' : ''}: custo lançado ${brl(r.lancado)} para previsto de ${brl(r.previsto)}. Excedeu <b>${brl(r.lancado - r.previsto)}</b>${r.previsto > 0 ? ` (${pct(r.pct - 1, 1)} acima)` : ''}.</div></div>`;
  for (const r of at) h += `<div class="alerta atencao">${ic('info')}<div><b>${esc(r.etapa.nome)}</b>: ${pct(r.pct)} do custo previsto já lançado. Saldo de ${brl(r.saldo)}.</div></div>`;
  if (aditEstourado) h += `<div class="alerta estourado">${ic('alerta')}<div><b>Aditivos</b>: o custo lançado como aditivo (${brl(pa.lancado)}) supera o custo previsto para aditivos (${brl(pa.orcado)}) em <b>${brl(pa.lancado - pa.orcado)}</b>.</div></div>`;
  if (!est.length && !at.length && !aditEstourado) h += `<div class="alerta ok">${ic('ok')}<div>Nenhuma etapa acima de 90% do custo previsto.</div></div>`;
  if (!S.data.orcamentoBase) h += `<div class="alerta atencao">${ic('cadeado')}<div>O orçamento original ainda não foi fixado. <a href="#" data-act="ir" data-v="etapas">Fixar na tela de etapas</a> para preservar a referência.</div></div>`;
  return h + '</div>';
}

function tabelaPendentes(lista, comAcao) {
  if (!lista.length) return '<div class="empty">Nenhuma conta a pagar.</div>';
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Nota</th><th>Pagamento</th><th>Fornecedor / descrição</th><th class="num">Valor</th>${comAcao ? '<th></th>' : ''}</tr></thead><tbody>
    ${lista.map((n) => `<tr><td><b>${esc(n.codigo)}</b></td><td class="nowrap">${dataBR(n.dataPagamento)}</td><td>${esc(n.fornecedor)}<div class="small muted">${esc(n.descricao)}</div></td><td class="num">${brl(totalNota(n))}</td>
      ${comAcao ? `<td class="acoes"><button class="btn sm" data-act="realizar-lanc" data-k="despesa" data-id="${n.id}">${ic('check')}Pagar</button></td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}
function tabelaFornecedores(lista) {
  if (!lista.length) return '<div class="empty">Nenhum fornecedor ainda.</div>';
  const tot = lista.reduce((a, f) => ({ l: a.l + f.lancado, p: a.p + f.pago, a: a.a + f.aPagar, n: a.n + f.notas }), { l: 0, p: 0, a: 0, n: 0 });
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Fornecedor</th><th class="num">Notas</th><th class="num">Lançado</th><th class="num">Pago</th><th class="num">A pagar</th></tr></thead><tbody>
    ${lista.map((f) => `<tr><td>${esc(f.nome)}</td><td class="num">${f.notas}</td><td class="num">${brl(f.lancado)}</td><td class="num">${brl(f.pago)}</td><td class="num">${brl(f.aPagar)}</td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total</td><td class="num">${tot.n}</td><td class="num">${brl(tot.l)}</td><td class="num">${brl(tot.p)}</td><td class="num">${brl(tot.a)}</td></tr></tfoot></table></div>`;
}
ACOES['ver-pendentes'] = () => { S.filtrosDesp = Object.assign(filtrosPadrao(), { situacao: 'pend' }); irView('notas'); };

/* ======================= OBRA ======================= */
function viewObra() {
  const o = S.data.obra, d = S.data;
  return `<div class="pagehead"><div><h1>Dados da obra</h1><p>As alterações são gravadas automaticamente.</p></div></div>
  <div class="row2">
    <div class="card"><div class="bd" style="padding-top:18px"><div class="grid2">
      <label class="f req span2"><span>Nome da obra</span><input class="inp" data-campo="nome" value="${esc(o.nome)}"></label>
      <div class="span2" data-ob-cliente></div>
      <p class="small muted span2" style="margin:-6px 0 0">O endereço vem do cadastro do cliente. Para corrigir, use o link abaixo do nome ou Clientes, Cadastro.</p>
      <label class="f"><span>Data de início</span><input class="inp" type="date" data-campo="dataInicio" value="${esc(o.dataInicio)}"></label>
      <label class="f"><span>Regime de contratação</span><select class="inp" data-campo="regime">${REGIMES.map(([k, v]) => `<option value="${k}" ${o.regime === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="f span2"><span class="small" style="font-weight:500;color:var(--ink-2)">Status da obra</span>
        <div class="seg" role="group" aria-label="Status da obra">${STATUS_OBRA.map(([k, v]) => `<button data-act="status-obra" data-s="${k}" class="${o.status === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      ${o.status === 'concluida' ? `<label class="f"><span>Data de conclusão</span><input class="inp" type="date" data-campo="dataConclusao" value="${esc(o.dataConclusao)}"></label><div></div>` : ''}
      <label class="f span2"><span>Observações</span><textarea class="inp" data-campo="observacoes" rows="3" placeholder="Informações gerais, contrato, condições...">${esc(o.observacoes)}</textarea></label>
    </div></div></div>
    <div class="card"><div class="hd"><h3>Registro</h3></div><div class="bd"><dl class="kv">
      <dt>Armazenamento</dt><dd>Supabase, com cópia no aparelho</dd>
      <dt>Criada em</dt><dd>${dataHoraBR(d.meta.criadoEm)}</dd>
      <dt>Última alteração</dt><dd>${dataHoraBR(d.meta.atualizadoEm)}</dd>
      <dt>Etapas</dt><dd>${d.etapas.length}</dd>
      <dt>Notas</dt><dd>${d.notas.length}</dd>
      <dt>Receitas</dt><dd>${d.receitas.length}</dd>
      <dt>Orçamento original</dt><dd>${d.orcamentoBase ? `Fixado em ${dataHoraBR(d.orcamentoBase.fixadoEm)}` : 'Ainda não fixado'}</dd>
    </dl><div class="actions" style="margin-top:16px"><button class="btn sm" data-act="exportar">${ic('baixar')}Exportar esta obra</button><button class="btn sm danger" data-act="excluir-obra">${ic('lixo')}Excluir obra</button></div></div></div>
  </div>`;
}
ACOES['excluir-obra'] = () => excluirObra();
document.addEventListener('change', (e) => {
  const el = e.target.closest && e.target.closest('[data-campo]');
  if (!el || !S.data) return;
  const campo = el.dataset.campo;
  const v = el.value.trim();
  if (campo === 'nome' && !v) { el.classList.add('erro'); toast('O nome da obra não pode ficar em branco.'); return; }
  S.data.obra[campo] = v;
  alterado();
  if (campo === 'nome' || campo === 'cliente') atualizarRecenteAtual();
});
ACOES['status-obra'] = async (el) => {
  const s = el.dataset.s;
  const d = S.data;
  if (d.obra.status === s) return;
  d.obra.status = s;
  if (s === 'concluida' && !d.obra.dataConclusao) d.obra.dataConclusao = hojeISO();
  alterado();
  atualizarRecenteAtual();
  if (s === 'em_andamento' && !d.orcamentoBase && d.etapas.length) {
    const ok = await confirmar({ titulo: 'Fixar o orçamento original?', msg: `A obra entrou em andamento. Deseja fixar agora o orçamento original (${brl(calcular(d).totais.previstoAtual)})?\nDepois disso, as alterações de valores das etapas ficam registradas no histórico.`, ok: 'Fixar orçamento' });
    if (ok) { fixarOrcamento(d); alterado(); toast('Orçamento original fixado.'); }
  }
};

/* ======================= ETAPAS ======================= */
function viewEtapas() {
  const d = S.data;
  const c = calcular(d);
  const t = c.totais;
  const base = d.orcamentoBase;
  const banner = base
    ? `<div class="banner info"><div>${ic('cadeado').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"')}Orçamento original fixado em ${dataBR(base.fixadoEm)}: <b>${brl(base.total)}</b>. Alterações de valor, tipo e nome ficam registradas no histórico.</div>
        <button class="btn sm ghost" data-act="refixar">Redefinir orçamento original</button></div>`
    : `<div class="banner warn"><div><b>Orçamento em montagem.</b> Quando os custos previstos estiverem fechados, fixe o orçamento original. Ele fica preservado como referência e as alterações seguintes passam a ser registradas.</div>
        <button class="btn sm primary" data-act="fixar" ${d.etapas.some((e) => e.tipo === 'previsto') ? '' : 'disabled'}>${ic('cadeado')}Fixar orçamento original</button></div>`;
  const resumo = `<div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lb">Orçamento original</div><div class="vl">${brl(t.orcOriginal)}</div><div class="sb">${base ? 'Fixado' : 'Soma atual das etapas previstas'}</div></div>
    <div class="kpi"><div class="lb">Ajustes no escopo original</div><div class="vl">${sinal(t.ajustes)}</div><div class="sb">Previsto atual: ${brl(t.previstoAtual)}</div></div>
    <div class="kpi"><div class="lb">Aditivos previstos</div><div class="vl">${brl(t.aditivos)}</div><div class="sb">${d.etapas.filter((e) => e.tipo === 'aditivo').length} etapa(s) de aditivo</div></div>
    <div class="kpi"><div class="lb">Orçamento de custo atualizado</div><div class="vl">${brl(t.orcAtualizado)}</div><div class="sb">Previsto atual + aditivos</div></div>
  </div>`;
  const n = d.etapas.length;
  const linhas = c.etapas.map((r, i) => `<tr>
      <td class="nowrap"><button class="btn icon" data-act="mover-etapa" data-id="${r.etapa.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">${ic('cima')}</button><button class="btn icon" data-act="mover-etapa" data-id="${r.etapa.id}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} title="Descer" aria-label="Descer">${ic('baixo')}</button></td>
      <td><b>${esc(r.etapa.nome)}</b>${r.nAloc || r.nRec ? `<div class="tiny muted">${[r.nAloc ? `${r.nAloc} lançamento${r.nAloc === 1 ? '' : 's'} de custo` : '', r.nRec ? `${r.nRec} de receita` : ''].filter(Boolean).join(' · ')}</div>` : ''}</td>
      <td>${chipTipo(r.etapa.tipo)}</td>
      <td class="num muted">${r.etapa.tipo === 'aditivo' ? '-' : brl(r.original)}</td>
      <td class="num"><b>${brl(r.previsto)}</b></td>
      <td class="num">${brl(r.lancado)}</td>
      <td class="num">${brl(r.pago)}</td>
      <td class="num ${r.saldo < -EPS ? 'neg' : ''}">${brl(r.saldo)}</td>
      <td>${chipStatus(r.status)}</td>
      <td class="acoes"><button class="btn icon" data-act="editar-etapa" data-id="${r.etapa.id}" title="Editar" aria-label="Editar">${ic('editar')}</button><button class="btn icon" data-act="excluir-etapa" data-id="${r.etapa.id}" title="Excluir" aria-label="Excluir">${ic('lixo')}</button></td></tr>`).join('');
  const soma = (tipo) => c.etapas.filter((r) => !tipo || r.etapa.tipo === tipo).reduce((a, r) => ({ o: a.o + (r.etapa.tipo === 'previsto' ? r.original : 0), p: a.p + r.previsto, l: a.l + r.lancado, pg: a.pg + r.pago, s: a.s + r.saldo }), { o: 0, p: 0, l: 0, pg: 0, s: 0 });
  const linhaTot = (rot, s, cls = '') => `<tr class="${cls}"><td></td><td colspan="2">${rot}</td><td class="num">${brl(s.o)}</td><td class="num">${brl(s.p)}</td><td class="num">${brl(s.l)}</td><td class="num">${brl(s.pg)}</td><td class="num ${s.s < -EPS ? 'neg' : ''}">${brl(s.s)}</td><td colspan="2"></td></tr>`;
  const temAdit = d.etapas.some((e) => e.tipo === 'aditivo');
  const cartoes = c.etapas.map((r, i) => `<div class="lc">
      <div class="lc-top"><b>${esc(r.etapa.nome)}</b>${chipTipo(r.etapa.tipo)}</div>
      <div class="lc-aloc"><div><span>Custo previsto</span><b>${brl(r.previsto)}</b></div><div><span>Custo lançado</span><b>${brl(r.lancado)}</b></div><div><span>Saldo</span><b class="${r.saldo < -EPS ? 'neg' : ''}">${brl(r.saldo)}</b></div></div>
      <div class="lc-acts">${chipStatus(r.status)}<span style="flex:1"></span>
        <button class="btn icon" data-act="mover-etapa" data-id="${r.etapa.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${ic('cima')}</button><button class="btn icon" data-act="mover-etapa" data-id="${r.etapa.id}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer">${ic('baixo')}</button>
        <button class="btn icon" data-act="editar-etapa" data-id="${r.etapa.id}" aria-label="Editar">${ic('editar')}</button><button class="btn icon" data-act="excluir-etapa" data-id="${r.etapa.id}" aria-label="Excluir">${ic('lixo')}</button></div>
    </div>`).join('');
  const tabela = n ? `<div class="lista-cards" style="padding:12px">${cartoes}</div><div class="tblwrap so-pc-bloco"><table class="tbl"><thead><tr><th style="width:1%">Ordem</th><th>Etapa</th><th>Tipo</th><th class="num">Original</th><th class="num">Custo previsto</th><th class="num">Custo lançado</th><th class="num">Pago</th><th class="num">Saldo</th><th>Situação</th><th></th></tr></thead>
    <tbody>${linhas}${temAdit ? linhaTot('Subtotal escopo original', soma('previsto'), 'sub') + linhaTot('Subtotal aditivos', soma('aditivo'), 'sub') : ''}</tbody>
    <tfoot>${linhaTot('Total da obra', soma(''))}</tfoot></table></div>`
    : `<div class="empty"><b>Nenhuma etapa cadastrada</b>Cadastre as etapas macro da obra com o custo previsto, por exemplo: Serviços preliminares, Impermeabilização, Revestimentos.</div>`;
  const hist = d.historico.slice().reverse();
  const histHTML = hist.length ? `<details class="dt" open><summary>Histórico de alterações do orçamento (${hist.length})</summary>
    <div class="tblwrap"><table class="tbl hist-tbl"><thead><tr><th>Data</th><th>Etapa</th><th>Alteração</th><th class="num">De</th><th class="num">Para</th><th>Motivo</th></tr></thead><tbody>
    ${hist.map((h) => `<tr><td class="nowrap">${dataHoraBR(h.data)}</td><td>${esc(h.etapaNome)}</td><td>${ACAO_HIST[h.acao] || h.acao}</td><td class="num">${fmtHist(h.de, h.acao)}</td><td class="num">${fmtHist(h.para, h.acao)}</td><td>${esc(h.motivo || '')}</td></tr>`).join('')}
    </tbody></table></div></details>` : '';
  return `<div class="pagehead"><div><h1>Etapas e orçamento</h1><p>Etapas macro da obra com o custo previsto. Use o tipo Aditivo para serviços solicitados pelo cliente fora do escopo contratado.</p></div>
    <div class="actions"><button class="btn primary" data-act="nova-etapa">${ic('mais')}Nova etapa</button></div></div>
    ${banner}${resumo}
    <div class="card"><div class="bd flush">${tabela}</div>${histHTML}</div>`;
}
function fmtHist(v, acao) {
  if (v === null || v === undefined || v === '') return '-';
  if (acao === 'tipo') return TIPO_NOME[v] || v;
  if (acao === 'nome') return esc(v);
  return typeof v === 'number' ? brl(v) : esc(v);
}
function linhasDaEtapa(d, etapaId) {
  const out = [];
  for (const n of d.notas) for (const a of n.alocacoes) if (a.etapaId === etapaId) out.push(a);
  for (const n of d.receitas) for (const a of n.alocacoes) if (a.etapaId === etapaId) out.push(a);
  return out;
}

function modalEtapa(etapa, aoSalvar) {
  const d = S.data;
  const nova = !etapa;
  let tipo = etapa ? etapa.tipo : 'previsto';
  const corpo = `<div class="grid2">
    <label class="f req span2"><span>Nome da etapa</span><input class="inp" name="nome" value="${esc(etapa ? etapa.nome : '')}" autofocus placeholder="Ex.: Impermeabilização"></label>
    <div class="f"><span class="small" style="font-weight:500;color:var(--ink-2)">Tipo</span><div class="seg" id="seg-tipo"><button data-t="previsto">Previsto</button><button data-t="aditivo">Aditivo</button></div></div>
    <label class="f"><span>Custo previsto (R$)</span><input class="inp money" name="valor" inputmode="decimal" value="${etapa ? numBR(etapa.valor) : ''}" placeholder="0,00"></label>
    <p class="small muted span2" id="dica-tipo" style="margin:0"></p>
    ${d.orcamentoBase ? `<label class="f span2"><span>Motivo da alteração (opcional, vai para o histórico)</span><input class="inp" name="motivo" placeholder="Ex.: revisão de quantitativos"></label>` : ''}
  </div>`;
  abrirModal({
    titulo: nova ? 'Nova etapa' : 'Editar etapa', corpo,
    aoAbrir: (el) => {
      const atualiza = () => {
        $$('#seg-tipo button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === tipo));
        $('#dica-tipo', el).textContent = tipo === 'aditivo'
          ? 'Aditivo: serviço solicitado pelo cliente fora do escopo contratado. O custo previsto fica separado do orçamento original e serve de referência para comparar com o custo lançado como aditivo.'
          : 'Previsto: etapa do escopo contratado.' + (d.orcamentoBase && nova ? ' Como o orçamento original já foi fixado, esta etapa entra como ajuste do escopo previsto.' : '');
      };
      $$('#seg-tipo button', el).forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.t; atualiza(); }));
      const v = $('[name=valor]', el);
      v.addEventListener('blur', () => { const n = parseValor(v.value); if (!isNaN(n)) v.value = numBR(n); });
      atualiza();
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); el.querySelector('.btn.primary').click(); } });
    },
    botoes: [
      { rot: 'Cancelar' },
      {
        rot: nova ? 'Criar etapa' : 'Salvar', classe: 'primary',
        acao: async (m) => {
          const el = m.el;
          const nome = $('[name=nome]', el).value.trim();
          const vStr = $('[name=valor]', el).value;
          const valor = vStr.trim() === '' ? 0 : parseValor(vStr);
          const motivo = ($('[name=motivo]', el) || {}).value || '';
          if (!nome) { $('[name=nome]', el).classList.add('erro'); $('[name=nome]', el).focus(); return; }
          if (isNaN(valor) || valor < 0) { $('[name=valor]', el).classList.add('erro'); $('[name=valor]', el).focus(); toast('Informe um valor válido, por exemplo 12.500,00'); return; }
          if (d.etapas.some((e) => e !== etapa && normTxt(e.nome) === normTxt(nome))) { $('[name=nome]', el).classList.add('erro'); toast('Já existe uma etapa com este nome.'); return; }
          let alvo = etapa;
          let atualizarLinhas = false;
          if (!nova && etapa.tipo !== tipo) {
            const linhas = linhasDaEtapa(d, etapa.id).filter((a) => a.tipo !== tipo);
            if (linhas.length) {
              const op = await escolher({ titulo: 'Reclassificar os lançamentos da etapa?', msg: `Há ${linhas.length} linha(s) de notas ou receitas nesta etapa classificadas como ${TIPO_NOME[etapa.tipo]}.\nDeseja reclassificá-las como ${TIPO_NOME[tipo]}?`, opcoes: [{ v: 'sim', rot: `Reclassificar como ${TIPO_NOME[tipo]}`, primario: true }, { v: 'nao', rot: 'Manter como estão' }] });
              if (!op) return;
              atualizarLinhas = op === 'sim';
            }
          }
          if (nova) {
            alvo = { id: uid(), nome, tipo, valor, criadaEm: new Date().toISOString() };
            d.etapas.push(alvo);
            registrarHistorico(d, { etapaId: alvo.id, etapaNome: nome, acao: 'inclusao', de: null, para: valor, motivo: motivo || (tipo === 'aditivo' ? 'Aditivo solicitado pelo cliente' : '') });
          } else {
            if (etapa.nome !== nome) { registrarHistorico(d, { etapaId: etapa.id, etapaNome: nome, acao: 'nome', de: etapa.nome, para: nome, motivo }); etapa.nome = nome; }
            if (etapa.tipo !== tipo) {
              registrarHistorico(d, { etapaId: etapa.id, etapaNome: nome, acao: 'tipo', de: etapa.tipo, para: tipo, motivo });
              if (atualizarLinhas) linhasDaEtapa(d, etapa.id).forEach((a) => { a.tipo = tipo; });
              etapa.tipo = tipo;
            }
            if (Math.abs(etapa.valor - valor) > EPS) { registrarHistorico(d, { etapaId: etapa.id, etapaNome: nome, acao: 'valor', de: etapa.valor, para: valor, motivo }); etapa.valor = valor; }
          }
          m.fechar();
          alterado();
          if (aoSalvar) aoSalvar(alvo);
        },
      },
    ],
  });
}
ACOES['nova-etapa'] = () => modalEtapa(null);
ACOES['editar-etapa'] = (el) => modalEtapa(etapaPorId(S.data, el.dataset.id));
ACOES['mover-etapa'] = (el) => {
  const arr = S.data.etapas;
  const i = arr.findIndex((e) => e.id === el.dataset.id);
  const j = i + Number(el.dataset.dir);
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  alterado();
};
ACOES['excluir-etapa'] = async (el) => {
  const d = S.data;
  const e = etapaPorId(d, el.dataset.id);
  const r = calcular(d).porId[e.id];
  if (r.nAloc || r.nRec) {
    await alerta({ titulo: 'Etapa com lançamentos', msg: `A etapa "${e.nome}" tem ${r.nAloc} lançamento(s) de custo (${brl(r.lancado)}) e ${r.nRec} de receita (${brl(r.receita)}).\nPara excluí-la, primeiro mova esses valores para outra etapa ou exclua os lançamentos correspondentes.` });
    return;
  }
  const ok = await confirmar({ titulo: 'Excluir etapa?', msg: `A etapa "${e.nome}" (${brl(e.valor)}) será excluída.${d.orcamentoBase ? '\nA exclusão fica registrada no histórico e o orçamento original fixado não muda.' : ''}`, ok: 'Excluir etapa', perigo: true });
  if (!ok) return;
  registrarHistorico(d, { etapaId: e.id, etapaNome: e.nome, acao: 'exclusao', de: e.valor, para: null, motivo: '' });
  d.etapas = d.etapas.filter((x) => x.id !== e.id);
  alterado();
};
ACOES.fixar = async () => {
  const d = S.data;
  const total = calcular(d).totais.previstoAtual;
  const ok = await confirmar({ titulo: 'Fixar orçamento original', msg: `O orçamento original será fixado em ${brl(total)} (soma do custo previsto das etapas do tipo Previsto).\nA partir daqui, você continua podendo editar os valores, e cada alteração fica registrada no histórico.`, ok: 'Fixar orçamento' });
  if (!ok) return;
  fixarOrcamento(d);
  alterado();
  toast('Orçamento original fixado.');
};
ACOES.refixar = async () => {
  const d = S.data;
  const total = calcular(d).totais.previstoAtual;
  const ok = await confirmar({ titulo: 'Redefinir orçamento original?', msg: `O orçamento original passa de ${brl(d.orcamentoBase.total)} para ${brl(total)}, que é a soma atual das etapas previstas.\nUse apenas para corrigir um erro de cadastro. O histórico de alterações é mantido.`, ok: 'Redefinir', perigo: true });
  if (!ok) return;
  fixarOrcamento(d, true);
  alterado();
};

/* ======================= RELATÓRIOS ======================= */
function viewRelatorios() {
  const d = S.data;
  const c = calcular(d);
  const datas = d.notas.map((n) => n.dataPagamento).concat(d.receitas.map((n) => n.dataRecebimento)).filter(Boolean).sort();
  const ini = datas[0] || hojeISO();
  const fim = datas[datas.length - 1] || hojeISO();
  const cards = `<div class="rep-cards">
    <div class="card"><div class="hd"><h3>Relatório gerencial</h3></div><div class="bd"><p class="grow">Resumo de custos e resultado, previsto x realizado por tipo e por etapa, alertas, fluxo mensal, categorias, fornecedores e contas a pagar.</p>
      <button class="btn primary" data-act="imprimir" data-tipo="gerencial">${ic('imprimir')}Imprimir ou salvar PDF</button></div></div>
    <div class="card"><div class="hd"><h3>Registro financeiro por período</h3></div><div class="bd">
      <div class="grid2"><label class="f"><span>De</span><input class="inp" type="date" id="rp-de" value="${ini}"></label><label class="f"><span>Até</span><input class="inp" type="date" id="rp-ate" value="${fim}"></label></div>
      <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="rp-rec" checked> Incluir receitas</label>
      <p class="tiny muted" style="margin:0">Notas pela data de pagamento e receitas pela data de recebimento.</p>
      <button class="btn primary" data-act="imprimir" data-tipo="periodo">${ic('imprimir')}Imprimir ou salvar PDF</button></div></div>
    <div class="card"><div class="hd"><h3>Relatório completo da obra</h3></div><div class="bd"><p class="grow">Fechamento com todas as informações: dados da obra, orçamento, aditivos e histórico, etapas, notas, receitas, resultado, categorias, fornecedores, fluxo mensal e pendências.</p>
      <button class="btn primary" data-act="imprimir" data-tipo="completo">${ic('imprimir')}Imprimir ou salvar PDF</button></div></div>
  </div>`;
  return `<div class="pagehead"><div><h1>Relatórios</h1><p>Os relatórios saem formatados para papel A4. Para gerar PDF, escolha "Salvar como PDF" na janela de impressão.</p></div></div>
    <div class="banner info so-cel">${ic('info').replace('<svg', '<svg style="width:16px;height:16px;flex:none"')}<div style="flex:1">A impressão e o PDF dos relatórios são feitos pelo computador. Aqui no celular, consulte os resumos abaixo.</div></div>
    <div class="so-pc">${cards}</div>
    <div class="cards">
      <div class="card"><div class="hd"><div><h3>Resultado por etapa</h3><p>Receitas lançadas menos custos lançados em cada etapa</p></div></div><div class="bd flush">${tabelaResultadoEtapas(c)}</div></div>
      <div class="card"><div class="hd"><div><h3>Fluxo mensal</h3><p>Meses futuros contêm valores a pagar e a receber</p></div></div><div class="bd flush">${tabelaFluxo(c)}</div></div>
      <div class="card"><div class="hd"><div><h3>Custos por etapa e categoria</h3><p>Custo lançado</p></div></div><div class="bd flush">${matrizEtapaCategoria(c)}</div></div>
      <div class="row2b">
        <div class="card"><div class="hd"><h3>Custos por categoria</h3></div><div class="bd flush">${tabelaCategorias(c)}</div></div>
        <div class="card"><div class="hd"><h3>Todos os fornecedores</h3></div><div class="bd flush">${tabelaFornecedores(c.fornecedores)}</div></div>
      </div>
    </div>`;
}
function tabelaResultadoEtapas(c, classe = 'tbl') {
  if (!c.etapas.length) return '<div class="empty">Sem etapas.</div>';
  const linha = (r) => `<tr><td>${esc(r.etapa.nome)}${r.etapa.tipo === 'aditivo' ? ' <span class="chip aditivo">Aditivo</span>' : ''}</td><td class="num">${brl(r.previsto)}</td><td class="num">${brl(r.lancado)}</td><td class="num">${brl(r.receita)}</td><td class="num">${brl(r.recebido)}</td><td class="num ${r.resultado < -EPS ? 'neg' : ''}">${brl(r.resultado)}</td><td class="num">${r.receita > EPS ? pct(r.resultado / r.receita, 1) : '-'}</td></tr>`;
  const t = c.totais;
  return `<div class="tblwrap"><table class="${classe}"><thead><tr><th>Etapa</th><th class="num">Custo previsto</th><th class="num">Custo lançado</th><th class="num">Receita lançada</th><th class="num">Recebido</th><th class="num">Resultado</th><th class="num">Margem</th></tr></thead>
    <tbody>${c.etapas.map(linha).join('')}</tbody>
    <tfoot><tr class="tot"><td>Total</td><td class="num">${brl(t.orcAtualizado)}</td><td class="num">${brl(t.lancado)}</td><td class="num">${brl(t.receita)}</td><td class="num">${brl(t.recebido)}</td><td class="num ${t.resultado < -EPS ? 'neg' : ''}">${brl(t.resultado)}</td><td class="num">${pctOuTraco(t.margem)}</td></tr></tfoot></table></div>`;
}
function tabelaFluxo(c, classe = 'tbl') {
  if (!c.meses.length) return '<div class="empty">Sem lançamentos.</div>';
  return `<div class="tblwrap"><table class="${classe}"><thead><tr><th>Mês</th><th class="num">Recebido</th><th class="num">A receber</th><th class="num">Pago</th><th class="num">A pagar</th><th class="num">Saldo do mês</th><th class="num">Saldo acumulado</th></tr></thead><tbody>
    ${c.meses.map((m) => `<tr><td>${mesRotulo(m.k, true)}${m.futuro ? ' <span class="chip neutro">previsto</span>' : ''}</td><td class="num">${brl(m.recebido)}</td><td class="num">${brl(m.aReceber)}</td><td class="num">${brl(m.pago)}</td><td class="num">${brl(m.aPagar)}</td><td class="num ${m.saldoMes < -EPS ? 'neg' : ''}">${brl(m.saldoMes)}</td><td class="num ${m.acumulado < -EPS ? 'neg' : ''}">${brl(m.acumulado)}</td></tr>`).join('')}
    </tbody><tfoot><tr class="tot"><td>Total</td><td class="num">${brl(c.totais.recebido)}</td><td class="num">${brl(c.totais.aReceber)}</td><td class="num">${brl(c.totais.pago)}</td><td class="num">${brl(c.totais.aPagar)}</td><td class="num">${brl(c.totais.receita - c.totais.lancado)}</td><td></td></tr></tfoot></table></div>`;
}
function matrizEtapaCategoria(c, classe = 'tbl') {
  if (!c.etapas.length) return '<div class="empty">Sem etapas.</div>';
  const extras = {}; c.etapas.forEach((r) => Object.keys(r.cat).forEach((k) => { extras[k] = { lancado: (extras[k] ? extras[k].lancado : 0) + r.cat[k] }; }));
  const cats = categoriasComValores(extras).filter(([k]) => c.etapas.some((r) => r.cat[k]));
  if (!cats.length) return '<div class="empty">Sem lançamentos.</div>';
  const tot = {};
  const linhas = c.etapas.map((r) => `<tr><td>${esc(r.etapa.nome)}${r.etapa.tipo === 'aditivo' ? ' <span class="chip aditivo">Aditivo</span>' : ''}</td>${cats.map(([k]) => { tot[k] = (tot[k] || 0) + (r.cat[k] || 0); return `<td class="num">${r.cat[k] ? brl(r.cat[k]) : '<span class="muted">-</span>'}</td>`; }).join('')}<td class="num"><b>${brl(r.lancado)}</b></td></tr>`).join('');
  return `<div class="tblwrap"><table class="${classe}"><thead><tr><th>Etapa</th>${cats.map(([, v]) => `<th class="num">${v}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${linhas}</tbody>
    <tfoot><tr class="tot"><td>Total</td>${cats.map(([k]) => `<td class="num">${brl(tot[k])}</td>`).join('')}<td class="num">${brl(c.totais.lancado)}</td></tr></tfoot></table></div>`;
}
function tabelaCategorias(c, classe = 'tbl') {
  const t = c.totais.lancado;
  return `<div class="tblwrap"><table class="${classe}"><thead><tr><th>Categoria</th><th class="num">Lançado</th><th class="num">Pago</th><th class="num">A pagar</th><th class="num">Part.</th></tr></thead><tbody>
    ${categoriasComValores(c.categorias).map(([k, v]) => { const x = c.categorias[k] || { lancado: 0, pago: 0, aPagar: 0 }; return `<tr><td>${v}</td><td class="num">${brl(x.lancado)}</td><td class="num">${brl(x.pago)}</td><td class="num">${brl(x.aPagar)}</td><td class="num">${t ? pct(x.lancado / t, 1) : '-'}</td></tr>`; }).join('')}
    </tbody><tfoot><tr class="tot"><td>Total</td><td class="num">${brl(t)}</td><td class="num">${brl(c.totais.pago)}</td><td class="num">${brl(c.totais.aPagar)}</td><td class="num">${t ? '100%' : '-'}</td></tr></tfoot></table></div>`;
}


/* ======================= EMPRESA NOS RELATÓRIOS ======================= */
function cardEmpresa() {
  const e = S.config.empresa;
  return `<div class="card"><div class="hd"><div><h3>Obras: empresa nos relatórios</h3><p>Guardado neste aparelho.</p></div></div><div class="bd">
    <div class="grid2">
      <label class="f span2"><span>Empresa</span><input class="inp" data-cfg="nome" value="${esc(e.nome)}"></label>
      <label class="f"><span>CNPJ</span><input class="inp" data-cfg="cnpj" value="${esc(e.cnpj)}"></label>
      <label class="f"><span>Registro profissional</span><input class="inp" data-cfg="registro" value="${esc(e.registro)}"></label>
      <label class="f span2"><span>Responsável técnico</span><input class="inp" data-cfg="responsavel" value="${esc(e.responsavel)}"></label>
      <label class="f span2"><span>Contato</span><input class="inp" data-cfg="contato" value="${esc(e.contato)}"></label>
    </div>
    <div class="secao-form" style="margin-top:14px">Logo</div>
    <div class="logo-prev" style="margin-top:6px"><img src="${logoAtual()}" alt="Logo"></div>
    <div class="actions" style="margin-top:8px"><button class="btn sm" data-act="logo">${ic('enviar')}Usar outro logo</button>${S.config.logo ? `<button class="btn sm ghost" data-act="logo-remover">Voltar ao logo padrão</button>` : ''}</div>
  </div></div>`;
}
/** Monta o seletor de cliente na tela "Dados da obra". */
function posRender() {
  const alvo = raiz && raiz.querySelector('[data-ob-cliente]');
  if (!alvo || !S.data) return;
  Sis.seletorCliente(alvo, {
    clienteId: S.data.obra.clienteId, obrigatorio: true,
    aoMudar: (id) => { if (id && id !== S.data.obra.clienteId) { S.data.obra.clienteId = id; alterado(); toast('Cliente da obra atualizado.'); } },
  });
}
ACOES.exportar = () => exportarDados();
ACOES.importar = () => importarObra();
ACOES.logo = () => escolherArquivoLocal('image/png,image/jpeg,image/svg+xml,image/webp', false, (fs) => {
  const f = fs[0];
  if (f.size > 1.5 * 1024 * 1024) { toast('Use uma imagem de até 1,5 MB.'); return; }
  const r = new FileReader();
  r.onload = async () => { S.config.logo = r.result; await salvarConfig(); render(); toast('Logo atualizado.'); };
  r.readAsDataURL(f);
});
ACOES['logo-remover'] = async () => { S.config.logo = null; await salvarConfig(); render(); };
document.addEventListener('change', async (e) => {
  const el = e.target.closest && e.target.closest('[data-cfg]');
  if (!el) return;
  S.config.empresa[el.dataset.cfg] = el.value.trim();
  await salvarConfig();
  toast('Dados da empresa atualizados.');
});

/* ---------- categorias de despesa ---------- */
function cardCategorias() {
  const n = CATEGORIAS.length;
  const linhas = CATEGORIAS.map(([k, nome], i) => {
    const u = usoDaCategoria(k);
    return `<div class="cat-it">
      <input class="inp" data-cat-nome="${esc(k)}" value="${esc(nome)}" aria-label="Nome da categoria" maxlength="40">
      <span class="cat-uso">${u.linhas ? `${u.linhas} lanç.` : 'sem uso'}</span>
      <button class="btn icon" data-act="cat-mover" data-k="${esc(k)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${ic('cima')}</button>
      <button class="btn icon" data-act="cat-mover" data-k="${esc(k)}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer">${ic('baixo')}</button>
      <button class="btn icon" data-act="cat-remover" data-k="${esc(k)}" ${n === 1 ? 'disabled' : ''} aria-label="Remover">${ic('lixo')}</button>
    </div>`;
  }).join('');
  return `<div class="card"><div class="hd"><div><h3>Obras: categorias de despesa</h3><p>Valem para todas as obras${S.modo === 'nuvem' ? ' e sincronizam com o celular' : ''}. Para renomear, edite o nome. A primeira da lista é a sugerida nas notas novas.</p></div></div>
    <div class="bd"><div class="cat-lista">${linhas}</div>
      <div class="cat-nova"><input class="inp" id="cat-nova" placeholder="Nova categoria, ex.: Frete" maxlength="40"><button class="btn primary" data-act="cat-adicionar">${ic('mais')}Adicionar</button></div>
      
    </div></div>`;
}
function nomeCategoriaRepetido(nome, ignorar) {
  const k = normTxt(nome).trim();
  return CATEGORIAS.some(([c, v]) => c !== ignorar && normTxt(v).trim() === k);
}
ACOES['cat-adicionar'] = () => {
  const inp = $('#cat-nova');
  const nome = inp.value.trim().replace(/\s+/g, ' ');
  if (!nome) { inp.classList.add('erro'); inp.focus(); return; }
  if (nomeCategoriaRepetido(nome)) { inp.classList.add('erro'); toast('Já existe uma categoria com esse nome.'); return; }
  salvarCategorias(CATEGORIAS.concat([['c' + uid().replace(/-/g, '').slice(0, 10), nome]]));
  render();
  toast(`Categoria "${nome}" adicionada.`);
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target) return;
  if (e.target.id === 'cat-nova') { e.preventDefault(); ACOES['cat-adicionar'](); }
  else if (e.target.dataset && e.target.dataset.catNome !== undefined) { e.preventDefault(); e.target.blur(); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest && e.target.closest('[data-cat-nome]');
  if (!el) return;
  const k = el.dataset.catNome;
  const nome = el.value.trim().replace(/\s+/g, ' ');
  if (!nome) { el.value = CAT_NOME[k]; toast('O nome da categoria não pode ficar em branco.'); return; }
  if (nomeCategoriaRepetido(nome, k)) { el.value = CAT_NOME[k]; toast('Já existe uma categoria com esse nome.'); return; }
  if (nome === CAT_NOME[k]) return;
  salvarCategorias(CATEGORIAS.map(([c, v]) => [c, c === k ? nome : v]));
  render();
  toast(`Categoria renomeada para "${nome}".`);
});
ACOES['cat-mover'] = (el) => {
  const lista = CATEGORIAS.map((c) => c.slice());
  const i = lista.findIndex((c) => c[0] === el.dataset.k);
  const j = i + Number(el.dataset.dir);
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  salvarCategorias(lista);
  render();
};
ACOES['cat-remover'] = async (el) => {
  const k = el.dataset.k;
  const nome = CAT_NOME[k];
  if (CATEGORIAS.length < 2) return;
  const u = usoDaCategoria(k);
  if (!u.linhas) {
    const ok = await confirmar({ titulo: 'Remover categoria?', msg: `A categoria "${nome}" não é usada em nenhuma nota e será removida.`, ok: 'Remover', perigo: true });
    if (!ok) return;
    salvarCategorias(CATEGORIAS.filter((c) => c[0] !== k));
    render(); toast(`Categoria "${nome}" removida.`);
    return;
  }
  const outras = CATEGORIAS.filter((c) => c[0] !== k);
  abrirModal({
    titulo: `Remover "${nome}"`,
    sub: `Esta categoria está em ${u.linhas} linha${u.linhas === 1 ? '' : 's'} de notas, em ${u.obras} obra${u.obras === 1 ? '' : 's'}.`,
    corpo: `<label class="f"><span>Passar esses lançamentos para</span><select class="inp" name="destino">${outras.map(([c, v]) => `<option value="${esc(c)}">${esc(v)}</option>`).join('')}</select></label>
      <p class="small muted" style="margin:10px 0 0">Os valores não mudam; só a categoria dessas linhas. A alteração vale para todas as obras.</p>`,
    botoes: [{ rot: 'Cancelar' }, {
      rot: 'Passar e remover', classe: 'primary', acao: (m) => {
        const destino = $('[name=destino]', m.el).value;
        m.fechar();
        moverCategoriaNasNotas(k, destino);
        salvarCategorias(CATEGORIAS.filter((c) => c[0] !== k));
        render();
        toast(`"${nome}" removida. ${u.linhas} linha(s) passaram para "${CAT_NOME[destino]}".`);
      },
    }],
  });
};

/* =========================================================
   Lançamentos: notas (despesas) e receitas
   Mesma estrutura: código sequencial, uma data (pagamento ou
   recebimento), descrição e distribuição por etapa e tipo.
   ========================================================= */

function viewNotas() { return viewLanc(LANC.despesa); }
function viewReceitas() { return viewLanc(LANC.receita); }

function filtrarLanc(cfg, d, f) {
  const hoje = hojeISO();
  const q = normTxt(f.busca);
  const out = [];
  for (const n of d[cfg.col]) {
    const dt = n[cfg.data];
    const ok = realizado(dt, hoje);
    if (f.situacao === 'ok' && !ok) continue;
    if (f.situacao === 'pend' && ok) continue;
    if (cfg.temFornecedor && f.fornecedor && n.fornecedor !== f.fornecedor) continue;
    if (q && !normTxt([n.codigo, n.fornecedor || '', n.descricao].join(' ')).includes(q)) continue;
    if (f.de && (!dt || dt < f.de)) continue;
    if (f.ate && (!dt || dt > f.ate)) continue;
    const alocs = n.alocacoes.filter((a) => (!f.etapa || a.etapaId === f.etapa) && (!cfg.temCategoria || !f.categoria || a.categoria === f.categoria) && (!f.tipo || a.tipo === f.tipo));
    if (!alocs.length) continue;
    out.push({ item: n, alocs, ok, subtotal: r2(alocs.reduce((s, a) => s + a.valor, 0)) });
  }
  return out.sort((a, b) => b.item.numero - a.item.numero || String(b.item.codigo).localeCompare(String(a.item.codigo), 'pt-BR', { numeric: true }));
}
const filtroAtivo = (f) => Object.values(f).some((v) => v);

function viewLanc(cfg) {
  const d = S.data;
  if (!S[cfg.filtros]) S[cfg.filtros] = filtrosPadrao();
  const f = S[cfg.filtros];
  const k = cfg.chave;
  const opt = (v, rot, sel) => `<option value="${esc(v)}" ${sel === v ? 'selected' : ''}>${esc(rot)}</option>`;
  const fornecedores = cfg.temFornecedor ? [...new Set(d.notas.map((n) => n.fornecedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')) : [];
  const nAtivos = ['de', 'ate', 'situacao', 'etapa', 'tipo', 'categoria', 'fornecedor'].filter((x) => f[x]).length;
  const filtros = `<div class="filtros ${nAtivos ? 'aberto' : ''}">
    <label class="f grow"><span>Buscar</span><input class="inp" data-filtro="busca" data-k="${k}" value="${esc(f.busca)}" placeholder="${cfg.temFornecedor ? 'Nota, fornecedor ou descrição' : 'Receita ou descrição'}"></label>
    <button class="btn so-cel filtros-toggle" data-act="toggle-filtros">${ic('ajustes')}Filtros${nAtivos ? ` (${nAtivos})` : ''}</button>
    <label class="f" style="min-width:140px"><span>De</span><input class="inp" type="date" data-filtro="de" data-k="${k}" value="${esc(f.de)}"></label>
    <label class="f" style="min-width:140px"><span>Até</span><input class="inp" type="date" data-filtro="ate" data-k="${k}" value="${esc(f.ate)}"></label>
    <label class="f"><span>Situação</span><select class="inp" data-filtro="situacao" data-k="${k}">${opt('', 'Todas', f.situacao)}${opt('ok', cfg.okRot + 's', f.situacao)}${opt('pend', cfg.pendRot, f.situacao)}</select></label>
    <label class="f"><span>Etapa</span><select class="inp" data-filtro="etapa" data-k="${k}">${opt('', 'Todas', f.etapa)}${d.etapas.map((e) => opt(e.id, e.nome, f.etapa)).join('')}</select></label>
    <label class="f"><span>Tipo</span><select class="inp" data-filtro="tipo" data-k="${k}">${opt('', 'Todos', f.tipo)}${opt('previsto', 'Previsto', f.tipo)}${opt('aditivo', 'Aditivo', f.tipo)}</select></label>
    ${cfg.temCategoria ? `<label class="f"><span>Categoria</span><select class="inp" data-filtro="categoria" data-k="${k}">${opt('', 'Todas', f.categoria)}${CATEGORIAS.map(([c, v]) => opt(c, v, f.categoria)).join('')}${f.categoria && !CAT_NOME[f.categoria] ? opt(f.categoria, nomeCat(f.categoria), f.categoria) : ''}</select></label>` : ''}
    ${cfg.temFornecedor ? `<label class="f"><span>Fornecedor</span><select class="inp" data-filtro="fornecedor" data-k="${k}">${opt('', 'Todos', f.fornecedor)}${fornecedores.map((x) => opt(x, x, f.fornecedor)).join('')}</select></label>` : ''}
    <button class="btn ghost sm" data-act="limpar-filtros" data-k="${k}" style="margin-bottom:4px">Limpar filtros</button>
  </div>`;
  const botaoNovo = d.etapas.length
    ? `<button class="btn primary" data-act="nova-lanc" data-k="${k}">${ic('mais')}Nova ${cfg.nome}</button>`
    : `<button class="btn primary" data-act="ir" data-v="etapas">Cadastre as etapas primeiro</button>`;
  const cab = cfg.chave === 'despesa'
    ? `<div class="pagehead"><div><h1>Notas e despesas</h1><p>Cada nota pode ser distribuída entre várias etapas. Data de pagamento futura = a pagar.</p></div><div class="actions">${botaoNovo}</div></div>`
    : `<div class="pagehead"><div><h1>Receitas</h1><p>Valores do cliente distribuídos por etapa. Data de recebimento futura = a receber.</p></div><div class="actions">${botaoNovo}</div></div>${resumoReceitas()}`;
  const extra = cfg.chave === 'receita' && d.etapas.length
    ? `<div class="card" style="margin-top:16px"><div class="hd"><div><h3>Receita x custo por etapa</h3><p>Resultado = receita lançada menos custo lançado</p></div></div><div class="bd flush">${tabelaResultadoEtapas(calcular(d))}</div></div>`
    : '';
  return `${cab}<div class="card">${filtros}<div id="lanc-corpo-${k}">${corpoLanc(cfg)}</div></div>${extra}`;
}

function resumoReceitas() {
  const d = S.data;
  const c = calcular(d);
  const t = c.totais;
  const dica = d.obra.regime === 'administracao'
    ? 'Obra por administração: ao lançar uma receita, use <b>Preencher pelo custo previsto</b> para distribuir o valor pelas etapas.'
    : d.obra.regime === 'medicao'
      ? 'Obra por medição: lance cada medição distribuída pelas etapas medidas.'
      : 'Informe o regime de contratação em Dados da obra (administração ou medição).';
  return `<div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lb">Receitas lançadas</div><div class="vl">${brl(t.receita)}</div><div class="sb">${t.nReceitas} receita${t.nReceitas === 1 ? '' : 's'}</div></div>
    <div class="kpi"><div class="lb">Recebido</div><div class="vl">${brl(t.recebido)}</div><div class="sb">Data de recebimento até hoje</div></div>
    <div class="kpi"><div class="lb">A receber</div><div class="vl">${brl(t.aReceber)}</div><div class="sb">${t.nAReceber} com data futura</div></div>
    <div class="kpi"><div class="lb">Resultado</div><div class="vl ${t.resultado < -EPS ? 'neg' : ''}">${brl(t.resultado)}</div><div class="sb">${t.margem === null ? 'Receitas menos custos lançados' : `Margem de ${pct(t.margem, 1)}`}</div></div>
  </div><div class="banner info" style="margin-top:-4px">${ic('info').replace('<svg', '<svg style="width:16px;height:16px;flex:none"')}<div style="flex:1">${dica}</div></div>`;
}

function corpoLanc(cfg) {
  const d = S.data;
  const f = S[cfg.filtros];
  const lista = filtrarLanc(cfg, d, f);
  const ativo = filtroAtivo(f);
  const tot = lista.reduce((a, it) => { a.l += it.subtotal; if (it.ok) a.p += it.subtotal; else a.a += it.subtotal; return a; }, { l: 0, p: 0, a: 0 });
  const resumo = `<div class="resumo-filtro"><span>${lista.length} ${lista.length === 1 ? cfg.nome : cfg.plural}${ativo ? ' no filtro' : ''}</span><span>Total <b>${brl(tot.l)}</b></span><span>${cfg.okRot}s <b>${brl(tot.p)}</b></span><span>${cfg.pendRot} <b>${brl(tot.a)}</b></span>
    ${ativo && (f.etapa || f.tipo || f.categoria) ? `<span class="muted">Com filtro de etapa, tipo ou categoria, os valores consideram apenas as linhas correspondentes.</span>` : ''}</div>`;
  if (!d[cfg.col].length) return resumo + `<div class="empty"><b>Nenhuma ${cfg.nome} lançada</b>Use o botão Nova ${cfg.nome} para registrar ${cfg.chave === 'despesa' ? 'a primeira despesa' : 'o primeiro valor recebido ou a receber'}.</div>`;
  if (!lista.length) return resumo + `<div class="empty"><b>Nada encontrado</b>Ajuste ou limpe os filtros.</div>`;
  const rows = lista.map(({ item: n, alocs, ok, subtotal }) => {
    const total = totalNota(n);
    const al = alocs.map((a) => {
      const e = etapaPorId(d, a.etapaId);
      const det = [cfg.temCategoria ? nomeCat(a.categoria) : '', TIPO_NOME[a.tipo]].filter(Boolean).join(' · ');
      return `<div class="et">${esc(e ? e.nome : '(etapa excluída)')} <small class="${a.tipo === 'aditivo' ? 'tag-adit' : ''}">· ${det}</small></div><div class="v">${brl(a.valor)}</div>`;
    }).join('');
    const parcial = alocs.length !== n.alocacoes.length;
    return `<tr>
      <td><a href="#" data-act="editar-lanc" data-k="${cfg.chave}" data-id="${n.id}"><b>${esc(n.codigo)}</b></a></td>
      <td class="nowrap">${dataBR(n[cfg.data])}${ok ? '' : `<div><span class="chip pendente">${cfg.pendRot}</span></div>`}</td>
      <td style="min-width:180px">${cfg.temFornecedor ? `<b style="font-weight:600">${esc(n.fornecedor)}</b><div class="small muted">${esc(n.descricao)}</div>` : `<b style="font-weight:600">${esc(n.descricao)}</b>`}</td>
      <td style="min-width:280px"><div class="aloc">${al}</div>${parcial ? `<div class="tiny muted" style="margin-top:3px">Mostrando ${alocs.length} de ${n.alocacoes.length} linhas (filtro)</div>` : ''}</td>
      <td class="num"><b>${brl(total)}</b>${parcial ? `<div class="tiny muted">no filtro ${brl(subtotal)}</div>` : ''}</td>
      <td class="acoes">
        ${ok ? '' : `<button class="btn icon" data-act="realizar-lanc" data-k="${cfg.chave}" data-id="${n.id}" title="Registrar ${cfg.verbo}" aria-label="Registrar ${cfg.verbo}">${ic('check')}</button>`}
        <button class="btn icon" data-act="editar-lanc" data-k="${cfg.chave}" data-id="${n.id}" title="Editar" aria-label="Editar">${ic('editar')}</button>
        <button class="btn icon" data-act="duplicar-lanc" data-k="${cfg.chave}" data-id="${n.id}" title="Duplicar" aria-label="Duplicar">${ic('copiar')}</button>
        <button class="btn icon" data-act="excluir-lanc" data-k="${cfg.chave}" data-id="${n.id}" title="Excluir" aria-label="Excluir">${ic('lixo')}</button></td></tr>`;
  }).join('');
  const cartoes = lista.map(({ item: n, alocs, ok }) => `<div class="lc" data-act="editar-lanc" data-k="${cfg.chave}" data-id="${n.id}">
      <div class="lc-top"><b>${esc(n.codigo)}</b><span class="muted">${dataBR(n[cfg.data])}</span>${ok ? '' : `<span class="chip pendente">${cfg.pendRot}</span>`}<b class="lc-tot">${brl(totalNota(n))}</b></div>
      <div class="lc-desc">${cfg.temFornecedor ? `<b>${esc(n.fornecedor)}</b> · ` : ''}${esc(n.descricao)}</div>
      <div class="lc-aloc">${alocs.map((a) => { const e = etapaPorId(d, a.etapaId); return `<div><span>${esc(e ? e.nome : '(etapa excluída)')} <small class="${a.tipo === 'aditivo' ? 'tag-adit' : ''}">· ${[cfg.temCategoria ? nomeCat(a.categoria) : '', TIPO_NOME[a.tipo]].filter(Boolean).join(' · ')}</small></span><b>${brl(a.valor)}</b></div>`; }).join('')}</div>
      <div class="lc-acts">${ok ? '' : `<button class="btn sm" data-act="realizar-lanc" data-k="${cfg.chave}" data-id="${n.id}">${ic('check')}${cfg.chave === 'despesa' ? 'Pagar' : 'Receber'}</button>`}<button class="btn sm ghost" data-act="duplicar-lanc" data-k="${cfg.chave}" data-id="${n.id}">${ic('copiar')}Duplicar</button><button class="btn sm ghost" data-act="excluir-lanc" data-k="${cfg.chave}" data-id="${n.id}">${ic('lixo')}Excluir</button></div>
    </div>`).join('');
  return resumo + `<div class="lista-cards">${cartoes}</div><div class="tblwrap so-pc-bloco"><table class="tbl"><thead><tr><th>${cfg.Nome}</th><th>${cfg.chave === 'despesa' ? 'Pagamento' : 'Recebimento'}</th><th>${cfg.temFornecedor ? 'Fornecedor / descrição' : 'Descrição'}</th><th>Distribuição por etapa</th><th class="num">Total</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

let _timerBusca = null;
function aplicarFiltro(el) {
  const cfg = LANC[el.dataset.k];
  if (!cfg) return;
  S[cfg.filtros][el.dataset.filtro] = el.value;
  const corpo = $('#lanc-corpo-' + cfg.chave);
  if (corpo) corpo.innerHTML = corpoLanc(cfg);
}
document.addEventListener('input', (e) => {
  const el = e.target.closest && e.target.closest('[data-filtro]');
  if (!el || el.dataset.filtro !== 'busca') return;
  clearTimeout(_timerBusca);
  _timerBusca = setTimeout(() => aplicarFiltro(el), 150);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest && e.target.closest('[data-filtro]');
  if (el && el.dataset.filtro !== 'busca') aplicarFiltro(el);
});
ACOES['toggle-filtros'] = (el) => el.closest('.filtros').classList.toggle('aberto');
ACOES['limpar-filtros'] = (el) => { const cfg = LANC[el.dataset.k]; S[cfg.filtros] = filtrosPadrao(); render(); };

/* ---------- formulário de lançamento ---------- */
function opcoesEtapas(sel) {
  const d = S.data;
  const grupo = (tipo, rot) => {
    const l = d.etapas.filter((e) => e.tipo === tipo);
    return l.length ? `<optgroup label="${rot}">${l.map((e) => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</optgroup>` : '';
  };
  return `<option value="">Selecione a etapa</option>${grupo('previsto', 'Escopo original')}${grupo('aditivo', 'Aditivos')}<option value="__nova">+ Criar nova etapa…</option>`;
}

function modalLanc(cfg, item, opcoes = {}) {
  const d = S.data;
  const desp = cfg.chave === 'despesa';
  const editando = !!item && !opcoes.duplicar;
  const origem = item || { descricao: '', fornecedor: '', alocacoes: [] };
  const auto = editando ? null : proximoCodigo(cfg, d);
  const codigo = editando ? item.codigo : auto.codigo;
  const dataIni = editando ? item[cfg.data] : hojeISO();
  let linhas = origem.alocacoes.map((a) => ({ id: uid(), etapaId: a.etapaId, tipo: a.tipo, categoria: a.categoria || catPadrao(), valor: a.valor }));
  if (!linhas.length) linhas = [{ id: uid(), etapaId: '', tipo: 'previsto', categoria: catPadrao(), valor: null }];
  let categoriaTocada = editando;
  // valores já lançados em cada etapa, sem contar este lançamento
  const calc = calcular(d);
  const fora = {};
  for (const r of calc.etapas) fora[r.etapa.id] = desp ? r.lancado : r.receita;
  if (editando) item.alocacoes.forEach((a) => { fora[a.etapaId] = (fora[a.etapaId] || 0) - a.valor; });

  const corpo = `
    <div class="${desp ? 'grid3' : 'grid2'}">
      <label class="f req"><span>${cfg.Nome}</span><input class="inp" name="codigo" value="${esc(codigo)}" autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-weight:600">
        <div class="tiny" id="sit-codigo" style="font-weight:400"></div></label>
      <label class="f req"><span>${cfg.dataRot}</span>
        <div style="display:flex;gap:6px"><input class="inp" type="date" name="data" value="${esc(dataIni)}" required><button class="btn sm" type="button" data-hoje>Hoje</button></div>
        <div class="tiny" id="sit-data" style="font-weight:400"></div></label>
      ${desp ? `<label class="f req"><span>Fornecedor</span><div class="sugere"><input class="inp" name="fornecedor" value="${esc(origem.fornecedor)}" ${editando ? '' : 'autofocus'} autocomplete="off" placeholder="Digite para buscar"><div class="lista-sug" id="sug-forn" hidden></div></div></label>` : ''}
      <label class="f req ${desp ? 'span3' : 'span2'}"><span>Descrição</span><input class="inp" name="descricao" value="${esc(origem.descricao)}" ${desp ? '' : 'autofocus'} placeholder="${desp ? 'Ex.: Manta asfáltica e primer' : 'Ex.: Medição 01 ou Aporte mensal do condomínio'}"></label>
    </div>
    <div class="secao-form" style="display:flex;justify-content:space-between;align-items:center;gap:10px">Distribuição por etapa
      ${desp ? '' : `<button class="btn sm" type="button" data-preencher style="text-transform:none;letter-spacing:0;font-weight:500">${ic('etapas')}Preencher pelo custo previsto</button>`}</div>
    <table class="aloc-tbl"><thead><tr><th style="width:${desp ? 36 : 50}%">Etapa</th><th style="width:15%">Tipo</th>${desp ? '<th style="width:19%">Categoria</th>' : ''}<th style="width:22%;text-align:right">Valor (R$)</th><th></th></tr></thead><tbody id="aloc-linhas"></tbody></table>
    <div><button class="btn sm ghost" type="button" data-add-linha>${ic('mais')}Adicionar linha</button></div>
    <div class="total-nota"><span class="muted">Total da ${cfg.nome}</span><b id="total-nota">R$ 0,00</b></div>`;

  const botoes = [];
  if (editando) botoes.push({ rot: `Excluir ${cfg.nome}`, classe: 'danger', esq: true, acao: async (m) => { if (await excluirLanc(cfg, item)) m.fechar(); } });
  botoes.push({ rot: 'Cancelar' });
  if (!editando) botoes.push({ rot: 'Salvar e lançar outra', acao: (m) => salvar(m, true) });
  botoes.push({ rot: editando ? 'Salvar alterações' : `Salvar ${cfg.nome}`, classe: 'primary', acao: (m) => salvar(m, false) });

  let raiz;
  const valorOk = (v) => v !== null && v !== undefined && !isNaN(v);
  function desenharLinhas() {
    $('#aloc-linhas', raiz).innerHTML = linhas.map((l) => `<tr data-l="${l.id}">
        <td class="c-etapa"><select class="inp" data-c="etapaId" aria-label="Etapa">${opcoesEtapas(l.etapaId)}</select><div class="saldo" data-saldo></div></td>
        <td class="c-tipo"><select class="inp" data-c="tipo" aria-label="Tipo"><option value="previsto" ${l.tipo === 'previsto' ? 'selected' : ''}>Previsto</option><option value="aditivo" ${l.tipo === 'aditivo' ? 'selected' : ''}>Aditivo</option></select></td>
        ${desp ? `<td class="c-cat"><select class="inp" data-c="categoria" aria-label="Categoria">${(CAT_NOME[l.categoria] ? CATEGORIAS : CATEGORIAS.concat([[l.categoria, nomeCat(l.categoria)]])).map(([k, v]) => `<option value="${esc(k)}" ${k === l.categoria ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></td>` : ''}
        <td class="c-valor"><input class="inp money" data-c="valor" inputmode="decimal" value="${valorOk(l.valor) ? numBR(l.valor) : ''}" placeholder="Valor (R$)" aria-label="Valor"></td>
        <td class="c-del"><button class="btn icon" type="button" data-rem title="Remover linha" aria-label="Remover linha" ${linhas.length === 1 ? 'disabled' : ''}>${ic('lixo')}</button></td></tr>`).join('');
    atualizarTotais();
  }
  function atualizarTotais() {
    const total = linhas.reduce((s, l) => s + (valorOk(l.valor) ? l.valor : 0), 0);
    $('#total-nota', raiz).textContent = brl(total);
    const somaEtapa = {};
    linhas.forEach((l) => { if (l.etapaId) somaEtapa[l.etapaId] = (somaEtapa[l.etapaId] || 0) + (valorOk(l.valor) ? l.valor : 0); });
    $$('#aloc-linhas tr', raiz).forEach((tr) => {
      const l = linhas.find((x) => x.id === tr.dataset.l);
      const box = $('[data-saldo]', tr);
      const e = l && etapaPorId(d, l.etapaId);
      if (!e) { box.textContent = ''; box.className = 'saldo'; return; }
      const acumulado = (fora[e.id] || 0) + somaEtapa[e.id];
      if (desp) {
        const saldo = e.valor - acumulado;
        box.className = 'saldo' + (saldo < -EPS ? ' neg' : '');
        box.textContent = saldo < -EPS ? `Com esta nota, a etapa passa ${brl(-saldo)} do custo previsto` : `Saldo da etapa após esta nota: ${brl(saldo)}`;
      } else {
        box.className = 'saldo';
        box.textContent = `Receita da etapa com este lançamento: ${brl(acumulado)} · custo previsto ${brl(e.valor)}`;
      }
    });
  }
  function situacaoCodigo() {
    const inp = $('[name=codigo]', raiz);
    const box = $('#sit-codigo', raiz);
    const v = inp.value.trim();
    inp.classList.remove('erro');
    if (!v) { box.innerHTML = '<span class="neg">Informe o código</span>'; return false; }
    if (v.length > 20) { box.innerHTML = '<span class="neg">Use até 20 caracteres</span>'; return false; }
    const outro = codigoEmUso(d[cfg.col], v, editando ? item.id : null);
    if (outro) {
      inp.classList.add('erro');
      box.innerHTML = `<span class="neg">Já usado: ${esc(outro.codigo)} · ${cfg.temFornecedor ? esc(outro.fornecedor) + ' · ' : ''}${brl(totalNota(outro))}</span>`;
      return false;
    }
    const igualOriginal = editando ? chaveCodigo(v) === chaveCodigo(item.codigo) : chaveCodigo(v) === chaveCodigo(auto.codigo);
    box.innerHTML = igualOriginal ? (editando ? '' : '<span class="muted">Numeração automática</span>') : '<span style="color:var(--ok)">Disponível</span>';
    return true;
  }
  function atualizarSituacao() {
    const v = $('[name=data]', raiz).value;
    const box = $('#sit-data', raiz);
    if (!v) { box.textContent = ''; return; }
    const ok = realizado(v);
    box.innerHTML = ok ? `<span style="color:var(--ok)">Situação: ${cfg.okRot.toLowerCase()}</span>` : `<span style="color:var(--warn)">Situação: ${cfg.pendRot.toLowerCase()} (data futura)</span>`;
  }
  function preencherPeloCusto() {
    linhas = linhas.filter((l) => l.etapaId || valorOk(l.valor));
    const noForm = {};
    linhas.forEach((l) => { if (l.etapaId) noForm[l.etapaId] = (noForm[l.etapaId] || 0) + (valorOk(l.valor) ? l.valor : 0); });
    let n = 0;
    for (const e of d.etapas) {
      const resta = r2(e.valor - (fora[e.id] || 0) - (noForm[e.id] || 0));
      if (resta > EPS) { linhas.push({ id: uid(), etapaId: e.id, tipo: e.tipo, categoria: catPadrao(), valor: resta }); n++; }
    }
    if (!linhas.length) linhas = [{ id: uid(), etapaId: '', tipo: 'previsto', categoria: catPadrao(), valor: null }];
    desenharLinhas();
    toast(n ? `${n} linha(s) preenchida(s) com o custo previsto ainda sem receita.` : 'Todas as etapas já têm receita igual ou maior que o custo previsto.');
  }

  async function salvar(m, outra) {
    const el = m.el;
    const val = (n) => { const x = $(`[name=${n}]`, el); return x ? x.value.trim() : ''; };
    const campos = { codigo: val('codigo').toUpperCase(), data: val('data'), fornecedor: val('fornecedor'), descricao: val('descricao') };
    $$('.erro', el).forEach((x) => x.classList.remove('erro'));
    let erro = '';
    if (!situacaoCodigo()) { $('[name=codigo]', el).classList.add('erro'); erro = $('#sit-codigo', el).textContent || 'Confira o código.'; }
    if (!campos.data) { $('[name=data]', el).classList.add('erro'); erro = erro || `Informe a ${cfg.dataRot.toLowerCase()}.`; }
    if (desp && !campos.fornecedor) { $('[name=fornecedor]', el).classList.add('erro'); erro = erro || 'Informe o fornecedor.'; }
    if (!campos.descricao) { $('[name=descricao]', el).classList.add('erro'); erro = erro || 'Informe a descrição.'; }
    const validas = linhas.filter((l) => l.etapaId || valorOk(l.valor));
    if (!validas.length) erro = erro || 'Distribua o valor em pelo menos uma etapa.';
    validas.forEach((l) => {
      const tr = $(`tr[data-l="${l.id}"]`, el);
      if (!l.etapaId || l.etapaId === '__nova') { $('[data-c=etapaId]', tr).classList.add('erro'); erro = erro || 'Selecione a etapa em todas as linhas.'; }
      if (!(l.valor > 0)) { $('[data-c=valor]', tr).classList.add('erro'); erro = erro || 'Informe valores maiores que zero.'; }
    });
    if (erro) { toast(erro); return; }
    const alocacoes = validas.map((l) => { const a = { id: uid(), etapaId: l.etapaId, tipo: l.tipo, valor: r2(l.valor) }; if (desp) a.categoria = l.categoria; return a; });
    const dados = { [cfg.data]: campos.data, descricao: campos.descricao, alocacoes };
    if (desp) dados.fornecedor = campos.fornecedor;
    let alvo;
    if (editando) {
      alvo = item;
      if (chaveCodigo(campos.codigo) !== chaveCodigo(item.codigo)) { dados.codigo = campos.codigo; dados.numero = numeroDoCodigo(campos.codigo); }
      Object.assign(alvo, dados, { atualizadaEm: new Date().toISOString() });
    } else {
      const automatico = chaveCodigo(campos.codigo) === chaveCodigo(auto.codigo);
      const numero = automatico ? auto.numero : numeroDoCodigo(campos.codigo);
      alvo = Object.assign({ id: uid(), numero, codigo: automatico ? auto.codigo : campos.codigo, criadaEm: new Date().toISOString(), atualizadaEm: null }, dados);
      d[cfg.col].push(alvo);
    }
    d.seq[cfg.seq] = Math.max(Math.floor(Number(d.seq[cfg.seq]) || 0), Math.floor(Number(alvo.numero) || 0));
    m.fechar();
    alterado();
    toast(`${alvo.codigo} ${editando ? 'atualizada' : 'lançada'}: ${brl(totalNota(alvo))}${realizado(alvo[cfg.data]) ? '' : ` (${cfg.pendRot.toLowerCase()} em ${dataBR(alvo[cfg.data])})`}`);
    if (outra) modalLanc(cfg, null);
  }

  abrirModal({
    titulo: editando ? `Editar ${item.codigo}` : opcoes.duplicar ? `Nova ${cfg.nome} (cópia de ${item.codigo})` : `Nova ${cfg.nome}`, largo: true, corpo, botoes,
    sub: editando && item.criadaEm ? `Registrada em ${dataHoraBR(item.criadaEm)}${item.atualizadaEm ? ' · alterada em ' + dataHoraBR(item.atualizadaEm) : ''}` : '',
    aoAbrir: (el) => {
      raiz = el;
      desenharLinhas();
      atualizarSituacao();
      situacaoCodigo();
      $('[name=codigo]', el).addEventListener('input', situacaoCodigo);
      $('[name=codigo]', el).addEventListener('blur', (e) => { e.target.value = e.target.value.trim().toUpperCase(); situacaoCodigo(); });
      const inpForn = $('[name=fornecedor]', el);
      if (inpForn) ligarSugestoes(inpForn, $('#sug-forn', el), buscarFornecedores, (it) => {
        inpForn.value = it.valor;
        const so = linhas.length === 1 && !linhas[0].etapaId && !valorOk(linhas[0].valor);
        if (it.cat && so && !categoriaTocada && linhas[0].categoria !== it.cat) {
          linhas[0].categoria = it.cat;
          desenharLinhas();
          toast(`Categoria preenchida pelo histórico: ${nomeCat(it.cat)}`);
        }
        const desc = $('[name=descricao]', el);
        if (desc && !desc.value.trim() && !matchMedia('(max-width: 760px)').matches) desc.focus();
      });
      const inpData = $('[name=data]', el);
      inpData.addEventListener('change', atualizarSituacao);
      inpData.addEventListener('input', atualizarSituacao);
      $('[data-hoje]', el).addEventListener('click', () => { inpData.value = hojeISO(); atualizarSituacao(); });
      const pre = $('[data-preencher]', el);
      if (pre) pre.addEventListener('click', preencherPeloCusto);
      $('[data-add-linha]', el).addEventListener('click', () => {
        const ult = linhas[linhas.length - 1];
        linhas.push({ id: uid(), etapaId: '', tipo: 'previsto', categoria: ult ? ult.categoria : catPadrao(), valor: null });
        desenharLinhas();
        const sel = $$('#aloc-linhas select[data-c=etapaId]', el).pop(); if (sel) sel.focus();
      });
      const tb = $('#aloc-linhas', el);
      tb.addEventListener('change', (e) => {
        const tr = e.target.closest('tr'); const l = linhas.find((x) => x.id === tr.dataset.l); const c = e.target.dataset.c;
        if (!l || !c) return;
        if (c === 'etapaId' && e.target.value === '__nova') {
          e.target.value = l.etapaId || '';
          modalEtapa(null, (nova) => { l.etapaId = nova.id; l.tipo = nova.tipo; fora[nova.id] = 0; desenharLinhas(); });
          return;
        }
        if (c === 'valor') { l.valor = parseValor(e.target.value); if (valorOk(l.valor)) e.target.value = numBR(l.valor); else if (e.target.value.trim()) e.target.classList.add('erro'); atualizarTotais(); return; }
        l[c] = e.target.value;
        if (c === 'categoria') categoriaTocada = true;
        if (c === 'etapaId') { const et = etapaPorId(d, l.etapaId); if (et) l.tipo = et.tipo; desenharLinhas(); }
        else atualizarTotais();
      });
      tb.addEventListener('input', (e) => {
        if (e.target.dataset.c !== 'valor') return;
        const l = linhas.find((x) => x.id === e.target.closest('tr').dataset.l);
        l.valor = parseValor(e.target.value);
        e.target.classList.remove('erro');
        atualizarTotais();
      });
      tb.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rem]'); if (!b) return;
        const id = b.closest('tr').dataset.l;
        linhas = linhas.filter((x) => x.id !== id);
        desenharLinhas();
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') e.preventDefault(); });
    },
  });
}

async function excluirLanc(cfg, n) {
  const quem = cfg.temFornecedor ? `${n.fornecedor}, ` : '';
  const ok = await confirmar({ titulo: `Excluir ${n.codigo}?`, msg: `${n.codigo} (${quem}${brl(totalNota(n))}) será excluída.\nO número ${n.codigo} não será reutilizado.`, ok: 'Excluir', perigo: true });
  if (!ok) return false;
  S.data[cfg.col] = S.data[cfg.col].filter((x) => x.id !== n.id);
  alterado();
  toast(`${n.codigo} excluída.`);
  return true;
}
const lancPorId = (cfg, id) => S.data[cfg.col].find((n) => n.id === id);
ACOES['nova-lanc'] = (el) => {
  const cfg = LANC[el.dataset.k];
  if (!S.data.etapas.length) { toast('Cadastre as etapas antes de lançar.'); irView('etapas'); return; }
  modalLanc(cfg, null);
};
ACOES['editar-lanc'] = (el) => { const cfg = LANC[el.dataset.k]; modalLanc(cfg, lancPorId(cfg, el.dataset.id)); };
ACOES['duplicar-lanc'] = (el) => { const cfg = LANC[el.dataset.k]; modalLanc(cfg, lancPorId(cfg, el.dataset.id), { duplicar: true }); };
ACOES['excluir-lanc'] = (el) => { const cfg = LANC[el.dataset.k]; excluirLanc(cfg, lancPorId(cfg, el.dataset.id)); };
ACOES['realizar-lanc'] = (el) => {
  const cfg = LANC[el.dataset.k];
  const n = lancPorId(cfg, el.dataset.id);
  abrirModal({
    titulo: `Registrar ${cfg.verbo} de ${n.codigo}`, sub: `${cfg.temFornecedor ? esc(n.fornecedor) + ' · ' : ''}${brl(totalNota(n))} · data atual ${dataBR(n[cfg.data])}`,
    corpo: `<label class="f"><span>${cfg.dataRot}</span><input class="inp" type="date" name="dp" value="${hojeISO()}" autofocus></label>`,
    botoes: [{ rot: 'Cancelar' }, {
      rot: `Registrar ${cfg.verbo}`, classe: 'primary', acao: (m) => {
        const v = $('[name=dp]', m.el).value;
        if (!v) { $('[name=dp]', m.el).classList.add('erro'); return; }
        n[cfg.data] = v; n.atualizadaEm = new Date().toISOString();
        m.fechar(); alterado(); toast(`${n.codigo}: ${cfg.verbo} registrado em ${dataBR(v)}.`);
      },
    }],
  });
};

/* ---------- fornecedores de todas as obras ---------- */
const FORN_IGNORAR = new Set(['nao informado', '(sem fornecedor)', 'sem fornecedor', '-']);
function diretorioFornecedores() {
  const mapa = new Map();
  const add = (nome, obraId, alocs, em) => {
    nome = String(nome || '').trim();
    const k = normTxt(nome);
    if (!k || FORN_IGNORAR.has(k)) return;
    const t = Date.parse(em || '') || 0;
    const r = mapa.get(k) || { nome, usos: 0, obras: new Set(), cats: {}, em: -1 };
    r.usos++; r.obras.add(obraId);
    if (t >= r.em) { r.nome = nome; r.em = t; }
    (alocs || []).forEach((a) => { if (a.categoria) r.cats[a.categoria] = (r.cats[a.categoria] || 0) + 1; });
    mapa.set(k, r);
  };
  if (S.modo === 'nuvem') {
    for (const r of S.rows.values()) if (r.tipo === 'nota' && !r.excluido && r.dados) add(r.dados.fornecedor, r.grupo, r.dados.alocacoes, r.dados.atualizadaEm || r.dados.criadaEm || r.atualizado_em);
  } else if (S.data) {
    S.data.notas.forEach((n) => add(n.fornecedor, S.data.id, n.alocacoes, n.atualizadaEm || n.criadaEm));
  }
  return [...mapa.values()].map((r) => {
    const cat = Object.entries(r.cats).sort((a, b) => b[1] - a[1])[0];
    return Object.assign(r, { cat: cat ? cat[0] : '' });
  });
}
function buscarFornecedores(t) {
  return diretorioFornecedores()
    .filter((f) => normTxt(f.nome).includes(t))
    .sort((a, b) => (normTxt(a.nome).startsWith(t) ? 0 : 1) - (normTxt(b.nome).startsWith(t) ? 0 : 1) || b.usos - a.usos || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((f) => ({
      titulo: f.nome, valor: f.nome, cat: f.cat,
      sub: [f.cat && CAT_NOME[f.cat] ? CAT_NOME[f.cat] : '', `${f.usos} nota${f.usos === 1 ? '' : 's'}`, `${f.obras.size} obra${f.obras.size === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
    }));
}
function realce(texto, t) {
  const alvo = String(texto || '');
  const i = t ? normTxt(alvo).indexOf(t) : -1;
  if (i < 0) return esc(alvo);
  return esc(alvo.slice(0, i)) + '<mark>' + esc(alvo.slice(i, i + t.length)) + '</mark>' + esc(alvo.slice(i + t.length));
}
/** Lista de sugestões própria (sem datalist): abre só ao digitar, até 5 itens, setas, Enter e Esc. */
function ligarSugestoes(entrada, caixa, fonte, aoEscolher) {
  let itens = [], marcado = -1, fechando = null, digitou = false;
  const fechar = () => { caixa.hidden = true; caixa.innerHTML = ''; itens = []; marcado = -1; };
  function abrir() {
    clearTimeout(fechando);
    const t = normTxt(entrada.value).trim();
    if (!t) { fechar(); return; }
    itens = fonte(t).slice(0, 5);
    if (!itens.length) { fechar(); return; }
    caixa.innerHTML = itens.map((it, i) => `<button type="button" class="sug" data-i="${i}" aria-selected="false"><span class="n">${realce(it.titulo, t)}</span>${it.sub ? `<span class="e">${esc(it.sub)}</span>` : ''}</button>`).join('');
    caixa.hidden = false;
    marcado = -1;
    setTimeout(() => { if (!caixa.hidden && caixa.scrollIntoView) caixa.scrollIntoView({ block: 'nearest' }); }, 40);
  }
  const marcar = () => $$('.sug', caixa).forEach((b, i) => b.setAttribute('aria-selected', String(i === marcado)));
  function escolher(i) { const it = itens[i]; fechar(); if (it) aoEscolher(it); }
  entrada.addEventListener('input', () => { digitou = true; abrir(); });
  entrada.addEventListener('focus', () => { if (digitou && entrada.value.trim()) abrir(); });
  entrada.addEventListener('blur', () => { fechando = setTimeout(fechar, 180); });
  entrada.addEventListener('keydown', (ev) => {
    if (caixa.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (marcado < 0) marcado = ev.key === 'ArrowDown' ? 0 : itens.length - 1;
      else marcado = (marcado + (ev.key === 'ArrowDown' ? 1 : itens.length - 1)) % itens.length;
      marcar();
    } else if (ev.key === 'Enter' && marcado >= 0) {
      ev.preventDefault(); escolher(marcado);
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation(); fechar();
    }
  });
  caixa.addEventListener('mousedown', (ev) => ev.preventDefault());
  caixa.addEventListener('click', (ev) => { const b = ev.target.closest('.sug'); if (b) escolher(+b.dataset.i); });
}

/* =========================================================
   Relatórios para impressão em A4 (e "Salvar como PDF")
   ========================================================= */

const cssStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';

function rpCabecalho(titulo, subtitulo = '') {
  const o = S.data.obra, e = S.config.empresa;
  return `<div class="rp-head"><div class="rp-logo"><img src="${logoAtual()}" alt="${esc(e.nome)}"></div>
    <div class="rp-tit"><h1>${esc(titulo)}</h1>${subtitulo ? `<div>${subtitulo}</div>` : ''}<div>Emitido em ${dataHoraBR(new Date().toISOString())}</div></div></div>
    <div class="rp-obra">
      <div><b>Obra:</b> ${esc(o.nome)}</div><div><b>Cliente:</b> ${esc(o.cliente || '-')}</div>
      <div><b>Endereço:</b> ${esc(o.endereco || '-')}</div><div><b>Regime:</b> ${REGIME_NOME[o.regime] || 'Não informado'}</div>
      <div><b>Início:</b> ${dataBR(o.dataInicio) || '-'}${o.status === 'concluida' && o.dataConclusao ? ` · <b>Conclusão:</b> ${dataBR(o.dataConclusao)}` : ''}</div><div><b>Status:</b> ${STATUS_NOME[o.status]}</div>
    </div>`;
}
const rpK = (rot, v, neg) => `<div><span>${rot}</span><b class="${neg ? 'neg' : ''}">${v}</b></div>`;
function rpKpis(t) {
  return `<div class="rp-kpis">
    ${rpK('Orçamento original', brl(t.orcOriginal))}${rpK('Ajustes no escopo original', sinal(t.ajustes))}${rpK('Aditivos previstos', brl(t.aditivos))}${rpK('Orçamento de custo atualizado', brl(t.orcAtualizado))}
    ${rpK('Custo lançado', brl(t.lancado))}${rpK('Pago', brl(t.pago))}${rpK('A pagar', brl(t.aPagar))}${rpK('Saldo do orçamento', brl(t.saldo), t.saldo < -EPS)}
  </div>`;
}
const SIT_CURTA = { estourado: 'Acima do previsto', atencao: 'Acima de 90%', ok: 'Dentro do previsto', sem_lancamento: 'Sem lançamentos' };
function rpTabelaEtapas(c) {
  const linha = (r) => `<tr><td>${esc(r.etapa.nome)}</td><td class="num">${brl(r.previsto)}</td><td class="num">${brl(r.lancado)}</td><td class="num">${brl(r.pago)}</td><td class="num ${r.saldo < -EPS ? 'neg' : ''}">${brl(r.saldo)}</td><td class="num">${r.previsto > 0 ? pct(r.pct) : '-'}</td><td><span class="chip ${STATUS_ETAPA[r.status].cls}">${SIT_CURTA[r.status]}</span></td></tr>`;
  const soma = (l) => l.reduce((a, r) => ({ p: a.p + r.previsto, l: a.l + r.lancado, pg: a.pg + r.pago, s: a.s + r.saldo }), { p: 0, l: 0, pg: 0, s: 0 });
  const tot = (rot, s, cls) => `<tr class="${cls}"><td>${rot}</td><td class="num">${brl(s.p)}</td><td class="num">${brl(s.l)}</td><td class="num">${brl(s.pg)}</td><td class="num">${brl(s.s)}</td><td class="num">${s.p > 0 ? pct(s.l / s.p) : '-'}</td><td></td></tr>`;
  const prev = c.etapas.filter((r) => r.etapa.tipo === 'previsto');
  const adit = c.etapas.filter((r) => r.etapa.tipo === 'aditivo');
  let body = '';
  if (adit.length) {
    body += `<tr class="sub"><td colspan="7">Escopo original</td></tr>${prev.map(linha).join('')}${tot('Subtotal escopo original', soma(prev), 'sub')}`;
    body += `<tr class="sub"><td colspan="7">Aditivos (serviços solicitados pelo cliente)</td></tr>${adit.map(linha).join('')}${tot('Subtotal aditivos', soma(adit), 'sub')}`;
  } else body = prev.map(linha).join('');
  return `<table><thead><tr><th style="width:30%">Etapa</th><th class="num">Custo previsto</th><th class="num">Custo lançado</th><th class="num">Pago</th><th class="num">Saldo</th><th class="num">%</th><th>Situação</th></tr></thead>
    <tbody>${body}</tbody><tfoot>${tot('Total da obra', soma(c.etapas), 'tot')}</tfoot></table>`;
}
function rpTipos(c) {
  const P = c.porTipo;
  const linha = (rot, p) => `<tr><td>${rot}</td><td class="num">${brl(p.orcado)}</td><td class="num">${brl(p.lancado)}</td><td class="num">${brl(p.pago)}</td><td class="num ${p.saldo < -EPS ? 'neg' : ''}">${brl(p.saldo)}</td><td class="num">${p.orcado > 0 ? pct(p.pct) : '-'}</td></tr>`;
  return `<div class="bloco">${legendaEtapas()}<div class="rp-chart">${graficoTipos(c)}</div></div>
    <table><thead><tr><th style="width:30%">Tipo</th><th class="num">Custo previsto</th><th class="num">Custo lançado</th><th class="num">Pago</th><th class="num">Saldo</th><th class="num">%</th></tr></thead>
    <tbody>${linha('Escopo original (Previsto)', P.previsto)}${linha('Aditivos', P.aditivo)}</tbody></table>
    <p class="obs">O custo lançado por tipo segue a classificação Previsto ou Aditivo informada em cada linha das notas.</p>`;
}
function rpRegistro(cfg, lista) {
  if (!lista.length) return `<p class="obs">Nenhuma ${cfg.nome} no período.</p>`;
  const d = S.data;
  const desp = cfg.chave === 'despesa';
  const hoje = hojeISO();
  const corpos = lista.map((n) => {
    const tot = totalNota(n);
    const nl = n.alocacoes.length;
    const ok = realizado(n[cfg.data], hoje);
    return `<tbody style="break-inside:avoid">${n.alocacoes.map((a, i) => {
      const e = etapaPorId(d, a.etapaId);
      const ini = i === 0 ? `<td rowspan="${nl}"><b>${esc(n.codigo)}</b></td><td rowspan="${nl}" class="nowrap">${dataBR(n[cfg.data])}${ok ? '' : `<div><b>${cfg.pendRot}</b></div>`}</td><td rowspan="${nl}">${desp ? `<b>${esc(n.fornecedor)}</b><div>${esc(n.descricao)}</div>` : esc(n.descricao)}</td>` : '';
      const fimC = i === 0 ? `<td rowspan="${nl}" class="num"><b>${brl(tot)}</b></td>` : '';
      return `<tr class="${i === 0 ? 'nota-sep' : ''}">${ini}<td>${esc(e ? e.nome : '(etapa excluída)')}</td>${desp ? `<td>${esc(nomeCat(a.categoria))}</td>` : ''}<td>${a.tipo === 'aditivo' ? '<b>Aditivo</b>' : 'Previsto'}</td><td class="num">${brl(a.valor)}</td>${fimC}</tr>`;
    }).join('')}</tbody>`;
  }).join('');
  const total = lista.reduce((s, n) => s + totalNota(n), 0);
  const ok = lista.filter((n) => realizado(n[cfg.data], hoje)).reduce((s, n) => s + totalNota(n), 0);
  const cols = desp ? 8 : 7;
  return `<table><thead><tr><th style="width:8%">${cfg.Nome}</th><th style="width:10%">${desp ? 'Pagamento' : 'Recebimento'}</th><th>${desp ? 'Fornecedor / descrição' : 'Descrição'}</th><th style="width:${desp ? 20 : 26}%">Etapa</th>${desp ? '<th style="width:10%">Categoria</th>' : ''}<th style="width:8%">Tipo</th><th class="num" style="width:11%">Valor</th><th class="num" style="width:11%">Total</th></tr></thead>
    ${corpos}<tfoot><tr class="tot"><td colspan="${cols - 1}">Total: ${lista.length} ${lista.length === 1 ? cfg.nome : cfg.plural} · ${cfg.okRot.toLowerCase()}s ${brl(ok)} · ${cfg.pendRot.toLowerCase()} ${brl(total - ok)}</td><td class="num">${brl(total)}</td></tr></tfoot></table>`;
}
function rpFornecedores(lista) {
  if (!lista.length) return '<p class="obs">Sem fornecedores.</p>';
  return `<table><thead><tr><th>Fornecedor</th><th class="num">Notas</th><th class="num">Lançado</th><th class="num">Pago</th><th class="num">A pagar</th></tr></thead><tbody>
    ${lista.map((f) => `<tr><td>${esc(f.nome)}</td><td class="num">${f.notas}</td><td class="num">${brl(f.lancado)}</td><td class="num">${brl(f.pago)}</td><td class="num">${brl(f.aPagar)}</td></tr>`).join('')}</tbody></table>`;
}
function rpPendentes(cfg, lista, total) {
  const desp = cfg.chave === 'despesa';
  if (!lista.length) return `<p class="obs">Não há valores ${desp ? 'a pagar' : 'a receber'}.</p>`;
  return `<table><thead><tr><th>${cfg.Nome}</th><th>Data prevista</th>${desp ? '<th>Fornecedor</th>' : ''}<th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>
    ${lista.map((n) => `<tr><td><b>${esc(n.codigo)}</b></td><td>${dataBR(n[cfg.data])}</td>${desp ? `<td>${esc(n.fornecedor)}</td>` : ''}<td>${esc(n.descricao)}</td><td class="num">${brl(totalNota(n))}</td></tr>`).join('')}
    </tbody><tfoot><tr class="tot"><td colspan="${desp ? 4 : 3}">Total ${desp ? 'a pagar' : 'a receber'}</td><td class="num">${brl(total)}</td></tr></tfoot></table>`;
}
function rpHistorico() {
  const h = S.data.historico;
  if (!h.length) return `<p class="obs">${S.data.orcamentoBase ? 'Nenhuma alteração registrada após a fixação do orçamento original.' : 'O orçamento original ainda não foi fixado; alterações não são registradas.'}</p>`;
  return `<table><thead><tr><th>Data</th><th>Etapa</th><th>Alteração</th><th class="num">De</th><th class="num">Para</th><th>Motivo</th></tr></thead><tbody>
    ${h.map((x) => `<tr><td class="nowrap">${dataHoraBR(x.data)}</td><td>${esc(x.etapaNome)}</td><td>${ACAO_HIST[x.acao] || x.acao}</td><td class="num">${fmtHist(x.de, x.acao)}</td><td class="num">${fmtHist(x.para, x.acao)}</td><td>${esc(x.motivo || '')}</td></tr>`).join('')}</tbody></table>`;
}
function rpOrcamento(c) {
  const d = S.data, t = c.totais;
  const base = d.orcamentoBase;
  const linhas = d.etapas.map((e) => {
    const r = c.porId[e.id];
    const orig = e.tipo === 'aditivo' ? 0 : r.original;
    const dif = e.valor - orig;
    return `<tr><td>${esc(e.nome)}</td><td>${TIPO_NOME[e.tipo]}</td><td class="num">${e.tipo === 'aditivo' ? '-' : brl(orig)}</td><td class="num">${brl(e.valor)}</td><td class="num">${Math.abs(dif) > EPS ? sinal(dif) : '-'}</td></tr>`;
  }).join('');
  const removidas = base ? Object.keys(base.etapas).filter((id) => !etapaPorId(d, id)) : [];
  const linhasRem = removidas.map((id) => `<tr><td><i>${esc(base.nomes[id] || 'Etapa excluída')} (excluída)</i></td><td>Previsto</td><td class="num">${brl(base.etapas[id])}</td><td class="num">${brl(0)}</td><td class="num">${sinal(-base.etapas[id])}</td></tr>`).join('');
  return `<p class="obs">${base ? `Orçamento original fixado em ${dataHoraBR(base.fixadoEm)}.` : 'O orçamento original ainda não foi fixado. Os valores originais correspondem aos custos atuais das etapas previstas.'} Valores de custo previsto.</p>
    <table><thead><tr><th>Etapa</th><th>Tipo</th><th class="num">Original</th><th class="num">Atual</th><th class="num">Variação</th></tr></thead><tbody>${linhas}${linhasRem}</tbody>
    <tfoot><tr class="tot"><td colspan="2">Escopo original</td><td class="num">${brl(t.orcOriginal)}</td><td class="num">${brl(t.previstoAtual)}</td><td class="num">${Math.abs(t.ajustes) > EPS ? sinal(t.ajustes) : '-'}</td></tr>
    <tr class="tot"><td colspan="2">Aditivos</td><td class="num">-</td><td class="num">${brl(t.aditivos)}</td><td class="num">${sinal(t.aditivos)}</td></tr>
    <tr class="tot"><td colspan="2">Orçamento de custo atualizado</td><td class="num">${brl(t.orcOriginal)}</td><td class="num">${brl(t.orcAtualizado)}</td><td class="num">${sinal(t.orcAtualizado - t.orcOriginal)}</td></tr></tfoot></table>`;
}
function rpAssinatura() {
  const e = S.config.empresa;
  if (!e.responsavel) return '';
  return `<div class="rp-assin"><div><b>${esc(e.responsavel)}</b>${e.registro ? `<br>${esc(e.registro)}` : ''}<br>${esc(e.nome)}</div></div>`;
}
function rpRodapeEmpresa() {
  const e = S.config.empresa;
  return `<p class="obs" style="margin-top:14px;text-align:center">${esc([e.nome, e.cnpj ? 'CNPJ ' + e.cnpj : '', e.contato].filter(Boolean).join(' · '))}</p>`;
}
const semLinks = (h) => h.replace(/<a [^>]*>([^<]*)<\/a>/g, '$1');

/* ---------- montagem dos relatórios ---------- */
function relatorioGerencial() {
  const c = calcular(S.data);
  return rpCabecalho('Relatório gerencial', 'Situação financeira da obra') +
    `<h2>Custos</h2>${rpKpis(c.totais)}
    <h2>Resultado da obra</h2>${resultadoHTML(c, true)}
    <h2>Previsto x realizado por tipo</h2>${rpTipos(c)}
    <div class="bloco"><h2>Orçado x executado por etapa</h2>${legendaEtapas()}<div class="rp-chart">${graficoEtapas(c)}</div></div>
    ${rpTabelaEtapas(c)}
    <h2>Alertas de orçamento</h2>${semLinks(alertasHTML(c))}
    <div class="bloco"><h2>Fluxo mensal</h2><div class="rp-chart">${graficoFluxo(c, 12)}</div></div>${tabelaFluxo(c, '')}
    <h2>Custos por categoria</h2>${tabelaCategorias(c, '')}
    <h2>Principais fornecedores</h2>${rpFornecedores(c.fornecedores.slice(0, 12))}
    <h2>Contas a pagar</h2>${rpPendentes(LANC.despesa, c.pendentes, c.totais.aPagar)}
    <h2>Receitas a receber</h2>${rpPendentes(LANC.receita, c.aReceber, c.totais.aReceber)}
    ${rpRodapeEmpresa()}`;
}
function noPeriodo(cfg, de, ate) {
  const dentro = (dt) => dt && (!de || dt >= de) && (!ate || dt <= ate);
  return S.data[cfg.col].filter((n) => dentro(n[cfg.data])).sort((a, b) => (a[cfg.data] || '').localeCompare(b[cfg.data] || '') || a.numero - b.numero);
}
function relatorioPeriodo(de, ate, comReceitas) {
  const notas = noPeriodo(LANC.despesa, de, ate);
  const receitas = comReceitas ? noPeriodo(LANC.receita, de, ate) : [];
  const sub = `Período de ${dataBR(de) || 'início'} a ${dataBR(ate) || 'hoje'} · notas pela data de pagamento${comReceitas ? ', receitas pela data de recebimento' : ''}`;
  const c = calcular(Object.assign({}, S.data, { notas, receitas }));
  const t = c.totais;
  const etapasComValor = c.etapas.filter((r) => r.lancado > EPS || r.receita > EPS);
  const kpis = `<div class="rp-kpis">${rpK('Saídas (notas)', brl(t.lancado))}${rpK('Pagas', brl(t.pago))}${rpK('A pagar', brl(t.aPagar))}${rpK('Notas no período', String(notas.length))}
    ${comReceitas ? `${rpK('Entradas (receitas)', brl(t.receita))}${rpK('Recebidas', brl(t.recebido))}${rpK('A receber', brl(t.aReceber))}${rpK('Entradas menos saídas', brl(t.receita - t.lancado), t.receita - t.lancado < -EPS)}` : ''}</div>`;
  return rpCabecalho('Registro financeiro por período', sub) + kpis +
    `<h2>Notas e despesas</h2>${rpRegistro(LANC.despesa, notas)}
    ${comReceitas ? `<h2>Receitas</h2>${rpRegistro(LANC.receita, receitas)}` : ''}
    ${etapasComValor.length ? `<div class="duas"><div><h2>Por etapa no período</h2><table><thead><tr><th>Etapa</th><th class="num">Custo</th>${comReceitas ? '<th class="num">Receita</th>' : '<th class="num">Pago</th>'}</tr></thead><tbody>
      ${etapasComValor.map((r) => `<tr><td>${esc(r.etapa.nome)}${r.etapa.tipo === 'aditivo' ? ' <i>(aditivo)</i>' : ''}</td><td class="num">${brl(r.lancado)}</td><td class="num">${brl(comReceitas ? r.receita : r.pago)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="tot"><td>Total</td><td class="num">${brl(t.lancado)}</td><td class="num">${brl(comReceitas ? t.receita : t.pago)}</td></tr></tfoot></table></div>
      <div><h2>Custos por categoria no período</h2>${tabelaCategorias(c, '')}</div></div>` : ''}
    ${rpRodapeEmpresa()}`;
}
function relatorioCompleto() {
  const d = S.data;
  const c = calcular(d);
  const o = d.obra;
  const notas = d.notas.slice().sort((a, b) => a.numero - b.numero);
  const receitas = d.receitas.slice().sort((a, b) => a.numero - b.numero);
  return rpCabecalho('Relatório completo da obra', o.status === 'concluida' ? 'Fechamento financeiro' : 'Posição financeira consolidada') +
    `<h2>1. Dados da obra</h2>${o.observacoes ? `<p class="obs" style="color:#333;font-size:9pt;white-space:pre-line">${esc(o.observacoes)}</p>` : '<p class="obs">Dados cadastrais no cabeçalho acima.</p>'}
    <h2>2. Resumo financeiro</h2>${rpKpis(c.totais)}${resultadoHTML(c, true)}
    <h2>3. Orçamento original, aditivos e orçamento atualizado</h2>${rpOrcamento(c)}
    <h3>Histórico de alterações do orçamento</h3>${rpHistorico()}
    <div class="bloco"><h2>4. Execução por etapa</h2>${legendaEtapas()}<div class="rp-chart">${graficoEtapas(c)}</div></div>${rpTabelaEtapas(c)}
    <h2>5. Previsto x realizado por tipo</h2>${rpTipos(c)}
    <h2 class="quebra">6. Notas e despesas</h2>${rpRegistro(LANC.despesa, notas)}
    <h2>7. Receitas</h2>${rpRegistro(LANC.receita, receitas)}
    <h2>8. Resultado por etapa</h2>${tabelaResultadoEtapas(c, '')}
    <h2>9. Custos por categoria e por fornecedor</h2>${tabelaCategorias(c, '')}
    <h3>Etapa x categoria</h3>${matrizEtapaCategoria(c, '')}
    <h3>Fornecedores</h3>${rpFornecedores(c.fornecedores)}
    <div class="bloco"><h2>10. Fluxo mensal</h2><div class="rp-chart">${graficoFluxo(c)}</div></div>${tabelaFluxo(c, '')}
    <h2>11. Valores a pagar e a receber</h2><h3>A pagar</h3>${rpPendentes(LANC.despesa, c.pendentes, c.totais.aPagar)}<h3>A receber</h3>${rpPendentes(LANC.receita, c.aReceber, c.totais.aReceber)}
    <h2>12. Indicadores de saldo e estouro por etapa</h2>${semLinks(alertasHTML(c))}
    <p class="obs">Excedente somado das etapas acima do custo previsto: ${brl(c.totais.excedente)}. Saldo global do orçamento de custo: ${brl(c.totais.saldo)}. Resultado (receitas menos custos): ${brl(c.totais.resultado)}.</p>
    ${rpAssinatura()}${rpRodapeEmpresa()}`;
}

/* ---------- impressão ---------- */
function estiloPagina(rodape) {
  let st = $('#estilo-pagina');
  if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
  st.textContent = `@page{size:A4 portrait;margin:13mm 12mm 15mm 12mm;
    @bottom-left{content:${cssStr(rodape)};font-family:"Segoe UI",Arial,sans-serif;font-size:7.5pt;color:#777}
    @bottom-right{content:"Página " counter(page) " de " counter(pages);font-family:"Segoe UI",Arial,sans-serif;font-size:7.5pt;color:#777}}`;
}
function montarImpressao(tipo, op = {}) {
  let html, nome;
  const obra = S.data.obra.nome || 'Obra';
  if (tipo === 'gerencial') { html = relatorioGerencial(); nome = `Relatório gerencial - ${obra} - ${hojeISO()}`; }
  else if (tipo === 'periodo') { html = relatorioPeriodo(op.de, op.ate, op.rec !== false); nome = `Registro financeiro ${op.de || ''} a ${op.ate || ''} - ${obra}`; }
  else { html = relatorioCompleto(); nome = `Relatório completo - ${obra} - ${hojeISO()}`; }
  $('#print-root').innerHTML = `<div class="rp">${html}</div>`;
  estiloPagina(`${S.config.empresa.nome || ''} · ${obra} · emitido em ${dataHoraBR(new Date().toISOString())}`);
  return nome;
}
function imprimir(tipo, op) {
  if (!S.data.etapas.length && tipo !== 'periodo') { toast('Cadastre as etapas antes de imprimir.'); return; }
  const nome = montarImpressao(tipo, op);
  const tituloAnt = document.title;
  document.title = nome.replace(/[\\/:*?"<>|]/g, '-');
  document.body.classList.add('imprimindo');
  const fim = () => {
    document.body.classList.remove('imprimindo');
    document.title = tituloAnt;
    $('#print-root').innerHTML = '';
    window.removeEventListener('afterprint', fim);
  };
  window.addEventListener('afterprint', fim);
  const imgs = $$('#print-root img');
  Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()))).then(() => setTimeout(() => window.print(), 60));
}
ACOES.imprimir = (el) => {
  const tipo = el.dataset.tipo;
  if (tipo === 'periodo') {
    const de = ($('#rp-de') || {}).value || '', ate = ($('#rp-ate') || {}).value || '';
    if (de && ate && de > ate) { toast('A data inicial é posterior à data final.'); return; }
    imprimir('periodo', { de, ate, rec: !!($('#rp-rec') || {}).checked });
  } else imprimir(tipo);
};


/* =========================================================
   Registro no sistema
   ========================================================= */
document.body.appendChild(_tip);
Sis.obrasConfig = { cardCategorias: () => cardCategorias(), cardEmpresa: () => cardEmpresa() };
Sis.obrasResumo = () => {
  const hoje = hojeISO();
  const ate = Sis.util.isoData(Sis.util.somaDias(new Date(), 7));
  return listaObras().filter((d) => d.obra.status === 'em_andamento').map((d) => {
    const t = calcular(d).totais;
    const aPagar7 = d.notas.filter((n) => n.dataPagamento > hoje && n.dataPagamento <= ate).reduce((s, n) => s + totalNota(n), 0);
    return { id: d.id, nome: d.obra.nome, cliente: d.obra.cliente, pct: t.orcAtualizado > 0 ? t.lancado / t.orcAtualizado : 0, lancado: t.lancado, orcado: t.orcAtualizado, aPagar7 };
  });
};
Sis.usosCli.push((id) => ({ n: listaObras().filter((d) => d.obra.clienteId === id).length, rot: 'obra', plural: 'obras' }));
Sis.modulo({
  id: 'obras', nome: 'Obras', desc: 'Custos e receitas', icone: 'obras', sistema: true,
  render(el, partes) {
    raiz = el;
    aplicarCategoriasDosRegistros();
    if (partes[0]) {
      if (!carregarObra(partes[0])) { S.data = null; el.innerHTML = '<div class="card"><div class="empty"><b>Obra não encontrada</b><a href="#/obras">Ver todas as obras</a></div></div>'; return; }
      S.view = VIEWS.some((v) => v[0] === partes[1]) ? partes[1] : 'painel';
    } else S.data = null;
    render();
  },
  buscar(t) {
    const out = [];
    const obras = listaObras();
    obras.filter((d) => normTxt(d.obra.nome).includes(t) || normTxt(d.obra.cliente).includes(t)).slice(0, 3)
      .forEach((d) => out.push({ tipo: 'Obra', titulo: d.obra.nome, sub: d.obra.cliente, rota: `#/obras/${d.id}/painel` }));
    obras.forEach((d) => d.notas.forEach((n) => {
      if (out.length >= 8) return;
      if (normTxt([n.codigo, n.fornecedor, n.descricao].join(' ')).includes(t)) out.push({ tipo: 'Nota', titulo: `${n.codigo} ${n.fornecedor || ''}`.trim(), sub: `${d.obra.nome}, ${brl(totalNota(n))}`, rota: `#/obras/${d.id}/notas` });
    }));
    return out;
  },
});
})();
