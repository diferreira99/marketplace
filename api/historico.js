// GET    /api/historico            -> lista das pesquisas (resumo), a mesma para todo mundo
// GET    /api/historico?termo=...  -> pesquisa completa salva
// DELETE /api/historico?termo=...  -> tira a pesquisa do histórico
'use strict';
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (!exigirSenha(req, res)) return;
  const termo = String((req.query && req.query.termo) || '').trim().slice(0, 120);
  if (req.method === 'GET') {
    if (!termo) return res.status(200).json({ nuvem: arm.ativo, itens: await arm.indice() });
    if (req.query.serie) return res.status(200).json({ termo, pontos: await arm.serie(termo) });
    if (req.query.anuncio) { const a = await arm.lerArquivo('anuncios/' + armazem.slug(termo) + '.json'); return a ? res.status(200).json(a) : res.status(404).json({ erro: 'Sem anúncio gerado.' }); }
    const d = await arm.ler(termo);
    return d ? res.status(200).json(d) : res.status(404).json({ erro: 'Pesquisa não encontrada.' });
  }
  if (req.method === 'DELETE') {
    if (!termo) return res.status(400).json({ erro: 'Diga qual pesquisa apagar.' });
    await arm.apagar(termo);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ erro: 'use GET ou DELETE' });
}

module.exports = handler;
