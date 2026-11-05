// Conta do vendedor no Mercado Livre (OAuth). O token fica guardado no Blob privado, só o servidor lê.
// Precisa de ML_CLIENT_ID e ML_CLIENT_SECRET (app criado em developers.mercadolivre.com.br).
'use strict';

const ML = 'https://api.mercadolibre.com';
const ARQ = 'ml-conta.json';

function urlAutorizacao(clientId, redirect, state) {
  return 'https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirect) + '&state=' + encodeURIComponent(state);
}

async function trocarCodigo(code, redirect, fetcher = fetch) {
  const corpo = new URLSearchParams({ grant_type: 'authorization_code', client_id: process.env.ML_CLIENT_ID || '', client_secret: process.env.ML_CLIENT_SECRET || '', code, redirect_uri: redirect });
  const r = await fetcher(ML + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: corpo.toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('O Mercado Livre recusou a autorização: ' + (j.message || j.error || r.status));
  return { access_token: j.access_token, refresh_token: j.refresh_token, user_id: j.user_id, expira: Date.now() + (Number(j.expires_in) || 21600) * 1000 - 60000 };
}

// Devolve um token válido (renova com o refresh_token quando vence) ou null se não conectado
async function token(arm, fetcher = fetch) {
  const c = await arm.lerArquivo(ARQ);
  if (!c || !c.access_token) return null;
  if (Date.now() < c.expira) return c;
  const corpo = new URLSearchParams({ grant_type: 'refresh_token', client_id: process.env.ML_CLIENT_ID || '', client_secret: process.env.ML_CLIENT_SECRET || '', refresh_token: c.refresh_token });
  const r = await fetcher(ML + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: corpo.toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { ...c, expirado: true };
  const novo = { ...c, access_token: j.access_token, refresh_token: j.refresh_token || c.refresh_token, expira: Date.now() + (Number(j.expires_in) || 21600) * 1000 - 60000 };
  await arm.mudarArquivo(ARQ, () => novo);
  return novo;
}

async function get(caminho, tk, fetcher = fetch) {
  const r = await fetcher(ML + caminho, { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json' } });
  if (!r.ok) { const e = new Error('ML ' + caminho.split('?')[0] + ' respondeu ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

// Resumo da loja: anúncios ativos com preço, estoque, vendidos, visitas e vendas dos últimos 30 dias
async function resumoLoja(tk, userId, fetcher = fetch, agora = new Date()) {
  const eu = await get('/users/me', tk, fetcher);
  const busca = await get('/users/' + userId + '/items/search?status=active&limit=50', tk, fetcher);
  const ids = (busca.results || []).slice(0, 50);
  const itens = [];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = await get('/items?ids=' + ids.slice(i, i + 20).join(',') + '&attributes=id,title,price,available_quantity,sold_quantity,permalink,listing_type_id,thumbnail,health,category_id', tk, fetcher);
    for (const x of lote) if (x && x.code === 200 && x.body) itens.push(x.body);
  }
  const de = new Date(agora.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const ate = agora.toISOString().slice(0, 10);
  const visitas = {};
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const v = await get('/items/visits?ids=' + ids.slice(i, i + 50).join(',') + '&date_from=' + de + '&date_to=' + ate, tk, fetcher);
      for (const x of Array.isArray(v) ? v : []) visitas[x.item_id] = x.total_visits;
    } catch (e) { /* visitas são extra */ }
  }
  const vendas = {}; let faturamento = 0, unidades = 0, pedidos = 0;
  try {
    let offset = 0;
    for (let pag = 0; pag < 6; pag++) {
      const o = await get('/orders/search?seller=' + userId + '&order.status=paid&order.date_created.from=' + de + 'T00:00:00.000-03:00&sort=date_desc&limit=50&offset=' + offset, tk, fetcher);
      for (const ped of o.results || []) {
        pedidos++;
        for (const it of ped.order_items || []) {
          const id = it.item && it.item.id, q = Number(it.quantity) || 0, pr = Number(it.unit_price) || 0;
          vendas[id] = vendas[id] || { unidades: 0, faturamento: 0 };
          vendas[id].unidades += q; vendas[id].faturamento += q * pr; unidades += q; faturamento += q * pr;
        }
      }
      offset += 50;
      if (!o.paging || offset >= o.paging.total) break;
    }
  } catch (e) { /* pedidos podem exigir permissão extra */ }
  const lista = itens.map(x => {
    const vis = visitas[x.id] ?? null, ven = vendas[x.id] || { unidades: 0, faturamento: 0 };
    return { id: x.id, titulo: x.title, preco: x.price, estoque: x.available_quantity, vendidosTotal: x.sold_quantity, link: x.permalink, tipo: x.listing_type_id, foto: x.thumbnail, saude: x.health,
      visitas30: vis, vendas30: ven.unidades, faturamento30: Math.round(ven.faturamento * 100) / 100, conversao: vis ? Math.round(ven.unidades / vis * 1000) / 10 : null };
  }).sort((a, b) => (b.vendas30 - a.vendas30) || ((b.visitas30 || 0) - (a.visitas30 || 0)));
  const totVis = lista.reduce((s, x) => s + (x.visitas30 || 0), 0);
  return {
    vendedor: { id: eu.id, apelido: eu.nickname, reputacao: eu.seller_reputation && eu.seller_reputation.level_id, medalha: eu.seller_reputation && eu.seller_reputation.power_seller_status },
    periodo: { de, ate }, totais: { anuncios: lista.length, pedidos, unidades, faturamento: Math.round(faturamento * 100) / 100, visitas: totVis, conversao: totVis ? Math.round(unidades / totVis * 1000) / 10 : null },
    itens: lista,
  };
}

module.exports = { urlAutorizacao, trocarCodigo, token, resumoLoja, get, ARQ };
