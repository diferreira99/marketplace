'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { calcular, calcularCanal, precoParaMargem, TAXAS_PADRAO } = require('../lib/margem');
const { criar } = require('../lib/armazem');
const { analisar } = require('../lib/analise');
const config = require('../api/config');
const titulos = require('../api/titulos');
const monitorar = require('../api/monitorar');
const historico = require('../api/historico');
const fx = require('./fixtures');

function blobFalso() {
  const dados = new Map(); let n = 0;
  return {
    __teste: true, dados,
    async get(c) { if (!dados.has(c)) return null; const d = dados.get(c); return { statusCode: 200, stream: new Response(d.corpo).body, blob: { etag: d.etag } }; },
    async put(c, corpo, op) {
      const atual = dados.get(c);
      if (op && op.ifMatch && (!atual || atual.etag !== op.ifMatch)) { const e = new Error('Precondition failed'); e.name = 'BlobPreconditionFailedError'; throw e; }
      dados.set(c, { corpo, etag: 'e' + (++n) }); return { pathname: c };
    },
    async del(c) { dados.delete(c); },
  };
}
function resFalsa() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
}
const H = { 'x-senha': 'segredo-teste' };
process.env.PAINEL_SENHA = 'segredo-teste';

test('margem: Mercado Livre abaixo de R$ 79 paga taxa fixa, acima paga frete', () => {
  const t = TAXAS_PADRAO.mercadolivre;
  const a = calcularCanal(50, 10, 2, 6, t);
  assert.strictEqual(a.comissao, 6); assert.strictEqual(a.fixo, 6.25); assert.strictEqual(a.frete, 0);
  assert.strictEqual(a.imposto, 3); assert.strictEqual(a.lucro, 50 - 6 - 6.25 - 3 - 12);
  // abaixo de R$ 19 a taxa fixa é no máximo metade do preço
  assert.strictEqual(calcularCanal(10, 1, 0, 0, t).fixo, 5);
  const b = calcularCanal(100, 10, 2, 6, t);
  assert.strictEqual(b.fixo, 0); assert.strictEqual(b.frete, 22);
});

test('margem: Shopee cobra por faixa de preço (2026)', () => {
  const t = TAXAS_PADRAO.shopee;
  assert.deepStrictEqual([calcularCanal(50, 0, 0, 0, t).comissao, calcularCanal(50, 0, 0, 0, t).fixo], [10, 4]);
  assert.deepStrictEqual([calcularCanal(90, 0, 0, 0, t).comissao, calcularCanal(90, 0, 0, 0, t).fixo], [12.6, 16]);
  assert.deepStrictEqual([calcularCanal(150, 0, 0, 0, t).comissao, calcularCanal(150, 0, 0, 0, t).fixo], [21, 20]);
  assert.deepStrictEqual([calcularCanal(1000, 0, 0, 0, t).comissao, calcularCanal(1000, 0, 0, 0, t).fixo], [140, 26]);
  // Amazon: mínimo de R$ 1
  assert.strictEqual(calcularCanal(5, 0, 0, 0, TAXAS_PADRAO.amazon).comissao, 1);
});

test('margem: preço mínimo realmente entrega a margem alvo', () => {
  for (const [id, t] of Object.entries(TAXAS_PADRAO)) {
    for (const custo of [3, 15, 60]) {
      const p = precoParaMargem(custo, 1, 6, t, 25);
      const r = calcularCanal(p, custo, 1, 6, t);
      assert.ok(r.margem >= 24.9, `${id} custo ${custo}: preço ${p} deu margem ${r.margem}`);
    }
  }
  const tudo = calcular({ preco: 30, custo: 8, embalagem: 1 });
  assert.deepStrictEqual(Object.keys(tudo).sort(), Object.keys(TAXAS_PADRAO).sort());
  assert.ok(tudo.shopee.lucro < 30);
});

test('config: taxas, custo por produto e vigiadas ficam na nuvem', async () => {
  const arm = criar(blobFalso());
  let r = resFalsa();
  await config({ method: 'POST', headers: H, body: { acao: 'taxas', imposto: 8, taxas: { shopee: { comissao: 22, fixoAbaixo: 4, limiteFixo: 1e9, freteAcima: 0, tetoComissao: 100 } } } }, r, { armazem: arm });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.imposto, 8); assert.strictEqual(r.body.taxas.shopee.comissao, 22);
  assert.strictEqual(r.body.taxas.amazon.comissao, 12);
  r = resFalsa();
  await config({ method: 'POST', headers: H, body: { acao: 'custo', termo: 'Fita de Borda', custo: 4.5, embalagem: 0.8 } }, r, { armazem: arm });
  assert.strictEqual(r.body.custos['fita-de-borda'].custo, 4.5); assert.strictEqual(r.body.custos['fita-de-borda'].embalagem, 0.8);
  r = resFalsa();
  await config({ method: 'POST', headers: H, body: { acao: 'vigiar', termo: 'Fita de Borda', ligar: true } }, r, { armazem: arm });
  assert.strictEqual(r.body.vigiadas.length, 1);
  r = resFalsa();
  await config({ method: 'GET', headers: H }, r, { armazem: arm });
  assert.strictEqual(r.body.vigiadas[0].termo, 'Fita de Borda'); assert.strictEqual(r.body.imposto, 8);
  r = resFalsa();
  await config({ method: 'POST', headers: H, body: { acao: 'vigiar', termo: 'Fita de Borda', ligar: false } }, r, { armazem: arm });
  assert.strictEqual(r.body.vigiadas.length, 0);
});

test('títulos: sem chave da IA monta por regra dentro do limite de cada canal', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const arm = criar(blobFalso());
  await arm.salvar(analisar(fx.termo, fx.respostas));
  const r = resFalsa();
  await titulos({ method: 'POST', headers: H, body: { termo: fx.termo } }, r, { armazem: arm });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.fonte, 'regra');
  assert.ok(r.body.mercadolivre.titulos.length >= 1 && r.body.mercadolivre.titulos.every(t => t.length <= 60));
  assert.ok(r.body.shopee.titulos.every(t => t.length <= 100));
  assert.ok(/22mm|branca/i.test(r.body.shopee.titulos.join(' ')));
});

test('títulos: com IA usa claude-opus-5-5, fallback padrão e corta no limite', async () => {
  process.env.ANTHROPIC_API_KEY = 'chave-falsa';
  let pedido = null;
  class Falso { constructor() { this.beta = { messages: { parse: async p => { pedido = p; return { stop_reason: 'end_turn', parsed_output: { mercadolivre: { titulos: ['Fita De Borda Adesiva 22mm Branca Pvc Rolo 20 Metros Para Moveis Mdf Acabamento'], descricao: 'd', destaques: ['1','2','3','4','5','6'] }, shopee: { titulos: ['a'], descricao: 'd', destaques: [] }, amazon: { titulos: ['b'], descricao: 'd', destaques: [] }, fichaTecnica: [], perguntas: [], dica: 'x' } }; } } }; } }
  const arm = criar(blobFalso());
  await arm.salvar(analisar(fx.termo, fx.respostas));
  const r = resFalsa();
  await titulos({ method: 'POST', headers: H, body: { termo: fx.termo } }, r, { armazem: arm, Anthropic: Falso });
  assert.strictEqual(r.body.fonte, 'ia');
  assert.strictEqual(pedido.model, 'claude-opus-5-5');
  assert.strictEqual(pedido.fallbacks, 'default');
  assert.ok(pedido.messages[0].content.includes('Autocompletar'));
  assert.ok(r.body.mercadolivre.titulos[0].length <= 60); assert.strictEqual(r.body.mercadolivre.destaques.length, 5);
  // recusa: cai para a regra
  class Recusa { constructor() { this.beta = { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } }; } }
  const r2 = resFalsa();
  await titulos({ method: 'POST', headers: H, body: { termo: fx.termo } }, r2, { armazem: arm, Anthropic: Recusa });
  assert.strictEqual(r2.body.fonte, 'regra');
  delete process.env.ANTHROPIC_API_KEY;
});

test('monitorar: só com CRON_SECRET; refaz as vigiadas e anota a série', async () => {
  process.env.CRON_SECRET = 'cron-teste'; process.env.SERPER_API_KEY = 'K';
  const arm = criar(blobFalso());
  await arm.mudarConfig(c => ({ ...c, vigiadas: [{ chave: 'fita-de-borda-adesiva', termo: fx.termo }] }));
  let r = resFalsa();
  await monitorar({ headers: {} }, r, { armazem: arm });
  assert.strictEqual(r.code, 401);
  const fetch = async (u, op) => {
    const b = JSON.parse(op.body); let c = fx.respostas.busca;
    if (u.endsWith('/shopping')) c = fx.respostas.shopping; else if (u.endsWith('/autocomplete')) c = fx.respostas.autocomplete;
    else if (b.q.includes('site:mercadolivre')) c = fx.respostas.mercadolivre; else if (b.q.includes('site:shopee')) c = fx.respostas.shopee; else if (b.q.includes('site:amazon')) c = fx.respostas.amazon;
    return { ok: true, json: async () => c };
  };
  r = resFalsa();
  await monitorar({ headers: { authorization: 'Bearer cron-teste' } }, r, { armazem: arm, fetch });
  assert.deepStrictEqual(r.body.feitos, [fx.termo]);
  const s = await arm.serie(fx.termo);
  assert.strictEqual(s.length, 1); assert.ok(s[0].precoMediano > 0); assert.strictEqual(s[0].maxVendidos, 2300);
  // mesmo dia não duplica
  await arm.anotarSerie(analisar(fx.termo, fx.respostas));
  assert.strictEqual((await arm.serie(fx.termo)).length, 1);
  r = resFalsa();
  await historico({ method: 'GET', headers: H, query: { termo: fx.termo, serie: '1' } }, r, { armazem: arm });
  assert.strictEqual(r.body.pontos.length, 1);
});
