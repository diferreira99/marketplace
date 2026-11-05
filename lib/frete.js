// Frete pelo peso e pela medida. Vale o maior entre o peso real e o peso cubado (C x L x A / 6000).
// Tabelas de REFERÊNCIA (o quanto o vendedor costuma pagar no frete grátis), editáveis em ⚙️ Taxas.
'use strict';

const FAIXAS_PADRAO = {
  // [até kg, R$]
  mercadolivre: [[0.3, 19.95], [0.5, 21.45], [1, 22.45], [2, 23.95], [5, 29.95], [9, 44.95], [13, 62.95], [17, 69.95], [23, 79.95], [30, 89.95]],
  amazon: [[0.25, 17.45], [0.5, 18.45], [1, 20.45], [2, 22.95], [5, 28.45], [10, 42.45], [15, 59.45], [20, 69.45], [30, 84.45]],
  shopee: [],   // na Shopee o frete grátis já entra na comissão
};

function pesoConsiderado(pesoKg, c, l, a) {
  const real = Math.max(0, Number(pesoKg) || 0);
  const cubado = (Number(c) || 0) * (Number(l) || 0) * (Number(a) || 0) / 6000;
  return { real, cubado: Math.round(cubado * 1000) / 1000, considerado: Math.max(real, cubado) };
}

// null = sem tabela (usa o valor fixo da taxa); 0 quando o canal não cobra frete à parte
function fretePorPeso(canal, kg, faixas) {
  const tab = (faixas && faixas[canal]) || FAIXAS_PADRAO[canal];
  if (!tab) return null;
  if (!tab.length) return 0;
  if (!(kg > 0)) return null;
  for (const [ate, valor] of tab) if (kg <= ate) return valor;
  return tab[tab.length - 1][1];   // acima da última faixa: usa a última (aviso no painel)
}

const _apiFrete = { FAIXAS_PADRAO, pesoConsiderado, fretePorPeso };
if (typeof module !== 'undefined' && module.exports) module.exports = _apiFrete;
else if (typeof window !== 'undefined') window.Frete = _apiFrete;
