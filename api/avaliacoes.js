// POST /api/avaliacoes { termo } -> o que os compradores reclamam nos anúncios do Mercado Livre
// (os da pesquisa e os concorrentes acompanhados) + reclamações do Reclame Aqui achadas pelo Google
// + perguntas dos compradores (ML), vídeos do YouTube e comentários de Shopee/Amazon (pelo Google).
// Com IA: resumo e melhorias; sem IA: temas por regra.
'use strict';
const { z } = require('zod');
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');
const { codigosML, buscarReviews, temasPorRegra, pontosDoAnuncio } = require('../lib/avaliacoes');
const mlconta = require('../lib/mlconta');
const reclameaqui = require('../lib/reclameaqui');
const fontes = require('../lib/fontes');
const perfil = require('../lib/perfil');
const ia = require('../lib/ia');

const Resumo = z.object({
  reclamacoes: z.array(z.object({ tema: z.string(), quanto: z.string(), exemplo: z.string() })),
  elogios: z.array(z.string()),
  melhoriasProduto: z.array(z.string()),
  melhoriasAnuncio: z.array(z.string()),
  ideiasProduto: z.array(z.object({ ideia: z.string(), porque: z.string() })),
});

async function comIA(textos, termo, deps) {
  return ia.gerarJSON({
    esquema: Resumo, maxTokens: 4000,
    sistema: 'Você analisa avaliações de compradores para um fabricante brasileiro que vende em marketplace. Seja concreto e use só o que está nas avaliações. Português do Brasil.',
    usuario: `Produto: ${termo}\n\nAvaliações de anúncios concorrentes (Mercado Livre, Shopee, Amazon) e reclamações do Reclame Aqui:\n${textos.join('\n').slice(0, 30000)}\n\nResuma: as reclamações mais frequentes (tema, quanto aparece e um exemplo curto), o que mais elogiam, o que o fabricante deve melhorar no produto, o que deve deixar claro no anúncio, e até 5 ideias de produto ou kit que resolvem dores reais dos compradores (com o porquê, citando a dor).`,
  }, deps);
}

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  const fetcher = deps.fetch || fetch;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });
  if (!exigirSenha(req, res)) return;
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  const termo = String(b.termo || '').trim().slice(0, 120);
  const d = await arm.ler(termo);
  if (!d) return res.status(404).json({ erro: 'Pesquise a palavra primeiro.' });
  const salvo = await arm.lerArquivo('avaliacoes/' + armazem.slug(termo) + '.json');
  if (salvo && !b.atualizar && Date.now() - new Date(salvo.em) < 7 * 864e5) return res.status(200).json({ ...salvo, doCache: true });

  const links = Object.values(d.marketplaces || {}).flatMap(m => (m.itens || []).map(i => i.link));
  const conc = ((await arm.lerArquivo('concorrentes.json')) || []).map(c => c.link);
  const ids = codigosML(links.concat(conc));
  // tudo em paralelo: avaliações e perguntas do ML, Reclame Aqui, vídeos e Shopee/Amazon pelo Google
  let tk = null;
  if (ids.length) {
    try { const c = await mlconta.token(arm, fetcher); tk = c && !c.expirado ? c.access_token : null; } catch (e) { tk = null; }
    if (!tk && process.env.ML_ACCESS_TOKEN) tk = process.env.ML_ACCESS_TOKEN;
  }
  const chave = process.env.SERPER_API_KEY;
  const seguro = (p, falha) => p.catch(() => falha);
  const [itens, ra, perguntas, videos, outras] = await Promise.all([
    ids.length ? seguro(buscarReviews(ids, fetcher, tk), []) : Promise.resolve([]),
    chave ? seguro(reclameaqui.buscar(termo, chave, fetcher).then(x => ({ ...x, oportunidade: reclameaqui.oportunidade(x.temas) })), { itens: [], temas: [], empresas: [], erro: 'Não deu para consultar o Reclame Aqui agora.' }) : Promise.resolve(null),
    ids.length ? seguro(fontes.perguntasML(ids, fetcher, tk), { itens: [], temas: [] }) : Promise.resolve({ itens: [], temas: [] }),
    chave ? seguro(fontes.videos(termo, chave, fetcher), { itens: [], angulos: [], erro: 'Não deu para buscar os vídeos agora.' }) : Promise.resolve(null),
    chave ? seguro(fontes.outrasAvaliacoes(termo, chave, fetcher), { itens: [], negativos: 0, temas: [], erro: 'Não deu para buscar Shopee e Amazon agora.' }) : Promise.resolve(null),
  ]);
  const motivoML = !ids.length ? 'Nenhum anúncio do Mercado Livre com código (MLB) na pesquisa nem nos concorrentes.'
    : !itens.length ? 'O Mercado Livre não liberou as avaliações agora' + (tk ? '.' : ' (conectar a sua conta do ML na aba 🛒 Minha loja costuma resolver).') : null;
  const extras = { perguntas: { ...perguntas, google: ((d.seo && d.seo.perguntas) || []).map(x => x.pergunta).filter(Boolean) }, videos, outras };
  extras.porAnuncio = itens.map(pontosDoAnuncio);
  extras.perfil = perfil.perfilCliente(perfil.textosDe({ itensML: itens, reclameAqui: ra, ...extras }));
  if (!itens.length && !(ra && ra.itens.length)) if (!(outras && outras.itens.length)) { const vazio = { termo, em: new Date().toISOString(), anuncios: 0, fonte: 'nenhum', motivo: motivoML || 'Sem avaliações disponíveis.', reclameAqui: ra, ...extras };
    try { await arm.mudarArquivo('avaliacoes/' + armazem.slug(termo) + '.json', () => vazio); } catch (e) { /* cache é extra */ }
    return res.status(200).json(vazio); }
  const regra = itens.length ? temasPorRegra(itens) : { negativos: 0, positivos: 0, temas: [] };
  let resumoIA = null;
  const textos = itens.flatMap(i => i.reviews.filter(r => r.texto || r.titulo).map(r => `[${r.nota}★] ${r.titulo} ${r.texto}`.trim()))
    .concat(ra ? ra.itens.map(i => `[Reclame Aqui · ${i.empresa}] ${i.titulo}. ${i.trecho}`) : [])
    .concat(outras ? outras.itens.filter(i => i.negativo).map(i => `[${i.canal === 'amazon' ? 'Amazon' : 'Shopee'}] ${i.trecho}`) : []);
  if (ia.qualIA() && textos.length >= 5) { try { resumoIA = await comIA(textos, termo, deps); } catch (e) { console.warn('[avaliacoes] IA falhou:', e && e.message); resumoIA = null; } }
  const out = { termo, em: new Date().toISOString(), anuncios: itens.length, motivoML, media: itens.map(i => i.media).filter(x => x != null),
    totalAvaliacoes: itens.reduce((s, i) => s + (i.total || 0), 0), lidas: itens.reduce((n, i) => n + i.reviews.filter(r => r.texto || r.titulo).length, 0), ...regra, ia: resumoIA, fonte: resumoIA ? 'ia' : 'regra', reclameAqui: ra, ...extras };
  try { await arm.mudarArquivo('avaliacoes/' + armazem.slug(termo) + '.json', () => out); } catch (e) { /* cache é extra */ }
  return res.status(200).json(out);
}

module.exports = handler;
