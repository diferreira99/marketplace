'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/tendencias');
const api = require('../api/historico');
const { criar } = require('../lib/armazem');

// 52 semanas: procura baixa no começo, alta nos últimos 3 meses e pico em novembro
function linhaTempo() {
  const ini = Date.UTC(2025, 10, 9) / 1000, sem = 7 * 86400;
  return Array.from({ length: 52 }, (_, i) => {
    const t = ini + i * sem, mes = new Date(t * 1000).getUTCMonth();
    return { time: String(t), value: [mes === 10 ? 100 : i >= 39 ? 70 : 40] };
  }).concat([{ time: String(ini + 52 * sem), value: [5], isPartial: true }]);
}
const prefixo = ")]}'\n";

test('resumir: tendência, meses fortes e ignora a semana incompleta', () => {
  const r = T.resumir({ default: { timelineData: linhaTempo() } });
  assert.strictEqual(r.pontos.length, 52);
  assert.strictEqual(r.tendencia, 'subindo'); assert.ok(r.variacao3m > 15);
  assert.strictEqual(r.mesesFortes[0], 'nov'); assert.strictEqual(r.pico.valor, 100);
});

function fetchFalso(chamadas) {
  return async (u) => {
    chamadas.push(u);
    if (u.includes('/trends/?geo')) return { ok: true, headers: { getSetCookie: () => ['NID=abc; path=/'] }, text: async () => '' };
    if (u.includes('/api/explore')) return { ok: true, text: async () => prefixo + JSON.stringify({ widgets: [{ id: 'TIMESERIES', token: 'TK', request: { a: 1 } }] }) };
    if (u.includes('/widgetdata/multiline')) return { ok: true, text: async () => ")]}',\n" + JSON.stringify({ default: { timelineData: linhaTempo() } }) };
    return { ok: false, status: 404, text: async () => '' };
  };
}

test('buscar: cookie, explore, token e pontos', async () => {
  const ch = []; const r = await T.buscar('fita dupla face', fetchFalso(ch));
  assert.strictEqual(r.pontos.length, 52); assert.ok(ch[2].includes('token=TK'));
});

function blobFalso() {
  const dados = new Map(); let n = 0;
  return { __teste: true, async get(c) { if (!dados.has(c)) return null; const d = dados.get(c); return { statusCode: 200, stream: new Response(d.corpo).body, blob: { etag: d.etag } }; },
    async put(c, corpo, op) { const a = dados.get(c); if (op && op.ifMatch && (!a || a.etag !== op.ifMatch)) throw new Error('Precondition failed'); dados.set(c, { corpo, etag: 'e' + (++n) }); }, async del(c) { dados.delete(c); } };
}
const res = () => { const r = { code: 0, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };

test('API: guarda por 7 dias e avisa quando o Google limita', async () => {
  process.env.PAINEL_SENHA = 'segredo-teste';
  const H = { 'x-senha': 'segredo-teste' }, arm = criar(blobFalso());
  let r = res(); await api({ method: 'GET', headers: H, query: { termo: 'fita eva', tendencia: '1' } }, r, { armazem: arm, fetch: fetchFalso([]) });
  assert.strictEqual(r.body.pontos.length, 52);
  r = res(); await api({ method: 'GET', headers: H, query: { termo: 'fita eva', tendencia: '1' } }, r, { armazem: arm, fetch: async () => { throw new Error('não devia chamar'); } });
  assert.strictEqual(r.body.doCache, true);
  const limita = async () => ({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' });
  r = res(); await api({ method: 'GET', headers: H, query: { termo: 'outra palavra', tendencia: '1' } }, r, { armazem: arm, fetch: limita });
  assert.strictEqual(r.body.indisponivel, true); assert.match(r.body.motivo, /limitou/);
});

test('API histórico: guarda e lista comparações de palavras-chave', async () => {
  process.env.PAINEL_SENHA = 'segredo-teste';
  const H = { 'x-senha': 'segredo-teste' }, arm = criar(blobFalso());
  const resultado = { lista: [{ termo: 'fita dupla face espelho', fontes: ['google'], forca: { total: 78 }, uso: 'título' }, { termo: 'fita eva', fontes: ['mercadolivre'], forca: { total: 50 }, uso: 'descrição e ficha' }], termos: ['fita', 'eva'] };
  let r = res(); await api({ method: 'POST', headers: H, query: {}, body: { acao: 'palavras', termo: 'fita espelho', resultado } }, r, { armazem: arm });
  assert.strictEqual(r.body.ok, true);
  r = res(); await api({ method: 'POST', headers: H, query: {}, body: { acao: 'palavras', termo: 'fita espelho', resultado } }, r, { armazem: arm });
  r = res(); await api({ method: 'GET', headers: H, query: { palavras: '1' } }, r, { armazem: arm });
  assert.strictEqual(r.body.itens.length, 1); assert.deepStrictEqual(r.body.itens[0].melhor, { termo: 'fita dupla face espelho', total: 78 });
  r = res(); await api({ method: 'GET', headers: H, query: { palavras: '1', termo: 'fita espelho' } }, r, { armazem: arm });
  assert.strictEqual(r.body.lista.length, 2); assert.strictEqual(r.body.lista[0].uso, 'título');
});
