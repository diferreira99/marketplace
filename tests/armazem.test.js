'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criar, slug } = require('../lib/armazem');
const { analisar } = require('../lib/analise');
const pesquisa = require('../api/pesquisa');
const historico = require('../api/historico');
const fx = require('./fixtures');

// Blob falso em memória, com etag e ifMatch como o de verdade
function blobFalso() {
  const dados = new Map(); let n = 0; const chamadas = { put: 0 };
  return {
    __teste: true, dados, chamadas,
    async get(caminho) {
      if (!dados.has(caminho)) return null;
      const d = dados.get(caminho);
      return { statusCode: 200, stream: new Response(d.corpo).body, blob: { etag: d.etag } };
    },
    async put(caminho, corpo, op) {
      chamadas.put++;
      const atual = dados.get(caminho);
      if (op && op.ifMatch && (!atual || atual.etag !== op.ifMatch)) { const e = new Error('Precondition failed'); e.name = 'BlobPreconditionFailedError'; throw e; }
      if (op.access !== 'private') throw new Error('deveria ser privado');
      dados.set(caminho, { corpo, etag: 'e' + (++n) });
      return { pathname: caminho };
    },
    async del(caminho) { dados.delete(caminho); },
  };
}
function resFalsa() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
}
const fetcherFx = async (url, op) => {
  const b = JSON.parse(op.body);
  let corpo = fx.respostas.busca;
  if (url.endsWith('/shopping')) corpo = fx.respostas.shopping;
  else if (url.endsWith('/autocomplete')) corpo = fx.respostas.autocomplete;
  else if (b.q.includes('site:mercadolivre')) corpo = fx.respostas.mercadolivre;
  else if (b.q.includes('site:shopee')) corpo = fx.respostas.shopee;
  else if (b.q.includes('site:amazon')) corpo = fx.respostas.amazon;
  return { ok: true, status: 200, json: async () => corpo };
};

test('slug sem acento e sem símbolo', () => {
  assert.strictEqual(slug('Fita de Borda Adesiva!'), 'fita-de-borda-adesiva');
  assert.strictEqual(slug('Ação & Reação'), 'acao-reacao');
});

test('salva, lê e lista no índice; regravar não duplica', async () => {
  const blob = blobFalso(); const arm = criar(blob);
  const d = { ...analisar(fx.termo, fx.respostas) };
  await arm.salvar(d);
  await arm.salvar({ ...d, geradoEm: new Date().toISOString() });
  await arm.salvar({ ...analisar('outra coisa', {}) });
  const idx = await arm.indice();
  assert.strictEqual(idx.length, 2);
  assert.strictEqual(idx[0].termo, 'outra coisa');
  assert.strictEqual(idx[1].ml, 3);
  assert.ok(idx[1].precoMediano > 0);
  const lido = await arm.ler('FITA DE BORDA ADESIVA');
  assert.strictEqual(lido.termo, fx.termo);
  await arm.apagar(fx.termo);
  assert.strictEqual((await arm.indice()).length, 1);
  assert.strictEqual(await arm.ler(fx.termo), null);
});

test('índice: se alguém gravou no meio, tenta de novo sem perder a outra pesquisa', async () => {
  const blob = blobFalso(); const arm = criar(blob);
  await arm.salvar(analisar('a', {}));
  const putOriginal = blob.put.bind(blob); let mexeu = false;
  blob.put = async (c, corpo, op) => {
    if (c === 'indice.json' && !mexeu) { mexeu = true; await putOriginal(c, JSON.stringify([{ termo: 'b', chave: 'b', nota: 1, nivel: 'fraco' }, { termo: 'a', chave: 'a', nota: 1, nivel: 'fraco' }]), { access: 'private' }); }
    return putOriginal(c, corpo, op);
  };
  await arm.salvar(analisar('c', {}));
  const idx = (await arm.indice()).map(x => x.termo).sort();
  assert.deepStrictEqual(idx, ['a', 'b', 'c']);
});

test('pesquisa compartilhada: 2ª pessoa recebe da nuvem sem gastar Serper', async () => {
  process.env.PAINEL_SENHA = 'segredo-teste';
  process.env.SERPER_API_KEY = 'CHAVE-FALSA';
  const arm = criar(blobFalso());
  let chamadasSerper = 0;
  const fetch = async (u, o) => { if (String(u).includes("serper")) chamadasSerper++; return fetcherFx(u, o); };
  const termo = 'termo unico ' + Date.now();
  let r = resFalsa();
  await pesquisa({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, body: { termo } }, r, { armazem: arm, fetch });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.salvoNaNuvem, true);
  assert.strictEqual(chamadasSerper, 6);
  // simula outra máquina da Vercel (sem o cache em memória): limpa via "atualizar" não, lê direto da nuvem
  const lido = await arm.ler(termo);
  assert.strictEqual(lido.termo, termo);
  r = resFalsa();
  await historico({ method: 'GET', headers: { 'x-senha': 'segredo-teste' }, query: {} }, r, { armazem: arm });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.nuvem, true);
  assert.ok(r.body.itens.some(x => x.termo === termo));
  r = resFalsa();
  await historico({ method: 'GET', headers: { 'x-senha': 'segredo-teste' }, query: { termo } }, r, { armazem: arm });
  assert.strictEqual(r.body.termo, termo);
  r = resFalsa();
  await historico({ method: 'GET', headers: { 'x-senha': 'errada-errada' }, query: {} }, r, { armazem: arm });
  assert.strictEqual(r.code, 401);
});

test('pesquisa: lê da nuvem quando a máquina não tem cache (nova instância)', async () => {
  process.env.PAINEL_SENHA = 'segredo-teste';
  const arm = criar(blobFalso());
  const termo = 'salvo por outro ' + Date.now();
  await arm.salvar({ ...analisar(termo, fx.respostas) });
  let chamadasSerper = 0;
  const r = resFalsa();
  await pesquisa({ method: 'POST', headers: { 'x-senha': 'segredo-teste' }, body: { termo } }, r, { armazem: arm, fetch: async () => { chamadasSerper++; return { ok: true, json: async () => ({}) }; } });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.doCache, true); assert.strictEqual(chamadasSerper, 0);
});
