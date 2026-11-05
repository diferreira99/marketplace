// Análise dos resultados do Serper: separa os anúncios por marketplace, lê preços e vendas
// dos textos que o Google mostra e calcula a nota de validação do produto.
'use strict';

const MARKETPLACES = {
  mercadolivre: { nome: 'Mercado Livre', dominio: 'mercadolivre.com.br' },
  shopee: { nome: 'Shopee', dominio: 'shopee.com.br' },
  amazon: { nome: 'Amazon', dominio: 'amazon.com.br' },
};

// "R$ 1.234,56", "R$12,90", "R$ 29" -> número
function lerPrecos(texto) {
  const out = [];
  const re = /R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/g;
  let m;
  while ((m = re.exec(String(texto || '')))) {
    const v = Number(m[1].replace(/\./g, '') + '.' + (m[2] || '0'));
    if (v > 0 && v < 1e6) out.push(v);
  }
  return out;
}

// "+500 vendidos", "Mais de 1 mil vendidos", "1,2 mil vendidos", "10mil vendidos" -> número
function lerVendidos(texto) {
  const t = String(texto || '').toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(mil)?\s*(?:\+\s*)?vendid[oa]s/);
  if (!m) return null;
  let n = Number(m[1].replace('.', '').replace(',', '.'));
  if (m[1].includes('.') && !m[2]) n = Number(m[1].replace(/\./g, ''));
  if (m[2]) n *= 1000;
  return Number.isFinite(n) ? Math.round(n) : null;
}

function lerNota(item) {
  if (item && item.rating != null) return { nota: Number(item.rating), avaliacoes: item.ratingCount != null ? Number(item.ratingCount) : null };
  const m = String((item && item.snippet) || '').match(/(\d[.,]\d)\s*(?:de 5|\/5|estrelas)/i);
  return m ? { nota: Number(m[1].replace(',', '.')), avaliacoes: null } : { nota: null, avaliacoes: null };
}

// Página de um produto (anúncio) ou página de lista/categoria?
function ehAnuncio(mp, link) {
  const u = String(link || '');
  if (mp === 'mercadolivre') return /MLB-?\d+/i.test(u) || /produto\.mercadolivre/.test(u);
  if (mp === 'shopee') return /-i\.\d+\.\d+/.test(u) || /\/product\/\d+\/\d+/.test(u);
  if (mp === 'amazon') return /\/dp\/|\/gp\/product\//.test(u);
  return false;
}

function itemMarketplace(mp, it) {
  const texto = [it.title, it.snippet, it.price, it.priceRange, JSON.stringify(it.attributes || {})].join(' ');
  const precos = lerPrecos(texto);
  const { nota, avaliacoes } = lerNota(it);
  return {
    titulo: String(it.title || '').replace(/\s*[|-]\s*(Mercado\s*Livre|Shopee Brasil|Shopee|Amazon\.com\.br).*$/i, '').trim(),
    link: it.link,
    preco: precos.length ? precos[0] : null,
    vendidos: lerVendidos(texto),
    nota, avaliacoes,
    anuncio: ehAnuncio(mp, it.link),
    trecho: String(it.snippet || '').slice(0, 220),
  };
}

function mediana(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}
function resumoPrecos(arr) {
  const v = arr.filter(x => Number.isFinite(x) && x > 0);
  if (!v.length) return { qtd: 0, min: null, mediana: null, max: null };
  // corta extremos (frete, kit, acessório): fica entre 1/5 e 5x a mediana
  const md = mediana(v), lim = v.filter(x => x >= md / 5 && x <= md * 5);
  return { qtd: lim.length, min: Math.min(...lim), mediana: mediana(lim), max: Math.max(...lim) };
}

function faixas(precos, n = 8) {
  const v = precos.filter(Number.isFinite);
  if (v.length < 2) return [];
  const min = Math.min(...v), max = Math.max(...v);
  if (min === max) return [{ de: min, ate: max, qtd: v.length }];
  const passo = (max - min) / n;
  const out = Array.from({ length: n }, (_, i) => ({ de: min + i * passo, ate: min + (i + 1) * passo, qtd: 0 }));
  v.forEach(x => { out[Math.min(n - 1, Math.floor((x - min) / passo))].qtd++; });
  return out;
}

// respostas: { busca, shopping, autocomplete, mercadolivre, shopee, amazon } (JSON do Serper; qualquer um pode faltar)
function analisar(termo, respostas) {
  const r = respostas || {};
  const mps = {};
  for (const mp of Object.keys(MARKETPLACES)) {
    const itens = ((r[mp] && r[mp].organic) || [])
      .filter(it => String(it.link || '').includes(MARKETPLACES[mp].dominio))
      .map(it => itemMarketplace(mp, it));
    const anuncios = itens.filter(i => i.anuncio);
    const vend = itens.map(i => i.vendidos).filter(x => x != null);
    mps[mp] = {
      nome: MARKETPLACES[mp].nome,
      itens,
      anuncios: anuncios.length,
      paginas: itens.length,
      precos: resumoPrecos(itens.map(i => i.preco)),
      maxVendidos: vend.length ? Math.max(...vend) : null,
      somaVendidos: vend.length ? vend.reduce((a, b) => a + b, 0) : null,
    };
  }

  const shopping = ((r.shopping && r.shopping.shopping) || []).map(it => ({
    titulo: it.title, loja: it.source, link: it.link,
    preco: lerPrecos(it.price)[0] ?? null,
    nota: it.rating != null ? Number(it.rating) : null,
    avaliacoes: it.ratingCount != null ? Number(it.ratingCount) : null,
    imagem: it.imageUrl || null, entrega: it.delivery || null,
  }));
  const lojas = [...new Set(shopping.map(s => String(s.loja || '').toLowerCase()).filter(Boolean))];

  const busca = r.busca || {};
  const organicos = (busca.organic || []).map(o => ({ titulo: o.title, link: o.link, trecho: o.snippet, posicao: o.position }));
  const dominio = l => { try { return new URL(l).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const relacionadas = (busca.relatedSearches || []).map(x => x.query).filter(Boolean);
  const perguntas = (busca.peopleAlsoAsk || []).map(x => ({ pergunta: x.question, resposta: x.snippet, link: x.link }));
  const sugestoes = ((r.autocomplete && r.autocomplete.suggestions) || []).map(x => x.value || x).filter(s => typeof s === 'string');
  const marketplacesNoTop = organicos.filter(o => /mercadolivre|shopee|amazon|magazineluiza|americanas|casasbahia|aliexpress|shein/.test(dominio(o.link))).length;

  const todosPrecos = [
    ...shopping.map(s => s.preco),
    ...Object.values(mps).flatMap(m => m.itens.map(i => i.preco)),
  ].filter(x => x != null);
  const precos = resumoPrecos(todosPrecos);

  // ── Nota de validação (0-100) ──
  const pontos = [];
  const add = (p, motivo) => { pontos.push({ p, motivo }); };
  let presentes = 0;
  for (const mp of Object.keys(mps)) {
    const m = mps[mp];
    if (m.anuncios >= 3) { presentes++; add(15, `${m.nome}: ${m.anuncios} anúncios encontrados`); }
    else if (m.paginas >= 2) { presentes++; add(8, `${m.nome}: aparece, mas com poucos anúncios diretos`); }
    else add(0, `${m.nome}: quase não aparece`);
  }
  if (lojas.length >= 10) add(15, `Google Shopping: ${lojas.length} lojas vendendo`);
  else if (lojas.length >= 4) add(8, `Google Shopping: ${lojas.length} lojas vendendo`);
  else add(0, `Google Shopping: só ${lojas.length} loja(s)`);
  if (sugestoes.length >= 6) add(10, `Autocompletar: ${sugestoes.length} variações que as pessoas digitam`);
  else if (sugestoes.length >= 3) add(5, `Autocompletar: ${sugestoes.length} variações`);
  if (perguntas.length) add(5, `Google mostra "As pessoas também perguntam" (${perguntas.length})`);
  if (relacionadas.length >= 4) add(5, `${relacionadas.length} pesquisas relacionadas`);
  const maxV = Math.max(0, ...Object.values(mps).map(m => m.maxVendidos || 0));
  if (maxV >= 1000) add(15, `Há anúncio com ${maxV.toLocaleString('pt-BR')}+ vendidos`);
  else if (maxV >= 100) add(10, `Há anúncio com ${maxV}+ vendidos`);
  else if (maxV > 0) add(4, `Vendas baixas nos anúncios (${maxV}+)`);
  if (marketplacesNoTop >= 3) add(5, `${marketplacesNoTop} marketplaces no top 10 do Google (intenção de compra)`);
  const nota = Math.min(100, pontos.reduce((a, b) => a + b.p, 0));
  const nivel = nota >= 65 ? 'validado' : nota >= 40 ? 'nicho' : 'fraco';

  // concorrência: muitos anúncios + muitas lojas = disputado
  const totalAnuncios = Object.values(mps).reduce((a, m) => a + m.anuncios, 0);
  const concorrencia = totalAnuncios + lojas.length >= 30 ? 'alta' : totalAnuncios + lojas.length >= 12 ? 'média' : 'baixa';

  const dicas = [];
  const melhor = Object.values(mps).sort((a, b) => b.anuncios - a.anuncios)[0];
  if (melhor && melhor.anuncios) dicas.push(`O ${melhor.nome} é onde mais aparecem anúncios desse termo.`);
  const ausente = Object.values(mps).filter(m => m.paginas === 0).map(m => m.nome);
  if (ausente.length && presentes) dicas.push(`Pouca presença em ${ausente.join(' e ')}: pode ser espaço livre para entrar.`);
  if (precos.mediana) dicas.push(`Preço mais comum fica perto de R$ ${precos.mediana.toFixed(2).replace('.', ',')}.`);
  const cauda = sugestoes.filter(s => s.toLowerCase() !== String(termo).toLowerCase()).slice(0, 4);
  if (cauda.length) dicas.push(`Termos de cauda longa para títulos e SEO: ${cauda.join(' · ')}.`);

  return {
    termo, geradoEm: new Date().toISOString(),
    validacao: { nota, nivel, pontos, concorrencia, presentes },
    precos, faixas: faixas(todosPrecos.filter(x => !precos.mediana || (x >= precos.mediana / 5 && x <= precos.mediana * 5))),
    marketplaces: mps,
    shopping: { itens: shopping, lojas: lojas.length },
    seo: { organicos, relacionadas, perguntas, sugestoes, marketplacesNoTop },
    dicas,
  };
}

module.exports = { analisar, lerPrecos, lerVendidos, ehAnuncio, resumoPrecos, MARKETPLACES };
