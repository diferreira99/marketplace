// Calculadora de margem por canal, para quem fabrica: custo de produção + embalagem + imposto
// contra comissão, taxa fixa e frete de cada marketplace. Taxas são de referência e editáveis
// no painel (cada canal muda as regras com frequência).
'use strict';

const TAXAS_PADRAO = {
  mercadolivre: { nome: 'Mercado Livre (Clássico)', comissao: 12, fixoAbaixo: 6.75, limiteFixo: 79, freteAcima: 22, tetoComissao: 0 },
  mercadolivrePremium: { nome: 'Mercado Livre (Premium)', comissao: 17, fixoAbaixo: 6.75, limiteFixo: 79, freteAcima: 22, tetoComissao: 0 },
  shopee: { nome: 'Shopee', comissao: 20, fixoAbaixo: 4, limiteFixo: 1e9, freteAcima: 0, tetoComissao: 100 },
  amazon: { nome: 'Amazon', comissao: 15, fixoAbaixo: 5.5, limiteFixo: 79, freteAcima: 20, tetoComissao: 0 },
};
const PADRAO = { imposto: 6, margemAlvo: 25, taxas: TAXAS_PADRAO };

const r2 = v => Math.round(v * 100) / 100;

// Um canal a um preço: quanto sobra
function calcularCanal(preco, custo, embalagem, impostoPct, t) {
  const P = Number(preco) || 0;
  let comissao = P * (Number(t.comissao) || 0) / 100;
  if (t.tetoComissao > 0) comissao = Math.min(comissao, t.tetoComissao);
  const fixo = P < (Number(t.limiteFixo) || 0) ? (Number(t.fixoAbaixo) || 0) : 0;
  const frete = P >= (Number(t.limiteFixo) || 0) ? (Number(t.freteAcima) || 0) : 0;
  const imposto = P * (Number(impostoPct) || 0) / 100;
  const custos = (Number(custo) || 0) + (Number(embalagem) || 0);
  const lucro = P - comissao - fixo - frete - imposto - custos;
  return {
    preco: r2(P), comissao: r2(comissao), fixo: r2(fixo), frete: r2(frete), imposto: r2(imposto), custo: r2(custos),
    lucro: r2(lucro), margem: P > 0 ? r2(lucro / P * 100) : null,
  };
}

// Menor preço que entrega a margem alvo (testa os dois lados do limite da taxa fixa / frete)
function precoParaMargem(custo, embalagem, impostoPct, t, alvoPct) {
  const custos = (Number(custo) || 0) + (Number(embalagem) || 0);
  const lim = Number(t.limiteFixo) || 0;
  const k = 1 - (Number(t.comissao) || 0) / 100 - (Number(impostoPct) || 0) / 100 - (Number(alvoPct) || 0) / 100;
  if (k <= 0) return null;
  const candidatos = [];
  const abaixo = (custos + (Number(t.fixoAbaixo) || 0)) / k;
  if (abaixo < lim) candidatos.push(abaixo);
  const acima = (custos + (Number(t.freteAcima) || 0)) / k;
  if (acima >= lim) candidatos.push(acima);
  if (!candidatos.length) candidatos.push(lim);
  // confere com o cálculo real (teto de comissão etc.) e arredonda para ,90
  const p = Math.min(...candidatos);
  const bonito = Math.ceil(p) - 0.1;
  return r2(bonito >= p ? bonito : Math.ceil(p) + 0.9);
}

function calcular(entrada) {
  const e = entrada || {};
  const taxas = { ...TAXAS_PADRAO, ...(e.taxas || {}) };
  const imposto = e.imposto ?? PADRAO.imposto, alvo = e.margemAlvo ?? PADRAO.margemAlvo;
  const out = {};
  for (const [id, t] of Object.entries(taxas)) {
    const preco = (e.precos && e.precos[id] != null) ? e.precos[id] : e.preco;
    out[id] = { nome: t.nome, ...calcularCanal(preco, e.custo, e.embalagem, imposto, t), precoMinimo: precoParaMargem(e.custo, e.embalagem, imposto, t, alvo) };
  }
  return out;
}

// Mesmo arquivo no servidor (require) e no navegador (<script src="/lib/margem.js">)
const _api = { calcular, calcularCanal, precoParaMargem, TAXAS_PADRAO, PADRAO };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
else if (typeof window !== 'undefined') window.Margem = _api;
