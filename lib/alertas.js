// Compara o último ponto com o anterior e diz o que mudou de forma relevante.
'use strict';

const pct = (a, b) => (a && b) ? (b - a) / a * 100 : null;
const reais = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

function alertasVigiada(termo, pontos) {
  if (!Array.isArray(pontos) || pontos.length < 2) return [];
  const a = pontos[pontos.length - 2], b = pontos[pontos.length - 1], out = [];
  const dp = pct(a.precoMediano, b.precoMediano);
  if (dp != null && Math.abs(dp) >= 10) out.push({ tipo: dp < 0 ? 'preco-caiu' : 'preco-subiu', termo, msg: `Preço mais comum de "${termo}" ${dp < 0 ? 'caiu' : 'subiu'} ${Math.abs(Math.round(dp))}%: ${reais(a.precoMediano)} → ${reais(b.precoMediano)}` });
  if (a.nota != null && b.nota != null && Math.abs(b.nota - a.nota) >= 10) out.push({ tipo: b.nota > a.nota ? 'nota-subiu' : 'nota-caiu', termo, msg: `Nota de "${termo}" ${b.nota > a.nota ? 'subiu' : 'caiu'} de ${a.nota} para ${b.nota}` });
  const anA = (a.ml || 0) + (a.shopee || 0) + (a.amazon || 0), anB = (b.ml || 0) + (b.shopee || 0) + (b.amazon || 0);
  if (anA >= 3 && anB - anA >= Math.max(3, anA * 0.3)) out.push({ tipo: 'concorrencia', termo, msg: `Entrou concorrência em "${termo}": ${anA} → ${anB} anúncios nos 3 canais` });
  if ((b.lojas || 0) - (a.lojas || 0) >= 4) out.push({ tipo: 'concorrencia', termo, msg: `Mais lojas no Google Shopping para "${termo}": ${a.lojas} → ${b.lojas}` });
  return out;
}

function alertasConcorrente(nome, pontos) {
  const ok = (pontos || []).filter(p => p.achou);
  if (ok.length < 2) return [];
  const a = ok[ok.length - 2], b = ok[ok.length - 1], out = [];
  const dp = pct(a.preco, b.preco);
  if (dp != null && Math.abs(dp) >= 5) out.push({ tipo: dp < 0 ? 'concorrente-baixou' : 'concorrente-subiu', termo: nome, msg: `Concorrente "${nome}" ${dp < 0 ? 'baixou' : 'subiu'} o preço ${Math.abs(Math.round(dp))}%: ${reais(a.preco)} → ${reais(b.preco)}` });
  if (a.vendidos != null && b.vendidos != null && b.vendidos > a.vendidos) out.push({ tipo: 'concorrente-vendeu', termo: nome, msg: `Concorrente "${nome}" passou de ${a.vendidos}+ para ${b.vendidos}+ vendidos` });
  return out;
}

module.exports = { alertasVigiada, alertasConcorrente };
