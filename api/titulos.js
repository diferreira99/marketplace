// POST /api/titulos { termo, detalhes?, dados? } -> anúncio pronto para os 3 canais:
// títulos, descrição, destaques, ficha técnica e respostas para as perguntas que o povo faz.
// Usa o Claude quando há ANTHROPIC_API_KEY; sem ela (ou se falhar), monta por regra.
'use strict';
const { z } = require('zod');
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');

const LIMITES = { mercadolivre: 60, shopee: 100, amazon: 150 };
const NOMES = { mercadolivre: 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };

const Canal = z.object({ titulos: z.array(z.string()), descricao: z.string(), destaques: z.array(z.string()) });
const Esquema = z.object({
  mercadolivre: Canal, shopee: Canal, amazon: Canal,
  fichaTecnica: z.array(z.object({ campo: z.string(), valor: z.string() })),
  perguntas: z.array(z.object({ pergunta: z.string(), resposta: z.string() })),
  dica: z.string(),
});

function contexto(d, detalhes) {
  const mp = d.marketplaces || {};
  const titulos = Object.values(mp).flatMap(m => (m.itens || []).filter(i => i.anuncio)
    .sort((a, b) => (b.vendidos || 0) - (a.vendidos || 0)).slice(0, 5)
    .map(i => `- [${m.nome}] ${i.titulo}${i.vendidos ? ` (${i.vendidos}+ vendidos)` : ''}${i.preco ? ` R$ ${i.preco}` : ''}`));
  const internas = (d.seo && d.seo.internas) || {};
  return [
    `Palavra-chave: ${d.termo}`,
    detalhes ? `Dados do produto (do fabricante, use como verdade): ${detalhes}` : 'Dados do produto: não informados (não invente medidas, materiais ou números; deixe campos a preencher entre colchetes).',
    `Autocompletar do Google: ${(d.seo.sugestoes || []).join(' | ') || '—'}`,
    `Buscado dentro do Mercado Livre: ${(internas.mercadolivre || []).join(' | ') || '—'}`,
    `Buscado dentro da Amazon: ${(internas.amazon || []).join(' | ') || '—'}`,
    `Pesquisas relacionadas: ${(d.seo.relacionadas || []).join(' | ') || '—'}`,
    `Perguntas que o povo faz no Google: ${(d.seo.perguntas || []).map(p => p.pergunta).join(' | ') || '—'}`,
    `Preço mais comum: ${d.precos.mediana ? 'R$ ' + d.precos.mediana : '—'}`,
    'Títulos de anúncios concorrentes:', ...(titulos.length ? titulos : ['—']),
  ].join('\n');
}

const cap = s => String(s || '').replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
const corta = (s, n) => s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '');

// Plano B sem IA: termo + variações reais, descrição e destaques em modelo com campos a preencher
function porRegra(d, detalhes) {
  const termo = d.termo.toLowerCase();
  const internas = (d.seo && d.seo.internas) || {};
  const variacoes = [...new Set([...(internas.mercadolivre || []), ...(d.seo.sugestoes || []), ...(d.seo.relacionadas || [])]
    .map(s => s.toLowerCase().replace(termo, '').trim()).filter(s => s && s.length < 30))].slice(0, 8);
  const base = cap(d.termo);
  const out = {};
  for (const [mp, lim] of Object.entries(LIMITES)) {
    const n = mp === 'mercadolivre' ? 2 : 4;
    const titulos = [0, 2, 4].map(i => corta([base, ...variacoes.slice(i, i + n)].join(' '), lim)).filter((v, i, a) => v && a.indexOf(v) === i);
    out[mp] = {
      titulos: titulos.length ? titulos : [corta(base, lim)],
      descricao: `${base}${detalhes ? ' — ' + detalhes : ''}.\n\nIdeal para quem procura ${variacoes.slice(0, 3).join(', ') || termo}.\n\n• Medidas: [preencher]\n• Material: [preencher]\n• Conteúdo da embalagem: [preencher]\n\nProduto de fábrica, com envio rápido. Ficou com dúvida? Pergunte antes de comprar.`,
      destaques: [`${base} direto da fábrica`, 'Medidas: [preencher]', 'Material: [preencher]', variacoes[0] ? `Opção ${variacoes[0]}` : 'Várias opções disponíveis', 'Envio rápido e embalagem reforçada'],
    };
  }
  return {
    ...out,
    fichaTecnica: [{ campo: 'Marca', valor: '[sua marca]' }, { campo: 'Modelo', valor: '[preencher]' }, { campo: 'Material', valor: '[preencher]' }, { campo: 'Medidas', valor: '[preencher]' }, { campo: 'Cor', valor: '[preencher]' }, { campo: 'Itens inclusos', valor: '[preencher]' }],
    perguntas: (d.seo.perguntas || []).slice(0, 6).map(p => ({ pergunta: p.pergunta, resposta: (p.resposta ? 'Base do Google: ' + p.resposta.slice(0, 220) + ' — ' : '') + 'adapte com os dados do seu produto.' })),
    dica: 'Anúncio montado a partir das buscas reais. Com a chave da IA configurada, o texto fica completo e natural.',
    fonte: 'regra',
  };
}

async function comIA(d, detalhes, chave, Cliente) {
  const Anthropic = Cliente || require('@anthropic-ai/sdk').default;
  const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
  const client = new Anthropic({ apiKey: chave });
  const resp = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Esquema) },
    system: 'Você é especialista em anúncios de marketplace no Brasil e escreve para um fabricante que vende direto. Títulos: palavra-chave principal no começo, atributos que o comprador procura (medida, cor, material, quantidade), sem caixa alta, emojis ou símbolos. Descrição: clara, escaneável, com benefícios e especificações. Nunca invente números, medidas, certificações ou garantias que não estejam nos dados do produto: quando faltar, escreva o campo entre colchetes para o fabricante preencher. Português do Brasil.',
    messages: [{
      role: 'user',
      content: `${contexto(d, detalhes)}\n\nMonte o anúncio para os 3 canais:\n- 3 títulos por canal, respeitando o limite: Mercado Livre até ${LIMITES.mercadolivre}, Shopee até ${LIMITES.shopee}, Amazon até ${LIMITES.amazon} caracteres. Use as variações que as pessoas realmente buscam.\n- descrição por canal (Mercado Livre e Shopee: texto corrido com tópicos; Amazon: mais objetiva).\n- 5 destaques por canal (os "bullets").\n- ficha técnica sugerida (campo e valor; o que não souber, entre colchetes).\n- respostas curtas para as perguntas que o povo faz no Google (até 6).\n- em "dica", uma frase sobre o que diferencia o anúncio dos concorrentes listados.`,
    }],
  });
  if (resp.stop_reason === 'refusal' || !resp.parsed_output) return null;
  const o = resp.parsed_output;
  for (const mp of Object.keys(LIMITES)) {
    o[mp].titulos = (o[mp].titulos || []).map(t => String(t).trim()).filter(Boolean).map(t => corta(t, LIMITES[mp])).slice(0, 3);
    o[mp].destaques = (o[mp].destaques || []).slice(0, 5);
  }
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
  const detalhes = String((b && b.detalhes) || '').trim().slice(0, 800);
  const d = (b && b.dados && b.dados.termo === termo && b.dados.seo) ? b.dados : await arm.ler(termo);
  if (!d) return res.status(404).json({ erro: 'Pesquise a palavra primeiro.' });
  const chave = process.env.ANTHROPIC_API_KEY;
  let out = null;
  if (chave) { try { out = await comIA(d, detalhes, chave, deps.Anthropic); } catch (e) { console.warn('[anuncio] IA falhou:', e && e.message); } }
  if (!out) out = porRegra(d, detalhes);
  return res.status(200).json({ termo, limites: LIMITES, nomes: NOMES, ...out });
}

module.exports = handler;
module.exports.porRegra = porRegra;
module.exports.contexto = contexto;
