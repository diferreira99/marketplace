'use strict';
const test = require('node:test');
const assert = require('node:assert');
const meus = require('../lib/meus');
const Ideias = require('../lib/ideias');
const { criar } = require('../lib/armazem');

const d = { termo: 'fita espelho', marketplaces: {
  mercadolivre: { itens: [
    { titulo: 'Líder', link: 'https://produto.mercadolivre.com.br/MLB-1111111111-lider', preco: 20, vendidos: 5000, nota: 4.8, avaliacoes: 900, anuncio: true },
    { titulo: 'Meu anúncio', link: 'https://produto.mercadolivre.com.br/MLB-2222222222-meu-_JM?x=1', preco: 25, vendidos: 100, nota: 4.5, avaliacoes: 30, anuncio: true }] },
  shopee: { itens: [] }, amazon: { itens: [] } }, shopping: { itens: [] } };

test('meus anúncios: mesmo anúncio com link diferente, posição e quem está na frente', () => {
  assert.strictEqual(meus.chaveLink('https://www.mercadolivre.com.br/p/MLB2222222222?a=1'), 'MLB2222222222');
  assert.deepStrictEqual(meus.limparLinks(['https://produto.mercadolivre.com.br/MLB-2222222222-a', 'https://produto.mercadolivre.com.br/MLB-2222222222-b', 'http://x.com', 'lixo']).length, 1);
  const p = meus.posicoes(d, ['https://produto.mercadolivre.com.br/MLB-2222222222-outro-nome']);
  assert.strictEqual(p.length, 1); assert.deepStrictEqual([p[0].posicao, p[0].total], [2, 2]); assert.strictEqual(p[0].frente[0].titulo, 'Líder');
});

function blobFalso() {
  const dados = new Map(); let n = 0;
  return { __teste: true, async get(c) { if (!dados.has(c)) return null; const x = dados.get(c); return { statusCode: 200, stream: new Response(x.corpo).body, blob: { etag: x.etag } }; },
    async put(c, corpo, op) { const a = dados.get(c); if (op && op.ifMatch && (!a || a.etag !== op.ifMatch)) throw new Error('Precondition failed'); dados.set(c, { corpo, etag: 'e' + (++n) }); }, async del(c) { dados.delete(c); } };
}
test('meus anúncios: anota uma posição por dia, por pesquisa', async () => {
  const arm = criar(blobFalso()), links = ['https://produto.mercadolivre.com.br/MLB-2222222222-meu'];
  await meus.anotar(arm, d, links); await meus.anotar(arm, d, links);
  const o = await arm.lerArquivo(meus.ARQ);
  assert.strictEqual(o['fita-espelho'].pontos.length, 1); assert.strictEqual(o['fita-espelho'].pontos[0].itens[0].posicao, 2);
  assert.strictEqual(await meus.anotar(arm, d, []), null);
});

test('ideias: kit por tamanho, caixa profissional e versão reforçada, com o porquê', () => {
  const aval = { temas: [{ tema: 'Não cola / descola', vezes: 5 }], reclameAqui: { temas: [{ tema: 'Fita fina ou fraca', vezes: 2 }] },
    perguntas: { temas: [{ tema: 'Quanto peso aguenta', vezes: 4 }, { tema: 'Preço para atacado', vezes: 3 }] },
    perfil: { usos: [{ nome: 'Espelho ou vidro', vezes: 6 }], quem: [{ nome: 'Profissional (instalador, vidraceiro, marceneiro)', vezes: 3 }] },
    ia: { ideiasProduto: [{ ideia: 'Kit camarim', porque: 'pedem para espelho de camarim' }] } };
  const l = Ideias.gerar(aval);
  assert.strictEqual(l[0].fonte, 'ia');
  const nomes = l.map(x => x.ideia);
  ['Kit pronto por tamanho de espelho', 'Caixa profissional (10, 20 ou 30 rolos)', 'Versão reforçada (alta adesão)'].forEach(n => assert.ok(nomes.includes(n), n));
  assert.ok(!nomes.includes('Linha para banheiro (resistente à umidade)'));
  assert.match(l.find(x => x.ideia.startsWith('Kit pronto')).porque, /4× "quanto peso aguenta"/);
  assert.deepStrictEqual(Ideias.gerar(null), []);
});
