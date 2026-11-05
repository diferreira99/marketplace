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
$('#entrar').onclick = () => { const s = $('#senha').value.trim(); if (!s) return; ls.set('radar_senha', s); mostrarLogin(false); carregar(); };
$('#senha').onkeydown = e => { if (e.key === 'Enter') $('#entrar').click(); };
$('#sair').onclick = () => { ls.del('radar_senha'); $('#senha').value = ''; mostrarLogin(true); };
$('#logos-lado').innerHTML = Object.keys(CANAIS).map(k => logo(k, true)).join('');

let abaAtual = 'painel';
function irPara(aba) {
  abaAtual = aba;
  $$('#nav button').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
  $$('.aba').forEach(s => s.classList.toggle('hidden', s.id !== 'aba-' + aba));
  erro('');
  ({ painel: pintarPainel, lote: pintarLote, vigiadas: pintarVigiadas, taxas: pintarTaxas, pesquisar: () => {} })[aba]();
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
      '<div class="acoes"><button type="button" class="' + (vig ? 'pri' : 'sec') + '" id="bt-vigiar">' + (vig ? '🔔 Vigiando' : '🔔 Vigiar') + '</button><button type="button" id="bt-atualizar">↻ Atualizar</button></div>' +
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
  '<div class="card" style="margin-top:14px" id="card-margem"></div>' +
  '<div class="grid g3">' + cardMp('mercadolivre', mp.mercadolivre) + cardMp('shopee', mp.shopee) + cardMp('amazon', mp.amazon) + '</div>' +
  '<div class="card" style="margin-top:14px" id="card-titulos"><h2>✍️ Títulos de anúncio <span class="tag">a partir das buscas reais e dos concorrentes</span></h2><button type="button" class="sec" id="bt-titulos">Gerar títulos para os 3 canais</button><div id="titulos-saida"></div></div>' +
  '<div class="grid g2">' +
    '<div class="card"><h2>🛒 Google Shopping <span class="tag">' + d.shopping.itens.length + ' ofertas · ' + d.shopping.lojas + ' lojas</span></h2>' +
      (d.shopping.itens.length ? '<div class="tabela-wrap"><table><thead><tr><th></th><th>Produto</th><th>Loja</th><th class="num">Preço</th><th class="num">Nota</th></tr></thead><tbody>' +
        d.shopping.itens.map(i => '<tr><td>' + (i.imagem ? '<img class="thumb" loading="lazy" src="' + esc(i.imagem) + '" alt="">' : '') + '</td><td><a href="' + esc(i.link) + '" target="_blank" rel="noopener">' + esc(i.titulo) + '</a></td><td>' + esc(i.loja) + '</td><td class="num preco">' + brl(i.preco) + '</td><td class="num">' + (i.nota != null ? '⭐ ' + String(i.nota).replace('.', ',') + (i.avaliacoes ? ' (' + num(i.avaliacoes) + ')' : '') : '—') + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="vazio">Sem ofertas no Shopping.</div>') + '</div>' +
    '<div class="card"><h2>💰 Distribuição de preços <span class="tag">' + d.precos.qtd + ' preços lidos</span></h2>' + colunas(d.faixas) + '<p class="small muted">Preços do Shopping e dos anúncios. Valores muito fora da curva (kits, atacado) ficam de fora.</p></div>' +
  '</div>' +
  (comFoto.length ? '<div class="card" style="margin-top:14px"><h2>🖼️ O que a concorrência vende <span class="tag">' + comFoto.length + ' produtos</span></h2><div class="galeria">' +
    comFoto.map(i => '<a href="' + esc(i.link) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(i.imagem) + '" alt="' + esc(i.titulo) + '"><span><b>' + brl(i.preco) + '</b> · ' + esc(i.loja) + '<br>' + esc(String(i.titulo).slice(0, 50)) + '</span></a>').join('') + '</div></div>' : '') +
  '<div class="card" style="margin-top:14px" id="card-serie"></div>' +
  '<div class="grid g2">' +
    '<div class="card"><h2>🔎 SEO · Top 10 do Google <span class="tag">' + s.marketplacesNoTop + ' marketplaces no top</span></h2>' +
      (s.organicos.length ? '<ul class="org">' + s.organicos.map(o => '<li><span class="pos">' + (o.posicao || '') + '</span><div><a href="' + esc(o.link) + '" target="_blank" rel="noopener">' + esc(o.titulo) + '</a><div class="dom">' + esc(dom(o.link)) + '</div></div></li>').join('') + '</ul>' : '<div class="vazio">Sem resultados orgânicos.</div>') + '</div>' +
    '<div class="card"><h2>📈 Demanda: o que as pessoas buscam</h2>' +
      '<div class="small muted" style="margin-bottom:6px">Autocompletar do Google (toque para pesquisar)</div><div class="chips">' + (s.sugestoes.length ? s.sugestoes.map(x => '<button type="button" class="chip" data-pesq="' + esc(x) + '">' + esc(x) + '</button>').join('') : '<span class="muted small">Nenhuma sugestão.</span>') + '</div>' +
      '<div class="small muted" style="margin:14px 0 6px">Pesquisas relacionadas</div><div class="chips">' + (s.relacionadas.length ? s.relacionadas.map(x => '<button type="button" class="chip" data-pesq="' + esc(x) + '">' + esc(x) + '</button>').join('') : '<span class="muted small">Nenhuma.</span>') + '</div>' +
      (s.perguntas.length ? '<div class="small muted" style="margin:14px 0 6px">As pessoas também perguntam</div><div class="paa">' + s.perguntas.map(p => '<details><summary>' + esc(p.pergunta) + '</summary><p class="small">' + esc(p.resposta || '') + '</p></details>').join('') + '</div>' : '') +
    '</div>' +
  '</div>';
  $$('[data-pesq]').forEach(b => b.onclick = () => { $('#q').value = b.dataset.pesq; pesquisar(b.dataset.pesq); });
  $('#bt-atualizar').onclick = () => pesquisar(d.termo, true);
  $('#bt-vigiar').onclick = () => alternarVigia(d.termo);
  $('#bt-titulos').onclick = () => gerarTitulos(d);
  pintarMargem(d);
  pintarSerie(d.termo);
}

// 💰 Calculadora de margem
function pintarMargem(d) {
  const c = cfg(), k = slug(d.termo), salvo = (c.custos || {})[k] || {};
  const precoCanal = id => { const m = d.marketplaces[canalDaTaxa(id)]; return (m && m.precos.mediana) || d.precos.mediana || 0; };
  const box = $('#card-margem');
  box.innerHTML = '<h2>💰 Vale a pena? Margem por canal <span class="tag">imposto ' + pct(c.imposto) + ' · meta de margem ' + pct(c.margemAlvo) + ' · <a href="#" id="ir-taxas">ajustar taxas</a></span></h2>' +
    '<div class="calc-entradas">' +
      '<label>Custo de produção (R$)<input type="number" step="0.01" min="0" id="m-custo" value="' + (salvo.custo ?? '') + '" placeholder="ex.: 4,50"></label>' +
      '<label>Embalagem e etiqueta (R$)<input type="number" step="0.01" min="0" id="m-emb" value="' + (salvo.embalagem ?? '') + '" placeholder="ex.: 0,80"></label>' +
      '<label>&nbsp;<button type="button" class="sec" id="m-salvar">Salvar custo deste produto</button></label>' +
    '</div><div id="m-saida"></div>';
  $('#ir-taxas').onclick = e => { e.preventDefault(); irPara('taxas'); };
  const precos = {}; Object.keys(c.taxas).forEach(id => precos[id] = Math.round(precoCanal(id) * 100) / 100);
  function calc() {
    const custo = Number($('#m-custo').value) || 0, emb = Number($('#m-emb').value) || 0;
    const r = Margem.calcular({ precos, custo, embalagem: emb, imposto: c.imposto, margemAlvo: c.margemAlvo, taxas: c.taxas });
    const linhas = Object.entries(r);
    $('#m-saida').innerHTML = (custo ? '' : '<p class="small muted">Digite o custo de produção para ver o lucro de verdade. Os preços já vêm da mediana de cada canal, e você pode mudar.</p>') +
      '<div class="tabela-wrap"><table><thead><tr><th>Canal</th><th class="num">Preço de venda</th><th class="num">Comissão</th><th class="num">Taxa fixa</th><th class="num">Frete</th><th class="num">Imposto</th><th class="num">Custo</th><th class="num">Lucro / un.</th><th class="num">Margem</th><th class="num">Preço p/ ' + pct(c.margemAlvo) + '</th></tr></thead><tbody>' +
      linhas.map(([id, x]) => '<tr><td>' + logo(canalDaTaxa(id)) + ' ' + esc(x.nome) + '</td><td class="num"><input type="number" step="0.01" min="0" data-preco="' + id + '" value="' + precos[id] + '" style="width:96px;text-align:right"></td><td class="num">' + brl(x.comissao) + '</td><td class="num">' + brl(x.fixo) + '</td><td class="num">' + brl(x.frete) + '</td><td class="num">' + brl(x.imposto) + '</td><td class="num">' + brl(x.custo) + '</td><td class="num ' + (x.lucro >= 0 ? 'lucro-pos' : 'lucro-neg') + '">' + brl(x.lucro) + '</td><td class="num ' + (x.margem >= 0 ? 'lucro-pos' : 'lucro-neg') + '">' + pct(x.margem) + '</td><td class="num">' + brl(x.precoMinimo) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (custo ? '<h2 style="margin-top:14px">Lucro por unidade</h2>' + barrasH(linhas.map(([id, x]) => ({ rotulo: x.nome, valor: Math.max(0, x.lucro), cor: CANAIS[canalDaTaxa(id)].cor, dica: x.nome + '<br>Lucro ' + brl(x.lucro) + ' (' + pct(x.margem) + ')' })), { esq: 260, formato: brl }) +
        '<p class="small muted">' + melhorCanal(linhas) + '</p>' : '') +
      '<p class="aviso">Taxas de referência (mudam com frequência e variam por categoria). Confira as suas em ⚙️ Taxas.</p>';
    $$('[data-preco]').forEach(inp => inp.onchange = () => { precos[inp.dataset.preco] = Number(inp.value) || 0; calc(); });
  }
  $('#m-custo').oninput = calc; $('#m-emb').oninput = calc;
  $('#m-salvar').onclick = async () => {
    try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'custo', termo: d.termo, custo: Number($('#m-custo').value) || 0, embalagem: Number($('#m-emb').value) || 0 }) }); $('#m-salvar').textContent = '✔ Custo salvo para o time'; }
    catch (e) { erro(e.message); }
  };
  calc();
}
function melhorCanal(linhas) {
  const ok = linhas.filter(([, x]) => x.lucro > 0).sort((a, b) => b[1].lucro - a[1].lucro);
  if (!ok.length) return '⚠️ Com esse custo e esses preços, nenhum canal dá lucro. Veja a coluna "Preço p/ meta".';
  return '👉 Melhor canal agora: <b>' + esc(ok[0][1].nome) + '</b>, ' + brl(ok[0][1].lucro) + ' por unidade (' + pct(ok[0][1].margem) + ').';
}

// ✍️ Títulos
async function gerarTitulos(d) {
  const bt = $('#bt-titulos'), out = $('#titulos-saida');
  bt.disabled = true; out.innerHTML = '<div class="vazio"><span class="carregando"></span>Escrevendo títulos…</div>';
  try {
    const r = await api('/api/titulos', { method: 'POST', body: JSON.stringify({ termo: d.termo, dados: d }) });
    out.innerHTML = '<div class="titulos">' + Object.keys(CANAIS).map(k => '<div><b>' + logo(k) + ' ' + CANAIS[k].nome + '</b> <span class="muted small">(até ' + r.limites[k] + ' caracteres)</span><ol>' +
      (r[k] || []).map(t => '<li>' + esc(t) + '<span class="cont">' + t.length + '</span><button type="button" class="copiar" data-copiar="' + esc(t) + '">copiar</button></li>').join('') + '</ol></div>').join('') +
      (r.dica ? '<p class="small">💡 ' + esc(r.dica) + '</p>' : '') + (r.fonte === 'ia' ? '<p class="aviso">Escritos pela IA (Claude) com base nas buscas reais e nos concorrentes.</p>' : '') + '</div>';
    $$('[data-copiar]').forEach(b => b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copiar); b.textContent = '✔ copiado'; });
  } catch (e) { out.innerHTML = ''; erro(e.message); }
  finally { bt.disabled = false; bt.textContent = '↻ Gerar de novo'; }
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
  box.innerHTML = '<h1 class="titulo-aba">Vigiadas</h1><p class="sub-aba">Toda segunda de manhã o Radar refaz a pesquisa dessas palavras e anota preço, nota e concorrência. Até 15 palavras (6 créditos do Serper cada, por semana).</p>' +
    '<div class="card" style="margin-top:14px" id="vig-lista">' + (vig.length ? '<div class="vazio"><span class="carregando"></span>carregando…</div>' : '<div class="vazio">Nenhuma palavra vigiada ainda. Abra uma pesquisa e toque em <b>🔔 Vigiar</b>.</div>') + '</div>';
  if (!vig.length) return;
  await carregarSeries(vig);
  $('#vig-lista').innerHTML = listaVigiadas(vig, false);
  $$('[data-desvigiar]').forEach(b => b.onclick = async e => { e.stopPropagation(); await alternarVigia(b.dataset.desvigiar); pintarVigiadas(); });
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

// ───────────────────────── ⚙️ TAXAS ─────────────────────────
function pintarTaxas() {
  const c = cfg(), box = $('#aba-taxas');
  const campos = [['comissao', 'Comissão %'], ['fixoAbaixo', 'Taxa fixa (R$)'], ['limiteFixo', 'Taxa fixa abaixo de (R$)'], ['freteAcima', 'Frete pago acima (R$)'], ['tetoComissao', 'Teto da comissão (R$)']];
  box.innerHTML = '<h1 class="titulo-aba">Taxas e impostos</h1><p class="sub-aba">Valores usados na calculadora de margem, iguais para todo o time. Os marketplaces mudam as regras com frequência e as taxas variam por categoria: confira no painel de vendedor de cada um.</p>' +
    '<div class="card taxas-tab" style="margin-top:14px"><div class="calc-entradas"><label>Imposto sobre a venda (%)<input type="number" step="0.1" id="tx-imp" value="' + c.imposto + '"></label><label>Meta de margem (%)<input type="number" step="1" id="tx-alvo" value="' + c.margemAlvo + '"></label></div>' +
    '<div class="tabela-wrap"><table><thead><tr><th>Canal</th>' + campos.map(([, n]) => '<th class="num">' + n + '</th>').join('') + '</tr></thead><tbody>' +
    Object.entries(c.taxas).map(([id, t]) => '<tr><td>' + logo(canalDaTaxa(id)) + ' ' + esc(t.nome) + '</td>' + campos.map(([k]) => '<td class="num"><input type="number" step="0.01" data-tx="' + id + '.' + k + '" value="' + (t[k] >= 1e8 ? '' : t[k]) + '"' + (k === 'limiteFixo' && t[k] >= 1e8 ? ' placeholder="sempre"' : '') + '></td>').join('') + '</tr>').join('') +
    '</tbody></table></div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="pri" id="tx-salvar">Salvar para o time</button><button type="button" id="tx-padrao">Voltar ao padrão</button><span class="small muted" id="tx-est"></span></div>' +
    '<p class="aviso">Taxa fixa: cobrada por unidade quando o preço fica abaixo do limite. Frete: o que você paga do frete grátis quando o preço fica acima do limite. Deixe o limite vazio para a taxa fixa valer sempre.</p></div>';
  $('#tx-salvar').onclick = async () => {
    const taxas = {};
    $$('[data-tx]').forEach(i => { const [id, k] = i.dataset.tx.split('.'); taxas[id] = taxas[id] || {}; taxas[id][k] = i.value === '' ? (k === 'limiteFixo' ? 1e9 : 0) : Number(i.value); });
    try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'taxas', imposto: Number($('#tx-imp').value), margemAlvo: Number($('#tx-alvo').value), taxas }) }); $('#tx-est').textContent = '✔ Salvo para todo o time.'; }
    catch (e) { erro(e.message); }
  };
  $('#tx-padrao').onclick = async () => {
    if (!confirm('Voltar as taxas ao padrão para todo o time?')) return;
    try { S.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ acao: 'taxas', restaurar: true }) }); pintarTaxas(); } catch (e) { erro(e.message); }
  };
}

// ───────────────────────── início ─────────────────────────
mostrarLogin(!senha());
if (senha()) carregar();
})();
