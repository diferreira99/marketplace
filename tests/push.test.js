'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { criar } = require('../lib/armazem');
const push = require('../lib/push');
const config = require('../api/config');

function blobFalso() {
  const dados = new Map(); let n = 0;
  return { __teste: true, async get(c) { if (!dados.has(c)) return null; const d = dados.get(c); return { statusCode: 200, stream: new Response(d.corpo).body, blob: { etag: d.etag } }; },
    async put(c, corpo, op) { const a = dados.get(c); if (op && op.ifMatch && (!a || a.etag !== op.ifMatch)) throw new Error('Precondition failed'); dados.set(c, { corpo, etag: 'e' + (++n) }); }, async del(c) { dados.delete(c); } };
}
const res = () => { const r = { code: 0, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
const H = { 'x-senha': 'segredo-teste' };
process.env.PAINEL_SENHA = 'segredo-teste';

function webpushFalso() {
  const w = { gerou: 0, enviados: [], mortos: new Set() };
  w.generateVAPIDKeys = () => { w.gerou++; return { publicKey: 'PUB' + w.gerou, privateKey: 'PRIV' + w.gerou }; };
  w.sendNotification = async (sub, corpo, op) => { if (w.mortos.has(sub.endpoint)) { const e = new Error('gone'); e.statusCode = 410; throw e; } w.enviados.push({ sub: sub.endpoint, corpo: JSON.parse(corpo), chave: op.vapidDetails.publicKey }); };
  return w;
}
const sub = id => ({ endpoint: 'https://push.exemplo/' + id, keys: { p256dh: 'p' + id, auth: 'a' + id } });

test('chaves criadas uma vez só; inscrever, testar e tirar aparelho que não existe mais', async () => {
  const arm = criar(blobFalso()), w = webpushFalso();
  let r = res(); await config({ method: 'GET', headers: H, query: { push: '1' } }, r, { armazem: arm, webpush: w });
  const pub = r.body.publicKey; assert.ok(pub);
  r = res(); await config({ method: 'GET', headers: H, query: { push: '1' } }, r, { armazem: arm, webpush: w });
  assert.strictEqual(r.body.publicKey, pub); assert.strictEqual(w.gerou, 1);
  for (const id of [1, 2]) { r = res(); await config({ method: 'POST', headers: H, query: {}, body: { acao: 'push-inscrever', inscricao: sub(id), aparelho: 'Android' } }, r, { armazem: arm, webpush: w }); assert.strictEqual(r.body.ok, true); }
  r = res(); await config({ method: 'POST', headers: H, query: {}, body: { acao: 'push-inscrever', inscricao: { endpoint: 'http://inseguro' } } }, r, { armazem: arm, webpush: w });
  assert.strictEqual(r.code, 400);
  w.mortos.add('https://push.exemplo/2');
  r = res(); await config({ method: 'POST', headers: H, query: {}, body: { acao: 'push-teste' } }, r, { armazem: arm, webpush: w });
  assert.deepStrictEqual([r.body.enviados, r.body.aparelhos, r.body.removidos], [1, 2, 1]);
  assert.strictEqual(w.enviados[0].chave, pub);
  assert.strictEqual(((await arm.lerArquivo('push/inscricoes.json')) || []).length, 1);
});

test('uma notificação só, priorizando concorrente que baixou o preço', () => {
  assert.strictEqual(push.avisoDosAlertas([{ tipo: 'nota-subiu', msg: 'x' }]), null);
  const a = push.avisoDosAlertas([{ tipo: 'preco-caiu', msg: 'Preço caiu' }, { tipo: 'concorrente-baixou', msg: 'Concorrente "Fita X" baixou o preço 12%' }, { tipo: 'concorrencia', msg: 'Entrou concorrência' }]);
  assert.strictEqual(a.titulo, '⚠️ Concorrente baixou o preço'); assert.match(a.texto, /Fita X.*\(\+2 avisos\)/);
});
