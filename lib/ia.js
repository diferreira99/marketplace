// 🧠 IA do Radar: um lugar só para pedir uma resposta estruturada (JSON) a um modelo.
// Usa a OpenAI quando há OPENAI_API_KEY (modelo em OPENAI_MODEL, padrão abaixo);
// senão usa a Anthropic quando há ANTHROPIC_API_KEY; sem nenhuma, devolve null e o app segue por regra.
'use strict';
const { z } = require('zod');

const OPENAI_PADRAO = 'gpt-4o-mini';

function qualIA() {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

// JSON Schema do zod, no formato que o "structured outputs" da OpenAI aceita (strict)
function esquemaJSON(esquema) {
  const j = z.toJSONSchema(esquema);
  delete j.$schema;
  return j;
}

async function viaOpenAI({ sistema, usuario, esquema, maxTokens }, fetcher) {
  const r = await fetcher('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || OPENAI_PADRAO,
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
      response_format: { type: 'json_schema', json_schema: { name: 'resposta', strict: true, schema: esquemaJSON(esquema) } },
      max_completion_tokens: maxTokens || 4000,
    }),
  });
  if (!r.ok) { let m = ''; try { m = ((await r.json()).error || {}).message || ''; } catch (e) { /* sem corpo */ } throw new Error('OpenAI respondeu ' + r.status + (m ? ': ' + m : '')); }
  const j = await r.json();
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  if (!msg || msg.refusal || !msg.content) return null;
  const ok = esquema.safeParse(JSON.parse(msg.content));
  return ok.success ? ok.data : null;
}

async function viaAnthropic({ sistema, usuario, esquema, maxTokens }, Cliente) {
  const Anthropic = Cliente || require('@anthropic-ai/sdk').default;
  const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.beta.messages.parse({
    model: 'claude-opus-5-5', max_tokens: maxTokens || 4000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(esquema) },
    system: sistema, messages: [{ role: 'user', content: usuario }],
  });
  if (resp.stop_reason === 'refusal' || !resp.parsed_output) return null;
  return resp.parsed_output;
}

// Devolve o objeto no formato do esquema, ou null (sem chave, recusa ou resposta fora do formato).
async function gerarJSON(pedido, deps = {}) {
  const qual = qualIA();
  if (qual === 'openai') return viaOpenAI(pedido, deps.fetch || fetch);
  if (qual === 'anthropic') return viaAnthropic(pedido, deps.Anthropic);
  return null;
}

module.exports = { gerarJSON, qualIA, esquemaJSON, OPENAI_PADRAO };
