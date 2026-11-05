// 🔑 Palavras-chave: junta todas as variações que a pesquisa achou (Google, Mercado Livre, Amazon)
// e dá uma "força para SEO" a cada uma depois de pesquisada, para saber qual usar no título.
(function () {
  const FONTES = { sua: 'sua palavra', google: 'Google', mercadolivre: 'Mercado Livre', amazon: 'Amazon', relacionada: 'relacionadas' };
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  // Junta as palavras sem repetir, guardando em quais lugares cada uma apareceu.
  function juntar(d) {
    const s = (d && d.seo) || {}, int = s.internas || {}, mapa = new Map();
    const add = (t, fonte) => {
      if (typeof t !== 'string' || !t.trim()) return;
      const k = norm(t); if (k.length < 3) return;
      if (!mapa.has(k)) mapa.set(k, { termo: t.trim(), fontes: [] });
      const it = mapa.get(k); if (!it.fontes.includes(fonte)) it.fontes.push(fonte);
    };
    add(d.termo, 'sua');
    (s.sugestoes || []).forEach(t => add(t, 'google'));
    (int.mercadolivre || []).forEach(t => add(t, 'mercadolivre'));
    (int.amazon || []).forEach(t => add(t, 'amazon'));
    (s.relacionadas || []).forEach(t => add(t, 'relacionada'));
    // quem aparece em mais lugares vem primeiro (é digitado em mais buscas)
    const peso = f => f === 'sua' ? 100 : f === 'relacionada' ? 0.5 : 1;
    return [...mapa.values()].sort((a, b) => b.fontes.reduce((x, f) => x + peso(f), 0) - a.fontes.reduce((x, f) => x + peso(f), 0));
  }

  // Força para SEO (0-100) de uma palavra já pesquisada:
  //  busca (até 40): em quantos autocompletares ela aparece + quantas variações ela própria puxa
  //  vendas (até 40): o anúncio que mais vende para essa palavra
  //  concorrência (até 20): menos anúncios disputando = mais fácil aparecer
  function forca(d, fontes) {
    const fs = (fontes || []).filter(f => f === 'google' || f === 'mercadolivre' || f === 'amazon');
    const s = d.seo || {}, int = s.internas || {};
    const variacoes = (s.sugestoes || []).length + (int.mercadolivre || []).length + (int.amazon || []).length;
    const busca = Math.min(40, fs.length * 10 + (variacoes >= 15 ? 10 : variacoes >= 6 ? 6 : variacoes >= 2 ? 3 : 0));
    const mps = Object.values(d.marketplaces || {});
    const maxVendidos = Math.max(0, ...mps.map(m => m.maxVendidos || 0));
    const vendas = maxVendidos >= 5000 ? 40 : maxVendidos >= 1000 ? 32 : maxVendidos >= 500 ? 25 : maxVendidos >= 100 ? 18 : maxVendidos > 0 ? 8 : 0;
    const anuncios = mps.reduce((a, m) => a + (m.anuncios || 0), 0);
    const conc = (d.validacao && d.validacao.concorrencia) || 'média';
    const concorrencia = anuncios === 0 ? 4 : conc === 'baixa' ? 20 : conc === 'média' ? 12 : 5;
    return { total: busca + vendas + concorrencia, partes: { busca, vendas, concorrencia }, maxVendidos, anuncios, concorrencia: conc, nota: d.validacao ? d.validacao.nota : null, preco: d.precos ? d.precos.mediana : null };
  }

  // As palavras soltas que mais se repetem nas melhores buscas (para montar o título).
  const VAZIAS = new Set('de da do das dos para pra com sem em no na nos nas e o a os as um uma por ao que kit onde comprar preco barato barata'.split(' '));
  function termosFortes(lista, n) {
    const cont = new Map();
    lista.forEach((x, i) => {
      const peso = Math.max(1, (x.forca ? x.forca.total : 50) / 20) * (i < 5 ? 1.5 : 1);
      new Set(norm(x.termo).split(/[^a-z0-9]+/)).forEach(w => { if (w.length > 1 && !VAZIAS.has(w)) cont.set(w, (cont.get(w) || 0) + peso); });
    });
    return [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, n || 10).map(([w]) => w);
  }

  // Ranking final + onde usar cada palavra.
  function ranking(itens) {
    const ok = itens.filter(x => x.forca).sort((a, b) => b.forca.total - a.forca.total || (b.forca.maxVendidos - a.forca.maxVendidos));
    ok.forEach((x, i) => { x.uso = i === 0 ? 'título' : i < 4 ? 'título / descrição' : x.forca.total >= 40 ? 'descrição e ficha' : 'pouca força'; });
    return { lista: ok, melhor: ok[0] || null, termos: termosFortes(ok.slice(0, 8), 10) };
  }

  const _apiPal = { juntar, forca, ranking, termosFortes, FONTES, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = _apiPal; else window.Palavras = _apiPal;
})();
