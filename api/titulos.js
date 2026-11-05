// POST /api/titulos { termo } -> 3 títulos de anúncio por marketplace, a partir da pesquisa salva.
// Usa o Claude quando há ANTHROPIC_API_KEY; sem ela (ou se falhar), monta títulos por regra.
'use strict';
const { z } = require('zod');
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');

const LIMITES = { mercadolivre: 60, shopee: 100, amazon: 150 };
const NOMES = { mercadolivre: 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };

const Esquema = z.object({
  mercadolivre: z.array(z.string()),
  shopee: z.array(z.string()),
  amazon: z.array(z.string()),
  dica: z.string(),
});

function contexto(d) {
  const mp = d.marketplaces || {};
  const titulos = Object.values(mp).flatMap(m => (m.itens || []).filter(i => i.anuncio)
    .sort((a, b) => (b.vendidos || 0) - (a.vendidos || 0)).slice(0, 5)
    .map(i => `- [${m.nome}] ${i.titulo}${i.vendidos ? ` (${i.vendidos}+ vendidos)` : ''}${i.preco ? ` R$ ${i.preco}` : ''}`));
  return [
    `Palavra-chave: ${d.termo}`,
    `Autocompletar do Google: ${(d.seo.sugestoes || []).join(' | ') || '—'}`,
    `Pesquisas relacionadas: ${(d.seo.relacionadas || []).join(' | ') || '—'}`,
    `Perguntas frequentes: ${(d.seo.perguntas || []).map(p => p.pergunta).join(' | ') || '—'}`,
    `Preço mais comum: ${d.precos.mediana ? 'R$ ' + d.precos.mediana : '—'}`,
    'Títulos de anúncios concorrentes:', ...(titulos.length ? titulos : ['—']),
  ].join('\n');
}

// Plano B sem IA: termo + variações da cauda longa, dentro do limite de cada canal
function porRegra(d) {
  const base = d.termo.replace(/\b\w/g, c => c.toUpperCase());
  const extras = [...new Set((d.seo.sugestoes || []).concat(d.seo.relacionadas || [])
    .map(s => s.toLowerCase().replace(d.termo.toLowerCase(), '').trim()).filter(s => s && s.length < 30))].slice(0, 6);
  const corta = (s, n) => s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '');
  const out = {};
  for (const [mp, lim] of Object.entries(LIMITES)) {
    out[mp] = [0, 2, 4].map(i => corta([base, ...extras.slice(i, i + (mp === 'mercadolivre' ? 2 : 4))].join(' '), lim)).filter((v, i, a) => v && a.indexOf(v) === i);
    if (!out[mp].length) out[mp] = [corta(base, lim)];
  }
  return { ...out, dica: 'Títulos montados a partir das buscas reais do Google. Com a chave da IA configurada, eles ficam mais naturais.', fonte: 'regra' };
}

async function comIA(d, chave, Cliente) {
  const Anthropic = Cliente || require('@anthropic-ai/sdk').default;
  const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
  const client = new Anthropic({ apiKey: chave });
  const resp = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Esquema) },
    system: 'Você é especialista em anúncios de marketplace no Brasil. Escreve títulos que ranqueiam na busca interna de cada canal: palavra-chave principal no começo, atributos que o comprador procura (medida, cor, material, quantidade), sem promessas falsas, sem caixa alta, sem emojis e sem símbolos. Escreve em português do Brasil.',
    messages: [{
      role: 'user',
      content: `${contexto(d)}\n\nCrie 3 títulos para cada canal, respeitando o limite de caracteres: Mercado Livre até ${LIMITES.mercadolivre}, Shopee até ${LIMITES.shopee}, Amazon até ${LIMITES.amazon}. Use as variações reais que as pessoas buscam. Em "dica", uma frase sobre o que diferencia o anúncio dos concorrentes listados.`,
    }],
  });
  if (resp.stop_reason === 'refusal' || !resp.parsed_output) return null;
  const o = resp.parsed_output;
  for (const mp of Object.keys(LIMITES)) o[mp] = (o[mp] || []).map(t => String(t).trim()).filter(Boolean).map(t => t.length > LIMITES[mp] ? t.slice(0, LIMITES[mp]).replace(/\s+\S*$/, '') : t).slice(0, 3);
  return { ...o, fonte: 'ia' };
}

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });
  if (!exigirSenha(req, res)) return;
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const termo = String((b && b.termo) || '').trim().slice(0, 120);
  const d = (b && b.dados && b.dados.termo === termo && b.dados.seo) ? b.dados : await arm.ler(termo);
  if (!d) return res.status(404).json({ erro: 'Pesquise a palavra primeiro.' });
  const chave = process.env.ANTHROPIC_API_KEY;
  let out = null;
  if (chave) { try { out = await comIA(d, chave, deps.Anthropic); } catch (e) { console.warn('[titulos] IA falhou:', e && e.message); } }
  if (!out) out = porRegra(d);
  return res.status(200).json({ termo, limites: LIMITES, nomes: NOMES, ...out });
}

module.exports = handler;
module.exports.porRegra = porRegra;
module.exports.contexto = contexto;
