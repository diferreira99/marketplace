// Calculadora de margem por canal, para quem fabrica: custo de produção + embalagem + imposto
// contra comissão, taxa fixa e frete de cada marketplace. Taxas são de referência e editáveis
// no painel (cada canal muda as regras com frequência).
'use strict';

// Referência de novembro/2026 (pesquisa em blogs de precificação; confirme no painel do vendedor):
// - Mercado Livre: Clássico 11–14% e Premium 16–19% conforme a categoria (o painel busca a oficial);
//   abaixo de R$ 79 cobra custo fixo por unidade (desde mar/2026 varia com peso: ~R$ 5,65 a R$ 8,75 até 2 kg;
//   abaixo de R$ 19, no máximo metade do preço); acima de R$ 79, frete grátis pago em boa parte pelo vendedor.
// - Shopee (CNPJ): por faixa de preço — até R$ 79,99: 20% + R$ 4; R$ 80–99,99: 14% + R$ 16;
//   R$ 100–199,99: 14% + R$ 20; R$ 200+: 14% + R$ 26. Frete grátis incluído. CPF paga + R$ 3 por item.
// - Amazon: Casa 12%, Ferramentas e Construção 11% (mínimo R$ 1); plano Profissional R$ 19/mês, sem taxa por item.
const TAXAS_PADRAO = {
  mercadolivre: { nome: 'Mercado Livre (Clássico)', comissao: 12, fixoAbaixo: 6.25, limiteFixo: 79, freteAcima: 22, tetoComissao: 0, metadeAbaixo: 19 },
  mercadolivrePremium: { nome: 'Mercado Livre (Premium)', comissao: 17, fixoAbaixo: 6.25, limiteFixo: 79, freteAcima: 22, tetoComissao: 0, metadeAbaixo: 19 },
  shopee: { nome: 'Shopee', comissao: 20, fixoAbaixo: 4, limiteFixo: 1e9, freteAcima: 0, tetoComissao: 0,
    faixas: [[0, 80, 20, 4], [80, 100, 14, 16], [100, 200, 14, 20], [200, 1e9, 14, 26]] },
  amazon: { nome: 'Amazon', comissao: 12, fixoAbaixo: 0, limiteFixo: 79, freteAcima: 20, tetoComissao: 0, minimo: 1 },
};
const PADRAO = { imposto: 6, margemAlvo: 25, taxas: TAXAS_PADRAO };

const r2 = v => Math.round(v * 100) / 100;

// Um canal a um preço: quanto sobra
function calcularCanal(preco, custo, embalagem, impostoPct, t) {
  const P = Number(preco) || 0;
  const fx = faixaDe(t, P);
  let comissao = P * (fx ? fx.comissao : (Number(t.comissao) || 0)) / 100;
  if (t.minimo && P > 0) comissao = Math.max(comissao, Number(t.minimo));
  if (t.tetoComissao > 0) comissao = Math.min(comissao, t.tetoComissao);
  let fixo = fx ? fx.fixo : (P < (Number(t.limiteFixo) || 0) ? (Number(t.fixoAbaixo) || 0) : 0);
  if (!fx && t.metadeAbaixo && P < t.metadeAbaixo) fixo = Math.min(fixo, P / 2);
  const frete = P >= (Number(t.limiteFixo) || 0) ? (Number(t.freteAcima) || 0) : 0;
  const imposto = P * (Number(impostoPct) || 0) / 100;
  const custos = (Number(custo) || 0) + (Number(embalagem) || 0);
  const lucro = P - comissao - fixo - frete - imposto - custos;
  return {
    preco: r2(P), comissao: r2(comissao), fixo: r2(fixo), frete: r2(frete), imposto: r2(imposto), custo: r2(custos),
    lucro: r2(lucro), margem: P > 0 ? r2(lucro / P * 100) : null,
  };
}

// Comissão por faixa de preço (Shopee): [de, até (exclusivo), comissão %, fixo R$]
function faixaDe(t, P) {
  if (!Array.isArray(t.faixas) || !t.faixas.length) return null;
  const f = t.faixas.find(x => P >= x[0] && P < x[1]) || t.faixas[t.faixas.length - 1];
  return { comissao: Number(f[2]) || 0, fixo: Number(f[3]) || 0 };
}

// Menor preço que entrega a margem alvo (testa os dois lados do limite da taxa fixa / frete)
function precoParaMargem(custo, embalagem, impostoPct, t, alvoPct) {
  const custos = (Number(custo) || 0) + (Number(embalagem) || 0);
  if (Array.isArray(t.faixas) && t.faixas.length) {
    const ok = [];
    for (const [de, ate, com, fixo] of t.faixas) {
      const k = 1 - (Number(com) || 0) / 100 - (Number(impostoPct) || 0) / 100 - (Number(alvoPct) || 0) / 100;
      if (k <= 0) continue;
      const p = (custos + (Number(fixo) || 0) + (Number(t.freteAcima) || 0) * 0) / k;
      if (p >= de && p < ate) ok.push(p); else if (p < de) ok.push(de);
    }
    if (!ok.length) return null;
    const p = Math.min(...ok), bonito = Math.ceil(p) - 0.1;
    return r2(bonito >= p ? bonito : Math.ceil(p) + 0.9);
  }
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
  for (const [id, t0] of Object.entries(taxas)) {
    // ajustes: taxa oficial da categoria (ML) e frete pelo peso do produto
    let t = { ...t0, ...((e.ajustes || {})[id] || {}) };
    if (e.fretes && e.fretes[id] != null) t = { ...t, freteAcima: e.fretes[id] };
    const preco = (e.precos && e.precos[id] != null) ? e.precos[id] : e.preco;
    out[id] = { nome: t.nome, ...calcularCanal(preco, e.custo, e.embalagem, imposto, t), precoMinimo: precoParaMargem(e.custo, e.embalagem, imposto, t, alvo), taxaUsada: t };
  }
  return out;
}

// Meta de lucro no mês: quantas unidades vender em cada canal (só os canais que dão lucro)
function metaMensal(resultado, lucroDesejado) {
  const meta = Number(lucroDesejado) || 0;
  const out = {};
  for (const [id, r] of Object.entries(resultado)) {
    out[id] = r.lucro > 0 && meta > 0
      ? { unidades: Math.ceil(meta / r.lucro), faturamento: r2(Math.ceil(meta / r.lucro) * r.preco), porDia: Math.ceil(Math.ceil(meta / r.lucro) / 30) }
      : null;
  }
  return out;
}

// Kits: n unidades num anúncio só. Comissão e taxa fixa uma vez, frete do peso total, desconto opcional.
function kits(entrada, tamanhos = [2, 3, 5, 10], descontoPorUnidade = 0.05) {
  const e = entrada || {};
  const unit = calcular(e);
  const out = {};
  for (const n of tamanhos) {
    const desconto = Math.min(0.3, descontoPorUnidade * (n - 1) / 2);
    const precos = {}, fretes = {};
    for (const id of Object.keys(unit)) {
      precos[id] = r2(((e.precos && e.precos[id]) || e.preco || 0) * n * (1 - desconto));
      if (e.fretesKit && e.fretesKit[n] && e.fretesKit[n][id] != null) fretes[id] = e.fretesKit[n][id];
      else if (e.fretes && e.fretes[id] != null) fretes[id] = e.fretes[id];
    }
    const r = calcular({ ...e, precos, fretes, custo: (Number(e.custo) || 0) * n, embalagem: (Number(e.embalagem) || 0) * (1 + 0.2 * (n - 1)) });
    out[n] = { desconto: r2(desconto * 100), canais: Object.fromEntries(Object.entries(r).map(([id, x]) => [id, { preco: x.preco, lucro: x.lucro, margem: x.margem, lucroPorUnidade: r2(x.lucro / n), ganhoVsUnidade: unit[id] && unit[id].lucro ? r2(x.lucro / n - unit[id].lucro) : null }])) };
  }
  return out;
}

// Mesmo arquivo no servidor (require) e no navegador (<script src="/lib/margem.js">)
const _api = { calcular, calcularCanal, precoParaMargem, metaMensal, kits, TAXAS_PADRAO, PADRAO };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
else if (typeof window !== 'undefined') window.Margem = _api;
