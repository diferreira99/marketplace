// 📣 Reclame Aqui: reclamações sobre o produto, achadas pelo Google (Serper).
// Não acessamos o site do Reclame Aqui direto (ele bloqueia robôs e os termos de uso proíbem coleta
// automática): usamos só o título e o trecho que o Google já mostra publicamente.
'use strict';
const { TEMAS } = require('./avaliacoes');

const EXTRAS = [
  ['Produto com defeito', /defeit|estragad|quebrad|n[aã]o funciona|vici/i],
  ['Não entregaram / atraso', /n[aã]o (recebi|chegou|entreg)|atras|extravi/i],
  ['Troca ou reembolso negado', /reembols|estorn|devolu|troca|cancel/i],
  ['Produto diferente do anunciado', /diferente|n[aã]o (é|e) o (mesmo|que)|falsific|propaganda engan/i],
];
const TODOS = TEMAS.concat(EXTRAS);
const VAZIAS = new Set('de da do das dos para pra com sem em no na nos nas e o a os as um uma kit'.split(' '));

// "fita de eva autocolante para espelho 19mm" -> "fita eva autocolante espelho" (o Reclame Aqui tem pouca coisa muito específica)
function nucleo(termo) {
  return String(termo).toLowerCase().split(/\s+/).filter(w => w.length > 1 && !VAZIAS.has(w) && !/\d/.test(w)).slice(0, 3).join(' ');
}

// Título do Google costuma ser "Título da reclamação - Empresa - Reclame Aqui"
function lerResultado(o) {
  let url; try { url = new URL(o.link); } catch (e) { return null; }
  if (!/reclameaqui\.com\.br$/.test(url.hostname)) return null;
  const partes = url.pathname.split('/').filter(Boolean);
  if (partes.length < 2 || /^(empresa|ranking|busca|indices|noticias|blog|categoria|segmentos)$/.test(partes[0])) return null;   // página de empresa/lista, não reclamação
  const empresaUrl = partes[0].replace(/-/g, ' ');
  const pedacos = String(o.title || '').replace(/\s*[-|]\s*Reclame\s*Aqui\s*$/i, '').split(/\s+-\s+/);
  const titulo = pedacos.length > 1 ? pedacos.slice(0, -1).join(' - ') : pedacos[0];
  const empresa = pedacos.length > 1 ? pedacos[pedacos.length - 1] : empresaUrl;
  return { titulo: titulo.trim(), empresa: empresa.trim(), trecho: String(o.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 300), link: o.link, data: o.date || null };
}

async function consulta(q, chave, fetcher) {
  const r = await fetcher('https://google.serper.dev/search', {
    method: 'POST', headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 20 }),
  });
  if (!r.ok) { const e = new Error('Serper respondeu ' + r.status); e.status = r.status; throw e; }
  return ((await r.json()).organic || []).map(lerResultado).filter(Boolean);
}

async function buscar(termo, chave, fetcher = fetch) {
  let itens = await consulta('site:reclameaqui.com.br ' + termo, chave, fetcher), consultas = 1;
  const curto = nucleo(termo);
  if (itens.length < 5 && curto && curto !== String(termo).toLowerCase().trim()) {
    itens = itens.concat(await consulta('site:reclameaqui.com.br ' + curto, chave, fetcher)); consultas++;
  }
  const vistos = new Set(); itens = itens.filter(i => !vistos.has(i.link) && vistos.add(i.link)).slice(0, 25);
  return { itens, consultas, ...resumir(itens) };
}

function resumir(itens) {
  const textos = itens.map(i => (i.titulo + ' ' + i.trecho).trim());
  const temas = TODOS.map(([tema, re]) => {
    const ex = itens.filter((i, k) => re.test(textos[k]));
    return { tema, vezes: ex.length, exemplos: ex.slice(0, 3).map(i => i.titulo) };
  }).filter(t => t.vezes > 0).sort((a, b) => b.vezes - a.vezes);
  const porEmpresa = {};
  itens.forEach(i => { porEmpresa[i.empresa] = (porEmpresa[i.empresa] || 0) + 1; });
  const empresas = Object.entries(porEmpresa).map(([nome, vezes]) => ({ nome, vezes })).sort((a, b) => b.vezes - a.vezes).slice(0, 6);
  return { temas, empresas };
}

// Frase de oportunidade a partir do tema que mais aparece (sem IA)
const DICAS = {
  'Não cola / descola': 'Mostre no anúncio um teste de força (vídeo segurando peso) e indique a superfície certa e o tempo de cura.',
  'Fita fina ou fraca': 'Informe a espessura em mm e a densidade da espuma; foto ao lado de uma régua.',
  'Medida diferente do anúncio': 'Coloque a medida real (largura × comprimento) na primeira foto e no título.',
  'Embalagem ou entrega': 'Embalagem reforçada e prazo de envio curto viram argumento de venda.',
  'Produto com defeito': 'Destaque a garantia de fábrica e o controle de qualidade.',
  'Não entregaram / atraso': 'Envio rápido (Full) e rastreio claro tiram essa dor do comprador.',
  'Troca ou reembolso negado': 'Deixe a política de troca simples e visível: é o que o comprador não encontra nos outros.',
  'Produto diferente do anunciado': 'Fotos reais do produto (não de catálogo) e a ficha técnica completa.',
  'Deixa resíduo / mancha o espelho': 'Explique que a fita não mancha o espelho (adesivo próprio para espelho) e mostre.',
};
function oportunidade(temas) { const t = (temas || []).find(x => DICAS[x.tema]); return t ? { tema: t.tema, vezes: t.vezes, dica: DICAS[t.tema] } : null; }

module.exports = { buscar, resumir, lerResultado, nucleo, oportunidade };
