'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const I = require('../lib/importar');
const BF = require('../lib/blackfriday');
const catalogo = require('../api/catalogo');

// trecho reduzido de uma página real de produto Nuvemshop (só o título e as variações)
const pagina = fs.readFileSync(path.join(__dirname, 'dados', 'pagina-nuvemshop.html'), 'utf8');

test('importa nome, 18 variações, preço, preço riscado e metros', () => {
  const p = I.lerPagina(pagina, 'https://loja.exemplo/produtos/x/');
  assert.match(p.nome, /Fita EVA Autocolante Branca/);
  assert.strictEqual(p.variacoes.length, 18);
  const v = p.variacoes[0];
  assert.deepStrictEqual([v.preco, v.precoDe, v.metros, v.sku], [15.27, 38.17, 3, 'EVA15x15-3m']);
  assert.deepStrictEqual(v.opcoes, ['3MTS', '15mmx15mm']);
  assert.strictEqual(p.variacoes[17].metros, 90); assert.strictEqual(p.variacoes[17].preco, 481.77);
});

test('só busca endereço público https', () => {
  assert.ok(I.urlSegura('https://decoraloja.com.br/produtos/x/'));
  ['http://loja.com.br/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://servico.internal/x', 'ftp://a.b/c', 'nada'].forEach(u => assert.strictEqual(I.urlSegura(u), null, u));
});

test('plano: desconto sem prejuízo, com margem mínima e preço de oferta', () => {
  const taxa = { nome: 'Site', comissao: 5, fixoAbaixo: 0, limiteFixo: 0, freteAcima: 0 };
  const r = BF.planoLinha({ preco: 51.29, custo: 20, embalagem: 2, imposto: 6, taxa, margemMin: 15 });
  // margem hoje = (51,29 - 2,56 - 3,08 - 22) / 51,29 ≈ 46%
  assert.ok(r.hoje.margem > 45 && r.hoje.margem < 47, r.hoje.margem);
  assert.ok(r.semPrejuizo > r.comMargem, 'sem prejuízo deixa descer mais');
  assert.strictEqual(r.desconto, 40);                       // dá até 42% com 15% de margem: o redondo é 40%
  assert.ok(String(r.precoOferta).endsWith('.9'));
  assert.ok(r.oferta.margem >= 15, r.oferta.margem);
  assert.strictEqual(BF.planoLinha({ preco: 10, custo: 0, embalagem: 0, imposto: 6, taxa, margemMin: 15 }).semCusto, true);
  assert.strictEqual(BF.precoBonito(33.4), 32.9); assert.strictEqual(BF.precoBonito(8.5), 7.99);
});

test('API: importar pelo link e guardar o plano', async () => {
  process.env.PAINEL_SENHA = 'segredo-teste';
  const res = () => { const r = { code: 0, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
  let r = res();
  await catalogo({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, query: {}, body: { acao: 'importar-url', url: 'https://loja.exemplo/produtos/fita/' } }, r,
    { armazem: { ativo: false }, fetch: async () => ({ ok: true, text: async () => pagina }) });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.variacoes.length, 18);
  r = res();
  await catalogo({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, query: {}, body: { acao: 'importar-url', url: 'http://inseguro/x' } }, r, { armazem: { ativo: false } });
  assert.strictEqual(r.code, 400);
});
