// 🏪 Compradores em volume: empresas que usam o produto no dia a dia (vidraçarias, marcenarias...),
// achadas no Google Maps pelo Serper. Só dados públicos do Maps; o contato é sempre manual.
'use strict';
const { serper } = require('./fontes');

const TIPOS_PADRAO = ['vidraçaria', 'marcenaria', 'loja de material de construção', 'móveis planejados'];

function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }
// Celular brasileiro com DDD -> link do WhatsApp (o vendedor clica e fala; nada é enviado sozinho)
function whatsapp(tel) {
  let d = soDigitos(tel); if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') return 'https://wa.me/55' + d;
  return null;
}

async function buscar({ cidade, tipos, paginas }, chave, fetcher = fetch) {
  const lista = (tipos && tipos.length ? tipos : TIPOS_PADRAO).slice(0, 6), np = Math.min(2, paginas || 1);
  const vistos = new Map(); let consultas = 0;
  for (const tipo of lista) {
    for (let page = 1; page <= np; page++) {
      let j; try { j = await serper('/places', { q: tipo + ' em ' + cidade, page }, chave, fetcher); consultas++; } catch (e) { if (e.status === 401 || e.status === 403) throw e; break; }
      const ps = j.places || [];
      ps.forEach(p => {
        const chaveP = p.cid || (p.title + '|' + p.address);
        if (vistos.has(chaveP)) return;
        vistos.set(chaveP, {
          nome: p.title || '', tipo, categoria: p.category || '', endereco: p.address || '', telefone: p.phoneNumber || '',
          whatsapp: whatsapp(p.phoneNumber), site: p.website || '', nota: p.rating != null ? Number(p.rating) : null, avaliacoes: p.ratingCount != null ? Number(p.ratingCount) : null,
          maps: p.cid ? 'https://www.google.com/maps?cid=' + p.cid : (p.latitude ? 'https://www.google.com/maps?q=' + p.latitude + ',' + p.longitude : ''),
        });
      });
      if (ps.length < 10) break;
    }
  }
  // quem tem mais avaliações costuma ser maior (compra mais)
  const itens = [...vistos.values()].sort((a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0));
  return { cidade, tipos: lista, consultas, itens };
}

module.exports = { buscar, whatsapp, TIPOS_PADRAO };
