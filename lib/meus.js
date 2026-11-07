// 🏠 Seus anúncios no ranking dos mais hypados: posição a cada pesquisa e na checagem de segunda.
'use strict';
const Hype = require('./hype');
const armazem = require('./armazem');

const ARQ = 'meus/posicoes.json';
const MAX_LINKS = 10;

// mesmo anúncio com links diferentes (parâmetros, www, barra no fim) vira a mesma chave
function chaveLink(l) {
  const m = String(l || '').match(/MLB-?(\d{6,})/i); if (m) return 'MLB' + m[1];
  try { const u = new URL(l); return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase(); } catch (e) { return String(l || '').toLowerCase(); }
}
function limparLinks(lista) {
  const out = [], vistos = new Set();
  (Array.isArray(lista) ? lista : []).forEach(l => {
    let u; try { u = new URL(String(l).trim()); } catch (e) { return; }
    if (u.protocol !== 'https:') return;
    const k = chaveLink(u.toString()); if (vistos.has(k)) return; vistos.add(k); out.push(u.toString().slice(0, 500));
  });
  return out.slice(0, MAX_LINKS);
}

// posição de cada um dos seus anúncios nesta pesquisa (pelo hype)
function posicoes(d, links) {
  const meus = new Set((links || []).map(chaveLink));
  if (!meus.size) return [];
  const lista = Hype.filtrar(Hype.juntar(d, null), { ordem: 'hype' });
  return lista.map((a, i) => ({ a, i })).filter(({ a }) => meus.has(chaveLink(a.link)))
    .map(({ a, i }) => ({ link: a.link, titulo: a.titulo, canal: a.canal, posicao: i + 1, total: lista.length, hype: a.hype, frente: lista.slice(0, i).slice(-3).map(x => ({ titulo: x.titulo, hype: x.hype, nota: x.nota, avaliacoes: x.avaliacoes, vendidos: x.vendidos, preco: x.preco })) }));
}

// anota (se algum anúncio seu apareceu) — chamado depois de cada pesquisa e na checagem de segunda
async function anotar(arm, d, links) {
  if (!arm.ativo || !links || !links.length) return null;
  const ps = posicoes(d, links); if (!ps.length) return null;
  const k = armazem.slug(d.termo), em = new Date().toISOString();
  await arm.mudarArquivo(ARQ, o => {
    const x = o && typeof o === 'object' ? o : {};
    const dia = em.slice(0, 10);
    const antes = (x[k] && x[k].pontos || []).filter(p => String(p.em).slice(0, 10) !== dia);
    x[k] = { termo: d.termo, pontos: antes.concat([{ em, itens: ps.map(p => ({ link: p.link, titulo: p.titulo, canal: p.canal, posicao: p.posicao, total: p.total, hype: p.hype })) }]).slice(-26), frente: ps[0].frente };
    return x;
  });
  return ps;
}

module.exports = { chaveLink, limparLinks, posicoes, anotar, ARQ };
