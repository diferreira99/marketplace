// Conta do vendedor no Mercado Livre
// POST /api/ml-conta {acao:'conectar'}       (senha) -> URL para autorizar no ML
// GET  /api/ml-conta?code=...&state=...      (volta do ML, sem senha: valida o state) -> guarda o token
// GET  /api/ml-conta                          (senha) -> status + resumo da loja (anúncios, visitas, vendas 30 dias)
// POST /api/ml-conta {acao:'desconectar'}    (senha)
'use strict';
const crypto = require('crypto');
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');
const ml = require('../lib/mlconta');

const configurado = () => !!(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET);
function redirectDe(req) {
  if (process.env.ML_REDIRECT_URI) return process.env.ML_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return 'https://' + host + '/api/ml-conta';
}

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  const fetcher = deps.fetch || fetch;
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};

  // volta do Mercado Livre depois de autorizar
  if (req.method === 'GET' && q.code) {
    const st = await arm.lerArquivo('ml-state.json');
    const ok = st && typeof q.state === 'string' && st.state === q.state && Date.now() - st.em < 15 * 60000;
    if (!ok) { res.statusCode = 302; res.setHeader('Location', '/?ml=erro-state#loja'); return res.end(); }
    try {
      const tk = await ml.trocarCodigo(String(q.code), redirectDe(req), fetcher);
      await arm.mudarArquivo(ml.ARQ, () => ({ ...tk, conectadoEm: new Date().toISOString() }));
      await arm.mudarArquivo('ml-state.json', () => ({ state: null, em: 0 }));
      res.statusCode = 302; res.setHeader('Location', '/?ml=ok#loja'); return res.end();
    } catch (e) { res.statusCode = 302; res.setHeader('Location', '/?ml=erro#loja'); return res.end(); }
  }

  if (!exigirSenha(req, res)) return;
  if (req.method === 'POST') {
    let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
    if (b.acao === 'conectar') {
      if (!configurado()) return res.status(400).json({ erro: 'Falta criar o app no Mercado Livre e colocar ML_CLIENT_ID e ML_CLIENT_SECRET na Vercel.', redirect: redirectDe(req) });
      const state = crypto.randomBytes(16).toString('hex');
      await arm.mudarArquivo('ml-state.json', () => ({ state, em: Date.now() }));
      return res.status(200).json({ url: ml.urlAutorizacao(process.env.ML_CLIENT_ID, redirectDe(req), state) });
    }
    if (b.acao === 'desconectar') { await arm.apagarArquivo(ml.ARQ); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  }
  if (req.method !== 'GET') return res.status(405).json({ erro: 'use GET ou POST' });
  const c = await ml.token(arm, fetcher).catch(() => null);
  if (!c) return res.status(200).json({ conectado: false, configurado: configurado(), redirect: redirectDe(req) });
  if (c.expirado) return res.status(200).json({ conectado: false, expirado: true, configurado: configurado(), redirect: redirectDe(req) });
  try {
    const loja = await ml.resumoLoja(c.access_token, c.user_id, fetcher);
    return res.status(200).json({ conectado: true, conectadoEm: c.conectadoEm, ...loja });
  } catch (e) { return res.status(502).json({ conectado: true, erro: 'O Mercado Livre não respondeu: ' + e.message }); }
}

module.exports = handler;
