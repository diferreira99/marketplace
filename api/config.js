// GET  /api/config  -> configurações do time (taxas, imposto, margem alvo, custos por produto, vigiadas)
// POST /api/config  { acao, ... } -> muda uma parte, sem atropelar o que outra pessoa salvou
'use strict';
const { exigirSenha } = require('../lib/acesso');
const armazem = require('../lib/armazem');
const { PADRAO, TAXAS_PADRAO } = require('../lib/margem');
const { FAIXAS_PADRAO } = require('../lib/frete');

const MAX_VIGIADAS = 15;
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; };

function completa(c) {
  const taxas = {};
  for (const [id, t] of Object.entries(TAXAS_PADRAO)) {
    const salvo = Object.fromEntries(Object.entries((c.taxas || {})[id] || {}).filter(([, v]) => v != null && Number.isFinite(Number(v))));
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
  if (req.method === 'GET') return res.status(200).json({ nuvem: arm.ativo, ...completa(await arm.config()) });
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use GET ou POST' });
  if (!arm.ativo) return res.status(503).json({ erro: 'Armazenamento na nuvem não configurado.' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
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
