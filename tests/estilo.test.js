'use strict';
// Uma chave "{" sem fechar no CSS faz todo o resto do arquivo valer só dentro de uma regra (ex.: só no celular).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('estilo.css: chaves abrem e fecham certinho', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'estilo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let d = 0, linha = 1, abertaEm = [];
  for (const c of s) {
    if (c === '\n') linha++;
    if (c === '{') { d++; abertaEm.push(linha); }
    if (c === '}') { d--; abertaEm.pop(); assert.ok(d >= 0, '} sobrando na linha ' + linha); }
  }
  assert.strictEqual(d, 0, '{ sem fechar (aberta na linha ' + abertaEm[abertaEm.length - 1] + ')');
});
