'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criar } = require('../lib/armazem');
const { analisar } = require('../lib/analise');
const { calcular, metaMensal, kits } = require('../lib/margem');
const { pesoConsiderado, fretePorPeso, FAIXAS_PADRAO } = require('../lib/frete');
const { categoriaETaxa, lerTarifa } = require('../lib/mltaxa');
const { lerAnuncio, codigoML, validar, canalDoLink } = require('../lib/concorrente');
const { alertasVigiada, alertasConcorrente } = require('../lib/alertas');
const concorrentes = require('../api/concorrentes');
const compartilhar = require('../api/compartilhar');
const titulos = require('../api/titulos');
const monitorar = require('../api/monitorar');
const config = require('../api/config');
const fx = require('./fixtures');

function blobFalso() {
  const dados = new Map(); let n = 0;
  return {
    __teste: true, dados,
    async get(c) { if (!dados.has(c)) return null; const d = dados.get(c); return { statusCode: 200, stream: new Response(d.corpo).body, blob: { etag: d.etag } }; },
    async put(c, corpo, op) { const a = dados.get(c); if (op && op.ifMatch && (!a || a.etag !== op.ifMatch)) { const e = new Error('Precondition failed'); throw e; } dados.set(c, { corpo, etag: 'e' + (++n) }); },
    async del(c) { dados.delete(c); },
  };
}
function resFalsa() { const r = { code: 0, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; }
const H = { 'x-senha': 'segredo-teste' };
process.env.PAINEL_SENHA = 'segredo-teste';

test('frete: peso cubado manda quando a caixa é grande e leve', () => {
  const p = pesoConsiderado(0.2, 40, 30, 20);   // 24000/6000 = 4 kg cubado
  assert.strictEqual(p.cubado, 4); assert.strictEqual(p.considerado, 4);
  assert.strictEqual(fretePorPeso('mercadolivre', 4), 29.95);
  assert.strictEqual(fretePorPeso('mercadolivre', 0.25), 19.95);
  assert.strictEqual(fretePorPeso('shopee', 3), 0);
  assert.strictEqual(fretePorPeso('mercadolivre', 0), null);
  assert.strictEqual(fretePorPeso('mercadolivre', 99), FAIXAS_PADRAO.mercadolivre.at(-1)[1]);
});

test('margem: frete pelo peso e taxa oficial do ML entram no cálculo', () => {
  const base = calcular({ preco: 100, custo: 20 });
  const ajustado = calcular({ preco: 100, custo: 20, fretes: { mercadolivre: 29.95 }, ajustes: { mercadolivre: { comissao: 14, fixoAbaixo: 0 } } });
  assert.strictEqual(base.mercadolivre.frete, 22); assert.strictEqual(ajustado.mercadolivre.frete, 29.95);
  assert.strictEqual(ajustado.mercadolivre.comissao, 14);
  assert.ok(ajustado.mercadolivre.lucro < base.mercadolivre.lucro);
});

test('meta mensal e kits', () => {
  const r = calcular({ precos: { mercadolivre: 50, mercadolivrePremium: 50, shopee: 50, amazon: 50 }, custo: 10, embalagem: 1 });
  const m = metaMensal(r, 5000);
  assert.strictEqual(m.mercadolivre.unidades, Math.ceil(5000 / r.mercadolivre.lucro));
  assert.ok(m.mercadolivre.porDia >= 1);
  const k = kits({ precos: { mercadolivre: 30, mercadolivrePremium: 30, shopee: 30, amazon: 30 }, custo: 6, embalagem: 1 });
  assert.deepStrictEqual(Object.keys(k).map(Number), [2, 3, 5, 10]);
  // kit de 5 no ML: a taxa fixa de R$ 6,75 deixa de existir (preço passa de 79) e o lucro por unidade sobe
  assert.ok(k[5].canais.mercadolivre.ganhoVsUnidade > 0, JSON.stringify(k[5].canais.mercadolivre));
});

test('taxa do ML: lê categoria e tarifas do Clássico e do Premium', async () => {
  const fetcher = async u => {
    if (u.includes('domain_discovery')) return { ok: true, json: async () => [{ category_id: 'MLB1234', category_name: 'Fitas de Borda' }] };
    if (u.includes('listing_prices')) return { ok: true, json: async () => [
      { listing_type_id: 'gold_special', price: 50, sale_fee_amount: 13.25, sale_fee_details: { percentage_fee: 13, fixed_fee: 6.75 } },
      { listing_type_id: 'gold_pro', price: 50, sale_fee_amount: 15.75, sale_fee_details: { percentage_fee: 18, fixed_fee: 6.75 } }] };
    return { ok: false };
  };
  const r = await categoriaETaxa('fita de borda', 50, fetcher);
  assert.strictEqual(r.categoria, 'Fitas de Borda'); assert.strictEqual(r.oficial, true);
  assert.deepStrictEqual(r.classico, { percentual: 13, fixo: 6.75, total: 13.25 });
  assert.strictEqual(r.premium.percentual, 18);
  assert.strictEqual(await categoriaETaxa('x', 50, async () => { throw new Error('bloqueado'); }), null);
  assert.strictEqual(lerTarifa({ price: 100, sale_fee_amount: 12 }).percentual, 12);
});

test('concorrente: link, código do ML e leitura do Google', async () => {
  assert.strictEqual(codigoML('https://produto.mercadolivre.com.br/MLB-123456789-fita-_JM'), 'MLB123456789');
  assert.strictEqual(validar('nada'), null);
  assert.strictEqual(validar('https://shopee.com.br/x-i.1.2?utm_source=a#topo'), 'https://shopee.com.br/x-i.1.2');
  assert.strictEqual(canalDoLink('https://www.amazon.com.br/dp/B0X'), 'amazon');
  let q = null;
  const r = await lerAnuncio('https://produto.mercadolivre.com.br/MLB-123456789-fita-_JM', 'K', async (u, op) => {
    q = JSON.parse(op.body).q;
    return { ok: true, json: async () => ({ organic: [{ title: 'Fita X | Mercado Livre', link: 'https://produto.mercadolivre.com.br/MLB-123456789-fita-_JM', snippet: 'R$ 19,90 · +500 vendidos', rating: 4.8 }] }) };
  });
  assert.match(q, /MLB-123456789/);
  assert.deepStrictEqual([r.achou, r.preco, r.vendidos, r.nota, r.titulo], [true, 19.9, 500, 4.8, 'Fita X']);
});

test('alertas: preço, nota, concorrência e concorrente', () => {
  const a = alertasVigiada('fita', [{ precoMediano: 20, nota: 50, ml: 3, shopee: 2, amazon: 1, lojas: 2 }, { precoMediano: 17, nota: 62, ml: 6, shopee: 4, amazon: 2, lojas: 7 }]);
  assert.deepStrictEqual(a.map(x => x.tipo).sort(), ['concorrencia', 'concorrencia', 'nota-subiu', 'preco-caiu']);
  const c = alertasConcorrente('Loja X', [{ achou: true, preco: 20, vendidos: 100 }, { achou: true, preco: 18, vendidos: 500 }]);
  assert.deepStrictEqual(c.map(x => x.tipo), ['concorrente-baixou', 'concorrente-vendeu']);
  assert.deepStrictEqual(alertasVigiada('x', [{ precoMediano: 20, nota: 50 }, { precoMediano: 20.5, nota: 52 }]), []);
});

test('API concorrentes: adiciona (já checa), lista com histórico, remove', async () => {
  process.env.SERPER_API_KEY = 'K';
  const arm = criar(blobFalso());
  const fetch = async () => ({ ok: true, json: async () => ({ organic: [{ title: 'Anúncio', link: 'https://shopee.com.br/x-i.1.2', snippet: 'R$ 12,00' }] }) });
  let r = resFalsa();
  await concorrentes({ method: 'POST', headers: H, body: { acao: 'adicionar', link: 'https://shopee.com.br/x-i.1.2', apelido: 'Loja X' } }, r, { armazem: arm, fetch });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.ponto.preco, 12);
  r = resFalsa();
  await concorrentes({ method: 'GET', headers: H }, r, { armazem: arm });
  assert.strictEqual(r.body.itens.length, 1); assert.strictEqual(r.body.itens[0].pontos.length, 1);
  const id = r.body.itens[0].id;
  r = resFalsa();
  await concorrentes({ method: 'POST', headers: H, body: { acao: 'remover', id } }, r, { armazem: arm });
  r = resFalsa();
  await concorrentes({ method: 'GET', headers: H }, r, { armazem: arm });
  assert.strictEqual(r.body.itens.length, 0);
  r = resFalsa();
  await concorrentes({ method: 'POST', headers: H, body: { acao: 'adicionar', link: 'ftp://x' } }, r, { armazem: arm });
  assert.strictEqual(r.code, 400);
});

test('monitorar: gera alertas e chama o webhook', async () => {
  process.env.CRON_SECRET = 'c'; process.env.SERPER_API_KEY = 'K'; process.env.ALERTA_WEBHOOK_URL = 'https://hook.exemplo/x';
  const arm = criar(blobFalso());
  await arm.mudarArquivo('concorrentes.json', () => [{ id: 'abc', link: 'https://shopee.com.br/x-i.1.2', apelido: 'Loja X' }]);
  await arm.mudarArquivo('concorrentes/abc.json', () => [{ em: '2026-10-01T10:00:00Z', achou: true, preco: 20, vendidos: 100 }]);
  let webhook = null;
  const fetch = async (u, op) => {
    if (u === 'https://hook.exemplo/x') { webhook = JSON.parse(op.body); return { ok: true }; }
    return { ok: true, json: async () => ({ organic: [{ title: 'Anúncio', link: 'https://shopee.com.br/x-i.1.2', snippet: 'R$ 15,00 · 300 vendidos' }] }) };
  };
  const r = resFalsa();
  await monitorar({ headers: { authorization: 'Bearer c' } }, r, { armazem: arm, fetch });
  assert.strictEqual(r.body.alertas, 2); assert.strictEqual(r.body.avisado, true);
  assert.match(webhook.texto, /baixou o preço 25%/);
  assert.strictEqual((await arm.lerArquivo('alertas.json')).length, 2);
  delete process.env.ALERTA_WEBHOOK_URL;
});

test('relatório: cria link com senha, abre sem senha, id inválido é recusado', async () => {
  const arm = criar(blobFalso());
  await arm.salvar(analisar(fx.termo, fx.respostas));
  let r = resFalsa();
  await compartilhar({ method: 'POST', headers: H, body: { termo: fx.termo, extras: { vencedor: 'mercadolivre' } } }, r, { armazem: arm });
  assert.strictEqual(r.code, 200); assert.match(r.body.id, /^[a-f0-9]{32}$/);
  const id = r.body.id;
  r = resFalsa();
  await compartilhar({ method: 'GET', headers: {}, query: { id } }, r, { armazem: arm });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.dados.termo, fx.termo); assert.strictEqual(r.body.extras.vencedor, 'mercadolivre');
  r = resFalsa();
  await compartilhar({ method: 'GET', headers: {}, query: { id: '../config' } }, r, { armazem: arm });
  assert.strictEqual(r.code, 400);
  r = resFalsa();
  await compartilhar({ method: 'POST', headers: {}, body: { termo: fx.termo } }, r, { armazem: arm });
  assert.strictEqual(r.code, 401);
});

test('anúncio por regra: 3 canais com títulos, descrição, destaques, ficha e perguntas', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const arm = criar(blobFalso());
  await arm.salvar(analisar(fx.termo, fx.respostas));
  const r = resFalsa();
  await titulos({ method: 'POST', headers: H, body: { termo: fx.termo, detalhes: 'PVC, 22mm x 20m' } }, r, { armazem: arm });
  for (const k of ['mercadolivre', 'shopee', 'amazon']) {
    assert.ok(r.body[k].titulos.length >= 1); assert.ok(r.body[k].descricao.includes('PVC, 22mm x 20m')); assert.strictEqual(r.body[k].destaques.length, 5);
  }
  assert.ok(r.body.fichaTecnica.length >= 5); assert.strictEqual(r.body.perguntas.length, 1);
});

test('config: guarda peso, medidas, meta e detalhes por produto; tabela de frete editável', async () => {
  const arm = criar(blobFalso());
  let r = resFalsa();
  await config({ method: 'POST', headers: H, body: { acao: 'custo', termo: 'Fita', custo: 4, embalagem: 1, pesoKg: 0.3, comp: 20, larg: 10, alt: 5, meta: 8000, detalhes: 'PVC' } }, r, { armazem: arm });
  assert.deepStrictEqual(r.body.custos.fita, { custo: 4, embalagem: 1, pesoKg: 0.3, comp: 20, larg: 10, alt: 5, meta: 8000, detalhes: 'PVC' });
  r = resFalsa();
  await config({ method: 'POST', headers: H, body: { acao: 'fretes', fretes: { mercadolivre: [[1, 25], [0.5, 20], ['x', 1]] } } }, r, { armazem: arm });
  assert.deepStrictEqual(r.body.fretes.mercadolivre, [[0.5, 20], [1, 25]]);
  assert.ok(r.body.fretes.amazon.length > 3);
});
