// Chamado pela Vercel toda semana (vercel.json -> crons): refaz a pesquisa das palavras vigiadas
// e anota um ponto novo na série de cada uma. Autorização: Bearer CRON_SECRET (a Vercel manda sozinha).
'use strict';
const armazem = require('../lib/armazem');
const { pesquisar } = require('./pesquisa');

async function handler(req, res, deps = {}) {
  const arm = deps.armazem || armazem.padrao();
  res.setHeader('Cache-Control', 'no-store');
  const segredo = process.env.CRON_SECRET || '';
  if (!segredo || String(req.headers.authorization || '') !== 'Bearer ' + segredo) return res.status(401).json({ erro: 'não autorizado' });
  const chave = process.env.SERPER_API_KEY;
  if (!chave || !arm.ativo) return res.status(500).json({ erro: 'Falta SERPER_API_KEY ou o armazenamento.' });

  const vigiadas = ((await arm.config()).vigiadas || []).slice(0, 15);
  const feitos = [], falhas = [];
  // 3 de cada vez: cabe no tempo da função e não estoura o Serper
  for (let i = 0; i < vigiadas.length; i += 3) {
    await Promise.all(vigiadas.slice(i, i + 3).map(async v => {
      try {
        const d = await pesquisar(v.termo, chave, deps.fetch || fetch);
        await arm.salvar(d); await arm.anotarSerie(d);
        feitos.push(v.termo);
      } catch (e) { falhas.push({ termo: v.termo, erro: e.message }); }
    }));
  }
  return res.status(200).json({ ok: true, feitos, falhas });
}

module.exports = handler;
