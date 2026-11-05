// Comissão oficial do Mercado Livre pela categoria do produto (API pública do ML):
// 1) domain_discovery descobre a categoria a partir da palavra-chave
// 2) listing_prices devolve a tarifa de cada tipo de anúncio (Clássico = gold_special, Premium = gold_pro)
// Se o ML pedir login (ML_ACCESS_TOKEN opcional) ou mudar o formato, devolve null e o painel usa a referência.
'use strict';

const ML = 'https://api.mercadolibre.com';

async function obter(url, fetcher, ms = 5000, tk = null) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctrl && ctrl.abort(), ms);
  try {
    const headers = { Accept: 'application/json' };
    const tok = tk || process.env.ML_ACCESS_TOKEN;
    if (tok) headers.Authorization = 'Bearer ' + tok;
    const r = await fetcher(url, { headers, signal: ctrl ? ctrl.signal : undefined });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

function lerTarifa(item) {
  if (!item) return null;
  const det = item.sale_fee_details || {};
  const preco = Number(item.price) || null;
  let pct = det.percentage_fee != null ? Number(det.percentage_fee) : null;
  const fixo = det.fixed_fee != null ? Number(det.fixed_fee) : null;
  if (pct == null && item.sale_fee_amount != null && preco) pct = Math.round((Number(item.sale_fee_amount) - (fixo || 0)) / preco * 1000) / 10;
  if (pct == null) return null;
  return { percentual: pct, fixo: fixo || 0, total: item.sale_fee_amount != null ? Number(item.sale_fee_amount) : null };
}

async function categoriaETaxa(termo, preco, fetcher = fetch, tk = null) {
  const dd = await obter(ML + '/sites/MLB/domain_discovery/search?limit=1&q=' + encodeURIComponent(termo), fetcher, 5000, tk);
  const cat = Array.isArray(dd) && dd[0];
  if (!cat || !cat.category_id) return null;
  const p = Math.max(1, Math.round(Number(preco) || 50));
  const lp = await obter(ML + '/sites/MLB/listing_prices?price=' + p + '&category_id=' + encodeURIComponent(cat.category_id), fetcher, 5000, tk);
  const lista = Array.isArray(lp) ? lp : [];
  const tipo = id => lerTarifa(lista.find(x => x && x.listing_type_id === id));
  const classico = tipo('gold_special'), premium = tipo('gold_pro');
  return {
    categoriaId: cat.category_id, categoria: cat.category_name || cat.domain_name || cat.category_id,
    precoConsultado: p, classico, premium, oficial: !!(classico || premium),
  };
}

module.exports = { categoriaETaxa, lerTarifa };
