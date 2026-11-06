'use strict';
const test = require('node:test');
const assert = require('node:assert');
const titulos = require('../api/titulos');
const fx = require('./fixtures');
const { analisar } = require('../lib/analise');

const pal = { lista: [{ termo: 'fita dupla face espelho 19mm' }, { termo: 'fita eva espelho' }], termos: ['fita', 'espelho'] };
const aval = { temas: [{ tema: 'Não cola / descola', vezes: 4 }], reclameAqui: { temas: [{ tema: 'Medida diferente do anúncio', vezes: 2 }, { tema: 'Não cola / descola', vezes: 1 }] }, outras: { temas: [] },
  perguntas: { temas: [{ tema: 'Quanto peso aguenta', vezes: 3 }, { tema: 'Medida / tamanho', vezes: 2 }], itens: [{ pergunta: 'Aguenta espelho de 10 kg?' }] },
  perfil: { usos: [{ nome: 'Espelho ou vidro', vezes: 5 }, { nome: 'Banheiro', vezes: 1 }], decisao: [{ nome: 'Aguentar o peso / segurar firme', vezes: 4 }] } };

test('insights: palavra mais forte, dúvidas, reclamações somadas e perfil', () => {
  const i = titulos.montarInsights(pal, aval);
  assert.strictEqual(i.melhor, 'fita dupla face espelho 19mm');
  assert.deepStrictEqual(i.reclamacoes.slice(0, 2), ['Não cola / descola', 'Medida diferente do anúncio']);
  assert.deepStrictEqual(i.duvidas, ['Quanto peso aguenta', 'Medida / tamanho']);
  assert.deepStrictEqual(i.usos, ['Espelho ou vidro']);
  assert.strictEqual(titulos.montarInsights(null, null), null);
});

test('anúncio por regra usa o que o Radar descobriu', () => {
  const d = analisar(fx.termo, fx.respostas);
  const r = titulos.porRegra(d, '', titulos.montarInsights(pal, aval));
  assert.ok(r.mercadolivre.titulos[0].startsWith('Fita Dupla Face Espelho 19mm'), r.mercadolivre.titulos[0]);
  assert.match(r.mercadolivre.descricao, /POR QUE ESCOLHER/); assert.match(r.mercadolivre.descricao, /Adesão forte/);
  assert.match(r.mercadolivre.descricao, /Ideal para espelho ou vidro/);
  assert.strictEqual(r.perguntas[0].pergunta, 'Quanto peso aguenta?');
  assert.ok(titulos.contexto(d, '', titulos.montarInsights(pal, aval)).includes('Palavra-chave mais forte'));
});

test('título por regra não repete palavra', () => {
  const d = analisar(fx.termo, fx.respostas);
  const r = titulos.porRegra(d, '', titulos.montarInsights({ lista: [{ termo: 'fita de borda adesiva branca' }] }, null));
  r.mercadolivre.titulos.concat(r.shopee.titulos).forEach(t => { const w = t.toLowerCase().split(/\s+/); assert.strictEqual(new Set(w).size, w.length, t); });
});

test('título não mistura duas cores', () => {
  const d = analisar(fx.termo, fx.respostas);
  d.seo.sugestoes = ['fita de borda preta', 'fita de borda 22mm', 'fita de borda madeira'];
  const r = titulos.porRegra(d, '', titulos.montarInsights({ lista: [{ termo: 'fita de borda branca' }] }, null));
  r.mercadolivre.titulos.forEach(t => assert.ok(!/pret[ao]|madeira/i.test(t), t));
});
