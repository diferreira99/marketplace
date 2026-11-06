// 👤 Quem é o cliente: lê o que os próprios compradores escrevem (avaliações, perguntas, reclamações,
// comentários e títulos de vídeos) e conta quem compra, para que usa e o que pesa na decisão.
// Sem dados pessoais: só os temas, em porcentagem.
'use strict';

const QUEM = [
  ['Faz em casa (consumidor final)', /minha casa|meu (banheiro|quarto|apartamento|espelho|guarda)|minha (parede|porta|sala)|em casa|apartament|eu mesm|fiz sozinh|marido|esposa|filh|presente/i],
  ['Profissional (instalador, vidraceiro, marceneiro)', /vidraceir|marcen|instalador|serralh|uso no (trabalho|servi[cç]o)|meus clientes|na obra|profission|montador/i],
  ['Revenda / compra em quantidade', /atacado|revend|caixa fechada|\blote\b|quantidade maior|para (minha|a) loja|cnpj|nota fiscal/i],
];
const USOS = [
  ['Espelho ou vidro', /espelh|vidro/i],
  ['Banheiro', /banheir|box\b/i],
  ['Quarto, guarda-roupa, closet', /quarto|guarda.?roupa|arm[aá]rio|closet/i],
  ['Parede, quadros, decoração', /quadro|decora|moldura|painel|parede/i],
  ['Porta e janela (vedação)', /porta|janela|veda[cç]|frestas?/i],
  ['Móveis e marcenaria', /m[oó]veis?|mdf|madeira|marcenar|gaveta|prateleira/i],
  ['Carro e moto', /\bcarro|\bmoto\b|automot|ve[ií]culo/i],
  ['Loja, vitrine, comércio', /vitrine|com[eé]rcio|expositor|loja/i],
  ['Artesanato e escola', /artesan|escola|crian[cç]a|lembrancinha/i],
];
const DECISAO = [
  ['Aguentar o peso / segurar firme', /segur|aguent|peso|firme|forte|resist|n[aã]o (cola|grud)|descol|solt/i],
  ['Medida certa', /medida|largura|comprimento|tamanho|espessura|\bmm\b|\bcm\b/i],
  ['Fácil de aplicar e remover', /f[aá]cil|pr[aá]tic|aplic|remov|tirar|liner|papel/i],
  ['Durar com umidade e calor', /umid|banheir|calor|sol\b|chuva|durab|tempo/i],
  ['Preço justo', /pre[cç]o|barat|caro|custo|vale a pena|desconto/i],
  ['Entrega rápida e bem embalada', /entreg|cheg(ou|a)|prazo|embalag|envio|frete/i],
];

function contar(textos, regras) {
  const n = textos.length || 1;
  return regras.map(([nome, re]) => { const vezes = textos.filter(t => re.test(t)).length; return { nome, vezes, pct: Math.round(vezes / n * 100) }; })
    .filter(x => x.vezes > 0).sort((a, b) => b.vezes - a.vezes);
}

// textos: lista de strings (avaliações, perguntas, reclamações, trechos, títulos de vídeo)
function perfilCliente(textos) {
  const t = (textos || []).map(x => String(x || '').trim()).filter(x => x.length >= 8);
  return { base: t.length, quem: contar(t, QUEM), usos: contar(t, USOS), decisao: contar(t, DECISAO) };
}

// Junta os textos de tudo o que o Radar já leu sobre o produto
function textosDe(r) {
  const out = [];
  (r.itensML || []).forEach(i => (i.reviews || []).forEach(v => out.push((v.titulo || '') + ' ' + (v.texto || ''))));
  ((r.perguntas && r.perguntas.itens) || []).forEach(q => out.push(q.pergunta));
  ((r.perguntas && r.perguntas.google) || []).forEach(q => out.push(q));
  ((r.reclameAqui && r.reclameAqui.itens) || []).forEach(i => out.push(i.titulo + ' ' + i.trecho));
  ((r.outras && r.outras.itens) || []).forEach(i => out.push(i.trecho));
  ((r.videos && r.videos.itens) || []).forEach(v => out.push(v.titulo + ' ' + (v.trecho || '')));
  return out;
}

module.exports = { perfilCliente, textosDe, QUEM, USOS, DECISAO };
