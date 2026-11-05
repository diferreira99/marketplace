// Pesquisas guardadas na nuvem (Vercel Blob privado): todo mundo que entra no painel vê o mesmo
// histórico, e uma palavra já pesquisada por alguém não gasta crédito do Serper de novo.
// Sem o BLOB_READ_WRITE_TOKEN (ex.: rodando local), tudo vira no-op e o painel segue funcionando.
'use strict';

const INDICE = 'indice.json';
const MAX_INDICE = 500;

function slug(termo) {
  return String(termo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sem-nome';
}

function resumo(d) {
  const mp = d.marketplaces || {};
  const n = k => (mp[k] && mp[k].anuncios) || 0;
  return {
    termo: d.termo, chave: slug(d.termo), em: d.geradoEm,
    nota: d.validacao.nota, nivel: d.validacao.nivel, concorrencia: d.validacao.concorrencia,
    precoMediano: d.precos.mediana, ml: n('mercadolivre'), shopee: n('shopee'), amazon: n('amazon'),
    lojas: (d.shopping && d.shopping.lojas) || 0,
  };
}

function criar(blob) {
  const ativo = !!(blob && (process.env.BLOB_READ_WRITE_TOKEN || blob.__teste));

  async function lerJson(caminho) {
    const r = await blob.get(caminho, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    const texto = await new Response(r.stream).text();
    return { dados: JSON.parse(texto), etag: r.blob && r.blob.etag };
  }
  async function gravar(caminho, obj, ifMatch) {
    const op = { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
    if (ifMatch) op.ifMatch = ifMatch;
    return blob.put(caminho, JSON.stringify(obj), op);
  }

  return {
    ativo,
    slug,
    async indice() {
      if (!ativo) return [];
      try { const r = await lerJson(INDICE); return (r && Array.isArray(r.dados)) ? r.dados : []; } catch (e) { return []; }
    },
    async ler(termo) {
      if (!ativo) return null;
      try { const r = await lerJson('pesquisas/' + slug(termo) + '.json'); return r ? r.dados : null; } catch (e) { return null; }
    },
    async salvar(d) {
      if (!ativo) return false;
      await gravar('pesquisas/' + slug(d.termo) + '.json', d);
      const item = resumo(d);
      // índice: lê, troca a linha e grava só se ninguém gravou no meio (ifMatch); tenta 3 vezes
      for (let i = 0; i < 3; i++) {
        let atual = null;
        try { atual = await lerJson(INDICE); } catch (e) { atual = null; }
        const lista = ((atual && Array.isArray(atual.dados)) ? atual.dados : []).filter(x => x.chave !== item.chave);
        lista.unshift(item);
        try { await gravar(INDICE, lista.slice(0, MAX_INDICE), atual && atual.etag); return true; }
        catch (e) { if (!/precondition|412/i.test(String((e && (e.name || '')) + (e && e.message)))) throw e; }
      }
      return false;
    },
    async apagar(termo) {
      if (!ativo) return false;
      const chave = slug(termo);
      try { await blob.del('pesquisas/' + chave + '.json'); } catch (e) { /* já não existia */ }
      for (let i = 0; i < 3; i++) {
        const atual = await lerJson(INDICE).catch(() => null);
        if (!atual) return true;
        try { await gravar(INDICE, atual.dados.filter(x => x.chave !== chave), atual.etag); return true; }
        catch (e) { if (!/precondition|412/i.test(String((e && (e.name || '')) + (e && e.message)))) throw e; }
      }
      return false;
    },
  };
}

let _padrao = null;
function padrao() {
  if (_padrao) return _padrao;
  let blob = null;
  try { blob = require('@vercel/blob'); } catch (e) { blob = null; }
  _padrao = criar(blob);
  return _padrao;
}

module.exports = { criar, padrao, slug, resumo };
