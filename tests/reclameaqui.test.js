'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RA = require('../lib/reclameaqui');

const org = [
  { title: 'Fita dupla face não cola no espelho - Loja Fitas Brasil - Reclame Aqui', link: 'https://www.reclameaqui.com.br/loja-fitas-brasil/fita-dupla-face-nao-cola-no-espelho_AbC123/', snippet: 'Comprei a fita e o espelho caiu em dois dias, descolou tudo.', date: '3 de out. de 2026' },
  { title: 'Produto veio menor que o anunciado - Adesivos XYZ - Reclame Aqui', link: 'https://www.reclameaqui.com.br/adesivos-xyz/produto-veio-menor_Zz9/', snippet: 'A largura é menor do que diz o anúncio.' },
  { title: 'Loja Fitas Brasil - Reclame Aqui', link: 'https://www.reclameaqui.com.br/empresa/loja-fitas-brasil/', snippet: 'Reputação da empresa' },
  { title: 'Outro site', link: 'https://exemplo.com/fita', snippet: 'nada' },
];

test('lê só páginas de reclamação, com título e empresa', () => {
  const l = org.map(RA.lerResultado).filter(Boolean);
  assert.strictEqual(l.length, 2);
  assert.deepStrictEqual([l[0].titulo, l[0].empresa], ['Fita dupla face não cola no espelho', 'Loja Fitas Brasil']);
});

test('busca: 2ª consulta mais curta quando acha pouco; temas e oportunidade', async () => {
  const qs = [];
  const fetch = async (u, op) => { const q = JSON.parse(op.body).q; qs.push(q); return { ok: true, json: async () => ({ organic: qs.length === 1 ? org.slice(0, 1) : org }) }; };
  const r = await RA.buscar('fita de eva autocolante para espelho 19mm', 'k', fetch);
  assert.deepStrictEqual(qs, ['site:reclameaqui.com.br fita de eva autocolante para espelho 19mm', 'site:reclameaqui.com.br fita eva autocolante']);
  assert.strictEqual(r.itens.length, 2); assert.strictEqual(r.consultas, 2);
  assert.ok(r.temas.some(t => t.tema === 'Não cola / descola'));
  assert.ok(r.temas.some(t => t.tema === 'Medida diferente do anúncio'));
  assert.strictEqual(r.empresas[0].vezes, 1);
  const o = RA.oportunidade(r.temas); assert.ok(o && o.dica.length > 10);
});
