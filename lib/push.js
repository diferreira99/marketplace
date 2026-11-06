// 🔔 Avisos no celular (Web Push). As chaves VAPID são criadas pelo próprio servidor na primeira vez
// e ficam no armazenamento privado do Radar (não passam por variável de ambiente nem pelo código).
'use strict';

const ARQ_CHAVES = 'push/vapid.json';
const ARQ_INSCRICOES = 'push/inscricoes.json';
const ASSUNTO = 'https://radar-marketplace-rho.vercel.app';
// quais alertas merecem notificação (o resto fica só no painel)
const IMPORTANTES = new Set(['concorrente-baixou', 'preco-caiu', 'concorrencia', 'concorrente-vendeu']);

async function chaves(arm, webpush) {
  let k = await arm.lerArquivo(ARQ_CHAVES);
  if (k && k.publicKey && k.privateKey) return k;
  const novas = webpush.generateVAPIDKeys();
  // se duas pessoas ativarem ao mesmo tempo, vale a primeira gravada
  k = await arm.mudarArquivo(ARQ_CHAVES, atual => (atual && atual.publicKey ? atual : { ...novas, criadoEm: new Date().toISOString() }));
  return k && k.publicKey ? k : await arm.lerArquivo(ARQ_CHAVES);
}

function validar(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000) return null;
  const k = sub.keys || {};
  if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return null;
  return { endpoint: sub.endpoint, keys: { p256dh: k.p256dh.slice(0, 200), auth: k.auth.slice(0, 100) } };
}

async function inscrever(arm, sub, aparelho) {
  const s = validar(sub); if (!s) { const e = new Error('Inscrição inválida.'); e.status = 400; throw e; }
  await arm.mudarArquivo(ARQ_INSCRICOES, l => [{ ...s, aparelho: String(aparelho || '').slice(0, 80), desde: new Date().toISOString() }]
    .concat((Array.isArray(l) ? l : []).filter(x => x.endpoint !== s.endpoint)).slice(0, 30));
  return true;
}
async function sair(arm, endpoint) {
  await arm.mudarArquivo(ARQ_INSCRICOES, l => (Array.isArray(l) ? l : []).filter(x => x.endpoint !== endpoint));
}

// Manda para todos os aparelhos inscritos; tira da lista os que não existem mais (404/410).
async function enviar(arm, webpush, aviso) {
  const lista = (await arm.lerArquivo(ARQ_INSCRICOES)) || [];
  if (!lista.length) return { enviados: 0, aparelhos: 0 };
  const k = await chaves(arm, webpush);
  const corpo = JSON.stringify({ titulo: aviso.titulo || '📡 Radar Marketplace', texto: aviso.texto || '', url: aviso.url || '/#vigiadas', tag: aviso.tag || 'radar' });
  const mortos = []; let enviados = 0;
  await Promise.all(lista.map(async s => {
    try { await webpush.sendNotification(s, corpo, { vapidDetails: { subject: ASSUNTO, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 24 * 3600 }); enviados++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) mortos.push(s.endpoint); }
  }));
  if (mortos.length) await arm.mudarArquivo(ARQ_INSCRICOES, l => (Array.isArray(l) ? l : []).filter(x => !mortos.includes(x.endpoint)));
  return { enviados, aparelhos: lista.length, removidos: mortos.length };
}

// Uma notificação só com os alertas importantes da checagem (não manda 10 avisos seguidos)
function avisoDosAlertas(alertas) {
  const imp = (alertas || []).filter(a => IMPORTANTES.has(a.tipo));
  if (!imp.length) return null;
  const baixou = imp.find(a => a.tipo === 'concorrente-baixou');
  const prim = baixou || imp[0];
  return {
    titulo: baixou ? '⚠️ Concorrente baixou o preço' : '📡 Mudou algo no seu mercado',
    texto: prim.msg + (imp.length > 1 ? ` (+${imp.length - 1} aviso${imp.length > 2 ? 's' : ''})` : ''),
    url: '/#vigiadas', tag: 'radar-alertas',
  };
}

module.exports = { chaves, inscrever, sair, enviar, avisoDosAlertas, validar, IMPORTANTES };
