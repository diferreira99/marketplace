// GET  /api/concorrentes            -> anúncios acompanhados + histórico de cada um
// POST /api/concorrentes {acao:'adicionar', link, apelido} | {acao:'remover', id} | {acao:'checar', id}
'use strict';
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');
const { lerAnuncio, idDoLink, canalDoLink, validar } = require('../lib/concorrente');
const { alertasConcorrente } = require('../lib/alertas');
const push = require('../lib/push');

const MAX = 20;
const LISTA = 'concorrentes.json';
const serieDe = id => 'concorrentes/' + id + '.json';

async function checar(arm, c, chave, fetcher) {
  const ponto = await lerAnuncio(c.link, chave, fetcher);
  await arm.mudarArquivo(serieDe(c.id), lista => {
    const l = Array.isArray(lista) ? lista : [];
    const dia = ponto.em.slice(0, 10);
    return l.filter(p => String(p.em).slice(0, 10) !== dia).concat([ponto]).slice(-104);
  });
  return ponto;
}

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (!exigirSenha(req, res)) return;
  if (req.method === 'GET') {
    const lista = (await arm.lerArquivo(LISTA)) || [];
    const comSerie = await Promise.all(lista.map(async c => ({ ...c, pontos: (await arm.lerArquivo(serieDe(c.id))) || [] })));
    return res.status(200).json({ nuvem: arm.ativo, itens: comSerie });
  }
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use GET ou POST' });
  if (!arm.ativo) return res.status(503).json({ erro: 'Armazenamento na nuvem não configurado.' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  const chave = process.env.SERPER_API_KEY;
  try {
    if (b.acao === 'adicionar') {
      const link = validar(b.link);
      if (!link) return res.status(400).json({ erro: 'Cole o link completo do anúncio (começando com https://).' });
      const c = { id: idDoLink(link), link, canal: canalDoLink(link), apelido: String(b.apelido || '').trim().slice(0, 60), termo: String(b.termo || '').slice(0, 120), desde: new Date().toISOString() };
      await arm.mudarArquivo(LISTA, l => {
        const lista = (Array.isArray(l) ? l : []).filter(x => x.id !== c.id);
        if (lista.length >= MAX) { const e = new Error(`No máximo ${MAX} concorrentes (cada um gasta 1 crédito por semana).`); e.status = 400; throw e; }
        return lista.concat([c]);
      });
      let ponto = null;
      if (chave) { try { ponto = await checar(arm, c, chave, deps.fetch || fetch); } catch (e) { ponto = null; } }
      return res.status(200).json({ ok: true, item: c, ponto });
    }
    if (b.acao === 'remover') {
      await arm.mudarArquivo(LISTA, l => (Array.isArray(l) ? l : []).filter(x => x.id !== b.id));
      await arm.apagarArquivo(serieDe(b.id));
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'checar') {
      if (!chave) return res.status(500).json({ erro: 'Falta configurar SERPER_API_KEY na Vercel.' });
      const c = ((await arm.lerArquivo(LISTA)) || []).find(x => x.id === b.id);
      if (!c) return res.status(404).json({ erro: 'Concorrente não encontrado.' });
      const ponto = await checar(arm, c, chave, deps.fetch || fetch);
      const alertas = alertasConcorrente(c.apelido || c.link, (await arm.lerArquivo(serieDe(c.id))) || []).map(a => ({ ...a, em: ponto.em }));
      if (alertas.length) {
        await arm.mudarArquivo('alertas.json', l => alertas.concat(Array.isArray(l) ? l : []).slice(0, 100));
        const aviso = push.avisoDosAlertas(alertas);
        if (aviso) { try { await push.enviar(arm, deps.webpush || require('web-push'), aviso); } catch (e) { /* aviso é extra */ } }
      }
      return res.status(200).json({ ok: true, ponto, alertas });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(e.status || 500).json({ erro: e.message });
  }
}

module.exports = handler;
module.exports.checar = checar;
module.exports.LISTA = LISTA;
module.exports.serieDe = serieDe;
