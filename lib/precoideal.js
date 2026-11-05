// Preço ideal por canal: onde estão os preços dos concorrentes (e dos que mais vendem)
// cruzado com o menor preço que dá a sua margem. Sugere um preço terminado em ,90.
'use strict';

function quantil(ordenado, q) {
  if (!ordenado.length) return null;
  const pos = (ordenado.length - 1) * q, b = Math.floor(pos), r = pos - b;
  return ordenado[b + 1] != null ? ordenado[b] + r * (ordenado[b + 1] - ordenado[b]) : ordenado[b];
}
const r2p = v => Math.round(v * 100) / 100;
const noventa = v => { const c = Math.floor(v); const p = c + 0.9; return r2p(p >= v - 0.5 ? p : c + 1.9); };

// itens: [{preco, vendidos}] dos anúncios do canal; precoMinimo: preço que entrega a meta de margem (ou null)
function precoIdeal(itens, precoMinimo) {
  const comPreco = (itens || []).filter(i => i && i.preco > 0);
  const ps = comPreco.map(i => i.preco).sort((a, b) => a - b);
  if (ps.length < 2) return { suficiente: false, pontos: comPreco, motivo: 'Poucos preços desse canal para sugerir (menos de 2).' };
  const p25 = quantil(ps, 0.25), p50 = quantil(ps, 0.5), p75 = quantil(ps, 0.75);
  const vencedores = comPreco.filter(i => (i.vendidos || 0) >= 100).map(i => i.preco).sort((a, b) => a - b);
  const faixaVenc = vencedores.length ? [vencedores[0], vencedores[vencedores.length - 1]] : null;
  // alvo: entre o 40º percentil e a mediana (competitivo sem ser o mais barato); puxa para a faixa dos que mais vendem
  let alvo = quantil(ps, 0.4);
  if (faixaVenc) alvo = Math.min(Math.max(alvo, faixaVenc[0]), Math.max(faixaVenc[1], alvo));
  let situacao, sugerido;
  if (precoMinimo == null) { sugerido = noventa(alvo); situacao = 'sem-custo'; }
  else if (precoMinimo <= alvo) { sugerido = noventa(alvo); situacao = 'folga'; }
  else if (precoMinimo <= p75) { sugerido = noventa(precoMinimo); situacao = 'apertado'; }
  else { sugerido = noventa(precoMinimo); situacao = 'acima'; }
  const textos = {
    'sem-custo': `Faixa competitiva: ${fmt(p25)} a ${fmt(p50)}. Informe o custo para saber se a sua margem cabe aí.`,
    folga: `Dá para vender a ${fmt(sugerido)}, entre os preços que mais vendem, e ainda bater a meta de margem (mínimo ${fmt(precoMinimo)}).`,
    apertado: `Para bater a meta você precisa de ${fmt(sugerido)}, acima da maioria (mediana ${fmt(p50)}). Diferencie no anúncio (qualidade, kit, prova de fixação).`,
    acima: `Seu preço mínimo (${fmt(precoMinimo)}) fica acima de 75% dos concorrentes. Nesse canal, só com kit, versão premium ou custo menor.`,
  };
  return { suficiente: true, p25: r2p(p25), p50: r2p(p50), p75: r2p(p75), min: ps[0], max: ps[ps.length - 1], faixaVencedores: faixaVenc, sugerido, precoMinimo, situacao, texto: textos[situacao], pontos: comPreco };
}
function fmt(v) { return v == null ? '—' : 'R$ ' + Number(v).toFixed(2).replace('.', ','); }

const _apiPI = { precoIdeal, quantil };
if (typeof module !== 'undefined' && module.exports) module.exports = _apiPI;
else if (typeof window !== 'undefined') window.PrecoIdeal = _apiPI;
