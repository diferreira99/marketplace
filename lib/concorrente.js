// Acompanhar o anúncio de um concorrente: o Google (via Serper, 1 crédito) mostra título, preço,
// vendidos e nota do anúncio. Guardamos um ponto por checagem para ver a evolução.
'use strict';
const crypto = require('crypto');
const { lerPrecos, lerVendidos } = require('./analise');

function idDoLink(link) { return crypto.createHash('sha1').update(String(link).trim()).digest('hex').slice(0, 16); }

function canalDoLink(link) {
  const h = (() => { try { return new URL(link).hostname; } catch (e) { return ''; } })();
  if (/mercadolivre|mercadolibre/.test(h)) return 'mercadolivre';
  if (/shopee/.test(h)) return 'shopee';
  if (/amazon/.test(h)) return 'amazon';
  return 'outro';
}

// "MLB-1234567890" ou "MLB1234567890" do link do Mercado Livre
function codigoML(link) { const m = String(link).match(/MLB-?(\d{6,})/i); return m ? 'MLB' + m[1] : null; }

function validar(link) {
  let u; try { u = new URL(String(link).trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign', 'matt_tool', 'tracking_id'].forEach(p => u.searchParams.delete(p));
  return u.toString();
}

async function lerAnuncio(link, chave, fetcher = fetch) {
  const canal = canalDoLink(link), cod = canal === 'mercadolivre' ? codigoML(link) : null;
  const host = (() => { try { return new URL(link).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
  const q = cod ? `"${cod.replace('MLB', 'MLB-')}" OR "${cod}" site:mercadolivre.com.br` : link;
  const r = await fetcher('https://google.serper.dev/search', {
    method: 'POST', headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 10 }),
  });
  if (!r.ok) { const e = new Error('Serper respondeu ' + r.status); e.status = r.status; throw e; }
  const j = await r.json();
  const itens = (j.organic || []);
  const alvo = itens.find(o => o.link && (o.link === link || (cod && o.link.replace(/-/g, '').includes(cod)))) ||
    itens.find(o => host && String(o.link || '').includes(host)) || null;
  if (!alvo) return { em: new Date().toISOString(), achou: false };
  const texto = [alvo.title, alvo.snippet, alvo.price, JSON.stringify(alvo.attributes || {})].join(' ');
  const precos = lerPrecos(texto);
  return {
    em: new Date().toISOString(), achou: true,
    titulo: String(alvo.title || '').replace(/\s*[|-]\s*(Mercado\s*Livre|Shopee Brasil|Shopee|Amazon\.com\.br).*$/i, '').trim(),
    preco: precos.length ? precos[0] : null, vendidos: lerVendidos(texto),
    nota: alvo.rating != null ? Number(alvo.rating) : null, avaliacoes: alvo.ratingCount != null ? Number(alvo.ratingCount) : null,
  };
}

module.exports = { lerAnuncio, idDoLink, canalDoLink, codigoML, validar };
