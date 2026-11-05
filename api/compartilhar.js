// POST /api/compartilhar { termo, extras }  (com senha) -> cria um link público só de leitura
// GET  /api/compartilhar?id=...             (sem senha)  -> o relatório guardado (para a página r.html)
'use strict';
const crypto = require('crypto');
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');

const valido = id => /^[a-f0-9]{32}$/.test(String(id || ''));

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    if (!valido(id)) return res.status(400).json({ erro: 'Link inválido.' });
    const r = await arm.lerArquivo('relatorios/' + id + '.json');
    return r ? res.status(200).json(r) : res.status(404).json({ erro: 'Relatório não encontrado ou removido.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use GET ou POST' });
  if (!exigirSenha(req, res)) return;
  if (!arm.ativo) return res.status(503).json({ erro: 'Armazenamento na nuvem não configurado.' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  const d = await arm.ler(String(b.termo || ''));
  if (!d) return res.status(404).json({ erro: 'Pesquise a palavra primeiro.' });
  const id = crypto.randomBytes(16).toString('hex');
  // extras: o que só existe na tela (recomendação, margem com o custo, meta) — guardamos só números e textos
  const extras = JSON.parse(JSON.stringify(b.extras || {}));
  const rel = { id, criadoEm: new Date().toISOString(), dados: d, extras };
  if (JSON.stringify(rel).length > 900000) return res.status(413).json({ erro: 'Relatório grande demais.' });
  await arm.mudarArquivo('relatorios/' + id + '.json', () => rel);
  return res.status(200).json({ id, caminho: '/r.html?id=' + id });
}

module.exports = handler;
module.exports.valido = valido;
