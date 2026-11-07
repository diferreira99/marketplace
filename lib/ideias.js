// 💡 Ideias de produto e kit a partir do que os compradores perguntam, reclamam e para que usam.
// Cada ideia traz o porquê (a evidência) e como vender. Navegador (window.Ideias) e servidor (testes).
(function () {
  const soma = (...listas) => { const m = new Map(); listas.flat().filter(Boolean).forEach(t => { const k = t.tema || t.nome; m.set(k, (m.get(k) || 0) + (t.vezes || 1)); }); return m; };

  const REGRAS = [
    { se: ['Quanto peso aguenta', 'Medida / tamanho'], usos: ['Espelho ou vidro'],
      ideia: 'Kit pronto por tamanho de espelho', como: 'Ex.: "Kit espelho até 60 cm", "até 1 m", "até 1,5 m", já com a quantidade certa de fita. O comprador não precisa calcular e paga mais por um pacote fechado.' },
    { se: ['Preço para atacado'], quem: ['Profissional (instalador, vidraceiro, marceneiro)', 'Revenda / compra em quantidade'],
      ideia: 'Caixa profissional (10, 20 ou 30 rolos)', como: 'Preço por metro menor que o rolo avulso e anúncio separado com "caixa fechada" no título. Atende vidraçaria e marcenaria que compram todo mês.' },
    { se: ['Não cola / descola', 'Fita fina ou fraca'],
      ideia: 'Versão reforçada (alta adesão)', como: 'Espuma mais densa ou adesivo mais forte, com teste de peso no vídeo e na primeira foto. Vende acima do preço comum porque resolve a maior reclamação.' },
    { se: ['Não cola / descola'], extra: 'Como aplicar / remover',
      ideia: 'Kit aplicação: fita + lenço limpador', como: 'Muita fita "descola" por superfície suja ou úmida. Um sachê de álcool ou primer no kit reduz reclamação e devolução.' },
    { se: ['Medida diferente do anúncio', 'Espessura (grossa ou fina demais)'],
      ideia: 'Medida impressa na embalagem e no rolo', como: 'Largura, espessura e metragem na etiqueta e numa foto com régua. Barato de fazer e ataca uma reclamação comum dos concorrentes.' },
    { se: ['Difícil de tirar o liner / descascar'],
      ideia: 'Liner com aba fácil de destacar', como: 'Picote ou aba no papel protetor. Mostre num vídeo curto: "tira em 1 segundo".' },
    { se: ['Umidade, calor, área externa'], usos: ['Banheiro'],
      ideia: 'Linha para banheiro (resistente à umidade)', como: 'Anúncio próprio com "banheiro" no título. Só prometa resistência à umidade se o seu adesivo tiver.' },
    { se: ['Quantidade e cor'],
      ideia: 'Variações de cor e de quantidade num anúncio só', como: 'Branca, preta e transparente, e pacotes de 1, 3 e 5 rolos como variações. As vendas e avaliações se somam num anúncio só.' },
    { usos: ['Porta e janela (vedação)'],
      ideia: 'Versão vedação de porta e janela', como: 'O mesmo material atende outro público: anúncio separado com as palavras de vedação ("veda frestas", "barra vento").' },
    { usos: ['Móveis e marcenaria'], quem: ['Profissional (instalador, vidraceiro, marceneiro)'],
      ideia: 'Rolo longo para marcenaria (25 m ou mais)', como: 'Marceneiro usa muito e quer menos troca de rolo: metragem maior e preço por metro competitivo.' },
  ];

  function gerar(aval) {
    if (!aval) return [];
    const pq = (aval.perguntas && aval.perguntas.temas) || [];
    const recl = [].concat(aval.temas || [], (aval.reclameAqui && aval.reclameAqui.temas) || [], (aval.outras && aval.outras.temas) || []);
    const pf = aval.perfil || {};
    const m = soma(pq, recl), usos = soma(pf.usos || []), quem = soma(pf.quem || []);
    const out = [];
    REGRAS.forEach(r => {
      const ev = [];
      (r.se || []).forEach(t => { if (m.get(t)) ev.push(m.get(t) + '× "' + t.toLowerCase() + '"'); });
      if (r.extra && m.get(r.extra)) ev.push(m.get(r.extra) + '× "' + r.extra.toLowerCase() + '"');
      (r.usos || []).forEach(t => { if ((usos.get(t) || 0) >= 2) ev.push('uso: ' + t.toLowerCase() + ' (' + usos.get(t) + ')'); });
      (r.quem || []).forEach(t => { if ((quem.get(t) || 0) >= 2) ev.push('quem compra: ' + t.toLowerCase() + ' (' + quem.get(t) + ')'); });
      const precisa = (r.se ? r.se.some(t => m.get(t)) : true) && (r.se || r.usos || r.quem) && ev.length;
      if (precisa) out.push({ ideia: r.ideia, porque: ev.join(' · '), como: r.como, forca: ev.length, fonte: 'regra' });
    });
    const daIA = ((aval.ia && aval.ia.ideiasProduto) || []).map(x => ({ ideia: x.ideia, porque: x.porque, como: '', forca: 9, fonte: 'ia' }));
    return daIA.concat(out.sort((a, b) => b.forca - a.forca)).slice(0, 8);
  }

  const _apiIdeias = { gerar, REGRAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = _apiIdeias; else window.Ideias = _apiIdeias;
})();
