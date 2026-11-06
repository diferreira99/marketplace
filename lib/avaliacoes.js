// O que os compradores reclamam: avaliações dos anúncios do Mercado Livre (API pública de reviews,
// ou com o token da conta conectada). Sem IA, conta os temas de reclamação mais comuns.
'use strict';

const TEMAS = [
  ['Não cola / descola', /n[aã]o (cola|grud|fix|segur)|descol|solt(a|ou)|caiu|cai(u)? |desgrud|aderen/i],
  ['Fita fina ou fraca', /fin[ao]|fraca|fr[aá]gil|rasg|arrebent/i],
  ['Medida diferente do anúncio', /menor|mais curt|tamanho|medida|largura|comprimento|veio menos/i],
  ['Espessura (grossa ou fina demais)', /espessura|gross[ao]/i],
  ['Difícil de tirar o liner / descascar', /tirar o papel|pel[ií]cula|papel protetor|liner|descascar/i],
  ['Deixa resíduo / mancha o espelho', /res[ií]duo|manch|marca(s)? no/i],
  ['Embalagem ou entrega', /embalag|amassad|chegou (aberto|danific|quebr)|demor|atras|entrega/i],
  ['Qualidade x preço', /caro|n[aã]o vale|qualidade (ruim|baixa|p[eé]ssima)|p[eé]ssim/i],
  ['Cheiro', /cheiro|odor/i],
];

// o que os compradores elogiam (avaliações de 4 e 5 estrelas)
const ELOGIOS = [
  ['Cola e segura bem', /segur|firme|cola (muito )?bem|grud(ou|a) bem|ader[eê]ncia (boa|ótima|excelente)|forte|n[aã]o (solta|descola)/i],
  ['Fácil de aplicar', /f[aá]cil|pr[aá]tic|r[aá]pid[ao] de (aplicar|usar|colocar)|simples/i],
  ['Boa qualidade', /qualidade|excelente|[oó]tim[oa]|perfeit|muito bo[am]|recomendo|top\b|maravilh/i],
  ['Medida certa / igual ao anúncio', /conforme|como (no )?anunciad|como descrit|medida certa|tamanho certo|igual (à|a) foto|exatamente/i],
  ['Bom preço', /pre[cç]o|barat|custo.?benef|vale (muito )?a pena|em conta/i],
  ['Entrega rápida e bem embalado', /cheg(ou)? (r[aá]pido|antes|bem)|entrega r[aá]pida|bem embalad|embalagem (boa|ótima|caprichada)/i],
];
// pontos positivos e negativos de UM anúncio (para o ranking dos mais hypados)
function pontosDoAnuncio(item) {
  const rv = item.reviews || [];
  const txt = r => ((r.titulo || '') + ' ' + (r.texto || '')).trim();
  const pos = rv.filter(r => r.nota >= 4).map(txt).filter(Boolean), neg = rv.filter(r => r.nota != null && r.nota <= 3).map(txt).filter(Boolean);
  const conta = (lista, regras) => regras.map(([tema, re]) => { const ex = lista.filter(t => re.test(t)); return { tema, vezes: ex.length, exemplo: ex[0] ? ex[0].slice(0, 140) : '' }; }).filter(t => t.vezes).sort((a, b) => b.vezes - a.vezes).slice(0, 4);
  return { id: item.id, media: item.media, total: item.total, lidas: rv.length, positivos: conta(pos, ELOGIOS), negativos: conta(neg, TEMAS), nPos: pos.length, nNeg: neg.length };
}

function codigosML(links) {
  const out = [];
  for (const l of links || []) { const m = String(l).match(/MLB-?(\d{6,})/i); if (m) out.push('MLB' + m[1]); }
  return [...new Set(out)].slice(0, 8);
}

async function buscarReviews(ids, fetcher = fetch, tk = null) {
  const res = [];
  for (const id of ids) {
    try {
      const h = { Accept: 'application/json' }; if (tk) h.Authorization = 'Bearer ' + tk;
      const r = await fetcher('https://api.mercadolibre.com/reviews/item/' + id + '?limit=50', { headers: h });
      if (!r.ok) continue;
      const j = await r.json();
      res.push({ id, media: j.rating_average ?? null, total: (j.paging && j.paging.total) || (j.reviews || []).length,
        reviews: (j.reviews || []).map(x => ({ nota: Number(x.rate) || null, titulo: x.title || '', texto: String(x.content || '').slice(0, 500) })) });
    } catch (e) { /* um anúncio a menos */ }
  }
  return res;
}

function temasPorRegra(itens) {
  const negativos = itens.flatMap(i => i.reviews.filter(r => r.nota != null && r.nota <= 3).map(r => (r.titulo + ' ' + r.texto).trim()).filter(Boolean));
  const positivos = itens.flatMap(i => i.reviews.filter(r => r.nota >= 4).map(r => (r.titulo + ' ' + r.texto).trim()).filter(Boolean));
  const temas = TEMAS.map(([nome, re]) => {
    const ex = negativos.filter(t => re.test(t));
    return { tema: nome, vezes: ex.length, exemplos: ex.slice(0, 3).map(t => t.slice(0, 160)) };
  }).filter(t => t.vezes > 0).sort((a, b) => b.vezes - a.vezes);
  return { negativos: negativos.length, positivos: positivos.length, temas };
}

module.exports = { codigosML, buscarReviews, temasPorRegra, pontosDoAnuncio, TEMAS, ELOGIOS };
