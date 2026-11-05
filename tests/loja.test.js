'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criar } = require('../lib/armazem');
const { analisar } = require('../lib/analise');
const { precoIdeal } = require('../lib/precoideal');
const { proximas, datasDoAno, extra, blackFriday } = require('../lib/calendario');
const { temasPorRegra, codigosML } = require('../lib/avaliacoes');
const mlconta = require('../lib/mlconta');
const catalogo = require('../api/catalogo');
const avaliacoes = require('../api/avaliacoes');
const mlApi = require('../api/ml-conta');
const { calcularCanal, precoParaMargem, TAXAS_PADRAO } = require('../lib/margem');
const fx = require('./fixtures');

function blobFalso() {
  const dados = new Map(); let n = 0;
  return {
    __teste: true, dados,
    async get(c) { if (!dados.has(c)) return null; const d = dados.get(c); return { statusCode: 200, stream: new Response(d.corpo).body, blob: { etag: d.etag } }; },
    async put(c, corpo, op) { const a = dados.get(c); if (op && op.ifMatch && (!a || a.etag !== op.ifMatch)) throw new Error('Precondition failed'); dados.set(c, { corpo, etag: 'e' + (++n) }); },
    async del(c) { dados.delete(c); },
  };
}
function resFalsa() {
  const r = { code: 0, body: null, headers: {}, fim: false };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => { r.fim = true; };
  return r;
}
const H = { 'x-senha': 'segredo-teste', host: 'radar.exemplo' };
process.env.PAINEL_SENHA = 'segredo-teste';

test('preço ideal: com folga, apertado, acima e sem custo', () => {
  const pontos = [{ preco: 15 }, { preco: 18, vendidos: 500 }, { preco: 20, vendidos: 1000 }, { preco: 22 }, { preco: 30 }];
  const a = precoIdeal(pontos, 12);
  assert.strictEqual(a.situacao, 'folga'); assert.ok(a.sugerido >= 17.9 && a.sugerido <= 20.9, a.sugerido); assert.ok(String(a.sugerido).endsWith('.9'));
  assert.strictEqual(precoIdeal(pontos, 21.5).situacao, 'apertado');
  assert.strictEqual(precoIdeal(pontos, 40).situacao, 'acima');
  assert.strictEqual(precoIdeal(pontos, null).situacao, 'sem-custo');
  assert.strictEqual(precoIdeal([{ preco: 10 }], 5).suficiente, false);
});

test('preço mínimo da Shopee respeita a faixa (20% + R$ 4 até R$ 79,99)', () => {
  const t = TAXAS_PADRAO.shopee;
  const p = precoParaMargem(10, 1, 6, t, 25);
  const r = calcularCanal(p, 10, 1, 6, t);
  assert.ok(r.margem >= 24.9, `preço ${p} margem ${r.margem}`);
});

test('calendário: datas certas e unidades extras', () => {
  assert.strictEqual(blackFriday(2026).toISOString().slice(0, 10), '2026-11-27');
  assert.strictEqual(blackFriday(2027).toISOString().slice(0, 10), '2027-11-26');
  const maes = datasDoAno(2027).find(x => /Mães/.test(x.nome)); assert.strictEqual(maes.data.toISOString().slice(0, 10), '2027-05-09');
  const px = proximas(new Date('2026-11-05T12:00:00Z'), 3);
  assert.deepStrictEqual(px.map(x => x.nome), ['11.11 (Shopee e Mercado Livre)', 'Black Friday', 'Cyber Monday']);
  assert.strictEqual(px[0].atrasado, true);
  assert.strictEqual(extra(300, 3), 300);
});

test('avaliações: códigos MLB e temas de reclamação', () => {
  assert.deepStrictEqual(codigosML(['https://produto.mercadolivre.com.br/MLB-123456789-x', 'https://x.com', 'https://www.mercadolivre.com.br/p/MLB987654321']), ['MLB123456789', 'MLB987654321']);
  const r = temasPorRegra([{ reviews: [{ nota: 1, titulo: 'Não cola', texto: 'descolou em 2 dias' }, { nota: 2, titulo: '', texto: 'veio menor que o anúncio' }, { nota: 5, titulo: 'ótima', texto: 'segurou o espelho' }] }]);
  assert.strictEqual(r.negativos, 2); assert.strictEqual(r.positivos, 1);
  assert.deepStrictEqual(r.temas.map(t => t.tema).sort(), ['Medida diferente do anúncio', 'Não cola / descola']);
});

test('API avaliações: lê reviews do ML e guarda', async () => {
  const arm = criar(blobFalso());
  await arm.salvar(analisar(fx.termo, fx.respostas));
  let urls = [];
  const fetch = async u => { urls.push(u); if (u.includes('/reviews/item/')) return { ok: true, json: async () => ({ rating_average: 4.1, paging: { total: 3 }, reviews: [{ rate: 1, title: 'ruim', content: 'descola fácil' }, { rate: 5, title: 'bom', content: 'ok' }] }) }; return { ok: false }; };
  const r = resFalsa();
  await avaliacoes({ method: 'POST', headers: H, body: { termo: fx.termo } }, r, { armazem: arm, fetch });
  assert.strictEqual(r.code, 200); assert.ok(r.body.anuncios >= 2); assert.strictEqual(r.body.temas[0].tema, 'Não cola / descola');
  assert.ok(urls.some(u => u.includes('MLB123456789')));
  const r2 = resFalsa();
  await avaliacoes({ method: 'POST', headers: H, body: { termo: fx.termo } }, r2, { armazem: arm, fetch: async () => { throw new Error('não devia chamar'); } });
  assert.strictEqual(r2.body.doCache, true);
});

test('API catálogo: salva produto com variações, limpa campos, remove', async () => {
  const arm = criar(blobFalso());
  let r = resFalsa();
  await catalogo({ method: 'POST', headers: H, body: { acao: 'salvar', produto: { nome: 'Fita EVA', palavraChave: 'fita eva espelho', variacoes: [{ rotulo: '12 mm', custo: '1.5', pesoKg: 0.05 }, { rotulo: '19 mm', custo: -3 }] } } }, r, { armazem: arm });
  assert.strictEqual(r.code, 200);
  const p = r.body.produto;
  assert.match(p.id, /^[a-f0-9]{12}$/); assert.strictEqual(p.variacoes.length, 2);
  assert.strictEqual(p.variacoes[0].custo, 1.5); assert.strictEqual(p.variacoes[1].custo, 0);
  p.variacoes[1].custo = 2.2;
  r = resFalsa();
  await catalogo({ method: 'POST', headers: H, body: { acao: 'salvar', produto: p } }, r, { armazem: arm });
  assert.strictEqual(r.body.produtos.length, 1); assert.strictEqual(r.body.produtos[0].variacoes[1].custo, 2.2);
  r = resFalsa();
  await catalogo({ method: 'POST', headers: H, body: { acao: 'remover', id: p.id } }, r, { armazem: arm });
  assert.strictEqual(r.body.produtos.length, 0);
});

test('conta ML: sem app configurado explica; com app faz o fluxo OAuth e lê a loja', async () => {
  const arm = criar(blobFalso());
  delete process.env.ML_CLIENT_ID; delete process.env.ML_CLIENT_SECRET;
  let r = resFalsa();
  await mlApi({ method: 'GET', headers: H, query: {} }, r, { armazem: arm });
  assert.deepStrictEqual([r.body.conectado, r.body.configurado, r.body.redirect], [false, false, 'https://radar.exemplo/api/ml-conta']);
  process.env.ML_CLIENT_ID = '123'; process.env.ML_CLIENT_SECRET = 'segredo';
  r = resFalsa();
  await mlApi({ method: 'POST', headers: H, body: { acao: 'conectar' }, query: {} }, r, { armazem: arm });
  const state = new URL(r.body.url).searchParams.get('state');
  assert.match(r.body.url, /^https:\/\/auth\.mercadolivre\.com\.br\/authorization\?response_type=code&client_id=123/);
  // state errado é recusado
  r = resFalsa();
  await mlApi({ method: 'GET', headers: { host: 'radar.exemplo' }, query: { code: 'X', state: 'errado' } }, r, { armazem: arm });
  assert.strictEqual(r.headers.Location, '/?ml=erro-state#loja');
  const fetch = async (u, op) => {
    if (u.endsWith('/oauth/token')) { assert.match(op.body, /grant_type=authorization_code/); return { ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', user_id: 99, expires_in: 21600 }) }; }
    if (u.endsWith('/users/me')) return { ok: true, json: async () => ({ id: 99, nickname: 'FABRICA', seller_reputation: { level_id: '5_green', power_seller_status: 'gold' } }) };
    if (u.includes('/items/search')) return { ok: true, json: async () => ({ results: ['MLB1', 'MLB2'] }) };
    if (u.includes('/items?ids=')) return { ok: true, json: async () => [{ code: 200, body: { id: 'MLB1', title: 'Fita EVA 19mm', price: 24.9, available_quantity: 50, sold_quantity: 800, listing_type_id: 'gold_special' } }, { code: 200, body: { id: 'MLB2', title: 'Fita EVA 12mm', price: 19.9, available_quantity: 0, sold_quantity: 10 } }] };
    if (u.includes('/items/visits')) return { ok: true, json: async () => [{ item_id: 'MLB1', total_visits: 1000 }, { item_id: 'MLB2', total_visits: 30 }] };
    if (u.includes('/orders/search')) return { ok: true, json: async () => ({ paging: { total: 2 }, results: [{ order_items: [{ item: { id: 'MLB1' }, quantity: 3, unit_price: 24.9 }] }, { order_items: [{ item: { id: 'MLB1' }, quantity: 2, unit_price: 24.9 }] }] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  r = resFalsa();
  await mlApi({ method: 'GET', headers: { host: 'radar.exemplo' }, query: { code: 'CODIGO', state } }, r, { armazem: arm, fetch });
  assert.strictEqual(r.headers.Location, '/?ml=ok#loja');
  r = resFalsa();
  await mlApi({ method: 'GET', headers: H, query: {} }, r, { armazem: arm, fetch });
  assert.strictEqual(r.body.conectado, true); assert.strictEqual(r.body.vendedor.apelido, 'FABRICA');
  assert.deepStrictEqual([r.body.totais.pedidos, r.body.totais.unidades, r.body.totais.visitas], [2, 5, 1030]);
  assert.strictEqual(r.body.itens[0].id, 'MLB1'); assert.strictEqual(r.body.itens[0].conversao, 0.5);
  // token vencido é renovado com o refresh_token
  const c = await arm.lerArquivo(mlconta.ARQ); await arm.mudarArquivo(mlconta.ARQ, () => ({ ...c, expira: 0 }));
  let renovou = false;
  const tk = await mlconta.token(arm, async (u, op) => { renovou = /grant_type=refresh_token/.test(op.body); return { ok: true, json: async () => ({ access_token: 'AT2', expires_in: 21600 }) }; });
  assert.strictEqual(renovou, true); assert.strictEqual(tk.access_token, 'AT2'); assert.strictEqual(tk.refresh_token, 'RT');
  r = resFalsa();
  await mlApi({ method: 'POST', headers: H, body: { acao: 'desconectar' }, query: {} }, r, { armazem: arm });
  assert.strictEqual(await arm.lerArquivo(mlconta.ARQ), null);
});
