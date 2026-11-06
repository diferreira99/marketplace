// GET  /api/config  -> configurações do time (taxas, imposto, margem alvo, custos por produto, vigiadas)
// POST /api/config  { acao, ... } -> muda uma parte, sem atropelar o que outra pessoa salvou
// GET  /api/config?push=1 -> chave pública para ativar avisos no celular
// POST /api/config  { acao: 'push-inscrever' | 'push-sair' | 'push-teste', inscricao } -> avisos no celular (lib/push)
'use strict';
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');
const { PADRAO, TAXAS_PADRAO } = require('../lib/margem');
const { FAIXAS_PADRAO } = require('../lib/frete');
const push = require('../lib/push');

const MAX_VIGIADAS = 15;
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; };

function completa(c) {
  const taxas = {};
  for (const [id, t] of Object.entries(TAXAS_PADRAO)) {
    const salvo = Object.fromEntries(Object.entries((c.taxas || {})[id] || {}).filter(([k, v]) => k === 'faixas' ? Array.isArray(v) && v.length : v != null && Number.isFinite(Number(v))));
    taxas[id] = { ...t, ...salvo };
  }
  return {
    imposto: c.imposto ?? PADRAO.imposto, margemAlvo: c.margemAlvo ?? PADRAO.margemAlvo, taxas,
    custos: c.custos || {}, vigiadas: c.vigiadas || [],
    fretes: { ...FAIXAS_PADRAO, ...(c.fretes || {}) },
  };
}

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  if (!exigirSenha(req, res)) return;
  const webpush = deps.webpush || require('web-push');
  if (req.method === 'GET' && req.query && req.query.push) {
    if (!arm.ativo) return res.status(503).json({ erro: 'Armazenamento na nuvem não configurado.' });
    const k = await push.chaves(arm, webpush);
    return res.status(200).json({ publicKey: k.publicKey, aparelhos: ((await arm.lerArquivo('push/inscricoes.json')) || []).length });
  }
  if (req.method === 'GET') return res.status(200).json({ nuvem: arm.ativo, ...completa(await arm.config()) });
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use GET ou POST' });
  if (!arm.ativo) return res.status(503).json({ erro: 'Armazenamento na nuvem não configurado.' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (String(b.acao || '').startsWith('push-')) {
    try {
      if (b.acao === 'push-inscrever') { await push.inscrever(arm, b.inscricao, b.aparelho); return res.status(200).json({ ok: true }); }
      if (b.acao === 'push-sair') { await push.sair(arm, String((b.inscricao && b.inscricao.endpoint) || '')); return res.status(200).json({ ok: true }); }
      if (b.acao === 'push-teste') return res.status(200).json({ ok: true, ...(await push.enviar(arm, webpush, { titulo: '📡 Radar Marketplace', texto: 'Avisos ligados! Quando um concorrente baixar o preço, você fica sabendo aqui.', url: '/#vigiadas', tag: 'radar-teste' })) });
      return res.status(400).json({ erro: 'Ação desconhecida.' });
    } catch (e) { return res.status(e.status || 500).json({ erro: e.message }); }
  }
  try {
    const novo = await arm.mudarConfig(c => {
      if (b.acao === 'taxas') {
        if (b.imposto != null) c.imposto = num(b.imposto, 0, 60);
        if (b.margemAlvo != null) c.margemAlvo = num(b.margemAlvo, 0, 90);
        c.taxas = c.taxas || {};
        for (const [id, t] of Object.entries(b.taxas || {})) {
          if (!TAXAS_PADRAO[id]) continue;
          c.taxas[id] = {
            comissao: num(t.comissao, 0, 60), fixoAbaixo: num(t.fixoAbaixo, 0, 500), limiteFixo: num(t.limiteFixo, 0, 1e9),
            freteAcima: num(t.freteAcima, 0, 500), tetoComissao: num(t.tetoComissao, 0, 10000),
          };
          if (Array.isArray(t.faixas)) c.taxas[id].faixas = t.faixas.map(f => [num(f[0], 0, 1e9), num(f[1], 0, 1e9), num(f[2], 0, 60), num(f[3], 0, 500)]).filter(f => f.every(v => v != null) && f[1] > f[0]).slice(0, 8);
        }
        if (b.restaurar) { delete c.taxas; delete c.imposto; delete c.margemAlvo; }
      } else if (b.acao === 'custo') {
        const k = armazem.slug(b.termo);
        c.custos = c.custos || {};
        c.custos[k] = {
          custo: num(b.custo, 0, 1e6) || 0, embalagem: num(b.embalagem, 0, 1e6) || 0,
          pesoKg: num(b.pesoKg, 0, 1000) || 0, comp: num(b.comp, 0, 1000) || 0, larg: num(b.larg, 0, 1000) || 0, alt: num(b.alt, 0, 1000) || 0,
          meta: num(b.meta, 0, 1e8) || 0, detalhes: String(b.detalhes || '').slice(0, 800),
        };
      } else if (b.acao === 'fretes') {
        if (b.restaurar) delete c.fretes;
        else {
          c.fretes = c.fretes || {};
          for (const [id, faixas] of Object.entries(b.fretes || {})) {
            if (!FAIXAS_PADRAO[id] || !Array.isArray(faixas)) continue;
            c.fretes[id] = faixas.map(f => [num(f[0], 0, 1000), num(f[1], 0, 5000)]).filter(f => f[0] > 0 && f[1] != null).sort((x, y) => x[0] - y[0]).slice(0, 20);
          }
        }
      } else if (b.acao === 'vigiar') {
        const k = armazem.slug(b.termo);
        const lista = (c.vigiadas || []).filter(v => v.chave !== k);
        if (b.ligar) {
          if (lista.length >= MAX_VIGIADAS) { const e = new Error(`No máximo ${MAX_VIGIADAS} palavras vigiadas (cada uma gasta 6 créditos por semana).`); e.status = 400; throw e; }
          lista.push({ chave: k, termo: String(b.termo).slice(0, 120), desde: new Date().toISOString() });
        }
        c.vigiadas = lista;
      } else {
        const e = new Error('Ação desconhecida.'); e.status = 400; throw e;
      }
      return c;
    });
    return res.status(200).json({ nuvem: true, ...completa(novo) });
  } catch (e) {
    return res.status(e.status || 500).json({ erro: e.message });
  }
}

module.exports = handler;
module.exports.completa = completa;
