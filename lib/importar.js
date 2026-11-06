// 🔗 Importa um produto pelo link da sua loja (Nuvemshop e lojas com dados de produto padrão).
// Lê nome, variações e preços do HTML público da página. Não guarda nada da página além disso.
'use strict';

const sem = s => String(s || '').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const limpa = s => sem(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const reais = v => { const n = typeof v === 'number' ? v : Number(String(v || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
// "3MTS", "6 metros", "90m" -> metros
function metrosDe(t) { const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|mts?\b|metros?\b)/i); return m ? Number(m[1].replace(',', '.')) : null; }

// Só endereços públicos https (o servidor não busca rede interna)
function urlSegura(u) {
  let x; try { x = new URL(String(u || '').trim()); } catch (e) { return null; }
  if (x.protocol !== 'https:') return null;
  const h = x.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) return null;
  return x.toString();
}

function lerPagina(html, url) {
  const s = String(html || '');
  const titulo = limpa((s.match(/<meta property="og:title" content="([^"]*)"/i) || s.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
  let variacoes = [];
  // Nuvemshop: data-variants="[...]"
  const dv = s.match(/data-variants="([^"]*)"/);
  if (dv) {
    try {
      variacoes = JSON.parse(sem(dv[1])).map(v => {
        const opc = [v.option0, v.option1, v.option2].filter(Boolean).map(String);
        return { rotulo: opc.join(' · ') || v.sku || 'Única', opcoes: opc, sku: v.sku || '', preco: reais(v.price_number ?? v.price_short), precoDe: reais(v.compare_at_price_number ?? v.compare_at_price_short), disponivel: v.available !== false, metros: opc.map(metrosDe).find(Boolean) || null };
      });
    } catch (e) { variacoes = []; }
  }
  // Padrão schema.org (JSON-LD)
  if (!variacoes.length) {
    for (const m of s.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const j = JSON.parse(m[1]); const lista = (Array.isArray(j) ? j : [j]).flatMap(x => x['@graph'] || [x]);
        lista.filter(x => /Product/.test(x['@type'])).forEach(p => {
          const ofertas = [].concat(p.offers && (p.offers.offers || p.offers) || []);
          ofertas.forEach(o => variacoes.push({ rotulo: limpa(o.name || p.name || 'Única'), opcoes: [], sku: o.sku || p.sku || '', preco: reais(o.price || o.lowPrice), precoDe: null, disponivel: !/OutOfStock/.test(o.availability || ''), metros: metrosDe(o.name) }));
        });
      } catch (e) { /* segue */ }
    }
  }
  variacoes = variacoes.filter(v => v.preco).slice(0, 60);
  return { url, nome: titulo.replace(/\s*[-|]\s*[^-|]*$/, '').trim() || titulo, variacoes };
}

async function importar(url, fetcher = fetch) {
  const u = urlSegura(url);
  if (!u) { const e = new Error('Cole o link completo da página do produto (começando com https://).'); e.status = 400; throw e; }
  const ctrl = new AbortController(); const tempo = setTimeout(() => ctrl.abort(), 15000);
  let r; try { r = await fetcher(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RadarMarketplace/1.0)', Accept: 'text/html' }, signal: ctrl.signal, redirect: 'follow' }); }
  catch (e) { const x = new Error('Não deu para abrir a página da loja agora.'); x.status = 502; throw x; } finally { clearTimeout(tempo); }
  if (!r.ok) { const e = new Error('A loja respondeu ' + r.status + '.'); e.status = 502; throw e; }
  const html = (await r.text()).slice(0, 3e6);
  const p = lerPagina(html, u);
  if (!p.variacoes.length) { const e = new Error('Não achei preços nessa página. Confira se é a página de um produto.'); e.status = 422; throw e; }
  return p;
}

module.exports = { importar, lerPagina, metrosDe, urlSegura, reais };
