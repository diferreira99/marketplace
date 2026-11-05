'use strict';
// Respostas no formato do Serper (simplificadas), para testar sem gastar crédito.
const termo = 'fita de borda adesiva';
module.exports = {
  termo,
  respostas: {
    busca: {
      organic: [
        { title: 'Fita De Borda Adesiva 22mm - Mercado Livre', link: 'https://lista.mercadolivre.com.br/fita-de-borda-adesiva', snippet: 'Frete grátis no mesmo dia', position: 1 },
        { title: 'Fita de borda PVC adesiva | Shopee Brasil', link: 'https://shopee.com.br/list/fita%20de%20borda', snippet: 'Compre online', position: 2 },
        { title: 'Fita de Borda Adesiva Branca - Amazon.com.br', link: 'https://www.amazon.com.br/s?k=fita+de+borda', snippet: '', position: 3 },
        { title: 'Como aplicar fita de borda', link: 'https://www.youtube.com/watch?v=1', snippet: 'Vídeo', position: 4 },
        { title: 'Fita de borda: guia', link: 'https://blog.exemplo.com.br/fita', snippet: 'Guia', position: 5 },
      ],
      relatedSearches: [{ query: 'fita de borda 22mm' }, { query: 'fita de borda branca' }, { query: 'fita de borda com cola' }, { query: 'fita de borda leroy' }],
      peopleAlsoAsk: [{ question: 'Como colar fita de borda?', snippet: 'Use ferro de passar...', link: 'https://x.com.br' }],
    },
    shopping: {
      shopping: [
        { title: 'Fita Borda 22mm 20m', source: 'Leroy Merlin', link: 'https://l.com', price: 'R$ 19,90', rating: 4.6, ratingCount: 120 },
        { title: 'Fita Borda Adesiva', source: 'Mercado Livre', link: 'https://m.com', price: 'R$ 24,90' },
        { title: 'Fita Borda 50m', source: 'Magazine Luiza', link: 'https://mg.com', price: 'R$ 39,90' },
        { title: 'Fita Borda Kit', source: 'Casas Bahia', link: 'https://cb.com', price: 'R$ 1.299,00' },
        { title: 'Fita Borda', source: 'Shopee', link: 'https://s.com', price: 'R$ 15,50' },
      ],
    },
    autocomplete: { suggestions: [{ value: 'fita de borda adesiva' }, { value: 'fita de borda adesiva 22mm' }, { value: 'fita de borda adesiva branca' }, { value: 'fita de borda adesiva madeira' }, { value: 'fita de borda adesiva preta' }, { value: 'fita de borda adesiva 35mm' }] },
    mercadolivre: {
      organic: [
        { title: 'Fita De Borda Adesiva 22mm X 20m Branca | Mercado Livre', link: 'https://produto.mercadolivre.com.br/MLB-123456789-fita', snippet: 'R$ 21,90. +1 mil vendidos. 4.7 de 5', rating: 4.7, ratingCount: 830 },
        { title: 'Fita Borda 35mm', link: 'https://www.mercadolivre.com.br/fita-borda/p/MLB1234', snippet: 'R$ 29,90 +500 vendidos' },
        { title: 'Fita de borda', link: 'https://produto.mercadolivre.com.br/MLB-987654321-x', snippet: 'R$ 18,00' },
        { title: 'Fita de borda adesiva | MercadoLivre', link: 'https://lista.mercadolivre.com.br/fita-de-borda', snippet: 'Encontre fita' },
      ],
    },
    shopee: {
      organic: [
        { title: 'Fita de Borda Adesiva 22mm | Shopee Brasil', link: 'https://shopee.com.br/Fita-de-Borda-i.123.456', snippet: 'R$12,90 · 2,3 mil vendidos' },
        { title: 'Fita Borda PVC', link: 'https://shopee.com.br/Fita-Borda-PVC-i.789.1011', snippet: 'R$ 14,50' },
        { title: 'Fita borda branca', link: 'https://shopee.com.br/x-i.1.2', snippet: 'R$ 11,00 · 87 vendidos' },
      ],
    },
    amazon: { organic: [{ title: 'Fita de Borda - Amazon.com.br', link: 'https://www.amazon.com.br/dp/B0ABC', snippet: 'R$ 32,90 4,5 de 5 estrelas' }] },
  },
};
