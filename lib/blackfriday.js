// 🛍️ Plano de Black Friday: até quanto dá para baixar o preço sem prejuízo e mantendo uma margem mínima,
// qual preço de oferta usar e quanto sobra. Funciona no navegador (window.BlackFriday) e no servidor.
(function () {
  const M = typeof module !== 'undefined' && module.exports ? require('./margem') : window.Margem;
  const DESCONTOS = [40, 35, 30, 25, 20, 15, 10, 5];

  // preço "de oferta" bonito: termina em ,90 (ou ,99 abaixo de R$ 10), sem passar do teto
  function precoBonito(teto) {
    if (!(teto > 0)) return 0;
    const p = teto >= 10 ? Math.floor(teto - 0.9) + 0.9 : Math.floor(teto - 0.99) + 0.99;
    return Math.round((p > 0 ? p : teto) * 100) / 100;
  }

  // maior desconto (em %, passo de 0,5) que ainda deixa a margem >= margemMin
  function descontoMaximo(preco, custo, embalagem, imposto, taxa, margemMin) {
    let melhor = null;
    for (let d = 0; d <= 90; d += 0.5) {
      const r = M.calcularCanal(preco * (1 - d / 100), custo, embalagem, imposto, taxa);
      if (r.margem != null && r.margem >= margemMin) melhor = d; else break;
    }
    return melhor;
  }

  function planoLinha({ preco, custo, embalagem, imposto, taxa, margemMin }) {
    const hoje = M.calcularCanal(preco, custo, embalagem, imposto, taxa);
    if (!(custo > 0)) return { hoje, semCusto: true };
    const semPrejuizo = descontoMaximo(preco, custo, embalagem, imposto, taxa, 0);
    const comMargem = descontoMaximo(preco, custo, embalagem, imposto, taxa, margemMin);
    // oferta sugerida: o maior desconto "redondo" que cabe na margem mínima
    const d = comMargem == null ? null : DESCONTOS.find(x => x <= comMargem) || null;
    const precoOferta = d ? precoBonito(preco * (1 - d / 100)) : null;
    const oferta = precoOferta ? M.calcularCanal(precoOferta, custo, embalagem, imposto, taxa) : null;
    return { hoje, semPrejuizo, comMargem, desconto: d, precoOferta, oferta, descReal: precoOferta ? Math.round((1 - precoOferta / preco) * 1000) / 10 : null };
  }

  // quantas vendas a mais no desconto para lucrar o mesmo que hoje
  function vendasParaEmpatar(hoje, oferta) { return hoje && oferta && oferta.lucro > 0 && hoje.lucro > 0 ? Math.round((hoje.lucro / oferta.lucro - 1) * 100) : null; }

  const _apiBF = { planoLinha, descontoMaximo, precoBonito, vendasParaEmpatar, DESCONTOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = _apiBF; else window.BlackFriday = _apiBF;
})();
