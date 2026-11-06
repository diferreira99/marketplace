'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../lib/fontes');
const C = require('../lib/compradores');

test('perguntas do ML: lê e agrupa as dúvidas por tema', async () => {
  const fetch = async u => ({ ok: true, json: async () => ({ questions: [
    { text: 'Serve para espelho de 1 metro? aguenta o peso?', answer: { text: 'Sim' } },
    { text: 'Qual a largura em mm?', answer: null },
    { text: 'Vende caixa fechada para atacado?', answer: null } ] }) });
  const r = await F.perguntasML(['MLB1'], fetch);
  assert.strictEqual(r.itens.length, 3); assert.strictEqual(r.itens[1].resposta, null);
  const temas = r.temas.map(t => t.tema);
  assert.ok(temas.includes('Quanto peso aguenta') && temas.includes('Medida / tamanho') && temas.includes('Preço para atacado'));
});

test('vídeos: só YouTube, visualizações e ângulos', async () => {
  assert.strictEqual(F.lerVisualizacoes('1,2 mi de visualizações'), 1200000);
  assert.strictEqual(F.lerVisualizacoes('35 mil'), 35000);
  const fetch = async (u, op) => { assert.ok(u.endsWith('/videos')); return { ok: true, json: async () => ({ videos: [
    { title: 'Teste: fita dupla face aguenta espelho?', link: 'https://www.youtube.com/watch?v=1', channel: 'Canal', views: '35 mil' },
    { title: 'Como aplicar fita no espelho passo a passo', link: 'https://youtu.be/2' },
    { title: 'Outro site', link: 'https://vimeo.com/3' } ] }) }; };
  const r = await F.videos('fita espelho', 'k', fetch);
  assert.strictEqual(r.itens.length, 2); assert.strictEqual(r.itens[0].visualizacoes, 35000);
  assert.deepStrictEqual(r.angulos.map(a => a.nome).sort(), ['Como aplicar (passo a passo)', 'Teste de força / resistência']);
});

test('Shopee e Amazon: canal, trechos negativos e temas', async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ organic: [
    { title: 'Fita Dupla Face Espelho | Amazon.com.br', link: 'https://www.amazon.com.br/dp/X', snippet: 'Não recomendo, descolou do espelho em 3 dias.', rating: 3.1 },
    { title: 'Fita EVA - Shopee Brasil', link: 'https://shopee.com.br/x', snippet: 'Ótima, segurou bem.' },
    { title: 'Blog', link: 'https://blog.com/x', snippet: 'ruim' } ] }) });
  const r = await F.outrasAvaliacoes('fita espelho', 'k', fetch);
  assert.strictEqual(r.itens.length, 2); assert.strictEqual(r.negativos, 1);
  assert.strictEqual(r.itens[0].canal, 'amazon'); assert.ok(r.temas.some(t => t.tema === 'Não cola / descola'));
});

test('compradores: junta tipos sem repetir, WhatsApp só de celular, maiores primeiro', async () => {
  assert.strictEqual(C.whatsapp('(19) 99876-5432'), 'https://wa.me/5519998765432');
  assert.strictEqual(C.whatsapp('(19) 3234-5678'), null);
  const qs = [];
  const fetch = async (u, op) => { const b = JSON.parse(op.body); qs.push(b.q); return { ok: true, json: async () => ({ places: b.q.startsWith('vidraçaria') ? [
    { title: 'Vidros A', cid: '1', phoneNumber: '(19) 99876-5432', rating: 4.8, ratingCount: 30 },
    { title: 'Vidros B', cid: '2', phoneNumber: '(19) 3234-5678', rating: 4.5, ratingCount: 300 } ]
    : [{ title: 'Vidros B', cid: '2', ratingCount: 300 }, { title: 'Marcenaria C', cid: '3', ratingCount: 5 }] }) }; };
  const r = await C.buscar({ cidade: 'Campinas SP', tipos: ['vidraçaria', 'marcenaria'] }, 'k', fetch);
  assert.deepStrictEqual(qs, ['vidraçaria em Campinas SP', 'marcenaria em Campinas SP']);
  assert.deepStrictEqual(r.itens.map(i => i.nome), ['Vidros B', 'Vidros A', 'Marcenaria C']);
  assert.strictEqual(r.itens[1].whatsapp, 'https://wa.me/5519998765432'); assert.ok(r.itens[0].maps.includes('cid=2'));
});
