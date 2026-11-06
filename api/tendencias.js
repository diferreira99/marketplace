// GET /api/tendencias?termo=... -> procura no Google Trends (12 meses, Brasil), guardada por 7 dias.
'use strict';
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');
const tendencias = require('../lib/tendencias');

const DIAS_CACHE = 7;

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ erro: 'use GET' });
  if (!exigirSenha(req, res)) return;
  const termo = String((req.query && req.query.termo) || '').trim().slice(0, 120);
  if (!termo) return res.status(400).json({ erro: 'Informe a palavra-chave.' });
  const caminho = 'tendencias/' + armazem.slug(termo) + '.json';
  const salvo = arm.ativo ? await arm.lerArquivo(caminho).catch(() => null) : null;
  const atualizar = req.query && req.query.atualizar;
  if (salvo && !atualizar && Date.now() - new Date(salvo.em) < DIAS_CACHE * 864e5) return res.status(200).json({ ...salvo, doCache: true });
  try {
    const r = { termo, em: new Date().toISOString(), ...(await tendencias.buscar(termo, deps.fetch || fetch)) };
    if (arm.ativo) { try { await arm.mudarArquivo(caminho, () => r); } catch (e) { /* segue sem guardar */ } }
    return res.status(200).json(r);
  } catch (e) {
    // devolve o último que deu certo, se houver, avisando que é antigo
    if (salvo) return res.status(200).json({ ...salvo, doCache: true, antigo: true });
    const limite = e.status === 429;
    return res.status(200).json({ termo, indisponivel: true, motivo: limite ? 'O Google Trends limitou os acessos agora. Tente de novo mais tarde.' : 'O Google Trends não respondeu agora (' + e.message + ').' });
  }
}

module.exports = handler;
