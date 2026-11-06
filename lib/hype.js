// 🔥 Anúncios mais "hypados": junta todos os anúncios da pesquisa (ML, Shopee, Amazon e Google Shopping),
// dá uma nota de hype (vendas + avaliações + estrelas) e tira a estratégia dos que mais vendem.
// Funciona no navegador (window.Hype) e no servidor (testes).
(function () {
  const CANAIS = ['mercadolivre', 'shopee', 'amazon'];
  const mlb = l => { const m = String(l || '').match(/MLB-?(\d{6,})/i); return m ? 'MLB' + m[1] : null; };
  const log10 = x => Math.log(Math.max(1, x)) / Math.LN10;

  // 0-100 com os sinais que existirem: vendas (peso 40), nº de avaliações (30) e estrelas (30).
  // Sinal que o Google não trouxe não conta como zero; com menos sinais, um pequeno desconto de confiança.
  function hype(a) {
    const s = [];
    if (a.vendidos) s.push([40, Math.min(1, log10(a.vendidos) / 4)]);                 // 10.000 vendidos = máximo
    if (a.avaliacoes) s.push([30, Math.min(1, log10(a.avaliacoes) / 3.5)]);           // ~3.000 avaliações = máximo
    if (a.nota != null) s.push([30, Math.max(0, Math.min(1, (a.nota - 3.5) / 1.5))]);  // 5★ = máximo; 3,5★ ou menos = 0
    if (!s.length) return 0;
    const base = s.reduce((t, [w, x]) => t + w * x, 0) / s.reduce((t, [w]) => t + w, 0);
    return Math.round(100 * base * [0, 0.8, 0.92, 1][s.length]);
  }
  function rotulo(h) { return h >= 70 ? '🔥 muito hypado' : h >= 45 ? '📈 em alta' : h >= 20 ? 'vende pouco' : 'sem sinais'; }

  function juntar(d, porAnuncio) {
    const rv = new Map((porAnuncio || []).map(x => [x.id, x]));
    const out = [];
    CANAIS.forEach(k => ((d.marketplaces[k] || {}).itens || []).filter(i => i.anuncio).forEach(i => {
      const id = k === 'mercadolivre' ? mlb(i.link) : null, r = id ? rv.get(id) : null;
      out.push({ canal: k, titulo: i.titulo, link: i.link, preco: i.preco, vendidos: i.vendidos,
        nota: i.nota != null ? i.nota : (r && r.media != null ? Math.round(r.media * 10) / 10 : null),
        avaliacoes: i.avaliacoes != null ? i.avaliacoes : (r ? r.total : null), loja: null, imagem: null, reviews: r || null });
    }));
    ((d.shopping && d.shopping.itens) || []).forEach(i => out.push({ canal: 'shopping', titulo: i.titulo, link: i.link, preco: i.preco, vendidos: null, nota: i.nota, avaliacoes: i.avaliacoes, loja: i.loja, imagem: i.imagem, reviews: null }));
    // mesmo anúncio repetido (mesmo link) só uma vez
    const vistos = new Set();
    return out.filter(a => a.link && !vistos.has(a.link) && vistos.add(a.link)).map(a => ({ ...a, hype: hype(a) }));
  }

  const ORDENS = {
    hype: (a, b) => b.hype - a.hype,
    avaliacoes: (a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0),
    estrelas: (a, b) => (b.nota || 0) - (a.nota || 0) || (b.avaliacoes || 0) - (a.avaliacoes || 0),
    vendidos: (a, b) => (b.vendidos || 0) - (a.vendidos || 0),
    preco: (a, b) => (a.preco || 1e9) - (b.preco || 1e9),
  };
  function filtrar(lista, { canal, estrelas, ordem }) {
    return lista.filter(a => (!canal || canal === 'todos' || a.canal === canal) && (!estrelas || (a.nota != null && a.nota >= estrelas)))
      .slice().sort(ORDENS[ordem] || ORDENS.hype);
  }

  const mediana = v => { const s = v.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const VAZIAS = new Set('de da do das dos para pra com sem em no na nos nas e o a os as um uma kit por x mm cm m un und unidade unidades rolo rolos'.split(' '));
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // O que os mais hypados têm em comum e como entrar para competir
  function estrategia(lista, termo) {
    const com = lista.filter(a => a.hype > 0).sort(ORDENS.hype);
    if (com.length < 2) return null;
    const top = com.slice(0, Math.min(5, Math.max(2, Math.ceil(com.length / 3)))), resto = com.slice(top.length);
    const pTop = mediana(top.map(a => a.preco)), pResto = mediana(resto.map(a => a.preco));
    const nTop = mediana(top.map(a => a.nota)), avTop = mediana(top.map(a => a.avaliacoes)), vTop = mediana(top.map(a => a.vendidos));
    // palavras que aparecem nos títulos dos mais hypados e quase não nos outros
    const doTermo = new Set(norm(termo).split(/\W+/));
    const conta = l => { const m = new Map(); l.forEach(a => new Set(norm(a.titulo).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !VAZIAS.has(w) && !doTermo.has(w))).forEach(w => m.set(w, (m.get(w) || 0) + 1))); return m; };
    const ct = conta(top), cr = conta(resto);
    const palavras = [...ct.entries()].filter(([w, n]) => n >= 2 && n / top.length > ((cr.get(w) || 0) / Math.max(1, resto.length)) + 0.2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
    // elogios e reclamações dos mais hypados (avaliações do Mercado Livre)
    const soma = campo => { const m = new Map(); top.forEach(a => ((a.reviews && a.reviews[campo]) || []).forEach(t => m.set(t.tema, (m.get(t.tema) || 0) + t.vezes))); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([tema, vezes]) => ({ tema, vezes })); };
    const elogios = soma('positivos'), reclamacoes = soma('negativos');
    const canais = {}; top.forEach(a => { canais[a.canal] = (canais[a.canal] || 0) + 1; });
    const canalTop = Object.entries(canais).sort((a, b) => b[1] - a[1])[0];
    const passos = [];
    if (pTop) passos.push(pResto && Math.abs(pTop / pResto - 1) >= 0.1
      ? (pTop < pResto ? `Os mais hypados cobram menos (mediana R$ ${pTop.toFixed(2).replace('.', ',')} contra R$ ${pResto.toFixed(2).replace('.', ',')} dos outros): o preço puxa a venda. Entre perto de R$ ${pTop.toFixed(2).replace('.', ',')}.`
        : `Os mais hypados cobram mais (mediana R$ ${pTop.toFixed(2).replace('.', ',')} contra R$ ${pResto.toFixed(2).replace('.', ',')}): o comprador paga por confiança (nota e avaliações). Não precisa ser o mais barato.`)
      : `Preço dos mais hypados: mediana de R$ ${pTop.toFixed(2).replace('.', ',')}. Fique nessa faixa.`);
    if (nTop) passos.push(`Nota dos líderes: ${String(Math.round(nTop * 10) / 10).replace('.', ',')}★${avTop ? ` com cerca de ${Math.round(avTop)} avaliações` : ''}. Peça avaliação nas primeiras 20 vendas (cartão na embalagem com QR) para chegar perto disso rápido.`);
    if (palavras.length) passos.push(`Palavras que os líderes usam no título e os outros não: ${palavras.join(', ')}. Use as que forem verdade no seu produto.`);
    if (elogios.length) passos.push(`O que fazem os compradores darem 5★: ${elogios.slice(0, 3).map(e => e.tema.toLowerCase()).join(', ')}. Mostre isso nas fotos e no começo da descrição.`);
    if (reclamacoes.length) passos.push(`Mesmo nos líderes reclamam de: ${reclamacoes.slice(0, 3).map(e => e.tema.toLowerCase()).join(', ')}. Resolver isso é a sua vantagem.`);
    if (canalTop && canalTop[1] >= 2 && top.length >= 3) passos.push(`${canalTop[1]} dos ${top.length} mais hypados estão em ${({ mercadolivre: 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon', shopping: 'lojas do Google Shopping' })[canalTop[0]]}: é onde a disputa está mais aquecida.`);
    return { top: top.length, precoTop: pTop, precoResto: pResto, notaTop: nTop, avaliacoesTop: avTop, vendidosTop: vTop, palavras, elogios, reclamacoes, passos };
  }

  const _apiHype = { juntar, filtrar, estrategia, hype, rotulo, ORDENS };
  if (typeof module !== 'undefined' && module.exports) module.exports = _apiHype; else window.Hype = _apiHype;
})();
