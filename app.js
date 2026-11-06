(function () {
'use strict';
// ───────────────────────── utilidades ─────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => v == null || !isFinite(v) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = v => v == null || !isFinite(v) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const num = v => v == null ? '—' : Number(v).toLocaleString('pt-BR');
const pct = v => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const dataBR = s => s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
const slug = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const NIVEL = { validado: { nome: 'Validado', ic: '✔', cor: 'var(--ok)' }, nicho: { nome: 'Nicho', ic: '◐', cor: 'var(--warn)' }, fraco: { nome: 'Fraco', ic: '✖', cor: 'var(--bad)' } };
const nivelTag = n => '<span class="nivel ' + n + '">' + NIVEL[n].ic + ' ' + NIVEL[n].nome + '</span>';
const CANAIS = {
  mercadolivre: { nome: 'Mercado Livre', dominio: 'mercadolivre.com.br', cor: 'var(--s1)', cls: 'ml' },
  shopee: { nome: 'Shopee', dominio: 'shopee.com.br', cor: 'var(--s2)', cls: 'sp' },
  amazon: { nome: 'Amazon', dominio: 'amazon.com.br', cor: 'var(--s3)', cls: 'az' },
};
const logo = (mp, g) => '<img class="logo-mp' + (g ? ' g' : '') + '" alt="' + esc(CANAIS[mp].nome) + '" src="https://www.google.com/s2/favicons?domain=' + CANAIS[mp].dominio + '&sz=64" onerror="this.style.display=\'none\'">';
const canalDaTaxa = id => id.startsWith('mercadolivre') ? 'mercadolivre' : id;

const S = { hist: ls.get('radar_hist', []), cfg: null, nuvem: false, atual: null, series: {} };

// ───────────────────────── API ─────────────────────────
function senha() { return ls.get('radar_senha', ''); }
async function api(caminho, op) {
  const r = await fetch(caminho, Object.assign({}, op, { headers: Object.assign({ 'Content-Type': 'application/json', 'x-senha': senha() }, (op && op.headers) || {}) }));
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { ls.del('radar_senha'); mostrarLogin(true); throw new Error('Senha incorreta. Entre de novo.'); }
  if (!r.ok) { const e = new Error(d.erro || ('Erro ' + r.status)); e.status = r.status; throw e; }
  return d;
}
function erro(m) { $('#msg').innerHTML = m ? '<div class="erro">' + esc(m) + '</div>' : ''; }

// ───────────────────────── dica (tooltip) ─────────────────────────
const tip = $('#tip');
function mostrarDica(e, txt) {
  tip.innerHTML = txt; tip.classList.add('on');
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
document.addEventListener('mousemove', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) mostrarDica(e, t.getAttribute('data-tip')); else tip.classList.remove('on'); });
document.addEventListener('touchstart', e => { const t = e.target.closest && e.target.closest('[data-tip]'); const p = e.touches[0]; if (t && p) mostrarDica({ clientX: p.clientX, clientY: p.clientY }, t.getAttribute('data-tip')); else tip.classList.remove('on'); }, { passive: true });

// ───────────────────────── gráficos (SVG) ─────────────────────────
// Barras horizontais: uma série, rótulo à esquerda, valor na ponta. Alvo de clique = a linha inteira.
function barrasH(itens, o = {}) {
  if (!itens.length) return '<div class="vazio">Sem dados ainda.</div>';
  const max = o.max || Math.max(...itens.map(i => i.valor), 1);
  const fmt = o.formato || num;
  return '<div class="hbar" role="list" aria-label="' + esc(o.titulo || '') + '">' + itens.map(it =>
    '<div class="hbar-l' + (it.termo ? ' clic' : '') + '" role="listitem" data-tip="' + esc(it.dica || (it.rotulo + ': ' + fmt(it.valor))) + '"' + (it.termo ? ' data-abrir="' + esc(it.termo) + '"' : '') + '>' +
      '<span class="hbar-r">' + esc(it.rotulo) + '</span>' +
      '<span class="hbar-t"><span class="hbar-b" style="width:' + Math.max(1.5, Math.max(0, it.valor) / max * 100) + '%;background:' + (it.cor || 'var(--brand)') + '"></span><span class="hbar-v">' + esc(fmt(it.valor)) + '</span></span></div>').join('') + '</div>';
}
// Colunas (histograma de preços)
function colunas(faixas) {
  if (!faixas || !faixas.length) return '<div class="vazio">Poucos preços para montar a distribuição.</div>';
  const max = Math.max(...faixas.map(f => f.qtd), 1);
  return '<div class="cols">' + faixas.map(f => '<div class="col" data-tip="' + esc(brl(f.de) + ' a ' + brl(f.ate) + ': ' + f.qtd + ' preço(s)') + '">' +
    (f.qtd ? '<span class="col-v">' + f.qtd + '</span><span class="col-b" style="height:' + Math.max(4, f.qtd / max * 100) + '%"></span>' : '') + '</div>').join('') + '</div>' +
    '<div class="eixo"><span>' + esc(brl(faixas[0].de)) + '</span><span>' + esc(brl(faixas[faixas.length - 1].ate)) + '</span></div>';
}
// Dispersão preço × nota (uma série; cada ponto abre a pesquisa)
function dispersao(itens) {
  const pts = itens.filter(i => i.precoMediano > 0);
  if (pts.length < 2) return '<div class="vazio">Pesquise pelo menos 2 produtos para ver o mapa.</div>';
  const L = 600, H = 260, e = 40, b = 28, t = 12, d = 14;
  const xs = pts.map(p => p.precoMediano), xmin = Math.min(...xs), xmax = Math.max(...xs);
  const X = v => e + (xmax === xmin ? 0.5 : (v - xmin) / (xmax - xmin)) * (L - e - d);
  const Y = v => t + (1 - v / 100) * (H - t - b);
  let s = '<svg class="graf" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="Preço contra nota">';
  [0, 40, 65, 100].forEach(v => { s += '<line class="grade" x1="' + e + '" x2="' + (L - d) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (e - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
  s += '<text x="' + e + '" y="' + (H - 6) + '">' + esc(brl0(xmin)) + '</text><text x="' + (L - d) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(brl0(xmax)) + '</text><text x="' + (L / 2) + '" y="' + (H - 6) + '" text-anchor="middle">preço mais comum →</text>';
  pts.forEach(p => {
    s += '<g class="alvo" data-abrir="' + esc(p.termo) + '" data-tip="' + esc('<b>' + p.termo + '</b><br>Nota ' + p.nota + ' · ' + brl(p.precoMediano)) + '"><circle cx="' + X(p.precoMediano) + '" cy="' + Y(p.nota) + '" r="13" fill="transparent"/>' +
      '<circle cx="' + X(p.precoMediano) + '" cy="' + Y(p.nota) + '" r="6" fill="' + NIVEL[p.nivel].cor + '" stroke="var(--card)" stroke-width="2"/></g>';
  });
  return s + '</svg>';
}
// Linha no tempo (uma medida) com pontos que mostram o valor
function linha(pontos, campo, fmt) {
  const p = pontos.filter(x => x[campo] != null);
  if (p.length < 2) return '<div class="vazio">' + (p.length ? 'Primeiro ponto anotado em ' + dataBR(p[0].em) + '. A curva aparece a partir da próxima checagem.' : 'Sem histórico ainda.') + '</div>';
  const L = 600, H = 180, e = 64, b = 24, t = 10, d = 12;
  const vs = p.map(x => x[campo]), min = Math.min(...vs), max = Math.max(...vs), pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;
  const lo = min - pad, hi = max + pad;
  const X = i => e + i / (p.length - 1) * (L - e - d), Y = v => t + (1 - (v - lo) / (hi - lo)) * (H - t - b);
  let s = '<svg class="graf" viewBox="0 0 ' + L + ' ' + H + '">';
  [lo, (lo + hi) / 2, hi].forEach(v => { s += '<line class="grade" x1="' + e + '" x2="' + (L - d) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (e - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + esc(fmt(v)) + '</text>'; });
  s += '<polyline fill="none" stroke="var(--brand)" stroke-width="2" points="' + p.map((x, i) => X(i) + ',' + Y(x[campo])).join(' ') + '"/>';
  p.forEach((x, i) => { s += '<g class="alvo" data-tip="' + esc(dataBR(x.em) + ': ' + fmt(x[campo])) + '"><circle cx="' + X(i) + '" cy="' + Y(x[campo]) + '" r="14" fill="transparent"/><circle cx="' + X(i) + '" cy="' + Y(x[campo]) + '" r="5" fill="var(--brand)" stroke="var(--card)" stroke-width="2"/></g>'; });
  s += '<text x="' + e + '" y="' + (H - 4) + '">' + dataBR(p[0].em) + '</text><text x="' + (L - d) + '" y="' + (H - 4) + '" text-anchor="end">' + dataBR(p[p.length - 1].em) + '</text>';
  return s + '</svg>';
}
function sparkline(pontos, campo) {
  const p = pontos.filter(x => x[campo] != null);
  if (p.length < 2) return '<span class="muted small">—</span>';
  const W = 120, H = 32, vs = p.map(x => x[campo]), min = Math.min(...vs), max = Math.max(...vs);
  const pts = p.map((x, i) => (i / (p.length - 1) * (W - 4) + 2) + ',' + (H - 3 - (max === min ? 0.5 : (x[campo] - min) / (max - min)) * (H - 6))).join(' ');
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><polyline fill="none" stroke="var(--brand)" stroke-width="2" points="' + pts + '"/></svg>';
}
function gauge(nota, nivel) {
  const a = Math.max(0, Math.min(100, nota)) / 100, R = 70, C = 2 * Math.PI * R * 0.75;
  return '<svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="Nota ' + nota + ' de 100"><g transform="rotate(135 85 85)">' +
    '<circle cx="85" cy="85" r="' + R + '" fill="none" stroke="var(--line)" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + C + ' 999"/>' +
    '<circle cx="85" cy="85" r="' + R + '" fill="none" stroke="' + NIVEL[nivel].cor + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (C * a) + ' 999"/></g>' +
    '<text x="85" y="92" text-anchor="middle" font-size="40" font-weight="800" fill="currentColor">' + nota + '</text>' +
    '<text x="85" y="116" text-anchor="middle" font-size="12" fill="var(--muted)">de 100</text></svg>';
}
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-abrir]'); if (a) abrir(a.getAttribute('data-abrir')); });

// ───────────────────────── login, tema, navegação ─────────────────────────
const tema = ls.get('radar_tema', null); if (tema) document.documentElement.dataset.theme = tema;
$('#tema').onclick = () => {
  const escuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = escuro ? 'light' : 'dark'; ls.set('radar_tema', document.documentElement.dataset.theme);
};
function mostrarLogin(sim) { $('#login').classList.toggle('hidden', !sim); $('#app').classList.toggle('hidden', sim); if (sim) setTimeout(() => $('#senha').focus(), 50); }
$('#entrar').onclick = () => { const s = $('#senha').value.trim(); if (!s) return; ls.set('radar_senha', s); mostrarLogin(false); carregar(); primeiraVez(); };
$('#senha').onkeydown = e => { if (e.key === 'Enter') $('#entrar').click(); };
$('#sair').onclick = () => { ls.del('radar_senha'); $('#senha').value = ''; mostrarLogin(true); };
$('#logos-lado').innerHTML = Object.keys(CANAIS).map(k => logo(k, true)).join('');

let abaAtual = 'painel';
function irPara(aba) {
  abaAtual = aba;
  $$('#nav button').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
  $$('.aba').forEach(s => s.classList.toggle('hidden', s.id !== 'aba-' + aba));
  erro('');
  ({ painel: pintarPainel, lote: pintarLote, vigiadas: pintarVigiadas, taxas: pintarTaxas, catalogo: pintarCatalogo, loja: pintarLoja, calendario: pintarCalendario, trilha: pintarTrilha, simulador: pintarSimulador, pesquisar: () => {} })[aba]();
  window.scrollTo({ top: 0 });
}
$$('#nav button').forEach(b => b.onclick = () => irPara(b.dataset.aba));

async function carregar() {
  if (!senha()) return;
  pintarPainel();
  try {
    const [h, c] = await Promise.all([api('/api/historico'), api('/api/config')]);
    S.nuvem = !!h.nuvem; if (S.nuvem) { S.hist = h.itens || []; ls.set('radar_hist', S.hist); }
    S.cfg = c;
  } catch (e) { erro(e.message); }
  if (abaAtual === 'painel') pintarPainel();
  if (abaAtual === 'vigiadas') pintarVigiadas();
  if (abaAtual === 'taxas') pintarTaxas();
  if (abaAtual === 'trilha') pintarTrilha();
  if (abaAtual === 'simulador') pintarSimulador();
  atualizarSeloTrilha();
}
function cfg() { return S.cfg || { imposto: Margem.PADRAO.imposto, margemAlvo: Margem.PADRAO.margemAlvo, taxas: Margem.TAXAS_PADRAO, custos: {}, vigiadas: [] }; }
function vigiada(termo) { return (cfg().vigiadas || []).some(v => v.chave === slug(termo)); }

// ───────────────────────── 📊 PAINEL ─────────────────────────
function pintarPainel() {
  const h = S.hist, box = $('#aba-painel');
  if (!h.length) { box.innerHTML = '<div class="estado"><h1>Bem-vindo ao Radar 📡</h1><p class="muted">Faça a primeira pesquisa lá em cima. O painel do time se monta sozinho.</p></div>'; return; }
  const cont = { validado: 0, nicho: 0, fraco: 0 }; h.forEach(x => cont[x.nivel] = (cont[x.nivel] || 0) + 1);
  const media = Math.round(h.reduce((a, x) => a + x.nota, 0) / h.length);
  const ultimos7 = h.filter(x => x.em && Date.now() - new Date(x.em) < 7 * 864e5).length;
  const melhor = h.slice().sort((a, b) => b.nota - a.nota)[0];
  const tot = { mercadolivre: 0, shopee: 0, amazon: 0 }; h.forEach(x => { tot.mercadolivre += x.ml || 0; tot.shopee += x.shopee || 0; tot.amazon += x.amazon || 0; });
  const vig = cfg().vigiadas || [];
  const top = h.slice().sort((a, b) => b.nota - a.nota).slice(0, 10);
  const totNivel = h.length;
  box.innerHTML =
    '<h1 class="titulo-aba">Painel do time</h1><p class="sub-aba">' + (S.nuvem ? '☁️ Todas as pesquisas do time, na nuvem.' : 'Pesquisas salvas neste navegador.') + '</p>' +
    '<div class="grid g4">' +
      '<div class="kpi"><div class="ic">🔎</div><div class="l">Pesquisas</div><div class="v">' + h.length + '</div><div class="d">' + ultimos7 + ' nos últimos 7 dias</div></div>' +
      '<div class="kpi"><div class="ic">✔</div><div class="l">Validados</div><div class="v">' + cont.validado + '</div><div class="d">' + pct(cont.validado / h.length * 100) + ' das pesquisas</div></div>' +
      '<div class="kpi"><div class="ic">⭐</div><div class="l">Nota média</div><div class="v">' + media + '</div><div class="d">Melhor: ' + esc(melhor.termo) + ' (' + melhor.nota + ')</div></div>' +
      '<div class="kpi"><div class="ic">🔔</div><div class="l">Vigiadas</div><div class="v">' + vig.length + '</div><div class="d">checadas toda segunda</div></div>' +
    '</div>' +
    '<div class="card" style="margin-top:14px" id="painel-alertas"></div>' +
    '<div class="grid g2">' +
      '<div class="card"><h2>🏆 Melhores produtos <span class="tag">nota de 0 a 100 · toque para abrir</span></h2>' +
        barrasH(top.map(x => ({ rotulo: x.termo, valor: x.nota, termo: x.termo, cor: 'var(--brand)', dica: '<b>' + esc(x.termo) + '</b><br>Nota ' + x.nota + ' · ' + NIVEL[x.nivel].nome + '<br>Preço comum ' + brl(x.precoMediano) })), { max: 100, titulo: 'Melhores produtos' }) + '</div>' +
      '<div class="card"><h2>🗺️ Preço × nota <span class="tag">cada ponto é um produto</span></h2>' +
        '<div class="legenda">' + Object.keys(NIVEL).map(n => '<span><i style="background:' + NIVEL[n].cor + '"></i>' + NIVEL[n].ic + ' ' + NIVEL[n].nome + '</span>').join('') + '</div>' + dispersao(h) + '</div>' +
    '</div>' +
    '<div class="grid g2">' +
      '<div class="card"><h2>📶 Como estão as ideias <span class="tag">' + totNivel + ' produtos</span></h2>' +
        '<div class="barra-empilhada">' + Object.keys(NIVEL).filter(n => cont[n]).map(n => '<div style="flex:' + cont[n] + ';background:' + NIVEL[n].cor + '" data-tip="' + NIVEL[n].nome + ': ' + cont[n] + '"></div>').join('') + '</div>' +
        '<div class="legenda" style="margin-top:10px">' + Object.keys(NIVEL).map(n => '<span><i style="background:' + NIVEL[n].cor + '"></i>' + NIVEL[n].ic + ' ' + NIVEL[n].nome + ': <b>' + (cont[n] || 0) + '</b> (' + pct((cont[n] || 0) / totNivel * 100) + ')</span>').join('') + '</div>' +
        '<h2 style="margin-top:18px">🛒 Anúncios encontrados por canal</h2>' +
        barrasH(Object.keys(CANAIS).map(k => ({ rotulo: CANAIS[k].nome, valor: tot[k], cor: CANAIS[k].cor })), { esq: 180 }) +
      '</div>' +
      '<div class="card"><h2>🔔 Vigiadas <span class="tag"><a href="#" id="ir-vig">ver todas</a></span></h2><div id="painel-vig">' +
        (vig.length ? '<div class="vazio"><span class="carregando"></span>carregando…</div>' : '<div class="vazio">Nenhuma palavra vigiada. Abra uma pesquisa e toque em <b>🔔 Vigiar</b>.</div>') + '</div></div>' +
    '</div>' +
    '<div class="card" style="margin-top:14px"><h2>📋 Todas as pesquisas <span class="tag">toque numa linha para abrir</span></h2>' + tabelaPesquisas(h) + '</div>';
  const iv = $('#ir-vig'); if (iv) iv.onclick = e => { e.preventDefault(); irPara('vigiadas'); };
  pintarAlertas('#painel-alertas', 5);
  if (vig.length) carregarSeries(vig).then(() => { const b = $('#painel-vig'); if (b) b.innerHTML = listaVigiadas(vig.slice(0, 6), true); });
}
function tabelaPesquisas(h) {
  return '<div class="tabela-wrap"><table><thead><tr><th>Produto</th><th>Nível</th><th class="num">Nota</th><th class="num">Preço comum</th><th class="num">' + logo('mercadolivre') + '</th><th class="num">' + logo('shopee') + '</th><th class="num">' + logo('amazon') + '</th><th class="num">Lojas</th><th>Concorrência</th><th class="num">Data</th></tr></thead><tbody>' +
    h.slice().sort((a, b) => String(b.em).localeCompare(String(a.em))).map(x => '<tr class="clic" data-abrir="' + esc(x.termo) + '"><td><b>' + esc(x.termo) + '</b>' + (vigiada(x.termo) ? ' 🔔' : '') + '</td><td>' + nivelTag(x.nivel) + '</td><td class="num"><b>' + x.nota + '</b></td><td class="num">' + brl(x.precoMediano) + '</td><td class="num">' + (x.ml ?? '—') + '</td><td class="num">' + (x.shopee ?? '—') + '</td><td class="num">' + (x.amazon ?? '—') + '</td><td class="num">' + (x.lojas ?? '—') + '</td><td>' + esc(x.concorrencia || '—') + '</td><td class="num">' + dataBR(x.em) + '</td></tr>').join('') +
    '</tbody></table></div>';
}

// ───────────────────────── 🔎 PESQUISAR ─────────────────────────
let rodando = false;
$('#f').onsubmit = e => { e.preventDefault(); const t = $('#q').value.trim(); if (t) pesquisar(t); };
async function pesquisar(termo, atualizar) {
  if (rodando) return; rodando = true; $('#btn').disabled = true; erro('');
  irPara('pesquisar');
  $('#resultado').innerHTML = '<div class="estado"><span class="carregando"></span> Varrendo Google, Shopping, Mercado Livre, Shopee e Amazon…</div>';
  try {
    const d = await api('/api/pesquisa', { method: 'POST', body: JSON.stringify({ termo, atualizar: !!atualizar }) });
    guardar(d); pintarResultado(d);
  } catch (e) { $('#resultado').innerHTML = ''; erro(e.message); }
  finally { rodando = false; $('#btn').disabled = false; }
}
function resumo(d) {
  const mp = d.marketplaces;
  return { termo: d.termo, chave: slug(d.termo), em: d.geradoEm, nota: d.validacao.nota, nivel: d.validacao.nivel, concorrencia: d.validacao.concorrencia, precoMediano: d.precos.mediana, ml: mp.mercadolivre.anuncios, shopee: mp.shopee.anuncios, amazon: mp.amazon.anuncios, lojas: d.shopping.lojas };
}
function guardar(d) {
  S.hist = [resumo(d)].concat(S.hist.filter(x => slug(x.termo) !== slug(d.termo))).slice(0, 500);
  ls.set('radar_hist', S.hist);
  const c = ls.get('radar_dados', {}); c[slug(d.termo)] = d; const k = Object.keys(c); if (k.length > 25) delete c[k[0]]; ls.set('radar_dados', c);
}
async function abrir(termo) {
  $('#q').value = termo; erro('');
  const local = ls.get('radar_dados', {})[slug(termo)], r = S.hist.find(x => slug(x.termo) === slug(termo));
  if (local && (!r || local.geradoEm >= r.em)) { irPara('pesquisar'); return pintarResultado(local, true); }
  if (S.nuvem) {
    irPara('pesquisar');
    $('#resultado').innerHTML = '<div class="estado"><span class="carregando"></span> Abrindo pesquisa salva…</div>';
    try { const d = await api('/api/historico?termo=' + encodeURIComponent(termo)); guardar(d); return pintarResultado(d, true); }
    catch (e) { if (e.status !== 404) { $('#resultado').innerHTML = ''; return erro(e.message); } }
  }
  pesquisar(termo);
}

function listaMp(m) {
  if (!m.itens.length) return '<div class="vazio">Nenhum resultado desse termo aqui.</div>';
  return '<ul class="lista">' + m.itens.map(i => '<li><a class="t" href="' + esc(i.link) + '" target="_blank" rel="noopener">' + esc(i.titulo || i.link) + '</a><div class="m">' +
    (i.preco != null ? '<span class="preco">' + brl(i.preco) + '</span>' : '') + (i.vendidos != null ? '<span>🔥 ' + num(i.vendidos) + '+ vendidos</span>' : '') +
    (i.nota != null ? '<span>⭐ ' + String(i.nota).replace('.', ',') + (i.avaliacoes ? ' (' + num(i.avaliacoes) + ')' : '') + '</span>' : '') +
    (i.anuncio ? '<span class="badge">anúncio</span>' : '<span class="badge cinza">lista/categoria</span>') + '</div></li>').join('') + '</ul>';
}
function cardMp(k, m) {
  return '<div class="card ' + CANAIS[k].cls + '"><div class="mp-head">' + logo(k, true) + '<span class="n">' + esc(m.nome) + '</span><span class="q">' + m.anuncios + (m.anuncios === 1 ? ' anúncio' : ' anúncios') + '</span></div>' +
    '<div class="mini"><span>Mediana <b>' + brl(m.precos.mediana) + '</b></span><span>Faixa <b>' + (m.precos.min != null ? brl(m.precos.min) + ' – ' + brl(m.precos.max) : '—') + '</b></span>' + (m.maxVendidos ? '<span>Top vendas <b>' + num(m.maxVendidos) + '+</b></span>' : '') + '</div>' + listaMp(m) + '</div>';
}

function pintarResultado(d, salvo) {
  S.atual = d;
  const v = d.validacao, mp = d.marketplaces, s = d.seo;
  const totalAn = mp.mercadolivre.anuncios + mp.shopee.anuncios + mp.amazon.anuncios;
  const dom = l => { try { return new URL(l).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const comFoto = d.shopping.itens.filter(i => i.imagem);
  const vig = vigiada(d.termo);
  $('#resultado').innerHTML =
  '<div class="grid g-hero" style="margin-top:0">' +
    '<div class="card score">' + gauge(v.nota, v.nivel) + nivelTag(v.nivel) +
      '<div class="small muted">“' + esc(d.termo) + '” · concorrência <b>' + esc(v.concorrencia) + '</b></div>' +
      '<div class="acoes"><button type="button" class="' + (vig ? 'pri' : 'sec') + '" id="bt-vigiar">' + (vig ? '🔔 Vigiando' : '🔔 Vigiar') + '</button><button type="button" id="bt-atualizar">↻ Atualizar</button><button type="button" id="bt-compartilhar">🔗 Compartilhar relatório</button></div><div class="small" id="link-relatorio" style="text-align:left"></div>' +
      '<div class="aviso">Pesquisado em ' + new Date(d.geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + (d.doCache ? ' · já estava salvo' : '') + '</div>' +
    '</div>' +
    '<div class="card"><h2>📊 Visão geral</h2><div class="mini-kpis">' +
      '<div><div class="v">' + brl(d.precos.mediana) + '</div><div class="l">Preço mais comum</div></div>' +
      '<div><div class="v">' + brl(d.precos.min) + '</div><div class="l">Menor · até ' + brl(d.precos.max) + '</div></div>' +
      '<div><div class="v">' + totalAn + '</div><div class="l">Anúncios nos 3 canais</div></div>' +
      '<div><div class="v">' + d.shopping.lojas + '</div><div class="l">Lojas no Google Shopping</div></div></div>' +
      '<ul class="motivos">' + v.pontos.map(p => '<li><span class="pt ' + (p.p ? '' : 'zero') + '">+' + p.p + '</span><span>' + esc(p.motivo) + '</span></li>').join('') + '</ul>' +
      (d.dicas.length ? '<ul class="dicas">' + d.dicas.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      ((d.falhas || []).length ? '<div class="aviso">⚠️ Não vieram: ' + d.falhas.map(f => esc(f.fonte)).join(', ') + '</div>' : '') +
    '</div>' +
  '</div>' +
  '<div class="card" style="margin-top:14px" id="card-onde"></div>' +
  '<div class="card" style="margin-top:14px" id="card-margem"></div>' +
  '<div class="card" style="margin-top:14px" id="card-preco"></div>' +
  '<div class="card" style="margin-top:14px" id="card-plano"></div>' +
  '<div class="grid g3">' + cardMp('mercadolivre', mp.mercadolivre) + cardMp('shopee', mp.shopee) + cardMp('amazon', mp.amazon) + '</div>' +
  '<div class="card" style="margin-top:14px" id="card-titulos"><h2>✍️ Anúncio pronto <span class="tag">títulos, descrição, destaques, ficha técnica e respostas</span></h2>' +
    '<label class="small muted" style="display:grid;gap:4px;margin-bottom:8px">Dados do seu produto (marca, material, medidas, cores, o que vem na caixa): a IA usa como verdade e não inventa<textarea id="an-detalhes" style="min-height:70px" placeholder="ex.: marca XYZ, PVC, 22 mm x 20 m, branca e preta, rolo com 1 unidade">' + esc(((cfg().custos || {})[slug(d.termo)] || {}).detalhes || '') + '</textarea></label>' +
    '<button type="button" class="sec" id="bt-titulos">Gerar o anúncio para os 3 canais</button><div id="titulos-saida"></div></div>' +
  '<div class="grid g2">' +
    '<div class="card"><h2>🛒 Google Shopping <span class="tag">' + d.shopping.itens.length + ' ofertas · ' + d.shopping.lojas + ' lojas</span></h2>' +
      (d.shopping.itens.length ? '<div class="tabela-wrap"><table><thead><tr><th></th><th>Produto</th><th>Loja</th><th class="num">Preço</th><th class="num">Nota</th></tr></thead><tbody>' +
        d.shopping.itens.map(i => '<tr><td>' + (i.imagem ? '<img class="thumb" loading="lazy" src="' + esc(i.imagem) + '" alt="">' : '') + '</td><td><a href="' + esc(i.link) + '" target="_blank" rel="noopener">' + esc(i.titulo) + '</a></td><td>' + esc(i.loja) + '</td><td class="num preco">' + brl(i.preco) + '</td><td class="num">' + (i.nota != null ? '⭐ ' + String(i.nota).replace('.', ',') + (i.avaliacoes ? ' (' + num(i.avaliacoes) + ')' : '') : '—') + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="vazio">Sem ofertas no Shopping.</div>') + '</div>' +
    '<div class="card"><h2>💰 Distribuição de preços <span class="tag">' + d.precos.qtd + ' preços lidos</span></h2>' + colunas(d.faixas) + '<p class="small muted">Preços do Shopping e dos anúncios. Valores muito fora da curva (kits, atacado) ficam de fora.</p></div>' +
  '</div>' +
  (comFoto.length ? '<div class="card" style="margin-top:14px"><h2>🖼️ O que a concorrência vende <span class="tag">' + comFoto.length + ' produtos</span></h2><div class="galeria">' +
    comFoto.map(i => '<a href="' + esc(i.link) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(i.imagem) + '" alt="' + esc(i.titulo) + '"><span><b>' + brl(i.preco) + '</b> · ' + esc(i.loja) + '<br>' + esc(String(i.titulo).slice(0, 50)) + '</span></a>').join('') + '</div></div>' : '') +
  '<div class="card" style="margin-top:14px" id="card-aval"></div>' +
  '<div class="card" style="margin-top:14px" id="card-fotos"></div>' +
  '<div class="card" style="margin-top:14px" id="card-serie"></div>' +
  '<div class="grid g2">' +
    '<div class="card"><h2>🔎 SEO · Top 10 do Google <span class="tag">' + s.marketplacesNoTop + ' marketplaces no top</span></h2>' +
      (s.organicos.length ? '<ul class="org">' + s.organicos.map(o => '<li><span class="pos">' + (o.posicao || '') + '</span><div><a href="' + esc(o.link) + '" target="_blank" rel="noopener">' + esc(o.titulo) + '</a><div class="dom">' + esc(dom(o.link)) + '</div></div></li>').join('') + '</ul>' : '<div class="vazio">Sem resultados orgânicos.</div>') + '</div>' +
    '<div class="card"><h2>📈 Demanda: o que as pessoas buscam</h2>' +
      '<button type="button" class="pri" id="bt-ir-palavras" style="width:100%;margin-bottom:12px">⚡ Comparar todas estas palavras e ver qual performa melhor</button>' +
      '<div class="small muted" style="margin-bottom:6px">Autocompletar do Google (toque para pesquisar)</div><div class="chips">' + (s.sugestoes.length ? s.sugestoes.map(x => '<button type="button" class="chip" data-pesq="' + esc(x) + '">' + esc(x) + '</button>').join('') : '<span class="muted small">Nenhuma sugestão.</span>') + '</div>' +
      seoInterno(s.internas) +
      '<div class="small muted" style="margin:14px 0 6px">Pesquisas relacionadas</div><div class="chips">' + (s.relacionadas.length ? s.relacionadas.map(x => '<button type="button" class="chip" data-pesq="' + esc(x) + '">' + esc(x) + '</button>').join('') : '<span class="muted small">Nenhuma.</span>') + '</div>' +
      (s.perguntas.length ? '<div class="small muted" style="margin:14px 0 6px">As pessoas também perguntam</div><div class="paa">' + s.perguntas.map(p => '<details><summary>' + esc(p.pergunta) + '</summary><p class="small">' + esc(p.resposta || '') + '</p></details>').join('') + '</div>' : '') +
    '</div>' +
  '</div>' +
  '<div class="card" style="margin-top:14px" id="card-palavras"></div>';
  $$('[data-pesq]').forEach(b => b.onclick = () => { $('#q').value = b.dataset.pesq; pesquisar(b.dataset.pesq); });
  $('#bt-atualizar').onclick = () => pesquisar(d.termo, true);
  $('#bt-vigiar').onclick = () => alternarVigia(d.termo);
  $('#bt-titulos').onclick = () => gerarTitulos(d);
  $('#bt-compartilhar').onclick = () => compartilharRelatorio(d);
  pintarMargem(d);
  pintarSerie(d.termo);
  pintarAvaliacoes(d);
  pintarFotos(d);
  pintarPalavras(d);
  $('#bt-ir-palavras').onclick = () => destacar('#card-palavras');
}

// ⚡ Comparar palavras-chave: pesquisa todas as variações de uma vez e diz qual tem mais força
function pintarPalavras(d) {
  const box = $('#card-palavras'); if (!box || !window.Palavras) return;
  const chave = 'radar_palavras_' + slug(d.termo), salvo = ls.get(chave, null);
  const todas = Palavras.juntar(d), MAX = 20;
  const recente = t => { const h = S.hist.find(x => slug(x.termo) === slug(t)); return h && Date.now() - new Date(h.em).getTime() < 6 * 3600 * 1000; };
  const NOMES = { sua: 'sua', google: 'Google', mercadolivre: 'ML', amazon: 'Amazon', relacionada: 'relac.' };
  const cabeca = '<h2>⚡ Qual palavra-chave performa melhor <span class="tag">' + todas.length + ' palavras encontradas</span></h2>';
  if (salvo && salvo.lista && salvo.lista.length && !box._escolher) return desenharRanking(salvo);
  box.innerHTML = cabeca +
    '<p class="small muted">Marque as palavras e o Radar pesquisa todas sozinho (Mercado Livre, Shopee, Amazon e Google) e monta o ranking. Vem marcado o que aparece em mais lugares.</p>' +
    '<div class="pal-sel">' + todas.map((x, i) => '<label class="pal-op"><input type="checkbox" data-pal="' + i + '"' + (i < 15 ? ' checked' : '') + '><span>' + esc(x.termo) + '</span><span class="pal-f">' + x.fontes.map(f => '<i>' + NOMES[f] + '</i>').join('') + '</span></label>').join('') + '</div>' +
    '<div class="pal-acoes"><button type="button" class="pri" id="pal-ir">Pesquisar e comparar</button><button type="button" class="link" id="pal-todas">marcar tudo</button><button type="button" class="link" id="pal-nenhuma">desmarcar</button><span class="small muted" id="pal-custo"></span></div>' +
    '<div class="progresso hidden" id="pal-prog"><span style="width:0"></span></div><div class="small muted" id="pal-est"></div>' +
    (salvo && salvo.lista ? '<button type="button" class="link" id="pal-voltar">← ver o último ranking</button>' : '');
  const marcadas = () => $$('[data-pal]').filter(c => c.checked).map(c => todas[+c.dataset.pal]);
  const custo = () => { const m = marcadas(), novas = m.filter(x => !recente(x.termo)).length;
    $('#pal-custo').textContent = m.length > MAX ? '⚠️ no máximo ' + MAX + ' de cada vez' : m.length + ' palavras · ' + (novas ? novas * 6 + ' créditos (' + novas + ' novas)' : 'sem gastar crédito');
    $('#pal-ir').disabled = !m.length || m.length > MAX; };
  $$('[data-pal]').forEach(c => c.onchange = custo); custo();
  $('#pal-todas').onclick = () => { $$('[data-pal]').forEach((c, i) => c.checked = i < MAX); custo(); };
  $('#pal-nenhuma').onclick = () => { $$('[data-pal]').forEach(c => c.checked = false); custo(); };
  if ($('#pal-voltar')) $('#pal-voltar').onclick = () => { box._escolher = false; pintarPalavras(d); };
  $('#pal-ir').onclick = async () => {
    const m = marcadas(), novas = m.filter(x => !recente(x.termo)).length;
    if (novas && !confirm('Vou pesquisar ' + m.length + ' palavras. Gasta cerca de ' + novas * 6 + ' créditos do Serper. Continuar?')) return;
    $('#pal-ir').disabled = true; $('#pal-prog').classList.remove('hidden');
    const itens = [];
    for (let i = 0; i < m.length; i++) {
      $('#pal-est').textContent = 'Pesquisando ' + (i + 1) + ' de ' + m.length + ': ' + m[i].termo;
      try {
        const r = slug(m[i].termo) === slug(d.termo) ? d : await api('/api/pesquisa', { method: 'POST', body: JSON.stringify({ termo: m[i].termo }) });
        if (r !== d) guardar(r);
        itens.push({ termo: m[i].termo, fontes: m[i].fontes, forca: Palavras.forca(r, m[i].fontes) });
      } catch (e) { itens.push({ termo: m[i].termo, fontes: m[i].fontes, erro: e.message }); if (e.status === 401) break; }
      $('#pal-prog').firstChild.style.width = ((i + 1) / m.length * 100) + '%';
    }
    const res = Palavras.ranking(itens); res.erros = itens.filter(x => x.erro); res.em = new Date().toISOString();
    ls.set(chave, res); box._escolher = false; desenharRanking(res); marcarTrilha('palavras');
  };
  function desenharRanking(r) {
    const b = r.melhor, PARTES = [['busca', 'Busca', 40], ['vendas', 'Vendas', 40], ['concorrencia', 'Concorrência', 20]];
    box.innerHTML = cabeca +
      (b ? '<div class="onde-topo"><div style="font-size:1.8rem">🥇</div><div><div class="onde-v">' + esc(b.termo) + ' <span class="badge">' + b.forca.total + '/100</span></div><div class="small">É a palavra mais forte: use no começo do título do anúncio. ' + (b.forca.maxVendidos ? 'O anúncio que mais vende com ela tem ' + num(b.forca.maxVendidos) + '+ vendas.' : '') + '</div></div></div>' : '') +
      barrasH(r.lista.slice(0, 12).map(x => ({ rotulo: x.termo, valor: x.forca.total, termo: x.termo, cor: 'var(--brand)', dica: '<b>' + esc(x.termo) + ': ' + x.forca.total + '/100</b><br>' + PARTES.map(([k, n, mx]) => n + ': ' + x.forca.partes[k] + '/' + mx).join('<br>') })), { max: 100 }) +
      '<div class="tabela-wrap"><table><thead><tr><th>Palavra-chave</th><th class="num">Força</th><th class="num">Busca</th><th class="num">Vendas</th><th class="num">Mais vendido</th><th class="num">Anúncios</th><th>Concorrência</th><th class="num">Preço comum</th><th>Usar no</th></tr></thead><tbody>' +
      r.lista.map((x, i) => '<tr class="clic" data-abrir="' + esc(x.termo) + '"><td><b>' + (i < 3 ? ['🥇', '🥈', '🥉'][i] + ' ' : '') + esc(x.termo) + '</b><div class="small muted">' + x.fontes.map(f => NOMES[f]).join(' · ') + '</div></td><td class="num"><b>' + x.forca.total + '</b></td><td class="num">' + x.forca.partes.busca + '</td><td class="num">' + x.forca.partes.vendas + '</td><td class="num">' + (x.forca.maxVendidos ? num(x.forca.maxVendidos) + '+' : '—') + '</td><td class="num">' + x.forca.anuncios + '</td><td>' + esc(x.forca.concorrencia) + '</td><td class="num">' + brl(x.forca.preco) + '</td><td>' + esc(x.uso) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (r.termos.length ? '<div class="small muted" style="margin:14px 0 6px">Palavras que mais se repetem nas melhores buscas: coloque no título e na descrição</div><div class="chips">' + r.termos.map(w => '<span class="chip">' + esc(w) + '</span>').join('') + '</div>' : '') +
      (r.lista.length >= 2 ? '<p class="aviso">Sugestão de título: comece com <b>' + esc(r.lista[0].termo) + '</b> e complete com <b>' + esc(r.lista.slice(1, 3).map(x => x.termo).join(' / ')) + '</b>, sem repetir palavra. As demais vão na descrição e na ficha técnica.</p>' : '') +
      (r.erros && r.erros.length ? '<p class="small muted">Não deu: ' + r.erros.map(x => esc(x.termo)).join(' · ') + '</p>' : '') +
      '<p class="small muted">Força = busca (aparece no autocompletar do Google, ML e Amazon; até 40) + vendas (o anúncio que mais vende com essa palavra; até 40) + concorrência (menos disputa, até 20). Comparado em ' + dataBR(r.em) + '. <button type="button" class="link" id="pal-refazer">Comparar de novo</button></p>';
    $$('#card-palavras [data-abrir]').forEach(tr => tr.onclick = () => abrir(tr.dataset.abrir));
    $('#pal-refazer').onclick = () => { box._escolher = true; pintarPalavras(d); };
  }
}

// 🔎 SEO interno: o que é digitado dentro do Mercado Livre e da Amazon
function seoInterno(internas) {
  if (!internas) return '';
  const bloco = (k, lista) => '<div class="small muted" style="margin:14px 0 6px">' + logo(k) + ' Buscado dentro do ' + CANAIS[k].nome + '</div>' +
    (lista == null ? '<span class="muted small">O ' + CANAIS[k].nome + ' não respondeu agora. Tente ↻ Atualizar mais tarde.</span>'
      : lista.length ? '<div class="chips">' + lista.map(x => '<button type="button" class="chip" data-pesq="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>'
      : '<span class="muted small">Nenhuma variação sugerida lá dentro.</span>');
  return bloco('mercadolivre', internas.mercadolivre) + bloco('amazon', internas.amazon) +
    '<div class="small muted" style="margin-top:8px">' + logo('shopee') + ' A Shopee não abre a busca dela para consulta: para ela usamos os sinais do Google.</div>';
}

// 🏆 Onde vender
function pintarOnde(d, margens) {
  const box = $('#card-onde'); if (!box || !window.Recomendacao) return;
  const r = Recomendacao.recomendar(d, margens);
  const v = r.ranking[0], PARTES = [['demanda', 'Demanda', 40], ['concorrencia', 'Espaço na concorrência', 15], ['preco', 'Preço no canal', 15], ['margem', 'Margem com seu custo', 30]];
  box.innerHTML = '<h2>🏆 Onde vender <span class="tag">nota de 0 a 100 por canal</span></h2>' +
    '<div class="onde-topo">' + (r.vencedor ? logo(v.id, true) + '<div><div class="onde-v">Melhor canal: ' + esc(v.nome) + ' <span class="badge">' + v.nota + '/100</span></div><div class="small">' + esc(r.estrategia) + '</div></div>'
      : '<div><div class="onde-v">Nenhum canal se destaca</div><div class="small">' + esc(r.estrategia) + '</div></div>') + '</div>' +
    (r.semCusto ? '<p class="small muted">⚠️ Sem o custo de produção, a margem entra neutra. Preencha o custo na calculadora logo abaixo e a recomendação se ajusta na hora.</p>' : '') +
    barrasH(r.ranking.map(x => ({ rotulo: x.nome, valor: x.nota, cor: CANAIS[x.id].cor, dica: '<b>' + esc(x.nome) + ': ' + x.nota + '/100</b><br>' + PARTES.map(([k, n, m]) => n + ': ' + x.partes[k] + '/' + m).join('<br>') })), { max: 100 }) +
    '<div class="grid g3">' + r.ranking.map((x, i) => '<div class="onde-canal' + (i === 0 && r.vencedor ? ' melhor' : '') + '"><div class="onde-c">' + logo(x.id) + ' <b>' + esc(x.nome) + '</b><span class="badge" style="margin-left:auto">' + x.nota + '</span></div>' +
      '<div class="onde-partes">' + PARTES.map(([k, n, m]) => '<div data-tip="' + esc(n + ': ' + x.partes[k] + ' de ' + m) + '"><span>' + n + '</span><span class="onde-trilho"><span style="width:' + (x.partes[k] / m * 100) + '%"></span></span><b>' + x.partes[k] + '/' + m + '</b></div>').join('') + '</div>' +
      (x.pros.length ? '<ul class="onde-lista pros">' + x.pros.map(p => '<li>✔ ' + esc(p) + '</li>').join('') + '</ul>' : '') +
      (x.contras.length ? '<ul class="onde-lista contras">' + x.contras.map(p => '<li>✖ ' + esc(p) + '</li>').join('') + '</ul>' : '') + '</div>').join('') + '</div>' +
    '<p class="aviso">Como a nota é feita: demanda (anúncios, vendas e busca dentro do canal) até 40 · espaço na concorrência até 15 · preço praticado no canal até 15 · margem com o seu custo até 30.</p>';
}

// 💰 Calculadora de margem
function pintarMargem(d) {
  const c = cfg(), k = slug(d.termo), salvo = (c.custos || {})[k] || {};
  const precoCanal = id => { const m = d.marketplaces[canalDaTaxa(id)]; return (m && m.precos.mediana) || d.precos.mediana || 0; };
  const v = x => (x == null || x === 0) ? '' : x;
  const box = $('#card-margem');
  box.innerHTML = '<h2>💰 Vale a pena? Margem por canal <span class="tag">imposto ' + pct(c.imposto) + ' · meta de margem ' + pct(c.margemAlvo) + ' · <a href="#" id="ir-taxas">ajustar taxas</a></span></h2>' +
    '<div class="calc-entradas">' +
      '<label>Custo de produção (R$)<input type="number" step="0.01" min="0" id="m-custo" value="' + v(salvo.custo) + '" placeholder="ex.: 4,50"></label>' +
      '<label>Embalagem e etiqueta (R$)<input type="number" step="0.01" min="0" id="m-emb" value="' + v(salvo.embalagem) + '" placeholder="ex.: 0,80"></label>' +
      '<label>Quero lucrar por mês (R$)<input type="number" step="100" min="0" id="m-meta" value="' + v(salvo.meta) + '" placeholder="ex.: 10000"></label>' +
    '</div>' +
    '<div class="calc-entradas c4">' +
      '<label>Peso embalado (kg)<input type="number" step="0.01" min="0" id="m-peso" value="' + v(salvo.pesoKg) + '" placeholder="ex.: 0,35"></label>' +
      '<label>Comprimento (cm)<input type="number" step="0.5" min="0" id="m-c" value="' + v(salvo.comp) + '"></label>' +
      '<label>Largura (cm)<input type="number" step="0.5" min="0" id="m-l" value="' + v(salvo.larg) + '"></label>' +
      '<label>Altura (cm)<input type="number" step="0.5" min="0" id="m-a" value="' + v(salvo.alt) + '"></label>' +
    '</div>' +
    '<div class="faixa-info" id="m-info"></div>' +
    '<div style="margin:6px 0 12px"><button type="button" class="sec" id="m-salvar">Salvar dados deste produto para o time</button></div>' +
    '<div id="m-sim"></div><div id="m-saida"></div><div id="m-meta-saida"></div><div id="m-kits"></div>';
  $('#ir-taxas').onclick = e => { e.preventDefault(); irPara('taxas'); };
  const precos = {}; Object.keys(c.taxas).forEach(id => precos[id] = Math.round(precoCanal(id) * 100) / 100);
  let taxaML = null;   // taxa oficial da categoria (vem do Mercado Livre)
  const ler = id => Number($(id).value) || 0;
  function entrada() {
    const peso = Frete.pesoConsiderado(ler('#m-peso'), ler('#m-c'), ler('#m-l'), ler('#m-a'));
    const fretes = {}, ajustes = {};
    for (const id of Object.keys(c.taxas)) {
      const f = Frete.fretePorPeso(canalDaTaxa(id), peso.considerado, c.fretes);
      if (f != null) fretes[id] = f;
    }
    if (taxaML && taxaML.oficial) {
      if (taxaML.classico) ajustes.mercadolivre = { comissao: taxaML.classico.percentual, fixoAbaixo: taxaML.classico.fixo || c.taxas.mercadolivre.fixoAbaixo };
      if (taxaML.premium) ajustes.mercadolivrePremium = { comissao: taxaML.premium.percentual, fixoAbaixo: taxaML.premium.fixo || c.taxas.mercadolivrePremium.fixoAbaixo };
    }
    return { peso, e: { precos, custo: ler('#m-custo'), embalagem: ler('#m-emb'), imposto: c.imposto, margemAlvo: c.margemAlvo, taxas: c.taxas, fretes, ajustes } };
  }
  function calc() {
    const { peso, e } = entrada();
    const r = Margem.calcular(e);
    const custo = e.custo;
    const margens = custo ? { mercadolivre: r.mercadolivre, shopee: r.shopee, amazon: r.amazon } : null;
    pintarOnde(d, margens);
    S.extras = { custo: e.custo, embalagem: e.embalagem, peso, margens: r, taxaML, recomendacao: window.Recomendacao ? Recomendacao.recomendar(d, margens) : null };
    // linha de informação: frete pelo peso e taxa oficial do ML
    const ult = (c.fretes.mercadolivre || []).slice(-1)[0];
    $('#m-info').innerHTML =
      (peso.considerado ? '📦 Peso usado no frete: <b>' + peso.considerado.toLocaleString('pt-BR') + ' kg</b>' + (peso.cubado > peso.real ? ' (o cubado ' + peso.cubado.toLocaleString('pt-BR') + ' kg é maior que o real)' : '') + ' · frete ' + Object.entries(e.fretes).filter(([id]) => id !== 'mercadolivrePremium').map(([id, f]) => CANAIS[canalDaTaxa(id)].nome + ' ' + brl(f)).join(' · ') + (ult && peso.considerado > ult[0] ? ' ⚠️ acima da última faixa da tabela' : '') : '📦 Informe o peso para o frete sair pela faixa de peso (hoje usa o valor fixo da taxa).') +
      '<br>' + (taxaML === null ? '<span class="carregando" style="width:12px;height:12px;border-width:2px"></span> Buscando a comissão oficial da categoria no Mercado Livre…'
        : taxaML.oficial ? logo('mercadolivre') + ' Categoria no Mercado Livre: <b>' + esc(taxaML.categoria) + '</b> · comissão oficial Clássico <b>' + pct(taxaML.classico && taxaML.classico.percentual) + '</b> · Premium <b>' + pct(taxaML.premium && taxaML.premium.percentual) + '</b>'
        : logo('mercadolivre') + ' ' + esc(taxaML.motivo || 'Comissão oficial indisponível agora') + ' (usando a taxa de referência).');
    const linhas = Object.entries(r);
    $('#m-saida').innerHTML = (custo ? '' : '<p class="small muted">Digite o custo de produção para ver o lucro de verdade. Os preços já vêm da mediana de cada canal, e você pode mudar.</p>') +
      '<div class="tabela-wrap"><table><thead><tr><th>Canal</th><th class="num">Preço de venda</th><th class="num">Comissão</th><th class="num">Taxa fixa</th><th class="num">Frete</th><th class="num">Imposto</th><th class="num">Custo</th><th class="num">Lucro / un.</th><th class="num">Margem</th><th class="num">Preço p/ ' + pct(c.margemAlvo) + '</th></tr></thead><tbody>' +
      linhas.map(([id, x]) => '<tr><td>' + logo(canalDaTaxa(id)) + ' ' + esc(x.nome) + '</td><td class="num"><input type="number" step="0.01" min="0" data-preco="' + id + '" value="' + precos[id] + '" style="width:96px;text-align:right"></td><td class="num" title="' + pct(x.taxaUsada.comissao) + '">' + brl(x.comissao) + '</td><td class="num">' + brl(x.fixo) + '</td><td class="num">' + brl(x.frete) + '</td><td class="num">' + brl(x.imposto) + '</td><td class="num">' + brl(x.custo) + '</td><td class="num ' + (x.lucro >= 0 ? 'lucro-pos' : 'lucro-neg') + '">' + brl(x.lucro) + '</td><td class="num ' + (x.margem >= 0 ? 'lucro-pos' : 'lucro-neg') + '">' + pct(x.margem) + '</td><td class="num">' + brl(x.precoMinimo) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (custo ? '<h2 style="margin-top:14px">Lucro por unidade</h2>' + barrasH(linhas.map(([id, x]) => ({ rotulo: x.nome, valor: Math.max(0, x.lucro), cor: CANAIS[canalDaTaxa(id)].cor, dica: x.nome + '<br>Lucro ' + brl(x.lucro) + ' (' + pct(x.margem) + ')' })), { formato: brl }) +
        '<p class="small muted">' + melhorCanal(linhas) + '</p>' : '') +
      '<p class="aviso">Comissão do Mercado Livre: oficial da categoria quando o ML responde. As outras taxas e a tabela de frete são de referência: confira em ⚙️ Taxas.</p>';
    $$('[data-preco]').forEach(inp => inp.onchange = () => { precos[inp.dataset.preco] = Number(inp.value) || 0; calc(); });
    // 💵 simulador: X unidades a R$ Y = quanto fica no bolso
    const simEstado = ls.get('radar_sim', { qtd: 100, canal: 'mercadolivre' });
    if (!r[simEstado.canal]) simEstado.canal = Object.keys(r)[0];
    $('#m-sim').innerHTML = simBloco(r, simEstado.qtd, simEstado.canal, { preco: precos[simEstado.canal], semCusto: !custo });
    ligarSim('#m-sim', st => { ls.set('radar_sim', { qtd: st.qtd, canal: st.canal }); if (st.preco != null) precos[st.canal] = st.preco; calc(); });
    // 🎯 meta do mês
    const metaV = ler('#m-meta');
    if (custo && metaV) {
      const m = Margem.metaMensal(r, metaV);
      S.extras.meta = { valor: metaV, canais: m };
      $('#m-meta-saida').innerHTML = '<h2 style="margin-top:16px">🎯 Para lucrar ' + brl0(metaV) + ' por mês</h2><div class="tabela-wrap"><table><thead><tr><th>Se vender só no…</th><th class="num">Unidades no mês</th><th class="num">Por dia</th><th class="num">Faturamento</th><th class="num">Produção (com 10% de folga)</th></tr></thead><tbody>' +
        linhas.map(([id, x]) => { const y = m[id]; return '<tr><td>' + logo(canalDaTaxa(id)) + ' ' + esc(x.nome) + '</td>' + (y ? '<td class="num"><b>' + num(y.unidades) + '</b></td><td class="num">' + num(y.porDia) + '</td><td class="num">' + brl0(y.faturamento) + '</td><td class="num">' + num(Math.ceil(y.unidades * 1.1)) + '</td>' : '<td class="num muted" colspan="4">não dá lucro nesse preço</td>') + '</tr>'; }).join('') +
        '</tbody></table></div><p class="aviso">Na prática você divide entre os canais: some as unidades de cada um até chegar na meta.</p>';
    } else { $('#m-meta-saida').innerHTML = custo ? '<p class="small muted">🎯 Coloque quanto quer lucrar por mês para ver quantas unidades vender e produzir.</p>' : ''; S.extras.meta = null; }
    // 📦 kits
    if (custo) {
      const pesoUn = peso.considerado;
      const fretesKit = {};
      for (const n of [2, 3, 5, 10]) { fretesKit[n] = {}; for (const id of Object.keys(c.taxas)) { const f = Frete.fretePorPeso(canalDaTaxa(id), pesoUn * n, c.fretes); if (f != null) fretesKit[n][id] = f; } }
      const kt = Margem.kits({ ...e, fretesKit });
      S.extras.kits = kt;
      const ids = ['mercadolivre', 'shopee', 'amazon'];
      const existentes = [...new Set([...(d.seo.sugestoes || []), ...((d.seo.internas || {}).mercadolivre || []), ...((d.seo.internas || {}).amazon || []), ...(d.seo.relacionadas || [])]
        .filter(s => /\bkit\b|\bcom \d|\b\d+\s?(un|unid|unidades|pe[cç]as|p[cç]s|rolos?|pares?|metros?)\b|\bc\/\s?\d/i.test(s)))];
      $('#m-kits').innerHTML = '<h2 style="margin-top:16px">📦 Kits: vender mais de uma unidade por pedido</h2>' +
        (existentes.length ? '<div class="small" style="margin-bottom:8px">Buscas reais com cara de kit: ' + existentes.slice(0, 8).map(x => '<button type="button" class="chip" data-pesq="' + esc(x) + '">' + esc(x) + '</button>').join(' ') + '</div>' : '') +
        '<div class="tabela-wrap"><table><thead><tr><th>Kit</th><th class="num">Desconto</th>' + ids.map(id => '<th class="num">' + logo(id) + ' preço / lucro do kit</th>').join('') + '</tr></thead><tbody>' +
        Object.entries(kt).map(([n, kk]) => '<tr><td><b>Kit ' + n + '</b></td><td class="num">' + pct(kk.desconto) + '</td>' + ids.map(id => { const x = kk.canais[id]; return '<td class="num">' + brl(x.preco) + ' · <span class="' + (x.lucro >= 0 ? 'lucro-pos' : 'lucro-neg') + '">' + brl(x.lucro) + '</span>' + (x.ganhoVsUnidade != null ? '<div class="small ' + (x.ganhoVsUnidade >= 0 ? 'var-pos' : 'var-neg') + '">' + (x.ganhoVsUnidade >= 0 ? '+' : '') + brl(x.ganhoVsUnidade) + ' por unidade</div>' : '') + '</td>'; }).join('') + '</tr>').join('') +
        '</tbody></table></div><p class="aviso">Kit = n unidades num anúncio só: a comissão e a taxa fixa são cobradas uma vez, o frete sai pelo peso total e há um desconto pequeno para o comprador. "+R$ por unidade" é quanto cada unidade rende a mais do que vendida sozinha.</p>';
      $$('#m-kits [data-pesq]').forEach(b => b.onclick = () => { $('#q').value = b.dataset.pesq; pesquisar(b.dataset.pesq); });
    } else { $('#m-kits').innerHTML = ''; S.extras.kits = null; }
    pintarPrecoIdeal(d, custo ? r : null);
    pintarPlano(d);
  }
  ['#m-custo', '#m-emb', '#m-meta', '#m-peso', '#m-c', '#m-l', '#m-a'].forEach(id => $(id).oninput = calc);
  $('#m-salvar').onclick = async () => {
    try {
      S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'custo', termo: d.termo, custo: ler('#m-custo'), embalagem: ler('#m-emb'), meta: ler('#m-meta'), pesoKg: ler('#m-peso'), comp: ler('#m-c'), larg: ler('#m-l'), alt: ler('#m-a'), detalhes: ($('#an-detalhes') && $('#an-detalhes').value) || salvo.detalhes || '' }) });
      $('#m-salvar').textContent = '✔ Salvo para o time';
    } catch (e) { erro(e.message); }
  };
  calc();
  api('/api/taxa-ml?termo=' + encodeURIComponent(d.termo) + '&preco=' + encodeURIComponent(precos.mercadolivre || 50))
    .then(t => { taxaML = t; }).catch(() => { taxaML = { oficial: false, motivo: 'Comissão oficial indisponível agora' }; })
    .finally(() => { if ($('#m-info') && S.atual === d) calc(); });
}
function melhorCanal(linhas) {
  const ok = linhas.filter(([, x]) => x.lucro > 0).sort((a, b) => b[1].lucro - a[1].lucro);
  if (!ok.length) return '⚠️ Com esse custo e esses preços, nenhum canal dá lucro. Veja a coluna "Preço p/ meta".';
  return '👉 Maior lucro por unidade agora: <b>' + esc(ok[0][1].nome) + '</b>, ' + brl(ok[0][1].lucro) + ' (' + pct(ok[0][1].margem) + ').';
}

// ✍️ Anúncio pronto
async function gerarTitulos(d) {
  const bt = $('#bt-titulos'), out = $('#titulos-saida');
  const detalhes = ($('#an-detalhes') && $('#an-detalhes').value.trim()) || '';
  marcarTrilha('anuncio');
  bt.disabled = true; out.innerHTML = '<div class="vazio"><span class="carregando"></span>Escrevendo o anúncio… (com a IA pode levar até 1 minuto)</div>';
  try {
    const r = await api('/api/titulos', { method: 'POST', body: JSON.stringify({ termo: d.termo, dados: d, detalhes }) });
    const copiar = t => '<button type="button" class="copiar" data-copiar="' + esc(t) + '">copiar</button>';
    let aba = 'mercadolivre';
    function desenhar() {
      const x = r[aba] || { titulos: [], descricao: '', destaques: [] };
      out.innerHTML = '<div class="abas-canal">' + Object.keys(CANAIS).map(k => '<button type="button" data-aba-canal="' + k + '" class="' + (k === aba ? 'pri' : '') + '">' + logo(k) + ' ' + CANAIS[k].nome + '</button>').join('') + '</div>' +
        '<div class="titulos"><div><b>Títulos</b> <span class="muted small">(até ' + r.limites[aba] + ' caracteres)</span><ol>' + x.titulos.map(t => '<li>' + esc(t) + '<span class="cont">' + t.length + '</span>' + copiar(t) + '</li>').join('') + '</ol></div>' +
        '<div><b>Descrição</b> ' + copiar(x.descricao) + '<pre class="desc">' + esc(x.descricao) + '</pre></div>' +
        '<div><b>Destaques</b> ' + copiar(x.destaques.map(y => '• ' + y).join('\n')) + '<ul>' + x.destaques.map(y => '<li>' + esc(y) + '</li>').join('') + '</ul></div>' +
        (r.fichaTecnica && r.fichaTecnica.length ? '<div><b>Ficha técnica sugerida</b><table>' + r.fichaTecnica.map(f => '<tr><td>' + esc(f.campo) + '</td><td>' + esc(f.valor) + '</td></tr>').join('') + '</table></div>' : '') +
        (r.perguntas && r.perguntas.length ? '<div><b>Respostas para as perguntas que o povo faz</b>' + r.perguntas.map(p => '<details><summary>' + esc(p.pergunta) + '</summary><p class="small">' + esc(p.resposta) + ' ' + copiar(p.resposta) + '</p></details>').join('') + '</div>' : '') +
        (r.dica ? '<p class="small">💡 ' + esc(r.dica) + '</p>' : '') + (r.fonte === 'ia' ? '<p class="aviso">Escrito pela IA (Claude) com base nas buscas reais e nos concorrentes. Revise medidas e dados antes de publicar.</p>' : '') + '</div>';
      $$('[data-aba-canal]').forEach(b => b.onclick = () => { aba = b.dataset.abaCanal; desenhar(); });
      $$('#titulos-saida [data-copiar]').forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copiar); b.textContent = '✔ copiado'; });
    }
    desenhar();
  } catch (e) { out.innerHTML = ''; erro(e.message); }
  finally { bt.disabled = false; bt.textContent = '↻ Gerar de novo'; }
}

// 🔗 Relatório para compartilhar
async function compartilharRelatorio(d) {
  marcarTrilha('relatorio');
  const bt = $('#bt-compartilhar'); bt.disabled = true; bt.textContent = 'Gerando link…';
  try {
    const r = await api('/api/compartilhar', { method: 'POST', body: JSON.stringify({ termo: d.termo, extras: S.extras || {} }) });
    const link = location.origin + r.caminho;
    if (navigator.clipboard) { try { await navigator.clipboard.writeText(link); } catch (e) {} }
    $('#link-relatorio').innerHTML = '🔗 Link do relatório (copiado): <a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a><div class="aviso">Quem tiver o link vê o relatório, sem precisar de senha. Não dá acesso ao resto do painel.</div>';
  } catch (e) { erro(e.message); }
  finally { bt.disabled = false; bt.textContent = '🔗 Compartilhar relatório'; }
}

// 🔔 Vigiar e série
async function alternarVigia(termo) {
  const ligar = !vigiada(termo);
  try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'vigiar', termo, ligar }) }); }
  catch (e) { return erro(e.message); }
  const b = $('#bt-vigiar'); if (b) { b.className = ligar ? 'pri' : 'sec'; b.textContent = ligar ? '🔔 Vigiando' : '🔔 Vigiar'; }
  pintarSerie(termo);
}
async function buscarSerie(termo) {
  if (!S.nuvem) return [];
  try { const r = await api('/api/historico?serie=1&termo=' + encodeURIComponent(termo)); S.series[slug(termo)] = r.pontos || []; } catch (e) { S.series[slug(termo)] = S.series[slug(termo)] || []; }
  return S.series[slug(termo)];
}
async function pintarSerie(termo) {
  const box = $('#card-serie'); if (!box) return;
  const p = await buscarSerie(termo);
  if (!$('#card-serie') || !S.atual || slug(S.atual.termo) !== slug(termo)) return;
  const vig = vigiada(termo);
  if (!vig && p.length < 2) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '<h2>📉 Evolução no tempo <span class="tag">' + (vig ? '🔔 checado toda segunda' : 'pesquisas anteriores') + '</span></h2><div class="grid g2" style="margin-top:0">' +
    '<div><div class="small muted">Preço mais comum</div>' + linha(p, 'precoMediano', brl) + '</div>' +
    '<div><div class="small muted">Nota de validação</div>' + linha(p, 'nota', v => Math.round(v)) + '</div></div>';
}
async function carregarSeries(lista) { await Promise.all(lista.map(v => buscarSerie(v.termo))); }
function variacao(p, campo, fmt, inverter) {
  const q = p.filter(x => x[campo] != null); if (q.length < 2) return '<span class="muted">—</span>';
  const a = q[0][campo], b = q[q.length - 1][campo], dlt = b - a;
  if (!dlt) return '<span class="muted">estável</span>';
  const bom = inverter ? dlt < 0 : dlt > 0;
  return '<span class="' + (bom ? 'var-pos' : 'var-neg') + '">' + (dlt > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(dlt)) + '</span>';
}
function listaVigiadas(vig, curto) {
  return '<div class="tabela-wrap"><table><thead><tr><th>Produto</th><th class="num">Nota</th>' + (curto ? '' : '<th>Variação da nota</th>') + '<th>Preço no tempo</th><th>Variação do preço</th>' + (curto ? '' : '<th class="num">Pontos</th><th></th>') + '</tr></thead><tbody>' +
    vig.map(v => { const p = S.series[v.chave] || [], ult = p[p.length - 1] || {}; return '<tr class="clic" data-abrir="' + esc(v.termo) + '"><td><b>' + esc(v.termo) + '</b><div class="small muted">desde ' + dataBR(v.desde) + '</div></td><td class="num">' + (ult.nota ?? '—') + '</td>' +
      (curto ? '' : '<td>' + variacao(p, 'nota', x => Math.round(x)) + '</td>') + '<td>' + sparkline(p, 'precoMediano') + '</td><td>' + variacao(p, 'precoMediano', brl, true) + '</td>' +
      (curto ? '' : '<td class="num">' + p.length + '</td><td><button type="button" class="link" data-desvigiar="' + esc(v.termo) + '" title="Parar de vigiar">✖</button></td>') + '</tr>'; }).join('') + '</tbody></table></div>';
}

// ───────────────────────── 🔔 VIGIADAS ─────────────────────────
async function pintarVigiadas() {
  const box = $('#aba-vigiadas'), vig = cfg().vigiadas || [];
  box.innerHTML = '<h1 class="titulo-aba">Vigiadas e concorrentes</h1><p class="sub-aba">Toda segunda de manhã o Radar refaz a pesquisa das palavras vigiadas, checa os anúncios dos concorrentes e avisa o que mudou.</p>' +
    '<div class="card" style="margin-top:14px" id="alertas-lista"><h2>🚨 O que mudou</h2><div class="vazio"><span class="carregando"></span>carregando…</div></div>' +
    '<div class="card" style="margin-top:14px"><h2>🕵️ Concorrentes <span class="tag">até 20 · 1 crédito do Serper por checagem</span></h2>' +
      '<form id="conc-form" class="conc-form"><input id="conc-link" placeholder="Cole o link do anúncio do concorrente (Mercado Livre, Shopee ou Amazon)"><input id="conc-apelido" placeholder="Apelido (ex.: Loja X 22mm)"><button class="pri" type="submit">Acompanhar</button></form>' +
      '<div id="conc-lista"><div class="vazio"><span class="carregando"></span>carregando…</div></div></div>' +
    '<div class="card" style="margin-top:14px"><h2>🔔 Palavras vigiadas <span class="tag">até 15 · 6 créditos por semana cada</span></h2><div id="vig-lista">' + (vig.length ? '<div class="vazio"><span class="carregando"></span>carregando…</div>' : '<div class="vazio">Nenhuma palavra vigiada ainda. Abra uma pesquisa e toque em <b>🔔 Vigiar</b>.</div>') + '</div></div>';
  $('#conc-form').onsubmit = async e => {
    e.preventDefault();
    const link = $('#conc-link').value.trim(); if (!link) return;
    const bt = $('#conc-form button'); bt.disabled = true; bt.textContent = 'Checando…';
    try { await api('/api/concorrentes', { method: 'POST', body: JSON.stringify({ acao: 'adicionar', link, apelido: $('#conc-apelido').value.trim() }) }); $('#conc-link').value = ''; $('#conc-apelido').value = ''; await pintarConcorrentes(); }
    catch (err) { erro(err.message); }
    finally { bt.disabled = false; bt.textContent = 'Acompanhar'; }
  };
  pintarAlertas('#alertas-lista', 50);
  pintarConcorrentes();
  if (!vig.length) return;
  await carregarSeries(vig);
  $('#vig-lista').innerHTML = listaVigiadas(vig, false);
  $$('[data-desvigiar]').forEach(b => b.onclick = async e => { e.stopPropagation(); await alternarVigia(b.dataset.desvigiar); pintarVigiadas(); });
}
async function pintarConcorrentes() {
  const box = $('#conc-lista'); if (!box) return;
  let itens = [];
  try { itens = (await api('/api/concorrentes')).itens || []; } catch (e) { box.innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
  if (!itens.length) { box.innerHTML = '<div class="vazio">Nenhum concorrente ainda. Cole o link de um anúncio que vende o mesmo que você.</div>'; return; }
  const ult = p => p.filter(x => x.achou).slice(-1)[0] || {};
  box.innerHTML = '<div class="tabela-wrap"><table><thead><tr><th>Anúncio</th><th class="num">Preço</th><th class="num">Vendidos</th><th class="num">Nota</th><th>Preço no tempo</th><th>Variação</th><th class="num">Checado</th><th></th></tr></thead><tbody>' +
    itens.map(c => { const u = ult(c.pontos), canal = CANAIS[c.canal] ? c.canal : null; return '<tr><td>' + (canal ? logo(canal) + ' ' : '') + '<a href="' + esc(c.link) + '" target="_blank" rel="noopener"><b>' + esc(c.apelido || u.titulo || 'Anúncio') + '</b></a>' + (u.titulo && c.apelido ? '<div class="small muted">' + esc(u.titulo.slice(0, 60)) + '</div>' : '') + (!c.pontos.some(x => x.achou) ? '<div class="small muted">O Google ainda não mostra esse anúncio; tento de novo na próxima checagem.</div>' : '') + '</td>' +
      '<td class="num">' + brl(u.preco) + '</td><td class="num">' + (u.vendidos != null ? num(u.vendidos) + '+' : '—') + '</td><td class="num">' + (u.nota != null ? '⭐ ' + String(u.nota).replace('.', ',') : '—') + '</td>' +
      '<td>' + sparkline(c.pontos.filter(x => x.achou), 'preco') + '</td><td>' + variacao(c.pontos.filter(x => x.achou), 'preco', brl, true) + '</td><td class="num">' + dataBR((c.pontos.slice(-1)[0] || {}).em) + '</td>' +
      '<td style="white-space:nowrap"><button type="button" class="link" data-checar="' + c.id + '" title="Checar agora (1 crédito)">↻</button> <button type="button" class="link" data-remover="' + c.id + '" title="Parar de acompanhar">✖</button></td></tr>'; }).join('') +
    '</tbody></table></div>';
  $$('[data-checar]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = '…'; try { await api('/api/concorrentes', { method: 'POST', body: JSON.stringify({ acao: 'checar', id: b.dataset.checar }) }); } catch (e) { erro(e.message); } pintarConcorrentes(); });
  $$('[data-remover]').forEach(b => b.onclick = async () => { if (!confirm('Parar de acompanhar esse concorrente?')) return; try { await api('/api/concorrentes', { method: 'POST', body: JSON.stringify({ acao: 'remover', id: b.dataset.remover }) }); } catch (e) { erro(e.message); } pintarConcorrentes(); });
}
const ICONE_ALERTA = { 'preco-caiu': '📉', 'preco-subiu': '📈', 'nota-subiu': '⭐', 'nota-caiu': '⚠️', concorrencia: '👥', 'concorrente-baixou': '🏷️', 'concorrente-subiu': '🏷️', 'concorrente-vendeu': '🔥' };
async function pintarAlertas(sel, max) {
  const box = $(sel); if (!box) return;
  let r = { itens: [], webhook: false };
  try { r = await api('/api/alertas'); } catch (e) { /* sem alertas */ }
  if (!$(sel)) return;
  const itens = (r.itens || []).slice(0, max);
  box.innerHTML = '<h2>🚨 O que mudou <span class="tag">' + (r.webhook ? '📲 avisos também saem pelo webhook' : 'avisos aparecem aqui') + '</span></h2>' +
    (itens.length ? '<ul class="alertas">' + itens.map(a => '<li><span>' + (ICONE_ALERTA[a.tipo] || '🔔') + '</span><div>' + esc(a.msg) + '<div class="small muted">' + dataBR(a.em) + '</div></div></li>').join('') + '</ul>'
      : '<div class="vazio">Nada mudou de forma relevante ainda. Os alertas aparecem depois das checagens de segunda (preço mudou 10%+, nota 10+ pontos, entrou concorrência, concorrente baixou preço ou vendeu mais).</div>');
}

// ───────────────────────── 📋 LOTE ─────────────────────────
let loteRes = [];
function pintarLote() {
  const box = $('#aba-lote');
  box.innerHTML = '<h1 class="titulo-aba">Pesquisa em lote</h1><p class="sub-aba">Cole uma palavra-chave por linha (até 20) e receba o ranking. Palavras já pesquisadas nas últimas 6 h não gastam crédito; as novas gastam 6 cada.</p>' +
    '<div class="card" style="margin-top:14px"><textarea id="lote-txt" placeholder="fita de borda adesiva&#10;fita de borda 22mm&#10;fita de borda branca"></textarea>' +
    '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap"><button type="button" class="pri" id="lote-ir">Pesquisar todas</button><span class="small muted" id="lote-est"></span></div>' +
    '<div class="progresso hidden" id="lote-prog"><span style="width:0"></span></div></div><div class="card" style="margin-top:14px" id="lote-res">' + (loteRes.length ? rankingLote() : '<div class="vazio">O ranking aparece aqui.</div>') + '</div>';
  const txt = $('#lote-txt');
  const contar = () => { const n = linhasLote().length, novas = linhasLote().filter(t => !S.hist.some(h => slug(h.termo) === slug(t) && Date.now() - new Date(h.em) < 6 * 36e5)).length; $('#lote-est').textContent = n ? n + ' palavra(s) · até ' + novas * 6 + ' créditos' : ''; };
  txt.oninput = contar;
  $('#lote-ir').onclick = rodarLote;
}
function linhasLote() { return [...new Set(($('#lote-txt').value || '').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length >= 2))].slice(0, 20); }
async function rodarLote() {
  const termos = linhasLote(); if (!termos.length) return;
  const bt = $('#lote-ir'), prog = $('#lote-prog'); bt.disabled = true; prog.classList.remove('hidden'); loteRes = []; erro('');
  for (let i = 0; i < termos.length; i++) {
    $('#lote-est').textContent = 'Pesquisando ' + (i + 1) + ' de ' + termos.length + ': ' + termos[i];
    try { const d = await api('/api/pesquisa', { method: 'POST', body: JSON.stringify({ termo: termos[i] }) }); guardar(d); loteRes.push(resumo(d)); }
    catch (e) { loteRes.push({ termo: termos[i], erro: e.message }); if (e.status === 401) break; }
    prog.firstChild.style.width = ((i + 1) / termos.length * 100) + '%';
    if ($('#lote-res')) $('#lote-res').innerHTML = rankingLote();
  }
  bt.disabled = false; $('#lote-est').textContent = 'Pronto: ' + loteRes.filter(x => !x.erro).length + ' de ' + termos.length + '.';
}
function rankingLote() {
  const ok = loteRes.filter(x => !x.erro).sort((a, b) => b.nota - a.nota), ruins = loteRes.filter(x => x.erro);
  return '<h2>🏁 Ranking</h2>' + barrasH(ok.map(x => ({ rotulo: x.termo, valor: x.nota, termo: x.termo, cor: 'var(--brand)', dica: '<b>' + esc(x.termo) + '</b><br>Nota ' + x.nota + ' · ' + brl(x.precoMediano) })), { max: 100 }) +
    (ok.length ? tabelaPesquisas(ok) : '') + (ruins.length ? '<p class="small muted">Não deu: ' + ruins.map(x => esc(x.termo) + ' (' + esc(x.erro) + ')').join(' · ') + '</p>' : '');
}

// ───────────────────────── 💵 SIMULADOR DE FATURAMENTO ─────────────────────────
// "Se eu vender X unidades a R$ Y, quanto entra e quanto sobra?" Em números grandes.
function simBloco(r, qtd, canal, op) {
  op = op || {};
  const q = Math.max(0, Number(qtd) || 0), u = r[canal] || {}, nomeC = id => (r[id] && r[id].nome) || (CANAIS[canalDaTaxa(id)] || {}).nome || id;
  const tot = k => (Number(u[k]) || 0) * q;
  const fat = tot('preco'), taxas = tot('comissao') + tot('fixo') + tot('frete'), imp = tot('imposto'), cus = tot('custo'), lucro = tot('lucro');
  const big = (rot, val, cls, sub, tip) => '<div class="big ' + (cls || '') + '"><div class="big-l">' + rot + (tip ? ' <button type="button" class="ajuda" data-txt="' + esc(tip) + '">?</button>' : '') + '</div><div class="big-v">' + val + '</div>' + (sub ? '<div class="big-s">' + sub + '</div>' : '') + '</div>';
  const pq = n => (fat ? ' · ' + pct(n / fat * 100) : '');
  return '<div class="sim">' +
    '<h2>💵 Simulador: quanto vou ter? <button type="button" class="ajuda" data-txt="Digite quantas unidades pretende vender e o preço. O Radar tira a comissão, a taxa fixa, o frete, o imposto e o seu custo de cada venda e mostra o que entra e o que sobra no bolso.">?</button></h2>' +
    '<div class="sim-entradas"><label>Se eu vender<span class="sim-in"><input type="number" min="0" step="1" data-sim="qtd" value="' + q + '"> unidades</span></label>' +
      '<label>no<select data-sim="canal">' + Object.keys(r).map(id => '<option value="' + id + '"' + (id === canal ? ' selected' : '') + '>' + esc(nomeC(id)) + '</option>').join('') + '</select></label>' +
      '<label>a<span class="sim-in">R$ <input type="number" min="0" step="0.01" data-sim="preco" value="' + (op.preco != null ? op.preco : (u.preco || '')) + '"> cada</span></label>' +
      (op.extra || '') + '</div>' +
    '<div class="chips" style="margin:8px 0 14px">' + [10, 50, 100, 300, 500, 1000].map(n => '<button type="button" class="chip' + (n === q ? ' on' : '') + '" data-sim-q="' + n + '">' + num(n) + ' un.</button>').join('') + '</div>' +
    '<div class="bigs">' +
      big('Faturamento', brl0(fat), '', num(q) + ' × ' + brl(u.preco), 'Tudo o que o comprador paga: unidades × preço. Ainda não é seu, as taxas saem daqui.') +
      big('Taxas do marketplace', '− ' + brl0(taxas), 'neg', 'comissão + taxa fixa + frete' + pq(taxas), 'Comissão, taxa fixa por unidade e o frete grátis que você banca. É o que o marketplace fica.') +
      big('Imposto', '− ' + brl0(imp), 'neg', pct(cfg().imposto) + ' sobre a venda', 'Imposto sobre a venda (ajuste a porcentagem em Taxas).') +
      big('Custo de produção', '− ' + brl0(cus), 'neg', op.semCusto ? '⚠️ coloque o custo acima' : brl(u.custo) + ' por unidade', 'Custo de produção + embalagem, vezes as unidades.') +
      big('Lucro no bolso', brl0(lucro), lucro >= 0 ? 'lucro' : 'prejuizo', (u.margem != null ? 'margem ' + pct(u.margem) + ' · ' : '') + brl(u.lucro) + ' por unidade', 'O que sobra depois de tudo. É o dinheiro que é seu de verdade.') +
    '</div>' +
    '<div class="sim-ano">Em 12 meses nesse ritmo: <b>' + brl0(fat * 12) + '</b> de faturamento e <b class="' + (lucro >= 0 ? 'lucro-pos' : 'lucro-neg') + '">' + brl0(lucro * 12) + '</b> de lucro.</div>' +
    '<div class="tabela-wrap"><table class="sim-comp"><thead><tr><th>Mesmas ' + num(q) + ' unidades no…</th><th class="num">Preço</th><th class="num">Faturamento</th><th class="num">Lucro no bolso</th></tr></thead><tbody>' +
      Object.entries(r).sort((a, b) => b[1].lucro - a[1].lucro).map(([id, x]) => '<tr' + (id === canal ? ' class="sim-sel"' : '') + '><td>' + logo(canalDaTaxa(id)) + ' ' + esc(nomeC(id)) + '</td><td class="num">' + brl(x.preco) + '</td><td class="num">' + brl0(x.preco * q) + '</td><td class="num ' + (x.lucro >= 0 ? 'lucro-pos' : 'lucro-neg') + '"><b>' + brl0(x.lucro * q) + '</b></td></tr>').join('') +
    '</tbody></table></div></div>';
}
function ligarSim(raiz, mudou) {
  const box = $(raiz), val = k => box.querySelector('[data-sim="' + k + '"]');
  const ler = precoMudou => ({ qtd: Number(val('qtd').value) || 0, canal: val('canal').value, preco: precoMudou ? (Number(val('preco').value) || 0) : null });
  val('qtd').onchange = () => mudou(ler(false));
  val('canal').onchange = () => mudou(ler(false));
  val('preco').onchange = () => mudou(ler(true));
  box.querySelectorAll('[data-sim-q]').forEach(b => b.onclick = () => { val('qtd').value = b.dataset.simQ; mudou(ler(false)); });
  box.querySelectorAll('[data-sim-extra]').forEach(i => i.onchange = () => mudou(ler(false)));
}
// aba própria: sem precisar pesquisar nada
function pintarSimulador() {
  const box = $('#aba-simulador'), c = cfg(), st = ls.get('radar_sim_livre', { qtd: 10, canal: 'mercadolivre', preco: 10, custo: 0, emb: 0 });
  box.innerHTML = '<h1 class="titulo-aba">Simulador de faturamento</h1><p class="sub-aba">Coloque quantas unidades, o preço e o seu custo: o Radar mostra o faturamento e o que sobra no bolso em cada canal, já tirando comissão, taxa fixa, frete e imposto.</p><div class="card" style="margin-top:14px" id="sim-livre"></div>';
  function desenhar() {
    const r = {};
    Object.entries(c.taxas).forEach(([id, t]) => { r[id] = { nome: t.nome, ...Margem.calcularCanal(id === st.canal ? st.preco : st.preco, st.custo, st.emb, c.imposto, t) }; });
    $('#sim-livre').innerHTML = simBloco(r, st.qtd, r[st.canal] ? st.canal : Object.keys(r)[0], { preco: st.preco, semCusto: !st.custo,
      extra: '<label>custo de produção<span class="sim-in">R$ <input type="number" min="0" step="0.01" data-sim-extra="custo" value="' + (st.custo || '') + '" placeholder="0,00"></span></label><label>embalagem<span class="sim-in">R$ <input type="number" min="0" step="0.01" data-sim-extra="emb" value="' + (st.emb || '') + '" placeholder="0,00"></span></label>' }) +
      '<p class="aviso">O frete usa o valor de referência de cada canal (sem peso). Para o frete pelo peso e a comissão oficial da categoria, use o simulador dentro de uma pesquisa, no card "Vale a pena?".</p>';
    ligarSim('#sim-livre', x => {
      st.qtd = x.qtd; st.canal = x.canal; if (x.preco != null) st.preco = x.preco;
      st.custo = Number($('[data-sim-extra="custo"]').value) || 0; st.emb = Number($('[data-sim-extra="emb"]').value) || 0;
      ls.set('radar_sim_livre', st); desenhar();
    });
  }
  desenhar();
}

// ───────────────────────── ⚙️ TAXAS ─────────────────────────
function pintarTaxas() {
  const c = cfg(), box = $('#aba-taxas');
  const campos = [['comissao', 'Comissão %'], ['fixoAbaixo', 'Taxa fixa (R$)'], ['limiteFixo', 'Taxa fixa abaixo de (R$)'], ['freteAcima', 'Frete pago acima (R$)'], ['tetoComissao', 'Teto da comissão (R$)']];
  box.innerHTML = '<h1 class="titulo-aba">Taxas e impostos</h1><p class="sub-aba">Valores usados na calculadora de margem, iguais para todo o time. Os marketplaces mudam as regras com frequência e as taxas variam por categoria: confira no painel de vendedor de cada um.</p>' +
    '<div class="card taxas-tab" style="margin-top:14px"><div class="calc-entradas"><label>Imposto sobre a venda (%)<input type="number" step="0.1" id="tx-imp" value="' + c.imposto + '"></label><label>Meta de margem (%)<input type="number" step="1" id="tx-alvo" value="' + c.margemAlvo + '"></label></div>' +
    '<div class="tabela-wrap"><table><thead><tr><th>Canal</th>' + campos.map(([, n]) => '<th class="num">' + n + '</th>').join('') + '</tr></thead><tbody>' +
    Object.entries(c.taxas).map(([id, t]) => '<tr><td>' + logo(canalDaTaxa(id)) + ' ' + esc(t.nome) + '</td>' + campos.map(([k]) => '<td class="num"><input type="number" step="0.01" data-tx="' + id + '.' + k + '" value="' + (t[k] >= 1e8 ? '' : t[k]) + '"' + (k === 'limiteFixo' && t[k] >= 1e8 ? ' placeholder="sempre"' : '') + '></td>').join('') + '</tr>').join('') +
    '</tbody></table></div>' +
    '<h2 style="margin-top:16px">' + logo('shopee') + ' Shopee: comissão por faixa de preço <span class="tag">substitui a comissão e a taxa fixa da linha da Shopee</span></h2>' +
    '<div class="tabela-wrap"><table><thead><tr><th class="num">De (R$)</th><th class="num">Até (R$)</th><th class="num">Comissão %</th><th class="num">Fixo por item (R$)</th></tr></thead><tbody>' +
    ((c.taxas.shopee && c.taxas.shopee.faixas) || []).map((f, i) => '<tr>' + f.map((v, j) => '<td class="num"><input type="number" step="0.01" data-sf="' + i + '.' + j + '" value="' + (v >= 1e8 ? '' : v) + '"' + (j === 1 && v >= 1e8 ? ' placeholder="sem limite"' : '') + '></td>').join('') + '</tr>').join('') +
    '</tbody></table></div><p class="aviso">Referência nov/2026 (CNPJ): até R$ 79,99 → 20% + R$ 4 · R$ 80–99,99 → 14% + R$ 16 · R$ 100–199,99 → 14% + R$ 20 · R$ 200+ → 14% + R$ 26. Frete grátis incluso. Vendedor CPF paga + R$ 3 por item (some no fixo).</p>' +
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="pri" id="tx-salvar">Salvar para o time</button><button type="button" id="tx-padrao">Voltar ao padrão</button><span class="small muted" id="tx-est"></span></div>' +
    '<p class="aviso">Taxa fixa: cobrada por unidade quando o preço fica abaixo do limite. Frete: o que você paga do frete grátis quando o preço fica acima do limite. Deixe o limite vazio para a taxa fixa valer sempre.</p></div>';
  $('#tx-salvar').onclick = async () => {
    marcarTrilha('taxas');
    const taxas = {};
    $$('[data-tx]').forEach(i => { const [id, k] = i.dataset.tx.split('.'); taxas[id] = taxas[id] || {}; taxas[id][k] = i.value === '' ? (k === 'limiteFixo' ? 1e9 : 0) : Number(i.value); });
    const faixas = [];
    $$('[data-sf]').forEach(i => { const [l, col] = i.dataset.sf.split('.').map(Number); (faixas[l] = faixas[l] || [])[col] = i.value === '' ? (col === 1 ? 1e9 : 0) : Number(i.value); });
    if (faixas.length) { taxas.shopee = taxas.shopee || {}; taxas.shopee.faixas = faixas.filter(f => f && f.length === 4); }
    try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'taxas', imposto: Number($('#tx-imp').value), margemAlvo: Number($('#tx-alvo').value), taxas }) }); $('#tx-est').textContent = '✔ Salvo para todo o time.'; }
    catch (e) { erro(e.message); }
  };
  $('#tx-padrao').onclick = async () => {
    if (!confirm('Voltar as taxas ao padrão para todo o time?')) return;
    try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'taxas', restaurar: true }) }); pintarTaxas(); } catch (e) { erro(e.message); }
  };
  // 📦 tabela de frete por peso (Mercado Livre e Amazon; na Shopee o frete entra na comissão)
  const fr = c.fretes || Frete.FAIXAS_PADRAO;
  const tabela = id => '<div><b>' + logo(id) + ' ' + CANAIS[id].nome + '</b><table class="frete-tab"><thead><tr><th class="num">Até (kg)</th><th class="num">Frete (R$)</th></tr></thead><tbody>' +
    (fr[id] || []).concat([['', '']]).map(([kg, v], i) => '<tr><td class="num"><input type="number" step="0.01" min="0" data-fr="' + id + '.' + i + '.0" value="' + kg + '"></td><td class="num"><input type="number" step="0.01" min="0" data-fr="' + id + '.' + i + '.1" value="' + v + '"></td></tr>').join('') + '</tbody></table></div>';
  box.insertAdjacentHTML('beforeend', '<div class="card taxas-tab" style="margin-top:14px"><h2>📦 Frete pelo peso <span class="tag">usado quando o produto tem peso informado</span></h2>' +
    '<p class="small muted">Quanto o vendedor paga do frete grátis em cada faixa de peso (o maior entre peso real e cubado). Valores de referência: confira na tabela do seu nível de reputação. Use a linha vazia para acrescentar uma faixa.</p>' +
    '<div class="grid g2" style="margin-top:0">' + tabela('mercadolivre') + tabela('amazon') + '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="pri" id="fr-salvar">Salvar tabela de frete</button><button type="button" id="fr-padrao">Voltar ao padrão</button><span class="small muted" id="fr-est"></span></div></div>');
  $('#fr-salvar').onclick = async () => {
    const fretes = { mercadolivre: [], amazon: [] };
    $$('[data-fr]').forEach(i => { const [id, n, k] = i.dataset.fr.split('.'); (fretes[id][n] = fretes[id][n] || [])[k] = i.value === '' ? null : Number(i.value); });
    for (const id of Object.keys(fretes)) fretes[id] = fretes[id].filter(f => f && f[0] > 0 && f[1] != null);
    try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'fretes', fretes }) }); $('#fr-est').textContent = '✔ Tabela salva para o time.'; pintarTaxas(); }
    catch (e) { erro(e.message); }
  };
  $('#fr-padrao').onclick = async () => {
    if (!confirm('Voltar a tabela de frete ao padrão?')) return;
    try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'fretes', restaurar: true }) }); pintarTaxas(); } catch (e) { erro(e.message); }
  };
}

// ───────────────────────── 🎯 PREÇO IDEAL ─────────────────────────
function faixaPrecos(pi, cor) {
  if (!pi.suficiente) return '<div class="vazio">' + esc(pi.motivo) + '</div>';
  const vals = pi.pontos.map(p => p.preco).concat([pi.sugerido, pi.precoMinimo].filter(v => v > 0));
  const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05, X = v => (v - lo) / (hi - lo) * 100;
  return '<div class="regua">' +
    '<div class="regua-faixa" style="left:' + X(pi.p25) + '%;width:' + Math.max(1, X(pi.p50) - X(pi.p25)) + '%" data-tip="Faixa competitiva: ' + brl(pi.p25) + ' a ' + brl(pi.p50) + '"></div>' +
    pi.pontos.map(p => '<span class="regua-ponto' + ((p.vendidos || 0) >= 100 ? ' forte' : '') + '" style="left:' + X(p.preco) + '%;background:' + cor + '" data-tip="' + esc(brl(p.preco) + ((p.vendidos != null) ? ' · ' + num(p.vendidos) + '+ vendidos' : '')) + '"></span>').join('') +
    (pi.precoMinimo ? '<span class="regua-min" style="left:' + X(pi.precoMinimo) + '%" data-tip="Seu preço mínimo para a meta: ' + brl(pi.precoMinimo) + '"></span>' : '') +
    '<span class="regua-sug" style="left:' + X(pi.sugerido) + '%" data-tip="Sugerido: ' + brl(pi.sugerido) + '">▼</span></div>' +
    '<div class="eixo"><span>' + brl(lo) + '</span><span>' + brl(hi) + '</span></div>';
}
function pintarPrecoIdeal(d, margens) {
  const box = $('#card-preco'); if (!box || !window.PrecoIdeal) return;
  const linhas = Object.keys(CANAIS).map(k => {
    const m = d.marketplaces[k];
    const pontos = (m.itens || []).filter(i => i.anuncio && i.preco).map(i => ({ preco: i.preco, vendidos: i.vendidos }));
    if (k !== 'mercadolivre' && d.shopping) d.shopping.itens.filter(i => i.preco && new RegExp(CANAIS[k].nome.split(' ')[0], 'i').test(i.loja || '')).forEach(i => pontos.push({ preco: i.preco, vendidos: null }));
    const minimo = margens && margens[k] ? margens[k].precoMinimo : null;
    return { k, pi: PrecoIdeal.precoIdeal(pontos, minimo) };
  });
  S.extras = Object.assign(S.extras || {}, { precoIdeal: Object.fromEntries(linhas.map(x => [x.k, { sugerido: x.pi.sugerido, p25: x.pi.p25, p50: x.pi.p50, situacao: x.pi.situacao }])) });
  const SIT = { folga: ['✔', 'var-pos'], apertado: ['◐', ''], acima: ['✖', 'var-neg'], 'sem-custo': ['ⓘ', ''] };
  box.innerHTML = '<h2>🎯 Preço ideal por canal <span class="tag">● concorrente · ● grande = 100+ vendidos · faixa = competitiva · | = seu mínimo · ▼ = sugerido</span></h2>' +
    '<div class="grid g3" style="margin-top:0">' + linhas.map(({ k, pi }) => '<div class="onde-canal"><div class="onde-c">' + logo(k) + ' <b>' + CANAIS[k].nome + '</b>' + (pi.suficiente ? '<span class="badge" style="margin-left:auto">' + brl(pi.sugerido) + '</span>' : '') + '</div>' +
      faixaPrecos(pi, CANAIS[k].cor) + (pi.suficiente ? '<p class="small ' + (SIT[pi.situacao] || [, ''])[1] + '">' + (SIT[pi.situacao] || ['', ''])[0] + ' ' + esc(pi.texto) + '</p>' : '') + '</div>').join('') + '</div>';
}

// ───────────────────────── 🗣️ RECLAMAÇÕES ─────────────────────────
async function pintarAvaliacoes(d, atualizar) {
  const box = $('#card-aval'); if (!box) return;
  box.innerHTML = '<h2>🗣️ O que os compradores reclamam <span class="tag">avaliações dos concorrentes no Mercado Livre</span></h2><div class="vazio"><span class="carregando"></span>Lendo avaliações…</div>';
  let r;
  try { r = await api('/api/avaliacoes', { method: 'POST', body: JSON.stringify({ termo: d.termo, atualizar: !!atualizar }) }); }
  catch (e) { box.innerHTML = '<h2>🗣️ O que os compradores reclamam</h2><div class="vazio">' + esc(e.message) + '</div>'; return; }
  if (!$('#card-aval') || S.atual !== d) return;
  if (!r.anuncios) { box.innerHTML = '<h2>🗣️ O que os compradores reclamam</h2><div class="vazio">' + esc(r.motivo || 'Sem avaliações disponíveis.') + '</div>'; return; }
  const ia = r.ia;
  box.innerHTML = '<h2>🗣️ O que os compradores reclamam <span class="tag">' + r.anuncios + ' anúncios · ' + r.lidas + ' avaliações lidas · <a href="#" id="aval-atualizar">atualizar</a></span></h2>' +
    (ia ? '<div class="grid g2" style="margin-top:0"><div><b>Reclamações mais comuns</b><ul class="onde-lista contras">' + ia.reclamacoes.map(x => '<li>✖ <b>' + esc(x.tema) + '</b> (' + esc(x.quanto) + '): “' + esc(x.exemplo) + '”</li>').join('') + '</ul>' +
        '<b style="display:block;margin-top:10px">O que elogiam</b><ul class="onde-lista pros">' + ia.elogios.map(x => '<li>✔ ' + esc(x) + '</li>').join('') + '</ul></div>' +
        '<div><b>🏭 Melhore no produto</b><ul class="onde-lista">' + ia.melhoriasProduto.map(x => '<li>→ ' + esc(x) + '</li>').join('') + '</ul>' +
        '<b style="display:block;margin-top:10px">📝 Deixe claro no anúncio</b><ul class="onde-lista">' + ia.melhoriasAnuncio.map(x => '<li>→ ' + esc(x) + '</li>').join('') + '</ul></div></div>'
      : (r.temas.length ? barrasH(r.temas.map(t => ({ rotulo: t.tema, valor: t.vezes, cor: 'var(--bad)', dica: esc(t.tema) + ': ' + t.vezes + '<br>' + t.exemplos.map(e => '“' + esc(e) + '”').join('<br>') })), {}) +
          '<div class="paa" style="margin-top:10px">' + r.temas.slice(0, 4).map(t => '<details><summary>' + esc(t.tema) + ' (' + t.vezes + ')</summary>' + t.exemplos.map(e => '<p class="small">“' + esc(e) + '”</p>').join('') + '</details>').join('') + '</div>'
        : '<div class="vazio">Das ' + r.lidas + ' avaliações lidas, ' + r.negativos + ' são negativas e nenhuma cai nos temas comuns. Bom sinal: o produto dos concorrentes agrada.</div>') +
        '<p class="aviso">' + r.negativos + ' avaliações negativas e ' + r.positivos + ' positivas. Com a chave da IA, o painel resume e sugere as melhorias.</p>');
  const at = $('#aval-atualizar'); if (at) at.onclick = e => { e.preventDefault(); pintarAvaliacoes(d, true); };
}

// ───────────────────────── 📸 FOTOS ─────────────────────────
function pintarFotos(d) {
  const box = $('#card-fotos'); if (!box) return;
  const t = d.termo, det = ((cfg().custos || {})[slug(t)] || {}).detalhes || '';
  const cenas = [
    ['Capa (fundo branco)', `Foto de produto em estúdio, fundo 100% branco, ${t}${det ? ' (' + det + ')' : ''}, rolo inteiro e um pedaço desenrolado mostrando a espuma e o liner, luz suave, sem sombras duras, nítido, quadrado 1200x1200.`],
    ['Uso real', `Mãos aplicando ${t} no verso de um espelho apoiado numa bancada de marcenaria, close nas tiras coladas em paralelo, luz natural de oficina, foto realista.`],
    ['Resultado', `Espelho grande fixado na parede de um banheiro moderno, acabamento limpo, sem parafusos aparentes, ambiente claro, foto realista de catálogo.`],
    ['Medidas', `Infográfico limpo em fundo branco com ${t} e setas indicando largura, espessura e comprimento do rolo, textos grandes e legíveis, estilo marketplace.`],
    ['Comparação de larguras', `Vários rolos de ${t} lado a lado em larguras diferentes, etiquetas com a medida de cada um, fundo branco, organizado.`],
    ['Prova de força', `Espelho pesado preso só com ${t}, legenda "segura X kg a cada 10 cm", estilo infográfico de marketplace, fundo claro.`],
  ];
  box.innerHTML = '<h2>📸 Fotos do anúncio <span class="tag">roteiro + pedidos prontos para IA de imagem</span></h2>' +
    '<ul class="onde-lista" style="margin-bottom:10px"><li>→ <b>Mercado Livre:</b> capa com fundo branco puro, sem texto, logo ou marca d’água; mínimo 500 px (ideal 1200 px); até 10 fotos.</li>' +
    '<li>→ <b>Shopee:</b> capa quadrada 1:1, 1024 px; pode usar selo e texto curto nas fotos secundárias; vídeo de até 60 s ajuda muito.</li>' +
    '<li>→ <b>Amazon:</b> imagem principal com fundo branco RGB 255,255,255, produto ocupando 85% do quadro, mínimo 1000 px para ter zoom.</li></ul>' +
    '<div class="tabela-wrap"><table><thead><tr><th>Foto</th><th>Pedido para a IA de imagem</th><th></th></tr></thead><tbody>' +
    cenas.map(([n, p]) => '<tr><td><b>' + n + '</b></td><td class="small">' + esc(p) + '</td><td><button type="button" class="copiar" data-copiar="' + esc(p) + '">copiar</button></td></tr>').join('') + '</tbody></table></div>' +
    '<p class="aviso">Para gerar as imagens, mande uma foto do produto aqui no chat comigo: eu gero as cenas a partir dela. A IA de imagem pode errar medidas e texto: use as fotos geradas como apoio, não como prova técnica.</p>';
  $$('#card-fotos [data-copiar]').forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copiar); b.textContent = '✔ copiado'; });
}

// ───────────────────────── 🧭 PLANO DE VENDAS ─────────────────────────
function pintarPlano(d) {
  const box = $('#card-plano'); if (!box) return;
  const x = S.extras || {}, rec = x.recomendacao, pi = x.precoIdeal || {}, m = x.margens || {};
  const acoes = [];
  const venc = rec && rec.vencedor;
  if (venc) acoes.push(['Canal principal', `Comece ${venc === 'mercadolivre' ? 'pelo Mercado Livre' : venc === 'shopee' ? 'pela Shopee' : 'pela Amazon'}${pi[venc] && pi[venc].sugerido ? ` a ${brl(pi[venc].sugerido)}` : ''}. Concentre estoque e avaliações num canal antes de abrir os outros.`]);
  if (m.mercadolivre && m.mercadolivrePremium) {
    const dif = m.mercadolivre.lucro - m.mercadolivrePremium.lucro;
    acoes.push(['Clássico ou Premium (ML)', dif > 0 ? `Comece no Clássico (rende ${brl(dif)} a mais por unidade). Crie um anúncio Premium igual quando tiver avaliações: ele aparece com parcelamento sem juros e costuma converter mais.` : 'O Premium sai melhor no seu preço.']);
  }
  if (x.kits) {
    const melhor = Object.entries(x.kits).map(([n, k]) => [n, k.canais.mercadolivre && k.canais.mercadolivre.ganhoVsUnidade]).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1])[0];
    if (melhor) acoes.push(['Kit', `Crie o Kit ${melhor[0]}: cada unidade rende ${brl(melhor[1])} a mais que vendida sozinha, e passar de R$ 79 dá frete grátis ao comprador (destaque na busca).`]);
  }
  acoes.push(['Variações num anúncio só', 'Agrupe as larguras como variações do mesmo anúncio (no ML, use "variações" ou o catálogo). As vendas e avaliações se somam e o anúncio sobe na busca mais rápido do que vários anúncios separados.']);
  acoes.push(['Primeiras vendas', 'Os 10 a 20 primeiros pedidos destravam o algoritmo. Comece com o preço na faixa competitiva, peça avaliação na embalagem (cartão com QR) e responda perguntas em menos de 1 hora.']);
  acoes.push(['Anúncios pagos', 'Ligue o Mercado Ads / Shopee Ads só no anúncio principal, com orçamento diário pequeno, e meça o ACOS (gasto ÷ venda). Corte palavras que gastam sem vender.']);
  acoes.push(['Full e prazo', 'Quando vender todo dia, mande estoque para o Mercado Livre Full (entrega em 1 dia, selo Full): costuma aumentar muito a conversão.']);
  acoes.push(['Vender para o profissional', 'Vidraçarias, marcenarias e lojas de material de construção compram em volume. Ofereça caixa fechada com preço de atacado (mesmo anúncio com "kit 10"/"kit 20" ou venda direta pelo WhatsApp).']);
  acoes.push(['Datas', 'Prepare estoque 30 dias antes das datas da aba 📅 Calendário (Black Friday e 11.11 são as maiores).']);
  box.innerHTML = '<h2>🧭 Plano de vendas <span class="tag">ações práticas a partir desta pesquisa</span></h2><ol class="plano">' + acoes.map(([t, a]) => '<li><b>' + esc(t) + ':</b> ' + esc(a) + '</li>').join('') + '</ol>';
}

// ───────────────────────── 📦 CATÁLOGO ─────────────────────────
let CAT = null;
const MODELO_EVA = { nome: 'Fita de EVA para espelho autocolante', palavraChave: 'fita eva espelho dupla face', marca: '', detalhes: 'Espuma de EVA com adesivo dos dois lados, para fixar espelho', variacoes: [
  { rotulo: '12 mm x 2 m', palavraChave: 'fita dupla face espuma 12mm espelho' }, { rotulo: '19 mm x 2 m', palavraChave: 'fita dupla face espuma 19mm espelho' },
  { rotulo: '25 mm x 2 m', palavraChave: 'fita dupla face espuma 25mm espelho' }, { rotulo: '19 mm x 10 m', palavraChave: 'fita eva espelho 19mm 10 metros' },
  { rotulo: '19 mm x 20 m (profissional)', palavraChave: 'fita eva espelho 19mm 20 metros' }] };
async function pintarCatalogo() {
  const box = $('#aba-catalogo');
  box.innerHTML = '<h1 class="titulo-aba">Catálogo da fábrica</h1><p class="sub-aba">Cadastre seus produtos e as variações (largura, comprimento...). O Radar mostra quais dão mais lucro e onde vender cada uma.</p><div id="cat-corpo"><div class="vazio"><span class="carregando"></span>carregando…</div></div>';
  try { CAT = (await api('/api/catalogo')).produtos || []; } catch (e) { $('#cat-corpo').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
  desenharCatalogo();
}
function variacaoAnalise(v, prod) {
  const termo = (v.palavraChave || (prod.palavraChave + ' ' + v.rotulo)).trim();
  const d = ls.get('radar_dados', {})[slug(termo)] || null, h = S.hist.find(x => slug(x.termo) === slug(termo));
  if (!d && !h) return { termo, pesquisado: false };
  const c = cfg();
  const precos = {}; Object.keys(c.taxas).forEach(id => { const m = d && d.marketplaces[canalDaTaxa(id)]; precos[id] = v.preco || (m && m.precos.mediana) || (d ? d.precos.mediana : h.precoMediano) || 0; });
  const peso = Frete.pesoConsiderado(v.pesoKg, v.comp, v.larg, v.alt), fretes = {};
  Object.keys(c.taxas).forEach(id => { const f = Frete.fretePorPeso(canalDaTaxa(id), peso.considerado, c.fretes); if (f != null) fretes[id] = f; });
  const r = Margem.calcular({ precos, custo: v.custo, embalagem: v.embalagem, imposto: c.imposto, margemAlvo: c.margemAlvo, taxas: c.taxas, fretes });
  const melhor = Object.entries(r).filter(([id]) => id !== 'mercadolivrePremium').sort((a, b) => b[1].lucro - a[1].lucro)[0];
  const rec = d && window.Recomendacao ? Recomendacao.recomendar(d, v.custo ? { mercadolivre: r.mercadolivre, shopee: r.shopee, amazon: r.amazon } : null) : null;
  return { termo, pesquisado: true, nota: h ? h.nota : d.validacao.nota, nivel: h ? h.nivel : d.validacao.nivel, precoMediano: h ? h.precoMediano : d.precos.mediana, melhor, rec, r };
}
function desenharCatalogo() {
  const box = $('#cat-corpo');
  const modelo = !CAT.some(p => /eva/i.test(p.nome)) ? '<button type="button" class="sec" id="cat-modelo">➕ Usar modelo: Fita de EVA para espelho (5 variações)</button> ' : '';
  let h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">' + modelo + '<button type="button" id="cat-novo">➕ Novo produto</button>' + (CAT.length ? ' <button type="button" id="cat-csv">⬇️ Planilha de cadastro (CSV)</button>' : '') + '</div>';
  if (!CAT.length) { box.innerHTML = h + '<div class="card"><div class="vazio">Nenhum produto ainda.</div></div>'; ligarCatalogo(); return; }
  const ranking = [];
  CAT.forEach(p => {
    const linhas = p.variacoes.map(v => ({ v, a: variacaoAnalise(v, p) }));
    linhas.forEach(x => { if (x.a.pesquisado && x.a.melhor && x.v.custo) ranking.push({ rotulo: p.nome.slice(0, 22) + ' · ' + x.v.rotulo, valor: Math.max(0, x.a.melhor[1].lucro), dica: esc(x.v.rotulo) + '<br>Melhor: ' + esc(x.a.melhor[1].nome) + ' · ' + brl(x.a.melhor[1].lucro) + ' (' + pct(x.a.melhor[1].margem) + ')<br>Nota ' + x.a.nota }); });
    h += '<div class="card" style="margin-top:14px" data-prod="' + p.id + '"><h2>📦 ' + esc(p.nome) + ' <span class="tag">palavra-chave: “' + esc(p.palavraChave || '—') + '”</span></h2>' +
      '<div class="tabela-wrap"><table class="cat-tab"><thead><tr><th>Variação</th><th>Palavra-chave</th><th class="num">Custo</th><th class="num">Embal.</th><th class="num">Peso kg</th><th class="num">C×L×A cm</th><th class="num">Seu preço</th><th class="num">Nota</th><th class="num">Preço mercado</th><th>Melhor canal (lucro/un.)</th><th></th></tr></thead><tbody>' +
      linhas.map(({ v, a }) => '<tr data-var="' + v.id + '"><td><input data-c="rotulo" value="' + esc(v.rotulo) + '" style="width:130px"></td><td><input data-c="palavraChave" value="' + esc(v.palavraChave) + '" placeholder="' + esc(p.palavraChave + ' ' + v.rotulo) + '" style="width:190px"></td>' +
        ['custo', 'embalagem', 'pesoKg'].map(k => '<td class="num"><input type="number" step="0.01" data-c="' + k + '" value="' + (v[k] || '') + '" style="width:72px"></td>').join('') +
        '<td class="num"><input type="number" data-c="comp" value="' + (v.comp || '') + '" style="width:48px">×<input type="number" data-c="larg" value="' + (v.larg || '') + '" style="width:48px">×<input type="number" data-c="alt" value="' + (v.alt || '') + '" style="width:48px"></td>' +
        '<td class="num"><input type="number" step="0.01" data-c="preco" value="' + (v.preco || '') + '" placeholder="mediana" style="width:80px"></td>' +
        (a.pesquisado ? '<td class="num">' + nivelTag(a.nivel).replace(NIVEL[a.nivel].nome, a.nota) + '</td><td class="num">' + brl(a.precoMediano) + '</td><td>' + (v.custo && a.melhor ? logo(canalDaTaxa(a.melhor[0])) + ' <b class="' + (a.melhor[1].lucro > 0 ? 'lucro-pos' : 'lucro-neg') + '">' + brl(a.melhor[1].lucro) + '</b> <span class="small muted">' + pct(a.melhor[1].margem) + '</span>' : '<span class="small muted">informe o custo</span>') + (a.rec && a.rec.vencedor ? '<div class="small muted">🏆 ' + esc(a.rec.ranking[0].nome) + ' ' + a.rec.ranking[0].nota + '/100</div>' : '') + '</td>'
          : '<td colspan="3"><button type="button" class="link" data-pesquisar="' + esc(a.termo) + '">🔎 pesquisar “' + esc(a.termo) + '”</button></td>') +
        '<td style="white-space:nowrap">' + (a.pesquisado ? '<button type="button" class="link" data-abrir="' + esc(a.termo) + '" title="Abrir pesquisa">↗</button> ' : '') + '<button type="button" class="link" data-tirar-var="' + v.id + '" title="Tirar variação">✖</button></td></tr>').join('') +
      '</tbody></table></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="pri" data-salvar-prod="' + p.id + '">Salvar</button><button type="button" data-add-var="' + p.id + '">➕ Variação</button><button type="button" data-pesq-todas="' + p.id + '">🔎 Pesquisar as não pesquisadas</button><button type="button" data-editar-prod="' + p.id + '">✏️ Nome e palavra-chave</button><button type="button" class="link" data-remover-prod="' + p.id + '">🗑️ Remover produto</button><span class="small muted" data-est="' + p.id + '"></span></div></div>';
  });
  if (ranking.length) h = h.replace('</div>', '</div><div class="card" style="margin-top:14px"><h2>🏆 Ranking de lucro por unidade (melhor canal de cada variação)</h2>' + barrasH(ranking.sort((a, b) => b.valor - a.valor), { formato: brl }) + '</div>');
  box.innerHTML = h;
  ligarCatalogo();
}
function lerProduto(id) {
  const p = JSON.parse(JSON.stringify(CAT.find(x => x.id === id)));
  $$('[data-prod="' + id + '"] tr[data-var]').forEach(tr => {
    const v = p.variacoes.find(x => x.id === tr.dataset.var); if (!v) return;
    tr.querySelectorAll('[data-c]').forEach(i => { const k = i.dataset.c; v[k] = i.type === 'number' ? (Number(i.value) || 0) : i.value.trim(); });
  });
  return p;
}
async function salvarProduto(p, est) {
  try { const r = await api('/api/catalogo', { method: 'POST', body: JSON.stringify({ acao: 'salvar', produto: p }) }); CAT = r.produtos; if (est) est.textContent = '✔ salvo'; return r.produto; }
  catch (e) { erro(e.message); return null; }
}
function ligarCatalogo() {
  const m = $('#cat-modelo'); if (m) m.onclick = async () => { await salvarProduto(MODELO_EVA); desenharCatalogo(); };
  $('#cat-novo').onclick = async () => { const nome = prompt('Nome do produto:'); if (!nome) return; const pc = prompt('Palavra-chave principal (como o cliente busca):', nome.toLowerCase()) || ''; await salvarProduto({ nome, palavraChave: pc, variacoes: [{ rotulo: 'padrão' }] }); desenharCatalogo(); };
  const csv = $('#cat-csv'); if (csv) csv.onclick = exportarCSV;
  $$('[data-salvar-prod]').forEach(b => b.onclick = async () => { await salvarProduto(lerProduto(b.dataset.salvarProd), $('[data-est="' + b.dataset.salvarProd + '"]')); desenharCatalogo(); });
  $$('[data-add-var]').forEach(b => b.onclick = async () => { const p = lerProduto(b.dataset.addVar); p.variacoes.push({ rotulo: 'nova' }); await salvarProduto(p); desenharCatalogo(); });
  $$('[data-tirar-var]').forEach(b => b.onclick = async () => { const id = b.closest('[data-prod]').dataset.prod, p = lerProduto(id); p.variacoes = p.variacoes.filter(v => v.id !== b.dataset.tirarVar); await salvarProduto(p); desenharCatalogo(); });
  $$('[data-editar-prod]').forEach(b => b.onclick = async () => { const p = lerProduto(b.dataset.editarProd); const n = prompt('Nome do produto:', p.nome); if (n == null) return; const pc = prompt('Palavra-chave principal:', p.palavraChave); if (pc == null) return; const det = prompt('Dados do produto (marca, material...) para o anúncio:', p.detalhes || ''); Object.assign(p, { nome: n, palavraChave: pc, detalhes: det || '' }); await salvarProduto(p); desenharCatalogo(); });
  $$('[data-remover-prod]').forEach(b => b.onclick = async () => { if (!confirm('Remover o produto e as variações do catálogo?')) return; try { CAT = (await api('/api/catalogo', { method: 'POST', body: JSON.stringify({ acao: 'remover', id: b.dataset.removerProd }) })).produtos; } catch (e) { erro(e.message); } desenharCatalogo(); });
  $$('[data-pesquisar]').forEach(b => b.onclick = async () => { const id = b.closest('[data-prod]').dataset.prod; await salvarProduto(lerProduto(id)); pesquisar(b.dataset.pesquisar); });
  $$('[data-pesq-todas]').forEach(b => b.onclick = async () => {
    const p = lerProduto(b.dataset.pesqTodas); await salvarProduto(p);
    const termos = p.variacoes.map(v => variacaoAnalise(v, p)).filter(a => !a.pesquisado).map(a => a.termo);
    if (!termos.length) return alert('Todas as variações já foram pesquisadas.');
    if (!confirm(termos.length + ' pesquisa(s), até ' + termos.length * 6 + ' créditos do Serper. Continuar?')) return;
    const est = $('[data-est="' + p.id + '"]');
    for (let i = 0; i < termos.length; i++) { est.textContent = 'Pesquisando ' + (i + 1) + ' de ' + termos.length + '…'; try { const d = await api('/api/pesquisa', { method: 'POST', body: JSON.stringify({ termo: termos[i] }) }); guardar(d); } catch (e) { erro(e.message); break; } }
    desenharCatalogo();
  });
}
// 📄 Planilha de cadastro em massa (CSV para abrir no Excel/Google Planilhas e copiar para o modelo do canal)
async function exportarCSV() {
  const linhas = [['Produto', 'Variação', 'SKU', 'Título Mercado Livre', 'Título Shopee', 'Título Amazon', 'Descrição', 'Destaques', 'Preço sugerido ML', 'Preço sugerido Shopee', 'Preço sugerido Amazon', 'Custo', 'Peso (kg)', 'Comprimento (cm)', 'Largura (cm)', 'Altura (cm)', 'Estoque', 'Marca', 'Palavra-chave']];
  for (const p of CAT) for (const v of p.variacoes) {
    const a = variacaoAnalise(v, p);
    let an = null;
    try { an = a.pesquisado ? await api('/api/historico?anuncio=1&termo=' + encodeURIComponent(a.termo)) : null; } catch (e) { an = null; }
    const t = k => an && an[k] && an[k].titulos ? an[k].titulos[0] : (p.nome + ' ' + v.rotulo);
    const pis = a.pesquisado && a.r ? a.r : null;
    linhas.push([p.nome, v.rotulo, v.sku, t('mercadolivre'), t('shopee'), t('amazon'), an && an.mercadolivre ? an.mercadolivre.descricao : '', an && an.mercadolivre ? an.mercadolivre.destaques.join(' | ') : '',
      pis ? (pis.mercadolivre.precoMinimo || '') : '', pis ? (pis.shopee.precoMinimo || '') : '', pis ? (pis.amazon.precoMinimo || '') : '', v.custo, v.pesoKg, v.comp, v.larg, v.alt, v.estoque || '', p.marca, a.termo]);
  }
  const cel = x => { const s = String(x == null ? '' : x).replace(/\r?\n/g, ' ⏎ '); return /[";]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const texto = '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })); a.download = 'radar-cadastro-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
}

// ───────────────────────── 🛒 MINHA LOJA (Mercado Livre) ─────────────────────────
async function pintarLoja() {
  const box = $('#aba-loja');
  box.innerHTML = '<h1 class="titulo-aba">Minha loja no Mercado Livre</h1><p class="sub-aba">Suas vendas, visitas e conversão reais dos últimos 30 dias, anúncio por anúncio.</p><div id="loja-corpo"><div class="vazio"><span class="carregando"></span>carregando…</div></div>';
  const q = new URLSearchParams(location.search).get('ml');
  if (q) { erro(q === 'ok' ? '' : 'Não consegui conectar ao Mercado Livre (' + q + '). Tente de novo.'); history.replaceState(null, '', location.pathname + '#loja'); }
  let r;
  try { r = await api('/api/ml-conta'); } catch (e) { $('#loja-corpo').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
  const c = $('#loja-corpo'); if (!c) return;
  if (!r.conectado) {
    c.innerHTML = '<div class="card" style="margin-top:14px"><h2>' + logo('mercadolivre', true) + ' Conectar a sua conta</h2>' +
      (r.configurado ? '<p>Você vai para o Mercado Livre, entra com a sua conta de vendedor e autoriza o Radar a <b>ler</b> seus anúncios, visitas e vendas. O Radar não altera nada na sua conta.</p><button type="button" class="pri" id="ml-conectar">Conectar Mercado Livre</button>' + (r.expirado ? '<p class="small muted">A autorização anterior venceu. Conecte de novo.</p>' : '')
        : '<p>Para conectar, é preciso criar um app (gratuito) no Mercado Livre, uma vez só:</p><ol class="plano"><li>Entre em <b>developers.mercadolivre.com.br</b> com a conta de vendedor → <b>Criar aplicação</b>.</li><li>Em <b>URL de redirect</b>, coloque exatamente: <code>' + esc(r.redirect) + '</code></li><li>Em permissões, marque leitura de <b>usuários, itens, pedidos e métricas</b>.</li><li>Copie o <b>Client ID</b> e o <b>Client Secret</b> para a Vercel como <code>ML_CLIENT_ID</code> e <code>ML_CLIENT_SECRET</code> e me avise para eu publicar de novo.</li></ol>') + '</div>';
    const b = $('#ml-conectar'); if (b) b.onclick = async () => { try { const x = await api('/api/ml-conta', { method: 'POST', body: JSON.stringify({ acao: 'conectar' }) }); location.href = x.url; } catch (e) { erro(e.message); } };
    return;
  }
  if (r.erro) { c.innerHTML = '<div class="vazio">' + esc(r.erro) + '</div>'; return; }
  const t = r.totais;
  c.innerHTML = '<div class="grid g4">' +
    '<div class="kpi"><div class="ic">🧾</div><div class="l">Pedidos (30 dias)</div><div class="v">' + num(t.pedidos) + '</div><div class="d">' + num(t.unidades) + ' unidades</div></div>' +
    '<div class="kpi"><div class="ic">💰</div><div class="l">Faturamento (30 dias)</div><div class="v">' + brl0(t.faturamento) + '</div><div class="d">' + (t.unidades ? 'ticket ' + brl(t.faturamento / Math.max(1, t.pedidos)) : '—') + '</div></div>' +
    '<div class="kpi"><div class="ic">👀</div><div class="l">Visitas (30 dias)</div><div class="v">' + num(t.visitas) + '</div><div class="d">' + num(t.anuncios) + ' anúncios ativos</div></div>' +
    '<div class="kpi"><div class="ic">🎯</div><div class="l">Conversão</div><div class="v">' + pct(t.conversao) + '</div><div class="d">' + (t.conversao == null ? '—' : t.conversao >= 3 ? 'boa (acima de 3%)' : t.conversao >= 1 ? 'média (1% a 3%)' : 'baixa (abaixo de 1%)') + '</div></div></div>' +
    '<div class="card" style="margin-top:14px"><h2>' + logo('mercadolivre') + ' ' + esc(r.vendedor.apelido || '') + ' <span class="tag">reputação ' + esc(r.vendedor.reputacao || '—') + (r.vendedor.medalha ? ' · ' + esc(r.vendedor.medalha) : '') + ' · <a href="#" id="ml-sair">desconectar</a></span></h2>' +
    '<div class="tabela-wrap"><table><thead><tr><th></th><th>Anúncio</th><th class="num">Preço</th><th class="num">Estoque</th><th class="num">Visitas</th><th class="num">Vendas</th><th class="num">Conversão</th><th class="num">Vendidos (total)</th><th>Diagnóstico</th></tr></thead><tbody>' +
    r.itens.map(x => '<tr><td>' + (x.foto ? '<img class="thumb" src="' + esc(x.foto) + '" alt="">' : '') + '</td><td><a href="' + esc(x.link) + '" target="_blank" rel="noopener">' + esc(x.titulo) + '</a><div class="small muted">' + esc(x.tipo === 'gold_pro' ? 'Premium' : x.tipo === 'gold_special' ? 'Clássico' : x.tipo || '') + '</div></td><td class="num">' + brl(x.preco) + '</td><td class="num">' + num(x.estoque) + '</td><td class="num">' + num(x.visitas30) + '</td><td class="num">' + num(x.vendas30) + '</td><td class="num">' + pct(x.conversao) + '</td><td class="num">' + num(x.vendidosTotal) + '</td><td class="small">' + diagnostico(x) + ' <button type="button" class="link" data-pesquisar-titulo="' + esc(x.titulo) + '">🔎 comparar</button></td></tr>').join('') +
    '</tbody></table></div><p class="aviso">Diagnóstico: poucas visitas = problema de título, preço ou anúncio pago; muitas visitas e poucas vendas = problema de preço, fotos, frete ou avaliações.</p></div>';
  $('#ml-sair').onclick = async e => { e.preventDefault(); if (!confirm('Desconectar a conta do Mercado Livre?')) return; await api('/api/ml-conta', { method: 'POST', body: JSON.stringify({ acao: 'desconectar' }) }); pintarLoja(); };
  $$('[data-pesquisar-titulo]').forEach(b => b.onclick = () => { const t2 = b.dataset.pesquisarTitulo.toLowerCase().split(/\s+/).slice(0, 6).join(' '); $('#q').value = t2; pesquisar(t2); });
}
function diagnostico(x) {
  if (!x.estoque) return '⚠️ sem estoque';
  if (x.visitas30 == null) return '';
  if (x.visitas30 < 50) return '👀 poucas visitas: melhore título e fotos, ou anúncio pago';
  if (x.conversao != null && x.conversao < 1) return '🛒 visitam e não compram: preço, frete ou avaliações';
  if (x.conversao >= 3) return '🔥 convertendo bem: aumente a exposição (Ads, Full, kit)';
  return '✔ ok';
}

// ───────────────────────── 📅 CALENDÁRIO ─────────────────────────
function pintarCalendario() {
  const box = $('#aba-calendario'), datas = Calendario.proximas(new Date(), 10);
  const custos = cfg().custos || {}, metas = Object.values(custos).map(c => c.meta).filter(Boolean);
  const unidadesMes = Number(ls.get('radar_unid_mes', 0)) || 0;
  box.innerHTML = '<h1 class="titulo-aba">Calendário de vendas</h1><p class="sub-aba">As próximas datas que movem o varejo online e quando começar a produzir (30 dias antes).</p>' +
    '<div class="card" style="margin-top:14px"><label class="small muted" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">Quantas unidades você vende por mês hoje (somando os canais)? <input type="number" id="cal-unid" min="0" step="10" value="' + (unidadesMes || '') + '" style="width:110px"></label>' +
    '<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Data</th><th>Evento</th><th class="num">Faltam</th><th class="num">Vendas sobem</th><th>Produzir até</th><th class="num">Unidades a mais</th><th>Dica</th></tr></thead><tbody id="cal-corpo"></tbody></table></div>' +
    '<p class="aviso">"Vendas sobem" é uma referência de mercado; ajuste com o seu histórico (a aba 🛒 Minha loja mostra as suas vendas reais).' + (metas.length ? '' : '') + '</p></div>';
  const desenhar = () => {
    const u = Number($('#cal-unid').value) || 0; ls.set('radar_unid_mes', u);
    $('#cal-corpo').innerHTML = datas.map(x => '<tr><td class="num">' + new Date(x.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) + '</td><td><b>' + esc(x.nome) + '</b></td><td class="num">' + x.dias + ' dias</td><td class="num">' + Math.round((x.fator - 1) * 100) + '%</td><td>' + (x.atrasado ? '<span class="var-neg">já devia ter começado</span>' : new Date(x.produzirAte + 'T12:00:00').toLocaleDateString('pt-BR')) + '</td><td class="num"><b>' + (u ? '+' + num(Calendario.extra(u, x.fator)) : '—') + '</b></td><td class="small">' + esc(x.dica) + '</td></tr>').join('');
  };
  $('#cal-unid').oninput = desenhar; desenhar(); marcarTrilha('datas');
}

// ───────────────────────── ❓ BALÕES DE AJUDA ─────────────────────────
// Cada título, número e coluna do painel ganha um "?" que explica o que é, em português simples.
// A ligação é pelo texto (começo do título), então vale para tudo que o painel desenha.
const AJUDA = [
  // pesquisa
  ['visão geral', 'Resumo do produto pesquisado: preço mais comum, menor e maior preço, quantos anúncios existem nos 3 marketplaces e quantas lojas vendem no Google Shopping. Logo abaixo, os pontos que formaram a nota.'],
  ['preço mais comum', 'A mediana: metade dos concorrentes vende abaixo desse valor e metade acima. É a referência de "quanto o mercado cobra".'],
  ['menor', 'O menor e o maior preço encontrados, sem contar valores fora da curva (kits grandes, atacado).'],
  ['anúncios nos 3', 'Quantos anúncios de produto (não páginas de lista) apareceram no Mercado Livre, na Shopee e na Amazon para essa palavra.'],
  ['lojas no google shopping', 'Quantas lojas diferentes vendem esse produto no Google Shopping. Muitas lojas = mercado aquecido e mais concorrência.'],
  ['onde vender', 'Nota de 0 a 100 para cada canal, somando: demanda (vendas e buscas lá dentro, até 40), espaço na concorrência (até 15), preço praticado no canal (até 15) e a sua margem com o custo informado (até 30). O canal com maior nota é o recomendado para começar.'],
  ['melhor canal', 'O canal com a maior nota. Canal sem sinais de venda nunca é recomendado, mesmo com pouca concorrência.'],
  ['vale a pena', 'A calculadora de lucro. Você informa custo de produção, embalagem, peso e medidas, e ela tira de cada preço a comissão, a taxa fixa, o frete e o imposto de cada canal. O que sobra é o lucro por unidade.'],
  ['lucro por unidade', 'Quanto sobra no seu bolso por unidade vendida em cada canal, depois de todas as taxas, frete, imposto e custo.'],
  ['para lucrar', 'Quantas unidades você precisa vender por mês (e por dia) em cada canal para chegar no lucro que digitou. A produção já vem com 10% de folga.'],
  ['kits', 'Vender 2, 3, 5 ou 10 unidades num anúncio só. A comissão e a taxa fixa são cobradas uma vez e o frete sai pelo peso total, então cada unidade costuma render mais. "+R$ por unidade" mostra quanto.'],
  ['preço ideal', 'Mostra onde estão os preços dos concorrentes de cada canal (pontos; os maiores vendem 100+), a faixa competitiva (área clara), o seu preço mínimo para bater a meta de margem (linha vermelha) e o preço sugerido (▼).'],
  ['plano de vendas', 'Lista de ações práticas montada a partir desta pesquisa: por onde começar, Clássico ou Premium, kit, primeiras vendas, anúncios pagos, Full e datas.'],
  ['anúncio pronto', 'Gera o anúncio para os 3 canais: títulos no limite de caracteres de cada um, descrição, destaques, ficha técnica e respostas para as perguntas que o povo faz. Preencha os dados do produto antes: o texto usa só o que você informou.'],
  ['mercado livre', 'Anúncios do Mercado Livre que o Google mostra para essa palavra, com preço, vendidos e nota quando aparecem. "anúncio" = página de produto; "lista/categoria" = página de busca do ML.'],
  ['shopee', 'Anúncios da Shopee que o Google mostra para essa palavra, com preço e vendidos quando aparecem.'],
  ['amazon', 'Anúncios da Amazon que o Google mostra para essa palavra, com preço e nota quando aparecem.'],
  ['google shopping', 'Ofertas do Google Shopping: quem vende, por quanto e com qual avaliação. Ajuda a ver lojas fora dos marketplaces.'],
  ['distribuição de preços', 'Quantos preços caem em cada faixa de valor. A coluna mais alta é onde a maioria dos concorrentes está.'],
  ['o que a concorrência vende', 'Fotos dos produtos dos concorrentes no Google Shopping. Toque para abrir o anúncio.'],
  ['evolução no tempo', 'Como o preço mais comum e a nota mudaram a cada checagem. Aparece quando a palavra é vigiada ou foi pesquisada mais de uma vez.'],
  ['seo', 'As 10 primeiras páginas do Google para essa palavra. Muitos marketplaces no topo = o povo busca para comprar.'],
  ['qual palavra-chave performa melhor', 'Pesquisa de uma vez todas as variações que o povo digita (Google, Mercado Livre, Amazon) e dá uma força de 0 a 100 para cada uma: busca (até 40) + vendas do anúncio que mais vende (até 40) + pouca concorrência (até 20). A 1ª vai no começo do título.'],
  ['força', 'Nota de 0 a 100 da palavra para SEO: quanto o povo busca, quanto vende e quanta disputa tem.'],
  ['busca', 'Até 40: em quantos autocompletares (Google, ML, Amazon) a palavra aparece e quantas variações ela própria puxa.'],
  ['vendas', 'Até 40: pelo anúncio que mais vende com essa palavra (5.000+ vendidos = 40).'],
  ['mais vendido', 'Quantas vendas tem o anúncio que mais vende com essa palavra-chave.'],
  ['usar no', 'Onde colocar a palavra no seu anúncio: título (as mais fortes), descrição e ficha técnica (as médias).'],
  ['demanda', 'O que as pessoas digitam no Google, na busca do Mercado Livre e da Amazon. Use essas variações nos títulos e na descrição: é assim que o cliente acha o anúncio.'],
  ['o que os compradores reclamam', 'Lê as avaliações dos anúncios concorrentes no Mercado Livre e agrupa as reclamações por tema. O que eles erram é o que você pode fazer melhor no produto e deixar claro no anúncio.'],
  ['fotos do anúncio', 'Regras de foto de cada canal e pedidos prontos para gerar imagens com IA (capa, uso real, medidas, prova de força).'],
  // painel
  ['painel do time', 'Visão geral de todas as pesquisas do time, salvas na nuvem.'],
  ['pesquisas', 'Quantas palavras-chave o time já pesquisou.'],
  ['validados', 'Quantos produtos tiraram nota 65 ou mais (sinais fortes de que vendem).'],
  ['nota média', 'A média das notas de todas as pesquisas.'],
  ['vigiadas', 'Palavras-chave que o Radar pesquisa de novo sozinho toda segunda, para você acompanhar preço, nota e concorrência no tempo.'],
  ['o que mudou', 'Alertas das checagens de segunda: preço que caiu ou subiu 10%+, nota que mudou 10+ pontos, concorrência que entrou, concorrente que baixou preço ou vendeu mais.'],
  ['melhores produtos', 'Os produtos pesquisados com as maiores notas. Toque numa barra para abrir.'],
  ['preço × nota', 'Cada ponto é um produto: quanto mais alto, melhor a nota; quanto mais à direita, mais caro. Os melhores ficam em cima.'],
  ['como estão as ideias', 'Quantos produtos são validados, nicho ou fracos.'],
  ['anúncios encontrados por canal', 'Soma dos anúncios encontrados em todas as pesquisas, por marketplace.'],
  ['todas as pesquisas', 'A lista completa. Toque numa linha para abrir a pesquisa salva (não gasta crédito).'],
  // outras abas
  ['simulador de faturamento', 'Conta rápida: se eu vender X unidades a R$ Y, quanto entra e quanto sobra no bolso em cada canal.'],
  ['catálogo da fábrica', 'Seus produtos e variações (largura, comprimento...). Com custo e peso de cada variação, o Radar mostra quais dão mais lucro e o melhor canal de cada uma.'],
  ['ranking de lucro', 'As variações do catálogo ordenadas pelo lucro por unidade no melhor canal de cada uma.'],
  ['pesquisa em lote', 'Pesquisa até 20 palavras de uma vez e mostra o ranking. Bom para comparar variações e ideias.'],
  ['ranking', 'As palavras pesquisadas no lote, da maior nota para a menor.'],
  ['vigiadas e concorrentes', 'O que o Radar acompanha sozinho toda segunda: palavras-chave e anúncios de concorrentes.'],
  ['concorrentes', 'Anúncios de concorrentes que você acompanha: preço, vendidos e nota a cada checagem. Cole o link do anúncio para começar.'],
  ['palavras vigiadas', 'Palavras-chave refeitas toda segunda. A tabela mostra a nota e como o preço mudou desde que começou a vigiar.'],
  ['minha loja', 'Os seus números reais do Mercado Livre (só leitura): vendas, visitas e conversão dos últimos 30 dias, anúncio por anúncio.'],
  ['pedidos', 'Pedidos pagos nos últimos 30 dias na sua conta do Mercado Livre.'],
  ['faturamento', 'Soma do valor vendido nos últimos 30 dias (sem descontar taxas).'],
  ['visitas', 'Quantas vezes seus anúncios foram vistos nos últimos 30 dias.'],
  ['conversão', 'De cada 100 visitas, quantas viraram venda. Acima de 3% é bom; abaixo de 1% indica problema de preço, foto, frete ou avaliação.'],
  ['calendário de vendas', 'As datas que mais vendem no varejo online e até quando produzir para não faltar estoque.'],
  ['taxas e impostos', 'Os valores que a calculadora usa: comissão, taxa fixa, frete e imposto de cada canal. Valem para todo o time. Confira no painel de vendedor e ajuste aqui.'],
  ['frete pelo peso', 'Quanto você paga do frete grátis em cada faixa de peso. Vale o maior entre o peso real e o cubado (comprimento × largura × altura ÷ 6000).'],
  ['shopee: comissão por faixa', 'Na Shopee a comissão muda conforme o preço do produto. Ficar abaixo de R$ 80 costuma sair mais barato para itens de baixo valor.'],
  // colunas
  ['comissão', 'Porcentagem que o marketplace cobra sobre o preço de venda.'],
  ['taxa fixa', 'Valor cobrado por unidade em produtos baratos (no Mercado Livre, abaixo de R$ 79; na Shopee, por faixa de preço).'],
  ['frete', 'O que você paga do frete grátis do comprador. No Mercado Livre e na Amazon, acima de R$ 79; na Shopee já está na comissão.'],
  ['imposto', 'O imposto sobre a venda (Simples Nacional, por exemplo). Ajuste a porcentagem em ⚙️ Taxas.'],
  ['custo', 'Custo de produção + embalagem de uma unidade.'],
  ['margem', 'Quanto do preço vira lucro, em porcentagem. Ex.: 25% = de cada R$ 100 vendidos, R$ 25 sobram.'],
  ['preço p/', 'O menor preço que entrega a sua meta de margem nesse canal.'],
  ['nota', 'Nota de validação de 0 a 100: quanto mais alta, mais sinais de que o produto vende.'],
  ['concorrência', 'Baixa, média ou alta, pela soma de anúncios e lojas encontrados.'],
  ['palavra-chave', 'O termo que o cliente digita para achar o produto. Cada variação pode ter a sua (ex.: "fita dupla face espuma 19mm espelho").'],
  ['seu preço', 'O preço que você pretende cobrar. Vazio = usa o preço mais comum do mercado.'],
  ['preço mercado', 'O preço mais comum dos concorrentes para essa variação.'],
];
const _ajudaNorm = t => String(t || '').toLowerCase().replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, '').replace(/\s+/g, ' ').trim();
const _ajudaOrdem = AJUDA.slice().sort((a, b) => b[0].length - a[0].length); // o mais específico ganha
function textoAjuda(el) {
  const t = _ajudaNorm(Array.from(el.childNodes).filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains('tag') && !n.classList.contains('ajuda') && n.tagName !== 'BUTTON' && n.tagName !== 'INPUT')).map(n => n.textContent).join(' '));
  if (!t) return null;
  const achado = _ajudaOrdem.find(([k]) => t.startsWith(k));
  return achado ? achado[1] : null;
}
function colocarAjudas(raiz) {
  (raiz || document).querySelectorAll('.card h2, .kpi .l, .mini-kpis .l, th, .titulo-aba').forEach(el => {
    if (el.querySelector(':scope > .ajuda') || el.closest('.titulos')) return;
    const txt = textoAjuda(el); if (!txt) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ajuda'; b.textContent = '?'; b.setAttribute('aria-label', 'O que é isso?'); b.dataset.txt = txt;
    const tag = el.querySelector(':scope > .tag');
    if (tag) el.insertBefore(b, tag); else el.appendChild(b);
  });
}
const balao = document.createElement('div'); balao.className = 'balao'; balao.setAttribute('role', 'dialog'); document.body.appendChild(balao);
function fecharBalao() { balao.classList.remove('on'); }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.ajuda');
  if (!b) { if (!e.target.closest || !e.target.closest('.balao')) fecharBalao(); return; }
  e.stopPropagation(); e.preventDefault();
  if (balao.classList.contains('on') && balao._de === b) return fecharBalao();
  balao._de = b; balao.innerHTML = '<div>' + esc(b.dataset.txt) + '</div><button type="button" class="link" onclick="this.parentNode.classList.remove(\'on\')">entendi</button>';
  balao.classList.add('on');
  const r = b.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
  balao.style.width = w + 'px';
  balao.style.left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12)) + 'px';
  const abaixo = r.bottom + 10 + balao.offsetHeight < innerHeight;
  balao.style.top = (abaixo ? r.bottom + 8 : Math.max(8, r.top - balao.offsetHeight - 8)) + 'px';
}, true);
addEventListener('scroll', fecharBalao, { passive: true });
new MutationObserver(() => { clearTimeout(colocarAjudas._t); colocarAjudas._t = setTimeout(() => colocarAjudas(document.getElementById('app')), 60); })
  .observe(document.getElementById('app'), { childList: true, subtree: true });

// ───────────────────────── 🧭 TRILHA ─────────────────────────
// Passo a passo do Radar. Cada passo se marca sozinho quando você faz a ação.
function marcarTrilha(chave) { const t = ls.get('radar_trilha', {}); if (!t[chave]) { t[chave] = Date.now(); ls.set('radar_trilha', t); atualizarSeloTrilha(); } }
let _trilhaExtra = { catalogo: null, concorrentes: null, loja: null };
const PASSOS = [
  { id: 'pesquisa', titulo: 'Faça a primeira pesquisa', como: 'Digite o nome do produto como o cliente procura (ex.: "fita dupla face para espelho") na barra lá em cima e toque em Pesquisar.', feito: () => S.hist.length > 0, ir: () => { irPara('pesquisar'); destacar('#q'); } },
  { id: 'custo', titulo: 'Coloque o custo, o peso e as medidas', como: 'Na pesquisa, no card "Vale a pena?", preencha o custo de produção, a embalagem, o peso embalado e as medidas da caixa. Toque em Salvar.', feito: () => Object.values(cfg().custos || {}).some(c => c.custo > 0), ir: () => irParaPesquisa('#card-margem') },
  { id: 'onde', titulo: 'Veja onde vender', como: 'Leia o card "Onde vender": ele mostra o melhor canal e os motivos a favor e contra cada um.', feito: () => !!ls.get('radar_trilha', {}).onde, ir: () => irParaPesquisa('#card-onde') },
  { id: 'preco', titulo: 'Defina o seu preço', como: 'No card "Preço ideal", veja a faixa dos concorrentes e o preço sugerido para cada canal. Ajuste na tabela da margem se quiser.', feito: () => !!ls.get('radar_trilha', {}).preco, ir: () => irParaPesquisa('#card-preco') },
  { id: 'palavras', titulo: 'Descubra a palavra-chave mais forte', como: 'Na pesquisa, no card "Qual palavra-chave performa melhor", marque as variações e toque em Pesquisar e comparar. A 1ª do ranking vai no começo do título.', feito: () => !!ls.get('radar_trilha', {}).palavras, ir: () => irParaPesquisa('#card-palavras') },
  { id: 'catalogo', titulo: 'Monte o catálogo com as suas variações', como: 'Na aba Catálogo, cadastre o produto e cada variação (largura, comprimento) com custo e peso. Depois toque em "Pesquisar as não pesquisadas".', feito: () => _trilhaExtra.catalogo === true || !!ls.get('radar_trilha', {}).catalogo, ir: () => irPara('catalogo') },
  { id: 'anuncio', titulo: 'Gere o anúncio pronto', como: 'Na pesquisa, no card "Anúncio pronto", escreva os dados do produto (marca, material, medidas) e toque em Gerar. Copie para o marketplace.', feito: () => !!ls.get('radar_trilha', {}).anuncio, ir: () => irParaPesquisa('#card-titulos') },
  { id: 'vigiar', titulo: 'Vigie o mercado', como: 'Toque em 🔔 Vigiar numa pesquisa e cole o link de 2 ou 3 concorrentes na aba Vigiadas. Toda segunda o Radar checa e avisa o que mudou.', feito: () => (cfg().vigiadas || []).length > 0 || _trilhaExtra.concorrentes === true, ir: () => irPara('vigiadas') },
  { id: 'datas', titulo: 'Planeje as datas', como: 'Na aba Calendário, informe quantas unidades vende por mês e veja até quando produzir para cada data (Black Friday, Natal...).', feito: () => !!ls.get('radar_trilha', {}).datas, ir: () => irPara('calendario') },
  { id: 'taxas', titulo: 'Confira as taxas do seu caso', como: 'Na aba Taxas, compare com o seu painel de vendedor (comissão da sua categoria, imposto do seu regime) e salve. Todo o time usa esses valores.', feito: () => !!ls.get('radar_trilha', {}).taxas, ir: () => irPara('taxas') },
  { id: 'loja', titulo: 'Conecte a sua loja do Mercado Livre', como: 'Na aba Minha loja, siga os passos para conectar (só leitura). Você passa a ver as suas vendas, visitas e conversão reais.', feito: () => _trilhaExtra.loja === true, ir: () => irPara('loja') },
  { id: 'relatorio', titulo: 'Compartilhe um relatório', como: 'Na pesquisa, toque em 🔗 Compartilhar relatório e mande o link para o sócio ou cliente. Abre sem senha e vira PDF.', feito: () => !!ls.get('radar_trilha', {}).relatorio, ir: () => irParaPesquisa('#bt-compartilhar') },
];
function irParaPesquisa(sel) {
  if (S.atual) { irPara('pesquisar'); destacar(sel); return; }
  const h = S.hist[0]; if (!h) { irPara('pesquisar'); destacar('#q'); return; }
  abrir(h.termo).then(() => destacar(sel));
}
function destacar(sel) {
  setTimeout(() => { const el = document.querySelector(sel); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('destaque'); setTimeout(() => el.classList.remove('destaque'), 2600); }, 250);
}
function progressoTrilha() { const f = PASSOS.filter(p => { try { return p.feito(); } catch (e) { return false; } }); return { feitos: f.length, total: PASSOS.length, proximo: PASSOS.find(p => !f.includes(p)) }; }
function atualizarSeloTrilha() {
  const b = document.querySelector('#nav button[data-aba="trilha"]'); if (!b) return;
  const pr = progressoTrilha(); let s = b.querySelector('.selo'); if (!s) { s = document.createElement('i'); s.className = 'selo'; b.appendChild(s); }
  s.textContent = pr.feitos + '/' + pr.total; s.classList.toggle('ok', pr.feitos === pr.total);
}
async function pintarTrilha() {
  const box = $('#aba-trilha');
  // descobre o que depende do servidor (catálogo, concorrentes, loja) sem travar a tela
  Promise.all([
    api('/api/catalogo').then(r => { _trilhaExtra.catalogo = (r.produtos || []).length > 0; }).catch(() => {}),
    api('/api/concorrentes').then(r => { _trilhaExtra.concorrentes = (r.itens || []).length > 0; }).catch(() => {}),
    api('/api/ml-conta').then(r => { _trilhaExtra.loja = !!r.conectado; }).catch(() => {}),
  ]).then(() => { if (abaAtual === 'trilha') desenharTrilha(); atualizarSeloTrilha(); });
  desenharTrilha();
  function desenharTrilha() {
    const pr = progressoTrilha();
    box.innerHTML = '<h1 class="titulo-aba">Trilha do Radar</h1><p class="sub-aba">O caminho do “será que vende?” até o anúncio no ar. Cada passo se marca sozinho quando você faz.</p>' +
      '<div class="card" style="margin-top:14px"><div class="trilha-topo"><b>' + pr.feitos + ' de ' + pr.total + ' passos</b>' + (pr.proximo ? '<span class="muted small">Próximo: ' + esc(pr.proximo.titulo) + '</span>' : '<span class="var-pos">🎉 Trilha completa!</span>') + '</div>' +
      '<div class="progresso"><span style="width:' + (pr.feitos / pr.total * 100) + '%"></span></div>' +
      '<ol class="trilha">' + PASSOS.map((p, i) => { let ok = false; try { ok = p.feito(); } catch (e) {} const prox = pr.proximo === p;
        return '<li class="' + (ok ? 'feito' : prox ? 'agora' : '') + '"><span class="trilha-n">' + (ok ? '✓' : i + 1) + '</span><div><b>' + esc(p.titulo) + '</b><div class="small muted">' + esc(p.como) + '</div></div><button type="button" class="' + (prox ? 'pri' : 'sec') + '" data-passo="' + p.id + '">' + (ok ? 'Ver' : 'Fazer agora') + '</button></li>'; }).join('') + '</ol>' +
      '<p class="aviso">Dica: em qualquer tela, toque no <span class="ajuda" style="pointer-events:none">?</span> ao lado de um título ou número para ver o que ele significa.</p></div>';
    $$('[data-passo]').forEach(b => b.onclick = () => PASSOS.find(p => p.id === b.dataset.passo).ir());
  }
}

// cards lidos (Onde vender, Preço ideal) contam na trilha quando aparecem na tela
const _visto = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { marcarTrilha(e.target.id === 'card-onde' ? 'onde' : 'preco'); _visto.unobserve(e.target); } }), { threshold: 0.5 });
new MutationObserver(() => ['#card-onde', '#card-preco'].forEach(sel => { const el = document.querySelector(sel); if (el && !el._obs) { el._obs = 1; _visto.observe(el); } }))
  .observe(document.getElementById('app'), { childList: true, subtree: true });

// ───────────────────────── início ─────────────────────────
mostrarLogin(!senha());
function primeiraVez() { if (!ls.get('radar_trilha_vista', false)) { ls.set('radar_trilha_vista', true); irPara('trilha'); } }
if (senha()) { carregar(); const aba0 = (location.hash || '').slice(1); if (['loja', 'catalogo', 'calendario', 'vigiadas', 'lote', 'taxas', 'trilha', 'simulador'].includes(aba0)) irPara(aba0); else primeiraVez(); }
})();
