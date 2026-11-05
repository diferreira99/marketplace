// Chamado pela Vercel toda semana (vercel.json -> crons): refaz a pesquisa das palavras vigiadas,
// checa os anúncios dos concorrentes, gera os alertas do que mudou e (se configurado) avisa no webhook.
// Autorização: Bearer CRON_SECRET (a Vercel manda sozinha).
'use strict';
const armazem = require('../lib/armazem');
const { pesquisar } = require('./pesquisa');
const concorrentes = require('./concorrentes');
const { alertasVigiada, alertasConcorrente } = require('../lib/alertas');

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  const fetcher = deps.fetch || fetch;
  res.setHeader('Cache-Control', 'no-store');
  const segredo = process.env.CRON_SECRET || '';
  if (!segredo || String(req.headers.authorization || '') !== 'Bearer ' + segredo) return res.status(401).json({ erro: 'não autorizado' });
  const chave = process.env.SERPER_API_KEY;
  if (!chave || !arm.ativo) return res.status(500).json({ erro: 'Falta SERPER_API_KEY ou o armazenamento.' });

  const vigiadas = ((await arm.config()).vigiadas || []).slice(0, 15);
  const feitos = [], falhas = [], novos = [];
  // 3 de cada vez: cabe no tempo da função e não estoura o Serper
  for (let i = 0; i < vigiadas.length; i += 3) {
    await Promise.all(vigiadas.slice(i, i + 3).map(async v => {
      try {
        const d = await pesquisar(v.termo, chave, fetcher);
        await arm.salvar(d); await arm.anotarSerie(d);
        novos.push(...alertasVigiada(v.termo, await arm.serie(v.termo)));
        feitos.push(v.termo);
      } catch (e) { falhas.push({ termo: v.termo, erro: e.message }); }
    }));
  }
  const lista = ((await arm.lerArquivo(concorrentes.LISTA)) || []).slice(0, 20);
  for (let i = 0; i < lista.length; i += 4) {
    await Promise.all(lista.slice(i, i + 4).map(async c => {
      try {
        await concorrentes.checar(arm, c, chave, fetcher);
        novos.push(...alertasConcorrente(c.apelido || c.link, (await arm.lerArquivo(concorrentes.serieDe(c.id))) || []));
        feitos.push(c.apelido || c.link);
      } catch (e) { falhas.push({ termo: c.apelido || c.link, erro: e.message }); }
    }));
  }
  const em = new Date().toISOString();
  const alertas = novos.map(a => ({ ...a, em }));
  if (alertas.length) await arm.mudarArquivo('alertas.json', l => alertas.concat(Array.isArray(l) ? l : []).slice(0, 100));
  // aviso para fora (n8n, Zapier, Make...): o webhook recebe a lista e manda por WhatsApp/e-mail
  let avisado = false;
  if (alertas.length && process.env.ALERTA_WEBHOOK_URL) {
    try {
      const r = await fetcher(process.env.ALERTA_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem: 'radar-marketplace', em, alertas, texto: '📡 Radar Marketplace\n' + alertas.map(a => '• ' + a.msg).join('\n') }) });
      avisado = r.ok;
    } catch (e) { avisado = false; }
  }
  return res.status(200).json({ ok: true, feitos, falhas, alertas: alertas.length, avisado });
}

module.exports = handler;
