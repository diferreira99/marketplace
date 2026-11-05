// Onde vender: nota de 0 a 100 por canal, com os motivos. Transparente de propósito:
// demanda (40) + espaço na concorrência (15) + preço no canal (15) + margem com o seu custo (30).
// Sem custo informado, a margem fica neutra (15) e o painel avisa.
'use strict';

const NOMES = { mercadolivre: 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };
// artigo de cada canal: o Mercado Livre, a Shopee, a Amazon
const ART = { mercadolivre: 'o', shopee: 'a', amazon: 'a' };
const de = id => (ART[id] === 'a' ? 'da ' : 'do ') + NOMES[id];
const por = id => (ART[id] === 'a' ? 'pela ' : 'pelo ') + NOMES[id];
const Art = id => (ART[id] === 'a' ? 'A ' : 'O ') + NOMES[id];
const art = id => ART[id] + ' ' + NOMES[id];
const lim = (v, a, b) => Math.max(a, Math.min(b, v));
const reais = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

// margens: { mercadolivre: {lucro, margem}, shopee: {...}, amazon: {...} } ou null (sem custo)
function recomendar(d, margens) {
  const geral = d.precos && d.precos.mediana;
  const internas = (d.seo && d.seo.internas) || {};
  const ranking = Object.keys(NOMES).map(id => {
    const m = (d.marketplaces || {})[id] || { anuncios: 0, paginas: 0, precos: {}, maxVendidos: null };
    const pros = [], contras = [];
    // demanda
    const pAn = Math.min(m.anuncios, 8) / 8 * 12;
    const v = m.maxVendidos || 0, pV = Math.min(16, 4 * Math.log10(v + 1));
    const busca = internas[id];
    const pB = Array.isArray(busca) ? Math.min(busca.length, 10) / 10 * 12 : 6;
    const demanda = pAn + pV + pB;
    if (v >= 1000) pros.push(`Tem anúncio com ${v.toLocaleString('pt-BR')}+ vendidos: o produto gira aqui`);
    else if (v >= 100) pros.push(`Tem anúncio com ${v}+ vendidos`);
    else if (m.anuncios) contras.push('Os anúncios encontrados não mostram volume de vendas');
    if (Array.isArray(busca) && busca.length >= 5) pros.push(`${busca.length} variações desse termo são digitadas na busca ${de(id)}`);
    else if (Array.isArray(busca)) contras.push(`Pouca busca interna ${ART[id] === 'a' ? 'na' : 'no'} ${NOMES[id]} (${busca.length} variações)`);
    if (!m.paginas) contras.push('Quase não aparece no Google para esse termo');
    // concorrência: pouca concorrência só vale como espaço se o produto vende NESTE canal
    const forca = Math.min(1, demanda / 20);
    let concorrencia;
    if (m.anuncios <= 3) {
      concorrencia = 15 * forca;
      if (forca >= 0.75) pros.push(`Pouca concorrência: ${m.anuncios} anúncio(s) bem posicionados`);
    } else if (m.anuncios <= 7) concorrencia = 9 * Math.max(forca, 0.5);
    else { concorrencia = 4; contras.push(`Concorrência alta: ${m.anuncios} anúncios disputando o termo`); }
    if (demanda < 15) contras.push(`Pouca evidência de que esse produto vende ${ART[id] === 'a' ? 'na' : 'no'} ${NOMES[id]} hoje`);
    // preço
    let preco = 7;
    const pm = m.precos && m.precos.mediana;
    if (pm && geral) {
      const r = pm / geral; preco = 15 * lim((r - 0.7) / 0.6, 0, 1);
      if (r >= 1.1) pros.push(`Vende mais caro aqui: mediana ${reais(pm)} contra ${reais(geral)} no geral`);
      else if (r <= 0.85) contras.push(`Preço puxado para baixo: mediana ${reais(pm)} contra ${reais(geral)} no geral`);
    }
    // margem
    let margem = 15, mg = null;
    if (margens && margens[id]) {
      mg = margens[id];
      margem = mg.lucro <= 0 ? 0 : 30 * lim(mg.margem / 40, 0, 1);
      if (mg.lucro <= 0) contras.push(`Dá prejuízo no preço do canal (${reais(mg.lucro)} por unidade)`);
      else if (mg.margem >= 25) pros.push(`Margem boa: ${reais(mg.lucro)} por unidade (${Math.round(mg.margem)}%)`);
      else contras.push(`Margem apertada: ${reais(mg.lucro)} por unidade (${Math.round(mg.margem)}%)`);
    }
    let nota = Math.round(demanda + concorrencia + preco + margem);
    if (demanda < 15) nota = Math.min(nota, 34);   // sem demanda no canal, não passa de "não recomendado"
    return { id, nome: NOMES[id], demandaBruta: demanda, nota, partes: { demanda: Math.round(demanda), concorrencia: Math.round(concorrencia), preco: Math.round(preco), margem: Math.round(margem) }, pros, contras, margem: mg, precoMediano: pm || null };
  }).sort((a, b) => b.nota - a.nota);

  const [a, b, c] = ranking;
  let estrategia;
  if (a.nota < 35) estrategia = 'Nenhum canal se destaca para esse termo. Vale testar uma variação da palavra-chave (veja a demanda) antes de investir.';
  else {
    const motivo = a.pros[0] ? a.pros[0].charAt(0).toLowerCase() + a.pros[0].slice(1) : 'melhor equilíbrio entre demanda, concorrência e preço';
    estrategia = `Comece ${por(a.id)}: ${motivo}.`;
    const apertada = b.margem && b.margem.lucro > 0 && b.margem.margem < 10;
    if (b.nota >= 35 && apertada) estrategia += ` ${Art(b.id)} tem demanda, mas a margem fica apertada (${Math.round(b.margem.margem)}%): só vale com preço maior.`;
    else if (b.nota >= a.nota - 10 && b.nota >= 35) estrategia += ` ${Art(b.id)} vem logo atrás (${b.nota}): vale abrir junto.`;
    else if (b.nota >= 35) estrategia += ` Depois, teste ${art(b.id)}.`;
    if (c.nota < 35 || c.demandaBruta < 15 || (c.margem && c.margem.lucro <= 0)) estrategia += ` Deixe ${art(c.id)} para depois${c.contras[0] ? ' (' + c.contras[0].charAt(0).toLowerCase() + c.contras[0].slice(1) + ')' : ''}.`;
  }
  return { ranking, vencedor: a.nota >= 35 && a.demandaBruta >= 15 ? a.id : null, estrategia, semCusto: !margens };
}

const _apiRec = { recomendar };
if (typeof module !== 'undefined' && module.exports) module.exports = _apiRec;
else if (typeof window !== 'undefined') window.Recomendacao = _apiRec;
