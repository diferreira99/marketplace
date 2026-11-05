// GET /api/alertas -> o que mudou nas últimas checagens (vigiadas e concorrentes)
'use strict';
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (!exigirSenha(req, res)) return;
  return res.status(200).json({ itens: (await arm.lerArquivo('alertas.json')) || [], webhook: !!process.env.ALERTA_WEBHOOK_URL });
}

module.exports = handler;
