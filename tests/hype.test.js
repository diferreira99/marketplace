'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('../lib/hype');
const { pontosDoAnuncio } = require('../lib/avaliacoes');

const d = { termo: 'fita espelho', marketplaces: {
  mercadolivre: { itens: [
    { titulo: 'Fita Dupla Face Espelho 19mm Profissional Branca', link: 'https://produto.mercadolivre.com.br/MLB-1111111111-x', preco: 24.9, vendidos: 5000, nota: null, avaliacoes: null, anuncio: true },
    { titulo: 'Fita Espelho 12mm', link: 'https://produto.mercadolivre.com.br/MLB-2222222222-y', preco: 32.9, vendidos: 50, nota: 4.1, avaliacoes: 12, anuncio: true },
    { titulo: 'Lista', link: 'https://lista.mercadolivre.com.br/fita', anuncio: false }] },
  shopee: { itens: [{ titulo: 'Fita Espelho Profissional Branca 19mm', link: 'https://shopee.com.br/a', preco: 21.9, vendidos: 2300, nota: 4.9, avaliacoes: 800, anuncio: true }] },
  amazon: { itens: [] } },
  shopping: { itens: [{ titulo: 'Fita espelho', loja: 'Loja X', link: 'https://loja.x/f', preco: 39.9, nota: 4.0, avaliacoes: 3 }] } };
const porAnuncio = [pontosDoAnuncio({ id: 'MLB1111111111', media: 4.8, total: 1500, reviews: [
  { nota: 5, titulo: 'Ótima', texto: 'segurou firme o espelho, fácil de aplicar' }, { nota: 5, titulo: '', texto: 'chegou rápido e bem embalado' },
  { nota: 2, titulo: 'fina', texto: 'veio menor que o anunciado' }] })];

test('pontos de um anúncio: elogios e reclamações das avaliações', () => {
  const p = porAnuncio[0];
  assert.deepStrictEqual([p.nPos, p.nNeg, p.lidas], [2, 1, 3]);
  assert.ok(p.positivos.some(t => t.tema === 'Cola e segura bem')); assert.ok(p.negativos.some(t => t.tema === 'Medida diferente do anúncio'));
});

test('junta canais, usa a nota das avaliações do ML e ordena por hype', () => {
  const l = H.juntar(d, porAnuncio);
  assert.strictEqual(l.length, 4);   // lista/categoria fora
  const ml = l.find(a => a.link.includes('MLB-1111111111'));
  assert.deepStrictEqual([ml.nota, ml.avaliacoes], [4.8, 1500]);
  const ord = H.filtrar(l, { ordem: 'hype' });
  assert.ok(ord[0].link.includes('MLB-1111111111') || ord[0].canal === 'shopee'); assert.ok(ord[0].hype >= 70);
  assert.deepStrictEqual(H.filtrar(l, { estrelas: 4.5 }).map(a => a.canal).sort(), ['mercadolivre', 'shopee']);
  assert.deepStrictEqual(H.filtrar(l, { canal: 'shopping' }).length, 1);
  assert.strictEqual(H.filtrar(l, { ordem: 'preco' })[0].preco, 21.9);
});

test('estratégia: preço, nota, palavras dos líderes, elogios e reclamações', () => {
  const e = H.estrategia(H.juntar(d, porAnuncio), d.termo);
  assert.ok(e.passos.length >= 4, e.passos.join(' | '));
  assert.ok(e.palavras.includes('profissional') && e.palavras.includes('branca'), e.palavras);
  assert.strictEqual(e.elogios[0].tema, 'Cola e segura bem');
  assert.ok(e.passos.some(p => /menos|mais|faixa/.test(p)));
});
