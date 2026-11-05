'use strict';
// Senha do painel (PAINEL_SENHA) no cabeçalho x-senha. Sem senha configurada, ninguém usa (protege os créditos).
function senhaOk(req) {
  const esperada = process.env.PAINEL_SENHA || '';
  if (!esperada) return false;
  const dada = String((req.headers && req.headers['x-senha']) || '');
  if (dada.length !== esperada.length) return false;
  let d = 0;
  for (let i = 0; i < dada.length; i++) d |= dada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return d === 0;
}

// Responde 500/401 e devolve false quando não pode seguir.
function exigirSenha(req, res) {
  if (!process.env.PAINEL_SENHA) { res.status(500).json({ erro: 'Falta configurar PAINEL_SENHA na Vercel.' }); return false; }
  if (!senhaOk(req)) { res.status(401).json({ erro: 'Senha incorreta.' }); return false; }
  return true;
}

module.exports = { senhaOk, exigirSenha };
