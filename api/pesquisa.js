// POST /api/pesquisa  { termo }  (cabeçalho x-senha)
// Faz 6 consultas no Serper em paralelo e devolve o painel já analisado.
'use strict';
const { analisar, MARKETPLACES } = require('../lib/analise');

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
  return { ...analisar(q, respostas), falhas, creditos: nomes.length - falhas.length };
}

function senhaOk(req) {
  const esperada = process.env.PAINEL_SENHA || '';
  if (!esperada) return false;                 // sem senha configurada, ninguém usa (protege os créditos)
  const dada = String(req.headers['x-senha'] || '');
  if (dada.length !== esperada.length) return false;
  let d = 0;
  for (let i = 0; i < dada.length; i++) d |= dada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return d === 0;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });
  if (!process.env.PAINEL_SENHA) return res.status(500).json({ erro: 'Falta configurar PAINEL_SENHA na Vercel.' });
  if (!senhaOk(req)) return res.status(401).json({ erro: 'Senha incorreta.' });
  let corpo = req.body;
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }
  const termo = String((corpo && corpo.termo) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (termo.length < 2) return res.status(400).json({ erro: 'Digite uma palavra-chave.' });
  if (/\bsite:|[<>]/i.test(termo)) return res.status(400).json({ erro: 'Use só a palavra-chave, sem operadores.' });

  const chave = process.env.SERPER_API_KEY;
  if (!chave) return res.status(500).json({ erro: 'Falta configurar SERPER_API_KEY na Vercel.' });

  const k = termo.toLowerCase();
  const c = cache.get(k);
  if (c && Date.now() - c.em < CACHE_MS && !(corpo && corpo.atualizar)) return res.status(200).json({ ...c.dados, doCache: true });
  try {
    const dados = await pesquisar(termo, chave);
    cache.set(k, { em: Date.now(), dados });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return res.status(200).json(dados);
  } catch (e) {
    return res.status(e.status || 500).json({ erro: 'Não consegui pesquisar agora: ' + e.message });
  }
}

module.exports = handler;
module.exports.pesquisar = pesquisar;
module.exports.senhaOk = senhaOk;
