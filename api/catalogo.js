// GET  /api/catalogo -> produtos da fábrica com as variações (largura, comprimento, custo, peso...)
// POST /api/catalogo {acao:'salvar', produto} | {acao:'remover', id}
'use strict';
const crypto = require('crypto');
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');

const ARQ = 'catalogo.json';
const MAX_PROD = 50, MAX_VAR = 40;
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.min(max, x) : 0; };

function limparProduto(p) {
  const id = /^[a-f0-9]{12}$/.test(String(p.id || '')) ? p.id : crypto.randomBytes(6).toString('hex');
  return {
    id, nome: txt(p.nome, 100) || 'Produto sem nome', palavraChave: txt(p.palavraChave, 120), marca: txt(p.marca, 60),
    detalhes: txt(p.detalhes, 800), atualizado: new Date().toISOString(),
    variacoes: (Array.isArray(p.variacoes) ? p.variacoes : []).slice(0, MAX_VAR).map(v => ({
      id: /^[a-f0-9]{8}$/.test(String(v.id || '')) ? v.id : crypto.randomBytes(4).toString('hex'),
      rotulo: txt(v.rotulo, 60), sku: txt(v.sku, 40), palavraChave: txt(v.palavraChave, 120),
      custo: num(v.custo, 1e6), embalagem: num(v.embalagem, 1e6), pesoKg: num(v.pesoKg, 1000),
      comp: num(v.comp, 1000), larg: num(v.larg, 1000), alt: num(v.alt, 1000), preco: num(v.preco, 1e6), estoque: num(v.estoque, 1e7),
    })),
  };
}

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (!exigirSenha(req, res)) return;
  if (req.method === 'GET') return res.status(200).json({ nuvem: arm.ativo, produtos: (await arm.lerArquivo(ARQ)) || [] });
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use GET ou POST' });
  if (!arm.ativo) return res.status(503).json({ erro: 'Armazenamento na nuvem não configurado.' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  try {
    if (b.acao === 'salvar') {
      const p = limparProduto(b.produto || {});
      const lista = await arm.mudarArquivo(ARQ, l => {
        const atual = (Array.isArray(l) ? l : []).filter(x => x.id !== p.id);
        if (atual.length >= MAX_PROD) { const e = new Error(`No máximo ${MAX_PROD} produtos.`); e.status = 400; throw e; }
        return atual.concat([p]);
      });
      return res.status(200).json({ ok: true, produto: p, produtos: lista });
    }
    if (b.acao === 'remover') {
      const lista = await arm.mudarArquivo(ARQ, l => (Array.isArray(l) ? l : []).filter(x => x.id !== b.id));
      return res.status(200).json({ ok: true, produtos: lista });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) { return res.status(e.status || 500).json({ erro: e.message }); }
}

module.exports = handler;
module.exports.limparProduto = limparProduto;
