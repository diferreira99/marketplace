'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');
const ia = require('../lib/ia');
const titulos = require('../api/titulos');

const Esq = z.object({ itens: z.array(z.object({ ideia: z.string(), porque: z.string() })) });
function limpaChaves() { delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_MODEL; }

test('sem chave: não chama ninguém', async () => {
  limpaChaves();
  assert.strictEqual(ia.qualIA(), null);
  assert.strictEqual(await ia.gerarJSON({ sistema: 's', usuario: 'u', esquema: Esq }, { fetch: async () => { throw new Error('não devia'); } }), null);
});

test('OpenAI: pede JSON no formato do esquema e devolve validado', async () => {
  limpaChaves(); process.env.OPENAI_API_KEY = 'sk-teste';
  let pedido = null;
  const fetch = async (u, op) => { pedido = { u, op, corpo: JSON.parse(op.body) }; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ itens: [{ ideia: 'Kit por tamanho de espelho', porque: 'perguntam quanto precisa' }] }) } }] }) }; };
  const r = await ia.gerarJSON({ sistema: 'sys', usuario: 'oi', esquema: Esq, maxTokens: 500 }, { fetch });
  assert.strictEqual(r.itens[0].ideia, 'Kit por tamanho de espelho');
  assert.strictEqual(pedido.u, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(pedido.op.headers.Authorization, 'Bearer sk-teste');
  assert.strictEqual(pedido.corpo.model, ia.OPENAI_PADRAO);
  assert.strictEqual(pedido.corpo.response_format.type, 'json_schema');
  assert.strictEqual(pedido.corpo.response_format.json_schema.strict, true);
  assert.strictEqual(pedido.corpo.response_format.json_schema.schema.additionalProperties, false);
  assert.strictEqual(pedido.corpo.response_format.json_schema.schema.$schema, undefined);
  assert.deepStrictEqual(pedido.corpo.messages.map(m => m.role), ['system', 'user']);
  process.env.OPENAI_MODEL = 'outro-modelo';
  await ia.gerarJSON({ sistema: 's', usuario: 'u', esquema: Esq }, { fetch }); assert.strictEqual(pedido.corpo.model, 'outro-modelo');
});

test('OpenAI: recusa, formato errado e erro viram null ou erro claro', async () => {
  limpaChaves(); process.env.OPENAI_API_KEY = 'sk-teste';
  assert.strictEqual(await ia.gerarJSON({ sistema: 's', usuario: 'u', esquema: Esq }, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { refusal: 'não posso', content: null } }] }) }) }), null);
  assert.strictEqual(await ia.gerarJSON({ sistema: 's', usuario: 'u', esquema: Esq }, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"outra":1}' } }] }) }) }), null);
  await assert.rejects(ia.gerarJSON({ sistema: 's', usuario: 'u', esquema: Esq }, { fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Incorrect API key' } }) }) }), /401: Incorrect API key/);
  limpaChaves();
});

test('anúncio: com a chave da OpenAI usa a IA; se ela falhar, cai na regra', async () => {
  limpaChaves(); process.env.OPENAI_API_KEY = 'sk-teste'; process.env.PAINEL_SENHA = 'segredo-teste';
  const fx = require('./fixtures'); const { analisar } = require('../lib/analise');
  const d = analisar(fx.termo, fx.respostas);
  const canal = { titulos: ['Fita Teste IA'], descricao: 'desc', destaques: ['a'] };
  const resposta = { mercadolivre: canal, shopee: canal, amazon: canal, fichaTecnica: [], perguntas: [], dica: 'ok' };
  const res = () => { const r = {}; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
  const arm = { ativo: false, lerArquivo: async () => null, mudarArquivo: async () => null, ler: async () => d };
  let r = res(); await titulos({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, body: { termo: d.termo, dados: d } }, r, { armazem: arm, fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(resposta) } }] }) }) });
  assert.strictEqual(r.body.fonte, 'ia'); assert.strictEqual(r.body.mercadolivre.titulos[0], 'Fita Teste IA');
  r = res(); await titulos({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, body: { termo: d.termo, dados: d } }, r, { armazem: arm, fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  assert.strictEqual(r.body.fonte, 'regra');
  limpaChaves();
});
