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

function contexto(d, detalhes, insights) {
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
    ...(insights ? ['', 'O que o Radar descobriu sobre os compradores:', ...linhasInsights(insights)] : []),
  ].join('\n');
}

// O que o Radar já descobriu sobre o produto (sem gastar crédito: lê o que está salvo)
function juntarTemas(...listas) {
  const m = new Map();
  listas.flat().filter(Boolean).forEach(t => { const k = t.tema || t.nome; if (k) m.set(k, (m.get(k) || 0) + (t.vezes || 1)); });
  return [...m.entries()].map(([tema, vezes]) => ({ tema, vezes })).sort((a, b) => b.vezes - a.vezes);
}
function montarInsights(pal, aval) {
  const i = {};
  if (pal && pal.lista && pal.lista.length) { i.melhor = pal.lista[0].termo; i.outras = pal.lista.slice(1, 4).map(x => x.termo); i.termos = (pal.termos || []).slice(0, 8); }
  if (aval) {
    const pq = aval.perguntas || {};
    i.duvidas = (pq.temas || []).slice(0, 5).map(t => t.tema);
    i.exemplosDuvidas = (pq.itens || []).slice(0, 6).map(q => q.pergunta);
    i.reclamacoes = juntarTemas(aval.temas || [], (aval.reclameAqui && aval.reclameAqui.temas) || [], (aval.outras && aval.outras.temas) || []).slice(0, 5).map(t => t.tema);
    const pf = aval.perfil || {};
    i.usos = (pf.usos || []).filter(x => x.vezes >= 2).slice(0, 3).map(x => x.nome);
    i.decisao = (pf.decisao || []).filter(x => x.vezes >= 2).slice(0, 3).map(x => x.nome);
  }
  return Object.keys(i).length ? i : null;
}
function linhasInsights(i) {
  if (!i) return [];
  return [
    i.melhor ? `Palavra-chave mais forte (comparação do Radar): "${i.melhor}" — comece o título por ela. Outras fortes: ${(i.outras || []).join(' | ') || '—'}` : '',
    i.termos && i.termos.length ? `Palavras que mais se repetem nas melhores buscas: ${i.termos.join(', ')}` : '',
    i.duvidas && i.duvidas.length ? `Dúvidas mais comuns dos compradores (responda no anúncio): ${i.duvidas.join(' | ')}. Exemplos: ${(i.exemplosDuvidas || []).join(' | ')}` : '',
    i.reclamacoes && i.reclamacoes.length ? `Reclamações mais comuns sobre os concorrentes (transforme em vantagem, sem prometer o que não está nos dados do produto): ${i.reclamacoes.join(' | ')}` : '',
    i.usos && i.usos.length ? `Para que o cliente usa: ${i.usos.join(' | ')}` : '',
    i.decisao && i.decisao.length ? `O que pesa na decisão do cliente: ${i.decisao.join(' | ')}` : '',
  ].filter(Boolean);
}
// reclamação dos concorrentes -> argumento do seu anúncio (com campo para o fabricante confirmar)
const VANTAGEM = {
  'Não cola / descola': 'Adesão forte: [informe quanto peso segura e em qual superfície]',
  'Fita fina ou fraca': 'Espuma encorpada: espessura de [mm] e densidade [informe]',
  'Medida diferente do anúncio': 'Medida real conferida: [largura] x [comprimento]',
  'Espessura (grossa ou fina demais)': 'Espessura exata: [mm], ideal para [uso]',
  'Difícil de tirar o liner / descascar': 'Liner fácil de destacar, aplicação rápida',
  'Deixa resíduo / mancha o espelho': 'Adesivo próprio para espelho: não mancha o verso',
  'Embalagem ou entrega': 'Embalagem reforçada e envio rápido',
  'Produto com defeito': 'Controle de qualidade de fábrica e garantia de [prazo]',
  'Não entregaram / atraso': 'Postagem em até [prazo] dias úteis',
  'Troca ou reembolso negado': 'Troca simples se não servir: [sua política]',
  'Produto diferente do anunciado': 'Fotos reais do produto, sem imagem de catálogo',
};
const RESPOSTA_DUVIDA = {
  'Medida / tamanho': ['Qual a medida?', '[largura] de largura x [comprimento] de comprimento, espessura de [mm].'],
  'Quanto peso aguenta': ['Quanto peso aguenta?', 'Cada [cm] de fita segura cerca de [kg]. Para espelhos grandes, use [quantidade] tiras.'],
  'Serve para qual superfície': ['Serve em qual superfície?', 'Funciona em [superfícies]. Não indicado para [superfícies].'],
  'Umidade, calor, área externa': ['Pode usar no banheiro?', '[Sim/Não]: resiste a umidade [informe]. Aplique com a superfície seca.'],
  'Como aplicar / remover': ['Como aplicar?', 'Limpe e seque a superfície, cole as tiras, retire o liner e pressione por [segundos].'],
  'Quantidade e cor': ['Quantas unidades vêm e quais cores?', 'Vem [quantidade] na cor [cor].'],
  'Prazo, frete e nota fiscal': ['Emite nota fiscal?', 'Sim, enviamos com nota fiscal. Postagem em até [prazo] dias úteis.'],
  'Preço para atacado': ['Vende em quantidade?', 'Sim, temos kits e caixa fechada: [informe as opções].'],
};

const cap = s => String(s || '').replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
const corta = (s, n) => s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '');

// Plano B sem IA: termo + variações reais, descrição e destaques em modelo com campos a preencher
function porRegra(d, detalhes, insights) {
  const termo = d.termo.toLowerCase();
  const internas = (d.seo && d.seo.internas) || {};
  const variacoes = [...new Set([...(internas.mercadolivre || []), ...(d.seo.sugestoes || []), ...(d.seo.relacionadas || [])]
    .map(s => s.toLowerCase().replace(termo, '').trim()).filter(s => s && s.length < 30))].slice(0, 8);
  const ins = insights || {};
  const base = cap(ins.melhor || d.termo);
  const vantagens = (ins.reclamacoes || []).map(t => VANTAGEM[t]).filter(Boolean).slice(0, 3);
  // se a palavra principal já tem cor, não junta outra cor no mesmo título
  const CORES = /\b(branc[ao]|pret[ao]|marrom|cinza|transparente|bege|azul|vermelh[ao]|verde|amarel[ao]|rosa|dourad[ao]|prata|madeira|amadeirad[ao])\b/i;
  const corBase = (base.match(CORES) || [])[0];
  if (corBase) { const sem = variacoes.filter(v => !CORES.test(v) || (v.match(CORES) || [])[0].toLowerCase() === corBase.toLowerCase()); variacoes.splice(0, variacoes.length, ...sem); }
  const out = {};
  for (const [mp, lim] of Object.entries(LIMITES)) {
    const n = mp === 'mercadolivre' ? 2 : 4;
    // não repete palavra no título (ex.: "Fita Branca 22mm branca")
    const semRepetir = partes => { const vistas = new Set(); return partes.join(' ').split(/\s+/).filter(w => { const k = w.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true; }).join(' '); };
    const titulos = [0, 2, 4].map(i => corta(semRepetir([base, ...variacoes.slice(i, i + n)]), lim)).filter((v, i, a) => v && a.indexOf(v) === i);
    out[mp] = {
      titulos: titulos.length ? titulos : [corta(base, lim)],
      descricao: `${base}${detalhes ? ' — ' + detalhes : ''}.\n\nIdeal para ${(ins.usos && ins.usos.length ? ins.usos.join(', ').toLowerCase() : '') || 'quem procura ' + (variacoes.slice(0, 3).join(', ') || termo)}.\n\n${vantagens.length ? 'POR QUE ESCOLHER O NOSSO\n' + vantagens.map(v => '• ' + v).join('\n') + '\n\n' : ''}• Medidas: [preencher]\n• Material: [preencher]\n• Conteúdo da embalagem: [preencher]\n\nProduto de fábrica, com envio rápido. Ficou com dúvida? Pergunte antes de comprar.`,
      destaques: [`${base} direto da fábrica`, ...vantagens, 'Medidas: [preencher]', 'Material: [preencher]', variacoes[0] ? `Opção ${variacoes[0]}` : 'Várias opções disponíveis', 'Envio rápido e embalagem reforçada'].slice(0, 5),
    };
  }
  return {
    ...out,
    fichaTecnica: [{ campo: 'Marca', valor: '[sua marca]' }, { campo: 'Modelo', valor: '[preencher]' }, { campo: 'Material', valor: '[preencher]' }, { campo: 'Medidas', valor: '[preencher]' }, { campo: 'Cor', valor: '[preencher]' }, { campo: 'Itens inclusos', valor: '[preencher]' }],
    perguntas: (ins.duvidas || []).map(t => RESPOSTA_DUVIDA[t]).filter(Boolean).map(([pergunta, resposta]) => ({ pergunta, resposta }))
      .concat((d.seo.perguntas || []).map(p => ({ pergunta: p.pergunta, resposta: (p.resposta ? 'Base do Google: ' + p.resposta.slice(0, 220) + ' — ' : '') + 'adapte com os dados do seu produto.' }))).slice(0, 6),
    dica: 'Anúncio montado a partir das buscas reais. Com a chave da IA configurada, o texto fica completo e natural.',
    fonte: 'regra',
  };
}

async function comIA(d, detalhes, chave, Cliente, insights) {
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
      content: `${contexto(d, detalhes, insights)}\n\nMonte o anúncio para os 3 canais:\n- 3 títulos por canal, respeitando o limite: Mercado Livre até ${LIMITES.mercadolivre}, Shopee até ${LIMITES.shopee}, Amazon até ${LIMITES.amazon} caracteres. Use as variações que as pessoas realmente buscam.\n- descrição por canal (Mercado Livre e Shopee: texto corrido com tópicos; Amazon: mais objetiva).\n- 5 destaques por canal (os "bullets").\n- ficha técnica sugerida (campo e valor; o que não souber, entre colchetes).\n- respostas curtas para as dúvidas mais comuns dos compradores e as perguntas do Google (até 6), com o que não souber entre colchetes.\n- se houver reclamações dos concorrentes, mostre na descrição e nos destaques como o produto resolve cada uma (só com o que estiver nos dados do produto; o resto entre colchetes).\n- em "dica", uma frase sobre o que diferencia o anúncio dos concorrentes listados.`,
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
  const sl = armazem.slug(termo);
  const [pal, aval] = await Promise.all([arm.lerArquivo('palavras/' + sl + '.json').catch(() => null), arm.lerArquivo('avaliacoes/' + sl + '.json').catch(() => null)]);
  const insights = montarInsights(pal, aval);
  const chave = process.env.ANTHROPIC_API_KEY;
  let out = null;
  if (chave) { try { out = await comIA(d, detalhes, chave, deps.Anthropic, insights); } catch (e) { console.warn('[anuncio] IA falhou:', e && e.message); } }
  if (!out) out = porRegra(d, detalhes, insights);
  const resposta = { termo, limites: LIMITES, nomes: NOMES, ...out, usouRadar: insights, geradoEm: new Date().toISOString() };
  try { await arm.mudarArquivo('anuncios/' + armazem.slug(termo) + '.json', () => resposta); } catch (e) { /* guardar é extra */ }
  return res.status(200).json(resposta);
}

module.exports = handler;
module.exports.porRegra = porRegra;
module.exports.contexto = contexto;
module.exports.montarInsights = montarInsights;
