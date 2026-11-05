// GET /api/taxa-ml?termo=...&preco=... -> categoria do produto no Mercado Livre e a comissão oficial dela
'use strict';
const { exigirSenha } = require('../lib/acesso');
const { categoriaETaxa } = require('../lib/mltaxa');
const armazem = require('../lib/armazem');
const mlconta = require('../lib/mlconta');

const cache = new Map();   // por máquina; a taxa da categoria muda pouco

async function handler(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (!exigirSenha(req, res)) return;
  const termo = String((req.query && req.query.termo) || '').trim().slice(0, 120);
  if (termo.length < 2) return res.status(400).json({ erro: 'Diga o produto.' });
  const preco = Number(req.query.preco) || 50;
  const k = termo.toLowerCase() + '|' + Math.round(preco);
  const c = cache.get(k);
  if (c && Date.now() - c.em < 24 * 36e5) return res.status(200).json(c.dados);
  let tk = null;
  try { const c = await mlconta.token(deps.armazem || armazem.padrao(), deps.fetch || fetch); tk = c && !c.expirado ? c.access_token : null; } catch (e) { tk = null; }
  const dados = await categoriaETaxa(termo, preco, deps.fetch || fetch, tk);
  if (!dados) return res.status(200).json({ oficial: false, motivo: 'O Mercado Livre não respondeu agora. Usando a taxa de referência.' });
  cache.set(k, { em: Date.now(), dados });
  return res.status(200).json(dados);
}

module.exports = handler;
