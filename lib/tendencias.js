'use strict';
// 📈 Procura no Google Trends (últimos 12 meses, Brasil).
// O Google Trends não tem API oficial: usamos os mesmos endereços que o site dele usa.
// Pode falhar (o Google limita acessos automáticos); quem chama trata o erro e mostra um aviso.

const BASE = 'https://trends.google.com/trends/api';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// As respostas do Trends começam com ")]}'" para não serem lidas direto: tira isso antes do JSON.
function lerJsonTrends(txt) {
  const i = String(txt).indexOf('{');
  if (i < 0) throw new Error('resposta inesperada do Google Trends');
  return JSON.parse(String(txt).slice(i));
}

async function buscar(termo, fetchFn, opcoes = {}) {
  const f = fetchFn || fetch;
  const geo = opcoes.geo || 'BR', periodo = opcoes.periodo || 'today 12-m';
  const cab = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' };
  // 1) cookie de sessão (sem ele o Trends costuma responder 429)
  try {
    const r0 = await f('https://trends.google.com/trends/?geo=' + geo, { headers: cab });
    const ck = r0.headers && (typeof r0.headers.getSetCookie === 'function' ? r0.headers.getSetCookie() : [r0.headers.get && r0.headers.get('set-cookie')]);
    const nid = (ck || []).filter(Boolean).map(c => String(c).split(';')[0]).find(c => /^NID=/.test(c));
    if (nid) cab.Cookie = nid;
  } catch (e) { /* segue sem cookie */ }
  // 2) "explore": devolve o token do gráfico de interesse ao longo do tempo
  const req = { comparisonItem: [{ keyword: termo, geo, time: periodo }], category: 0, property: '' };
  const r1 = await f(BASE + '/explore?hl=pt-BR&tz=180&req=' + encodeURIComponent(JSON.stringify(req)), { headers: cab });
  if (!r1.ok) throw Object.assign(new Error('Google Trends respondeu ' + r1.status), { status: r1.status });
  const widgets = lerJsonTrends(await r1.text()).widgets || [];
  const w = widgets.find(x => x.id === 'TIMESERIES'), wGeo = widgets.find(x => x.id === 'GEO_MAP');
  if (!w) throw new Error('Google Trends não devolveu o gráfico');
  // 3) os pontos do gráfico
  const r2 = await f(BASE + '/widgetdata/multiline?hl=pt-BR&tz=180&req=' + encodeURIComponent(JSON.stringify(w.request)) + '&token=' + encodeURIComponent(w.token), { headers: cab });
  if (!r2.ok) throw Object.assign(new Error('Google Trends respondeu ' + r2.status), { status: r2.status });
  const out = resumir(lerJsonTrends(await r2.text()));
  // 4) procura por estado (mesma consulta, sem custo extra); se falhar, segue sem
  if (wGeo) {
    try {
      const r3 = await f(BASE + '/widgetdata/comparedgeo?hl=pt-BR&tz=180&req=' + encodeURIComponent(JSON.stringify(wGeo.request)) + '&token=' + encodeURIComponent(wGeo.token), { headers: cab });
      if (r3.ok) out.estados = lerEstados(lerJsonTrends(await r3.text()));
    } catch (e) { /* sem estados */ }
  }
  return out;
}
function lerEstados(j) {
  return ((j && j.default && j.default.geoMapData) || []).filter(x => x.hasData !== false && x.geoName)
    .map(x => ({ estado: x.geoName, valor: Number((x.value || [0])[0]) || 0 })).filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor).slice(0, 8);
}

// Transforma a série do Trends em pontos + leitura simples (subindo/caindo, meses fortes).
function resumir(j) {
  const linha = ((j && j.default && j.default.timelineData) || []).filter(x => !x.isPartial);
  const pontos = linha.map(x => ({ data: new Date(Number(x.time) * 1000).toISOString().slice(0, 10), valor: Number((x.value || [0])[0]) || 0 }));
  if (!pontos.length) return { pontos: [], semDados: true };
  const media = a => a.length ? a.reduce((s, x) => s + x.valor, 0) / a.length : 0;
  const ult = pontos.slice(-13), ant = pontos.slice(-26, -13);
  const variacao = ant.length && media(ant) > 0 ? Math.round((media(ult) - media(ant)) / media(ant) * 100) : null;
  const porMes = Array.from({ length: 12 }, () => []);
  pontos.forEach(p => porMes[Number(p.data.slice(5, 7)) - 1].push(p.valor));
  const mediaMes = porMes.map((v, i) => ({ mes: MESES[i], valor: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null })).filter(x => x.valor != null);
  const fortes = mediaMes.slice().sort((a, b) => b.valor - a.valor).slice(0, 2).map(x => x.mes);
  const fracos = mediaMes.slice().sort((a, b) => a.valor - b.valor).slice(0, 2).map(x => x.mes);
  const pico = pontos.reduce((a, b) => (b.valor > a.valor ? b : a), pontos[0]);
  return {
    pontos, variacao3m: variacao,
    tendencia: variacao == null ? null : variacao >= 15 ? 'subindo' : variacao <= -15 ? 'caindo' : 'estável',
    mesesFortes: fortes, mesesFracos: fracos, pico: { data: pico.data, valor: pico.valor },
    mediaGeral: Math.round(media(pontos)), semDados: pontos.every(p => !p.valor),
  };
}

module.exports = { buscar, resumir, lerJsonTrends, lerEstados };
