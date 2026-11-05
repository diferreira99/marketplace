// SEO interno dos marketplaces: o que as pessoas digitam na busca do Mercado Livre e da Amazon
// (autocompletar público de cada um). Não gasta crédito do Serper. Se um deles não responder
// ou mudar o formato, devolve null para aquele canal e o resto da pesquisa segue normal.
'use strict';

const FONTES = {
  mercadolivre: q => 'https://http2.mlstatic.com/resources/sites/MLB/autosuggest?showFilters=true&limit=10&api_version=2&q=' + encodeURIComponent(q),
  amazon: q => 'https://completion.amazon.com.br/api/2017/suggestions?limit=11&prefix=' + encodeURIComponent(q) +
    '&suggestion-type=KEYWORD&page-type=Search&alias=aps&site-variant=desktop&version=3&lop=pt_BR&mid=A2Q3Y263D00KWC',
};

// Pega as frases do JSON sem depender de um formato exato (q / value / keyword)
function extrair(json) {
  const out = [];
  const lista = (json && (json.suggested_queries || json.suggestions || json.results)) || [];
  for (const x of Array.isArray(lista) ? lista : []) {
    const s = typeof x === 'string' ? x : (x && (x.q || x.value || x.keyword || x.text));
    if (typeof s === 'string' && s.trim()) out.push(s.trim().toLowerCase());
  }
  return [...new Set(out)].slice(0, 12);
}

async function umaFonte(url, fetcher, ms) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctrl && ctrl.abort(), ms);
  try {
    const r = await fetcher(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 RadarMarketplace' }, signal: ctrl ? ctrl.signal : undefined });
    if (!r.ok) return null;
    return extrair(await r.json());
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

async function sugestoesMarketplaces(termo, fetcher = fetch, ms = 4000) {
  const ids = Object.keys(FONTES);
  const res = await Promise.all(ids.map(id => umaFonte(FONTES[id](termo), fetcher, ms)));
  return Object.fromEntries(ids.map((id, i) => [id, res[i]]));
}

module.exports = { sugestoesMarketplaces, extrair, FONTES };
