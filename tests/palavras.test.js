'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/palavras');

const base = { termo: 'fita eva espelho', seo: { sugestoes: ['fita de eva autocolante', 'Fita EVA espelho', 'fita eva preta'], internas: { mercadolivre: ['fita de eva autocolante', 'fita dupla face espelho'], amazon: null }, relacionadas: ['fita dupla face espelho'] } };

test('juntar: sem repetir, com as fontes, quem aparece mais vem primeiro', () => {
  const l = P.juntar(base);
  assert.strictEqual(l[0].termo, 'fita eva espelho'); assert.deepStrictEqual(l[0].fontes, ['sua', 'google']);
  assert.strictEqual(l.length, 4);
  assert.deepStrictEqual(l[1].fontes.sort(), ['google', 'mercadolivre']);
});

test('força: busca + vendas + concorrência e ranking com uso', () => {
  const d = (vend, conc, an) => ({ seo: { sugestoes: Array(8).fill('x') }, marketplaces: { ml: { maxVendidos: vend, anuncios: an } }, validacao: { concorrencia: conc, nota: 50 }, precos: { mediana: 20 } });
  const a = P.forca(d(5000, 'média', 10), ['google', 'mercadolivre']);
  assert.deepStrictEqual(a.partes, { busca: 26, vendas: 40, concorrencia: 12 }); assert.strictEqual(a.total, 78);
  const b = P.forca(d(0, 'baixa', 0), ['google']);
  assert.deepStrictEqual(b.partes, { busca: 16, vendas: 0, concorrencia: 4 });
  const r = P.ranking([{ termo: 'fita eva dupla face', forca: b }, { termo: 'fita eva espelho', forca: a }, { termo: 'erro', erro: 'x' }]);
  assert.strictEqual(r.melhor.termo, 'fita eva espelho'); assert.strictEqual(r.melhor.uso, 'título'); assert.strictEqual(r.lista.length, 2);
  assert.ok(r.termos.includes('eva') && !r.termos.includes('de'));
});
