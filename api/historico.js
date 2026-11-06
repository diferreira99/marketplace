// GET    /api/historico            -> lista das pesquisas (resumo), a mesma para todo mundo
// GET    /api/historico?termo=...  -> pesquisa completa salva
// GET    /api/historico?termo=...&tendencia=1 -> procura no Google Trends (lib/tendencias-rota)
// GET    /api/historico?palavras=1            -> lista das comparações de palavras-chave do time
// GET    /api/historico?palavras=1&termo=...  -> uma comparação completa
// POST   /api/historico {acao:'palavras', termo, resultado} -> guarda a comparação
// DELETE /api/historico?termo=...  -> tira a pesquisa do histórico
'use strict';
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');

const INDICE_PAL = 'palavras/indice.json';

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (!exigirSenha(req, res)) return;
  const termo = String((req.query && req.query.termo) || '').trim().slice(0, 120);
  if (req.method === 'GET') {
    if (req.query.palavras) {
      if (!termo) return res.status(200).json({ itens: (await arm.lerArquivo(INDICE_PAL)) || [] });
      const c = await arm.lerArquivo('palavras/' + armazem.slug(termo) + '.json');
      return c ? res.status(200).json(c) : res.status(404).json({ erro: 'Sem comparação salva.' });
    }
    if (!termo) return res.status(200).json({ nuvem: arm.ativo, itens: await arm.indice() });
    if (req.query.tendencia) return require('../lib/tendencias-rota')(req, res, deps);
    if (req.query.serie) return res.status(200).json({ termo, pontos: await arm.serie(termo) });
    if (req.query.anuncio) { const a = await arm.lerArquivo('anuncios/' + armazem.slug(termo) + '.json'); return a ? res.status(200).json(a) : res.status(404).json({ erro: 'Sem anúncio gerado.' }); }
    const d = await arm.ler(termo);
    return d ? res.status(200).json(d) : res.status(404).json({ erro: 'Pesquisa não encontrada.' });
  }
  if (req.method === 'POST') {
    let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
    if (b.acao !== 'palavras') return res.status(400).json({ erro: 'Ação desconhecida.' });
    if (!arm.ativo) return res.status(503).json({ erro: 'Armazenamento na nuvem não configurado.' });
    const t = String(b.termo || '').trim().slice(0, 120), r = b.resultado || {};
    const lista = (Array.isArray(r.lista) ? r.lista : []).slice(0, 25).map(x => ({ termo: String(x.termo || '').slice(0, 120), fontes: (x.fontes || []).slice(0, 6), forca: x.forca, uso: String(x.uso || '').slice(0, 40) }));
    if (!t || !lista.length) return res.status(400).json({ erro: 'Nada para guardar.' });
    const guardado = { termo: t, em: new Date().toISOString(), lista, melhor: lista[0], termos: (r.termos || []).slice(0, 12), erros: (r.erros || []).slice(0, 25).map(x => ({ termo: String(x.termo || '').slice(0, 120) })) };
    await arm.mudarArquivo('palavras/' + armazem.slug(t) + '.json', () => guardado);
    await arm.mudarArquivo(INDICE_PAL, l => [{ termo: t, em: guardado.em, n: lista.length, melhor: { termo: lista[0].termo, total: lista[0].forca && lista[0].forca.total } }]
      .concat((Array.isArray(l) ? l : []).filter(x => armazem.slug(x.termo) !== armazem.slug(t))).slice(0, 200));
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    if (!termo) return res.status(400).json({ erro: 'Diga qual pesquisa apagar.' });
    await arm.apagar(termo);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ erro: 'use GET, POST ou DELETE' });
}

module.exports = handler;
