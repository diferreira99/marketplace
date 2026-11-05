'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { recomendar } = require('../lib/recomendacao');
const { extrair, sugestoesMarketplaces } = require('../lib/seointerno');
const { analisar } = require('../lib/analise');
const { calcular } = require('../lib/margem');
const fx = require('./fixtures');

test('SEO interno: lê o formato do Mercado Livre e da Amazon', () => {
  assert.deepStrictEqual(extrair({ q: 'fita', suggested_queries: [{ q: 'Fita de borda 22mm' }, { q: 'fita de borda branca' }] }), ['fita de borda 22mm', 'fita de borda branca']);
  assert.deepStrictEqual(extrair({ suggestions: [{ value: 'fita de borda pvc' }, { value: 'fita de borda pvc' }] }), ['fita de borda pvc']);
  assert.deepStrictEqual(extrair({ outra: 1 }), []);
});

test('SEO interno: canal que não responde vira null, sem derrubar', async () => {
  const r = await sugestoesMarketplaces('fita', async u => {
    if (u.includes('mlstatic')) return { ok: true, json: async () => ({ suggested_queries: [{ q: 'fita a' }, { q: 'fita b' }] }) };
    throw new Error('bloqueado');
  });
  assert.deepStrictEqual(r.mercadolivre, ['fita a', 'fita b']);
  assert.strictEqual(r.amazon, null);
});

test('recomendação: sem custo, decide por demanda/concorrência/preço e avisa', () => {
  const d = analisar(fx.termo, { ...fx.respostas, internas: { mercadolivre: ['a', 'b', 'c', 'd', 'e', 'f'], amazon: null } });
  const r = recomendar(d, null);
  assert.strictEqual(r.semCusto, true);
  assert.strictEqual(r.ranking.length, 3);
  assert.ok(r.ranking[0].nota >= r.ranking[1].nota && r.ranking[1].nota >= r.ranking[2].nota);
  assert.ok(['mercadolivre', 'shopee'].includes(r.vencedor), 'vencedor ' + r.vencedor);
  assert.ok(r.estrategia.startsWith('Comece pelo'));
  const ml = r.ranking.find(x => x.id === 'mercadolivre');
  assert.ok(ml.pros.some(p => /variações/.test(p)));
});

test('recomendação: com custo alto, canal com prejuízo cai e é citado', () => {
  const d = analisar(fx.termo, fx.respostas);
  const precos = { mercadolivre: d.marketplaces.mercadolivre.precos.mediana, shopee: d.marketplaces.shopee.precos.mediana, amazon: d.marketplaces.amazon.precos.mediana };
  const c = calcular({ precos, custo: 14, embalagem: 1 });
  const r = recomendar(d, { mercadolivre: c.mercadolivre, shopee: c.shopee, amazon: c.amazon });
  const sp = r.ranking.find(x => x.id === 'shopee');
  assert.ok(sp.margem.lucro <= 0);
  assert.strictEqual(sp.partes.margem, 0);
  assert.ok(sp.contras.some(x => /prejuízo/.test(x)));
  assert.notStrictEqual(r.vencedor, 'shopee');
});

test('recomendação: pouca concorrência sem demanda não ganha (Amazon com 1 anúncio e sem vendas)', () => {
  const d = analisar(fx.termo, { ...fx.respostas, internas: { mercadolivre: ['a', 'b', 'c', 'd', 'e', 'f'], amazon: null } });
  const precos = { mercadolivre: d.marketplaces.mercadolivre.precos.mediana, shopee: d.marketplaces.shopee.precos.mediana, amazon: d.marketplaces.amazon.precos.mediana };
  const c = calcular({ precos, custo: 4.5, embalagem: 0.8 });
  const r = recomendar(d, { mercadolivre: c.mercadolivre, shopee: c.shopee, amazon: c.amazon });
  assert.notStrictEqual(r.vencedor, 'amazon');
  const az = r.ranking.find(x => x.id === 'amazon');
  assert.ok(az.contras.some(x => /Pouca evidência/.test(x)));
  assert.ok(az.partes.concorrencia < 15);
  assert.ok(!/pelo Amazon|o Amazon/.test(r.estrategia), r.estrategia);
  assert.ok(/(pelo Mercado Livre|pela Shopee)/.test(r.estrategia), r.estrategia);
});

test('recomendação: sem dados em lugar nenhum, não inventa vencedor', () => {
  const r = recomendar(analisar('xyz', {}), null);
  assert.strictEqual(r.vencedor, null);
  assert.match(r.estrategia, /Nenhum canal/);
});
