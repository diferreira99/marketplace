// Datas de venda do varejo online no Brasil, com quando começar a produzir.
// "fator" = quanto as vendas costumam subir no período (referência; ajuste com o seu histórico).
'use strict';

const d = (a, m, dia) => new Date(Date.UTC(a, m - 1, dia));
function nDomingo(a, m, n) { const x = d(a, m, 1); const dif = (7 - x.getUTCDay()) % 7; return d(a, m, 1 + dif + 7 * (n - 1)); }
function blackFriday(a) { const x = d(a, 11, 1); const ateQui = (4 - x.getUTCDay() + 7) % 7; return d(a, 11, 1 + ateQui + 21 + 1); }   // dia seguinte à 4ª quinta

function datasDoAno(a) {
  const bf = blackFriday(a);
  return [
    { nome: 'Volta às aulas e reformas de começo de ano', data: d(a, 1, 20), fator: 1.3, dica: 'Janeiro e fevereiro: mudanças, reformas e decoração.' },
    { nome: 'Dia do Consumidor', data: d(a, 3, 15), fator: 1.4, dica: 'Os marketplaces fazem campanha com cupom.' },
    { nome: 'Dia das Mães', data: nDomingo(a, 5, 2), fator: 1.5, dica: 'Casa e decoração entram como presente.' },
    { nome: 'Dia dos Namorados', data: d(a, 6, 12), fator: 1.2, dica: '' },
    { nome: 'Dia dos Pais', data: nDomingo(a, 8, 2), fator: 1.3, dica: 'Ferramentas e "faça você mesmo" vendem bem.' },
    { nome: '9.9 (Shopee)', data: d(a, 9, 9), fator: 1.6, dica: 'Data dupla da Shopee: frete grátis e cupons.' },
    { nome: '10.10 (Shopee)', data: d(a, 10, 10), fator: 1.6, dica: '' },
    { nome: 'Dia das Crianças', data: d(a, 10, 12), fator: 1.1, dica: '' },
    { nome: '11.11 (Shopee e Mercado Livre)', data: d(a, 11, 11), fator: 2.0, dica: 'Uma das maiores datas da Shopee.' },
    { nome: 'Black Friday', data: bf, fator: 3.0, dica: 'Maior pico do ano nos 3 canais. Estoque no centro de distribuição antes.' },
    { nome: 'Cyber Monday', data: d(a, 11, bf.getUTCDate() + 3), fator: 1.8, dica: '' },
    { nome: '12.12 (Shopee)', data: d(a, 12, 12), fator: 1.7, dica: '' },
    { nome: 'Natal', data: d(a, 12, 25), fator: 1.8, dica: 'Últimos envios garantidos ~10 dias antes.' },
  ];
}

// Próximas datas a partir de hoje; produzir ~30 dias antes (ou o prazo informado)
function proximas(hoje = new Date(), quantas = 8, antecedenciaDias = 30) {
  const a = hoje.getUTCFullYear();
  const todas = datasDoAno(a).concat(datasDoAno(a + 1)).filter(x => x.data >= new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())));
  return todas.slice(0, quantas).map(x => {
    const dias = Math.round((x.data - hoje) / 864e5);
    const produzirAte = new Date(x.data.getTime() - antecedenciaDias * 864e5);
    return { ...x, data: x.data.toISOString().slice(0, 10), dias, produzirAte: produzirAte.toISOString().slice(0, 10), atrasado: produzirAte < hoje };
  });
}

// Unidades extras para a data, a partir das unidades vendidas por mês (vendas extras = (fator - 1) * meio mês)
function extra(unidadesMes, fator) { return Math.ceil((Number(unidadesMes) || 0) / 2 * Math.max(0, fator - 1)); }

const _apiCal = { datasDoAno, proximas, extra, blackFriday };
if (typeof module !== 'undefined' && module.exports) module.exports = _apiCal;
else if (typeof window !== 'undefined') window.Calendario = _apiCal;
