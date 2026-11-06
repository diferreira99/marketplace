'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/perfil');
const T = require('../lib/tendencias');

test('perfil: quem compra, para que usa e o que pesa, em %', () => {
  const r = P.perfilCliente([
    'Usei no espelho do meu banheiro, segurou firme', 'Comprei para colar o espelho no meu quarto, fácil de aplicar',
    'Sou vidraceiro e uso na obra com meus clientes', 'Serve para espelho de 1 metro? aguenta o peso?', 'curto',
  ]);
  assert.strictEqual(r.base, 4);
  assert.strictEqual(r.quem[0].nome, 'Faz em casa (consumidor final)'); assert.strictEqual(r.quem[0].pct, 50);
  assert.strictEqual(r.usos[0].nome, 'Espelho ou vidro');
  assert.strictEqual(r.decisao[0].nome, 'Aguentar o peso / segurar firme');
});

test('perfil: junta textos de todas as fontes', () => {
  const t = P.textosDe({ itensML: [{ reviews: [{ titulo: 'Bom', texto: 'segurou' }] }], perguntas: { itens: [{ pergunta: 'serve?' }], google: ['como colar?'] },
    reclameAqui: { itens: [{ titulo: 'Descolou', trecho: 'caiu' }] }, outras: { itens: [{ trecho: 'ruim' }] }, videos: { itens: [{ titulo: 'Teste', trecho: '' }] } });
  assert.strictEqual(t.length, 6);
});

test('Trends: estados ordenados, sem os sem dados', () => {
  const e = T.lerEstados({ default: { geoMapData: [{ geoName: 'Minas Gerais', value: [80] }, { geoName: 'São Paulo', value: [100] }, { geoName: 'Acre', value: [0], hasData: false }] } });
  assert.deepStrictEqual(e.map(x => x.estado), ['São Paulo', 'Minas Gerais']);
});
