'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { analisar, lerPrecos, lerVendidos, ehAnuncio } = require('../lib/analise');
const handler = require('../api/pesquisa');
const fx = require('./fixtures');

test('lê preços em reais', () => {
  assert.deepStrictEqual(lerPrecos('de R$ 1.299,00 por R$12,90 ou R$ 29'), [1299, 12.9, 29]);
  assert.deepStrictEqual(lerPrecos('sem preço'), []);
});

test('lê vendidos', () => {
  assert.strictEqual(lerVendidos('+1 mil vendidos'), 1000);
  assert.strictEqual(lerVendidos('2,3 mil vendidos'), 2300);
  assert.strictEqual(lerVendidos('+500 vendidos'), 500);
  assert.strictEqual(lerVendidos('87 vendidos'), 87);
  assert.strictEqual(lerVendidos('nada aqui'), null);
});

test('separa anúncio de página de lista', () => {
  assert.ok(ehAnuncio('mercadolivre', 'https://produto.mercadolivre.com.br/MLB-123-x'));
  assert.ok(!ehAnuncio('mercadolivre', 'https://lista.mercadolivre.com.br/fita'));
  assert.ok(ehAnuncio('shopee', 'https://shopee.com.br/x-i.1.2'));
  assert.ok(ehAnuncio('amazon', 'https://www.amazon.com.br/dp/B0ABC'));
});

test('análise completa: nota, preços e marketplaces', () => {
  const d = analisar(fx.termo, fx.respostas);
  assert.strictEqual(d.marketplaces.mercadolivre.anuncios, 3);
  assert.strictEqual(d.marketplaces.mercadolivre.paginas, 4);
  assert.strictEqual(d.marketplaces.shopee.anuncios, 3);
  assert.strictEqual(d.marketplaces.shopee.maxVendidos, 2300);
  assert.strictEqual(d.marketplaces.amazon.anuncios, 1);
  assert.strictEqual(d.shopping.lojas, 5);
  // o kit de R$ 1.299 fica fora da faixa (mais de 5x a mediana)
  assert.ok(d.precos.max < 100, 'max ' + d.precos.max);
  assert.ok(d.precos.mediana > 15 && d.precos.mediana < 30);
  assert.ok(d.validacao.nota >= 40 && d.validacao.nota <= 100, 'nota ' + d.validacao.nota);
  assert.strictEqual(d.seo.sugestoes.length, 6);
  assert.strictEqual(d.seo.marketplacesNoTop, 3);
  assert.ok(d.dicas.some(x => x.includes('cauda longa')));
});

test('sem dados: nota baixa e sem erro', () => {
  const d = analisar('xyz', {});
  assert.strictEqual(d.validacao.nivel, 'fraco');
  assert.strictEqual(d.precos.mediana, null);
});

function resFalsa() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
}

test('handler: exige senha e chave, e usa o cache', async () => {
  process.env.PAINEL_SENHA = 'segredo-teste';
  delete process.env.SERPER_API_KEY;
  let r = resFalsa();
  await handler({ method: 'POST', headers: { 'x-senha': 'errada' }, body: { termo: 'fita' } }, r);
  assert.strictEqual(r.code, 401);
  r = resFalsa();
  await handler({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, body: { termo: 'fita' } }, r);
  assert.strictEqual(r.code, 500);
  assert.match(r.body.erro, /SERPER_API_KEY/);
  r = resFalsa();
  await handler({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, body: { termo: 'x site:abc.com' } }, r);
  assert.strictEqual(r.code, 400);
});

test('pesquisar: 6 consultas no Serper, com o termo e os sites certos', async () => {
  const chamadas = [];
  const fetcher = async (url, op) => {
    const b = JSON.parse(op.body);
    chamadas.push({ url, q: b.q, gl: b.gl, key: op.headers['X-API-KEY'] });
    let corpo = {};
    if (url.endsWith('/shopping')) corpo = fx.respostas.shopping;
    else if (url.endsWith('/autocomplete')) corpo = fx.respostas.autocomplete;
    else if (b.q.includes('site:mercadolivre')) corpo = fx.respostas.mercadolivre;
    else if (b.q.includes('site:shopee')) corpo = fx.respostas.shopee;
    else if (b.q.includes('site:amazon')) corpo = fx.respostas.amazon;
    else corpo = fx.respostas.busca;
    return { ok: true, status: 200, json: async () => corpo };
  };
  const d = await handler.pesquisar(fx.termo, 'CHAVE-FALSA', fetcher);
  assert.strictEqual(chamadas.length, 6);
  assert.ok(chamadas.every(c => c.gl === 'br' && c.key === 'CHAVE-FALSA'));
  assert.ok(chamadas.some(c => c.q === fx.termo + ' site:shopee.com.br'));
  assert.strictEqual(d.creditos, 6);
  assert.strictEqual(d.falhas.length, 0);
  assert.strictEqual(d.marketplaces.mercadolivre.anuncios, 3);
});

test('pesquisar: uma fonte falhando não derruba o painel', async () => {
  const fetcher = async (url, op) => {
    if (url.endsWith('/shopping')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const d = await handler.pesquisar('teste', 'K', fetcher);
  assert.strictEqual(d.falhas.length, 1);
  assert.strictEqual(d.falhas[0].fonte, 'shopping');
});
