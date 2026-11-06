// Fontes extras sobre o produto (todas públicas):
//  ❓ perguntas dos compradores nos anúncios do Mercado Livre (API do ML)
//  🎬 vídeos sobre o produto no YouTube (pelo Google/Serper)
//  ⭐ comentários de Shopee e Amazon que o Google mostra (pelo Google/Serper)
'use strict';
const { TEMAS } = require('./avaliacoes');

const SERPER = 'https://google.serper.dev';
async function serper(rota, corpo, chave, fetcher) {
  const r = await fetcher(SERPER + rota, { method: 'POST', headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' }, body: JSON.stringify({ gl: 'br', hl: 'pt-br', ...corpo }) });
  if (!r.ok) { const e = new Error('Serper respondeu ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

// ───────── ❓ Perguntas ─────────
const TEMAS_PERGUNTA = [
  ['Medida / tamanho', /medida|tamanho|largura|comprimento|metros?\b|\bmm\b|\bcm\b|espessura|grossura/i],
  ['Quanto peso aguenta', /peso|aguenta|suporta|segura|kg|quilo/i],
  ['Serve para qual superfície', /serve|parede|azulejo|vidro|espelho|madeira|mdf|reboco|porcelanato|pintura|metal/i],
  ['Umidade, calor, área externa', /umid|banheiro|chuva|sol|calor|extern|água|agua|temperatura/i],
  ['Como aplicar / remover', /como (aplic|usa|coloc|tira|remov)|remov|tirar depois|reposicion/i],
  ['Quantidade e cor', /quantos|quantas|unidade|rolo|cor\b|cores|branc|pret|transparent/i],
  ['Prazo, frete e nota fiscal', /prazo|entrega|frete|chega|envio|nota fiscal|nf\b|cnpj/i],
  ['Preço para atacado', /atacado|quantidade maior|caixa fechada|revenda|desconto|lote/i],
];
function temasDe(textos, temas) {
  return temas.map(([tema, re]) => {
    const ex = textos.filter(t => re.test(t));
    return { tema, vezes: ex.length, exemplos: ex.slice(0, 3).map(t => t.slice(0, 160)) };
  }).filter(t => t.vezes > 0).sort((a, b) => b.vezes - a.vezes);
}
async function perguntasML(ids, fetcher = fetch, tk = null) {
  const out = [];
  for (const id of (ids || []).slice(0, 6)) {
    try {
      const h = { Accept: 'application/json' }; if (tk) h.Authorization = 'Bearer ' + tk;
      const r = await fetcher('https://api.mercadolibre.com/questions/search?item=' + id + '&api_version=4&limit=50&sort_fields=date_created&sort_types=DESC', { headers: h });
      if (!r.ok) continue;
      const j = await r.json();
      (j.questions || []).forEach(q => { if (q && q.text) out.push({ anuncio: id, pergunta: String(q.text).slice(0, 300), resposta: q.answer && q.answer.text ? String(q.answer.text).slice(0, 300) : null }); });
    } catch (e) { /* um anúncio a menos */ }
  }
  const vistas = new Set(), unicas = out.filter(q => { const k = q.pergunta.toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim(); return !vistas.has(k) && vistas.add(k); });
  return { itens: unicas, temas: temasDe(unicas.map(q => q.pergunta), TEMAS_PERGUNTA) };
}

// ───────── 🎬 Vídeos ─────────
const ANGULOS = [
  ['Teste de força / resistência', /teste|aguenta|resist|força|forca|peso/i],
  ['Como aplicar (passo a passo)', /como (usar|aplicar|colocar|instalar|fixar)|passo a passo|tutorial|diy|fa[cç]a voc[eê]/i],
  ['Review / vale a pena?', /review|vale a pena|opini[aã]o|an[aá]lise|unboxing|testei/i],
  ['Comparação de marcas', /\bvs\b|versus|compara|qual (a )?melhor|melhores/i],
];
function lerVisualizacoes(v) {
  const m = String(v || '').replace(/\./g, '').replace(',', '.').match(/([\d.]+)\s*(mil|mi|k|m)?/i);
  if (!m) return null; let n = Number(m[1]); const u = (m[2] || '').toLowerCase();
  if (u === 'mil' || u === 'k') n *= 1e3; else if (u === 'mi' || u === 'm') n *= 1e6;
  return Math.round(n);
}
async function videos(termo, chave, fetcher = fetch) {
  const j = await serper('/videos', { q: termo, num: 12 }, chave, fetcher);
  const itens = (j.videos || []).filter(v => /youtube\.com|youtu\.be/.test(v.link || '')).map(v => ({
    titulo: v.title || '', link: v.link, canal: v.channel || '', data: v.date || null, duracao: v.duration || null,
    imagem: v.imageUrl || null, trecho: String(v.snippet || '').slice(0, 200), visualizacoes: lerVisualizacoes(v.views),
  })).slice(0, 10);
  const angulos = ANGULOS.map(([nome, re]) => ({ nome, vezes: itens.filter(v => re.test(v.titulo + ' ' + v.trecho)).length })).filter(a => a.vezes).sort((a, b) => b.vezes - a.vezes);
  return { itens, angulos };
}

// ───────── ⭐ Shopee e Amazon (pelo Google) ─────────
const NEGATIVO = /n[aã]o (cola|grud|recomend|segur|vale)|descol|solt|p[eé]ssim|ruim|horr[ií]vel|fraca|fin[ao] demais|veio menor|defeit|decepcion|n[aã]o gostei|arrependi/i;
async function outrasAvaliacoes(termo, chave, fetcher = fetch) {
  const q = termo + ' avaliação (site:amazon.com.br OR site:shopee.com.br)';
  const j = await serper('/search', { q, num: 20 }, chave, fetcher);
  const itens = (j.organic || []).map(o => {
    const host = (() => { try { return new URL(o.link).hostname; } catch (e) { return ''; } })();
    const canal = /amazon\.com\.br/.test(host) ? 'amazon' : /shopee\.com\.br/.test(host) ? 'shopee' : null;
    const texto = String(o.snippet || '').replace(/\s+/g, ' ').trim();
    return canal && texto ? { canal, titulo: String(o.title || '').replace(/\s*[|:-]\s*(Amazon\.com\.br|Shopee Brasil|Shopee).*$/i, '').trim(), trecho: texto.slice(0, 300), link: o.link, nota: o.rating != null ? Number(o.rating) : null, negativo: NEGATIVO.test(texto) } : null;
  }).filter(Boolean);
  const neg = itens.filter(i => i.negativo);
  return { itens, negativos: neg.length, temas: temasDe(neg.map(i => i.trecho), TEMAS) };
}

module.exports = { perguntasML, videos, outrasAvaliacoes, lerVisualizacoes, TEMAS_PERGUNTA, serper };
