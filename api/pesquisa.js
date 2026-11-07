// POST /api/pesquisa  { termo, atualizar? }  (cabeçalho x-senha)
// Faz 6 consultas no Serper em paralelo, analisa e guarda na nuvem para todo mundo ver.
'use strict';
const { analisar, MARKETPLACES } = require('../lib/analise');
const { senhaOk, exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');
const meus = require('../lib/meus');
const { sugestoesMarketplaces } = require('../lib/seointerno');

const SERPER = 'https://google.serper.dev';
const CACHE_MS = 6 * 60 * 60 * 1000;          // mesma palavra em 6 h não gasta crédito de novo
const cache = new Map();

async function serper(rota, corpo, chave, fetcher) {
  const r = await fetcher(SERPER + rota, {
    method: 'POST',
    headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gl: 'br', hl: 'pt-br', ...corpo }),
  });
  if (!r.ok) {
    const e = new Error('Serper ' + rota + ' respondeu ' + r.status);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function pesquisar(termo, chave, fetcher = fetch) {
  const q = termo.trim();
  const tarefas = {
    busca: serper('/search', { q, num: 10 }, chave, fetcher),
    shopping: serper('/shopping', { q }, chave, fetcher),
    autocomplete: serper('/autocomplete', { q }, chave, fetcher),
  };
  for (const [mp, info] of Object.entries(MARKETPLACES)) {
    tarefas[mp] = serper('/search', { q: `${q} site:${info.dominio}`, num: 10 }, chave, fetcher);
  }
  const internas = sugestoesMarketplaces(q, fetcher);     // grátis: autocompletar do ML e da Amazon
  const nomes = Object.keys(tarefas);
  const res = await Promise.allSettled(Object.values(tarefas));
  const respostas = {}, falhas = [];
  res.forEach((x, i) => {
    if (x.status === 'fulfilled') respostas[nomes[i]] = x.value;
    else falhas.push({ fonte: nomes[i], erro: x.reason && x.reason.message, status: x.reason && x.reason.status });
  });
  if (falhas.length === nomes.length) {
    const e = new Error(falhas[0].erro || 'Serper indisponível');
    e.status = falhas[0].status === 401 || falhas[0].status === 403 ? 502 : 503;
    throw e;
  }
  respostas.internas = await internas.catch(() => ({}));
  return { ...analisar(q, respostas), falhas, creditos: nomes.length - falhas.length };
}

function recente(d) { return d && d.geradoEm && Date.now() - new Date(d.geradoEm).getTime() < CACHE_MS; }

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });
  if (!exigirSenha(req, res)) return;
  let corpo = req.body;
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }
  const termo = String((corpo && corpo.termo) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (termo.length < 2) return res.status(400).json({ erro: 'Digite uma palavra-chave.' });
  if (/\bsite:|[<>]/i.test(termo)) return res.status(400).json({ erro: 'Use só a palavra-chave, sem operadores.' });
  const atualizar = !!(corpo && corpo.atualizar);

  const k = armazem.slug(termo);
  // posição dos seus anúncios (🏠) também quando o resultado vem guardado (não gasta crédito)
  const anotarMeus = async d => { try { await meus.anotar(arm, d, ((await arm.config()) || {}).meusAnuncios); } catch (e) { /* extra */ } };
  if (!atualizar) {
    const c = cache.get(k);
    if (c && recente(c)) { await anotarMeus(c); return res.status(200).json({ ...c, doCache: true }); }
    const salvo = await arm.ler(termo);
    if (recente(salvo)) { cache.set(k, salvo); await anotarMeus(salvo); return res.status(200).json({ ...salvo, doCache: true }); }
  }

  const chave = process.env.SERPER_API_KEY;
  if (!chave) return res.status(500).json({ erro: 'Falta configurar SERPER_API_KEY na Vercel.' });
  try {
    const dados = await pesquisar(termo, chave, deps.fetch || fetch);
    cache.set(k, dados);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    let salvoNaNuvem = false;
    try { salvoNaNuvem = await arm.salvar(dados); await arm.anotarSerie(dados); } catch (e) { console.warn('[armazem] não salvou:', e && e.message); }
    await anotarMeus(dados);
    return res.status(200).json({ ...dados, salvoNaNuvem });
  } catch (e) {
    return res.status(e.status || 500).json({ erro: 'Não consegui pesquisar agora: ' + e.message });
  }
}

module.exports = handler;
module.exports.pesquisar = pesquisar;
module.exports.senhaOk = senhaOk;
