(function () {
'use strict';
const DATA = window.DOU_DATA;
const CARS = DATA.cars;
const BY_ID = new Map(CARS.map(c => [c.id, c]));
const COMMENTS = DATA.comments.filter(c => BY_ID.has(c.car));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('dou.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dou.' + k, JSON.stringify(v)); } catch {} }
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let saved = new Set(store.get('saved', []));
let liked = new Set(store.get('liked', []));
let compare = store.get('compare', []).filter(id => BY_ID.has(id));

/* ---------- icons ---------- */
const I = {
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><path d="M3 17L17 3l4 4L7 21H3z"/><path d="M13 7l2 2M10 10l2 2M7 13l2 2"/></svg>',
  compare: '<svg viewBox="0 0 24 24"><path d="M8 4v16M16 4v16M4 8h8M12 16h8"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- helpers ---------- */
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800);
}
const dim = v => v == null ? '—' : v;
const brands = () => count(CARS, 'brand');
const models = () => count(CARS, 'model');
function count(list, key) {
  const m = new Map(); list.forEach(c => m.set(c[key], (m.get(c[key]) || 0) + 1));
  return [...m.entries()].sort((a, b) => (a[0] === '其他') - (b[0] === '其他') || b[1] - a[1]);
}
const likeCount = c => c.likes + (liked.has(c.id) ? 1 : 0);
function fmtDate(ms) { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }
function ago(ms) {
  if (!ms) return ''; const s = (Date.now() - ms) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' 分钟前';
  if (s < 86400) return Math.round(s / 3600) + ' 小时前';
  if (s < 86400 * 30) return Math.round(s / 86400) + ' 天前';
  return fmtDate(ms);
}
function img(src, alt, cls = '') {
  return `<img class="loading ${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" onload="this.classList.remove('loading')" onerror="this.classList.remove('loading')">`;
}
function featuredCar() {
  const wk = CARS.reduce((m, c) => c.weekKey > m ? c.weekKey : m, '');
  return [...CARS].filter(c => c.weekKey === wk).sort((a, b) => b.week - a.week)[0] || [...CARS].sort((a, b) => b.views - a.views)[0];
}

/* ---------- card ---------- */
const sub = c => { const s = [c.brand, c.model].filter(v => v !== '其他'); return s.length ? s.map(esc).join(' · ') : '其他'; };
function card(c, i = 0) {
  return `<article class="card" data-car="${esc(c.id)}" style="--i:${Math.min(i, 16)}" tabindex="0" aria-label="${esc(c.name)}">
    <div class="card-img">${img(c.thumb, c.name)}
      <div class="card-tags">${c.wide ? '<span class="pill glass">宽体</span>' : ''}${c.finished ? '<span class="pill glass">成品图</span>' : ''}</div>
      <button class="save-btn ${saved.has(c.id) ? 'on' : ''}" data-save="${esc(c.id)}" aria-label="${saved.has(c.id) ? '取消收藏' : '收藏'}">${I.bookmark}</button>
    </div>
    <div class="card-body">
      <span class="card-sub">${sub(c)}</span>
      <h3 class="card-title">${esc(c.name)}</h3>
      <div class="card-dims"><div><b>${dim(c.wb)}</b><span>轴距</span></div><div><b>${dim(c.ft)}</b><span>前轮距</span></div><div><b>${dim(c.rt)}</b><span>后轮距</span></div></div>
      <div class="card-meta"><span class="by">@${esc(c.by)}</span><span class="likes">${I.heart}${likeCount(c)}</span></div>
    </div>
  </article>`;
}
function shelf(id, title, sub, inner, link) {
  return `<section class="section reveal"><div class="wrap">
    <div class="section-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <div class="shelf-btns">${link ? `<a class="btn ghost" href="${link}">查看全部 ${I.arrow}</a>` : ''}<button class="round" data-shelf="${id}" data-dir="-1" aria-label="向左">${I.left}</button><button class="round" data-shelf="${id}" data-dir="1" aria-label="向右">${I.arrow}</button></div></div>
    <div class="shelf" id="${id}">${inner}</div></div></section>`;
}

/* ---------- pages ---------- */
function home() {
  const f = featuredCar();
  const totalLikes = CARS.reduce((s, c) => s + c.likes, 0);
  const totalViews = CARS.reduce((s, c) => s + c.views, 0);
  const contributors = new Set(CARS.map(c => c.byId || c.by)).size;
  const latest = CARS.slice(0, 12);
  const popular = [...CARS].sort((a, b) => b.views - a.views).slice(0, 12);
  const wide = CARS.filter(c => c.wide).slice(0, 12);
  const modelTiles = models().map(([m, n]) => {
    const cover = CARS.find(c => c.model === m);
    return `<a class="model-tile" href="#/library?model=${encodeURIComponent(m)}">${img(cover.thumb, '')}<b>${esc(m)}</b><span>${n} 款车壳</span></a>`;
  }).join('');
  app.innerHTML = `
  <section class="hero"><div class="wrap">
    <p class="eyebrow reveal">1/28 RC 车壳尺寸库</p>
    <h1 class="reveal"><span class="grad">每一毫米，</span><br>都有车友量过。</h1>
    <p class="lead reveal">轴距、轮距、车身长度与实拍图。挑壳、对比、上调车板，一站完成。</p>
    <div class="hero-cta reveal"><a class="btn primary" href="#/library">浏览车壳库</a><a class="btn ghost" href="#/setup">打开电子调车板 ${I.arrow}</a></div>
    <div class="stats reveal">
      <div class="stat"><b data-count="${CARS.length}">0</b><span>款实测车壳</span></div>
      <div class="stat"><b data-count="${contributors}">0</b><span>位车友贡献</span></div>
      <div class="stat"><b data-count="${totalViews}">0</b><span>次浏览</span></div>
      <div class="stat"><b data-count="${totalLikes}">0</b><span>个点赞</span></div>
    </div>
  </div></section>
  <section class="section reveal"><div class="wrap">
    <div class="section-head"><div><h2>本周精选。</h2><p>这周被看得最多的一款。</p></div></div>
    <a class="featured" href="#/car/${esc(f.id)}" id="featured">
      <img src="${esc(f.cover)}" alt="${esc(f.name)}">
      <div class="featured-copy">
        <div><span class="pill">本周 ${f.week || f.views} 次浏览</span><h3>${esc(f.name)}</h3><p class="muted">${esc(f.brand)} · ${esc(f.model)} · @${esc(f.by)}</p></div>
        <div class="featured-specs"><div><b>${dim(f.wb)}</b><span>轴距 mm</span></div><div><b>${dim(f.ft)}</b><span>前轮距</span></div><div><b>${dim(f.rt)}</b><span>后轮距</span></div></div>
      </div>
    </a>
  </div></section>
  ${shelf('s-latest', '最近收录。', '车友刚刚量完的新壳。', latest.map(card).join(''), '#/library')}
  ${shelf('s-models', '按车型找。', '从 Silvia 到 Supra，按车系浏览。', modelTiles)}
  ${shelf('s-pop', '最多浏览。', '大家都在看的热门车壳。', popular.map(card).join(''), '#/library?sort=views')}
  ${wide.length ? shelf('s-wide', '宽体专区。', '宽体套件、扫描图和来源链接。', wide.map(card).join(''), '#/library?wide=1') : ''}
  <section class="wrap"><div class="cta-band reveal">
    <div><p class="eyebrow">电子调车板</p><h2>把屏幕，<br>变成 1:1 实尺。</h2><p>用尺子校准一次，任何车壳的轴距和轮距都能按真实毫米画在屏幕上，直接对照前束和外倾。</p><a class="btn primary" href="#/setup">开始调车</a></div>
    ${miniBoard()}
  </div></section>`;
  countUp(); bindShelves(); parallax();
}

function miniBoard() {
  return `<svg class="mini-board" viewBox="0 0 200 240" aria-hidden="true">
    <defs><pattern id="g" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" stroke="#13251d" stroke-width=".6"/></pattern></defs>
    <rect width="200" height="240" rx="16" fill="#080b0a"/><rect width="200" height="240" rx="16" fill="url(#g)"/>
    <path d="M100 10V230M10 120H190" stroke="#00ff66" stroke-dasharray="4 4" stroke-width=".8"/>
    <g stroke="#00ff66" stroke-width="1.6"><path d="M62 70H138M60 170H140"/></g>
    <g stroke="#fff" stroke-width="1.6" fill="none"><rect x="56" y="58" width="10" height="24" rx="2" transform="rotate(-6 61 70)"/><rect x="134" y="58" width="10" height="24" rx="2" transform="rotate(6 139 70)"/><rect x="55" y="158" width="10" height="24" rx="2"/><rect x="135" y="158" width="10" height="24" rx="2"/></g>
    <text x="100" y="60" fill="#c8ffd9" font-size="7" text-anchor="middle">前轮距 76 mm</text><text x="106" y="116" fill="#c8ffd9" font-size="7">轴距 98 mm</text>
  </svg>`;
}

function parseQuery() {
  const q = (location.hash.split('?')[1] || '');
  return Object.fromEntries(new URLSearchParams(q));
}
let lib = null;
function library() {
  const q = parseQuery();
  lib = { q: q.q || '', brand: q.brand || '全部', model: q.model || '全部', sort: q.sort || 'time', wide: q.wide === '1', ranges: {}, showRanges: false };
  const brandList = [['全部', CARS.length], ...brands()];
  app.innerHTML = `
  <section class="wrap lib-head page-enter"><h1>车壳库</h1><p>${CARS.length} 款车壳，全部由车友实测。</p></section>
  <div class="toolbar"><div class="wrap">
    <div class="toolbar-row">
      <label class="search">${I.search}<input id="libSearch" type="search" placeholder="搜索名称、品牌或上传者" value="${esc(lib.q)}" aria-label="搜索车壳"></label>
      <div class="seg" id="sortSeg" role="tablist"><i></i><button data-sort="time">最新</button><button data-sort="views">最热</button><button data-sort="likes">最多赞</button><button data-sort="wb">轴距</button></div>
      <button class="filter-btn" id="rangeBtn">${I.sliders} 尺寸</button>
    </div>
    <div class="chips" id="brandChips">${brandList.map(([b, n]) => `<button class="chip" data-brand="${esc(b)}">${esc(b)}<small>${n}</small></button>`).join('')}<button class="chip" data-wide="1">宽体</button></div>
    <div class="chips" id="modelChips">${[['全部', CARS.length], ...models()].map(([m]) => `<button class="chip" data-model="${esc(m)}">${m === '全部' ? '全部车型' : esc(m)}</button>`).join('')}</div>
    <div class="ranges" id="ranges" hidden>
      ${[['wb', '轴距'], ['ft', '前轮距'], ['rt', '后轮距']].map(([k, l]) => `<label>${l} (mm)<span class="pair"><input inputmode="decimal" data-range="${k}Min" placeholder="最小"><span class="muted">—</span><input inputmode="decimal" data-range="${k}Max" placeholder="最大"></span></label>`).join('')}
    </div>
  </div></div>
  <section class="wrap"><div class="result-line"><span id="resultCount"></span><button id="clearAll" hidden>清除条件</button></div><div class="grid" id="grid"></div></section>`;
  const search = $('#libSearch');
  let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { lib.q = search.value.trim(); renderGrid(); }, 120); });
  $('#sortSeg').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (b) { lib.sort = b.dataset.sort; renderGrid(); } });
  $('#brandChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.wide) lib.wide = !lib.wide; else lib.brand = b.dataset.brand;
    renderGrid();
  });
  $('#modelChips').addEventListener('click', e => { const b = e.target.closest('[data-model]'); if (b) { lib.model = b.dataset.model; renderGrid(); } });
  $('#rangeBtn').addEventListener('click', () => { lib.showRanges = !lib.showRanges; $('#ranges').hidden = !lib.showRanges; });
  $('#ranges').addEventListener('input', e => { const k = e.target.dataset.range; if (!k) return; const v = parseFloat(e.target.value); if (isFinite(v)) lib.ranges[k] = v; else delete lib.ranges[k]; renderGrid(); });
  $('#clearAll').addEventListener('click', () => { Object.assign(lib, { q: '', brand: '全部', model: '全部', wide: false, ranges: {} }); search.value = ''; $$('#ranges input').forEach(i => i.value = ''); renderGrid(); });
  renderGrid(true);
}
function filterCars(f) {
  const q = f.q.toLowerCase();
  let list = CARS.filter(c => (f.brand === '全部' || c.brand === f.brand) && (f.model === '全部' || c.model === f.model) && (!f.wide || c.wide) &&
    (!q || [c.name, c.brand, c.model, c.by, c.note].join(' ').toLowerCase().includes(q)));
  for (const [k, v] of Object.entries(f.ranges)) {
    const key = k.slice(0, 2), max = k.endsWith('Max');
    list = list.filter(c => c[key] != null && (max ? c[key] <= v : c[key] >= v));
  }
  const s = { time: (a, b) => b.time - a.time, views: (a, b) => b.views - a.views, likes: (a, b) => likeCount(b) - likeCount(a), wb: (a, b) => (a.wb ?? 999) - (b.wb ?? 999) }[f.sort];
  return list.sort(s);
}
function renderGrid(first) {
  const list = filterCars(lib);
  $$('#sortSeg button').forEach(b => b.classList.toggle('on', b.dataset.sort === lib.sort));
  moveSeg($('#sortSeg'));
  $$('#brandChips .chip').forEach(b => b.classList.toggle('on', b.dataset.wide ? lib.wide : b.dataset.brand === lib.brand));
  $$('#modelChips .chip').forEach(b => b.classList.toggle('on', b.dataset.model === lib.model));
  const active = lib.q || lib.brand !== '全部' || lib.model !== '全部' || lib.wide || Object.keys(lib.ranges).length;
  $('#rangeBtn').classList.toggle('on', Object.keys(lib.ranges).length > 0);
  $('#clearAll').hidden = !active;
  $('#resultCount').textContent = active ? `找到 ${list.length} 款` : `全部 ${list.length} 款`;
  $('#grid').innerHTML = list.length ? list.map(card).join('') : `<div class="empty" style="grid-column:1/-1"><b>没有找到匹配的车壳。</b>换个关键词，或者放宽尺寸范围试试。</div>`;
  const params = new URLSearchParams();
  if (lib.q) params.set('q', lib.q); if (lib.brand !== '全部') params.set('brand', lib.brand); if (lib.model !== '全部') params.set('model', lib.model);
  if (lib.sort !== 'time') params.set('sort', lib.sort); if (lib.wide) params.set('wide', '1');
  const h = '#/library' + (params.toString() ? '?' + params : '');
  if (!first && location.hash !== h) { history.replaceState(null, '', h); lastPage = h; currentPage = h; }
}
function moveSeg(seg) {
  if (!seg) return; const on = $('button.on', seg), pill = $('i', seg);
  if (!on) return; pill.style.left = on.offsetLeft + 'px'; pill.style.width = on.offsetWidth + 'px';
}

function rank() {
  const list = [...CARS].sort((a, b) => likeCount(b) - likeCount(a) || b.views - a.views);
  const top = list.slice(0, 3);
  app.innerHTML = `
  <section class="wrap lib-head page-enter"><h1>点赞榜</h1><p>车友们最喜欢的车壳。</p></section>
  <section class="wrap">
    <div class="podium">${top.map((c, i) => `<div class="p${i + 1} reveal" style="position:relative"><span class="medal">${i + 1}</span>${card(c)}</div>`).join('')}</div>
    <div class="rank-list reveal">${list.slice(3, 50).map((c, i) => `<div class="rank-row" data-car="${esc(c.id)}"><span class="n">${i + 4}</span>${img(c.thumb, '')}<div><h4>${esc(c.name)}</h4><p>${esc(c.brand)} · ${esc(c.model)} · @${esc(c.by)}</p></div><span class="v">${I.heart}${likeCount(c)}</span></div>`).join('')}</div>
  </section>`;
}

function savedPage() {
  const list = CARS.filter(c => saved.has(c.id));
  app.innerHTML = `
  <section class="wrap lib-head page-enter"><h1>收藏</h1><p>${list.length ? `你收藏了 ${list.length} 款车壳。收藏保存在这台设备的浏览器里。` : '收藏保存在这台设备的浏览器里。'}</p></section>
  <section class="wrap" style="margin-top:30px">${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty"><b>还没有收藏。</b>在车壳卡片右上角点一下书签就能收藏。<br><br><a class="btn primary" href="#/library">去车壳库看看</a></div>`}</section>`;
}

function comparePage() {
  const list = compare.map(id => BY_ID.get(id)).filter(Boolean);
  if (!list.length) {
    app.innerHTML = `<section class="wrap lib-head page-enter"><h1>车壳对比</h1><p>在车壳详情里点「加入对比」，最多三款。</p></section><section class="wrap"><div class="empty"><b>还没有选车壳。</b><a class="btn primary" href="#/library" style="margin-top:20px">去挑车壳</a></div></section>`;
    return;
  }
  const row = (key, label) => {
    const max = Math.max(...list.map(c => c[key] || 0)) || 1;
    return `<div class="cmp-row reveal"><h4>${label}</h4><div class="cmp-cols" style="--n:${list.length}">${list.map(c => `<div><b>${dim(c[key])}<small> mm</small></b><div class="bar"><i style="width:${(c[key] || 0) / max * 100}%"></i></div></div>`).join('')}</div></div>`;
  };
  app.innerHTML = `
  <section class="wrap lib-head page-enter"><h1>车壳对比</h1><p>并排看尺寸，差 1 mm 都看得见。</p></section>
  <section class="wrap cmp">
    <div class="cmp-cols" style="--n:${list.length}">${list.map(c => `<div class="cmp-col"><a href="#/car/${esc(c.id)}">${img(c.thumb, c.name)}</a><h3>${esc(c.name)}</h3><p>${esc(c.brand)} · ${esc(c.model)}</p><button class="x" data-uncompare="${esc(c.id)}">移除</button></div>`).join('')}</div>
    <div class="cmp-row reveal"><h4>俯视轮廓（同比例叠放）</h4><div class="cmp-overlay">${overlaySvg(list)}</div></div>
    ${row('wb', '轴距')}${row('ft', '前轮距')}${row('rt', '后轮距')}${row('len', '车身长度')}
    <div class="cmp-row"><h4>点赞 / 浏览</h4><div class="cmp-cols" style="--n:${list.length}">${list.map(c => `<div><b>${likeCount(c)}<small> 赞</small></b><p class="muted">${c.views} 次浏览</p></div>`).join('')}</div></div>
  </section>`;
}
function overlaySvg(list) {
  const colors = ['#00ff66', '#64d2ff', '#ff9f0a'];
  const W = Math.max(...list.map(c => Math.max(c.ft || 80, c.rt || 80))) + 40, H = Math.max(...list.map(c => c.len || (c.wb || 100) + 70)) + 30;
  return `<svg viewBox="${-W / 2} ${-H / 2} ${W} ${H}" style="width:min(420px,100%);height:auto">${list.map((c, i) => {
    const wb = c.wb || 100, ft = c.ft || 80, rt = c.rt || 80;
    return `<g stroke="${colors[i]}" fill="none" stroke-width="1"><path d="M${-ft / 2} ${-wb / 2}H${ft / 2}M${-rt / 2} ${wb / 2}H${rt / 2}M0 ${-wb / 2}V${wb / 2}"/>${[[-ft / 2, -wb / 2], [ft / 2, -wb / 2], [-rt / 2, wb / 2], [rt / 2, wb / 2]].map(([x, y]) => `<rect x="${x - 4}" y="${y - 11}" width="8" height="22" rx="2"/>`).join('')}</g>`;
  }).join('')}${list.map((c, i) => `<text x="${-W / 2 + 4}" y="${-H / 2 + 10 + i * 10}" fill="${colors[i]}" font-size="7">● ${esc(c.name)}</text>`).join('')}</svg>`;
}

/* ---------- setup board ---------- */
const DEFAULT_BOARD = { wheelbase: 98, frontTrack: 76, rearTrack: 78, frontToe: 0, rearToe: 0, frontCamber: 0, rearCamber: 0 };
let board = SetupBoard.validate(store.get('board', DEFAULT_BOARD)) || { ...DEFAULT_BOARD };
let boardCar = store.get('boardCar', null);
let cal = store.get('calibration', null);
const screenKey = () => [screen.width, screen.height, devicePixelRatio].join('x');
const CTL = [
  ['wheelbase', '轴距', 50, 300, 0.5, 'mm'], ['frontTrack', '前轮距', 30, 250, 0.5, 'mm'], ['rearTrack', '后轮距', 30, 250, 0.5, 'mm'],
  ['frontToe', '前束（前）', -5, 5, 0.5, '°'], ['rearToe', '前束（后）', -5, 5, 0.5, '°'], ['frontCamber', '外倾（前）', -20, 20, 0.5, '°'], ['rearCamber', '外倾（后）', -20, 20, 0.5, '°']
];
function setup() {
  const q = parseQuery();
  if (q.car && BY_ID.has(q.car)) loadCarToBoard(BY_ID.get(q.car), false);
  const ctl = ([k, l, min, max, step, u]) => `<div class="ctl"><div class="ctl-head"><span>${l}</span><output id="o-${k}">${board[k]}<small>${u}</small></output></div><div class="stepper"><button data-step="${k}" data-d="-${step}" aria-label="减少${l}">−</button><input type="range" id="r-${k}" min="${min}" max="${max}" step="${step}" value="${board[k]}" aria-label="${l}"><button data-step="${k}" data-d="${step}" aria-label="增加${l}">+</button></div></div>`;
  app.innerHTML = `
  <section class="wrap lib-head page-enter"><h1>电子调车板</h1><p>按真实毫米绘制。先用尺子校准一次，再对照前束、外倾和轮距。</p></section>
  <section class="wrap setup">
    <div class="controls">
      <div class="pick-car" id="pickCar" role="button" tabindex="0">${boardCarHtml()}</div>
      ${ctl(CTL[0])}${ctl(CTL[1])}${ctl(CTL[2])}
      <div class="ctl-pair">${ctl(CTL[3])}${ctl(CTL[4])}</div>
      <div class="ctl-pair">${ctl(CTL[5])}${ctl(CTL[6])}</div>
      <button class="btn secondary" id="resetBoard">恢复默认</button>
    </div>
    <div class="board-card" id="boardCard"><canvas id="board"></canvas>
      <div class="board-bar"><span class="status" id="boardStatus"><i></i>未校准</span><span style="display:flex;gap:8px"><button class="btn small secondary" id="calBtn">${I.ruler} 校准</button><button class="round" id="fsBtn" aria-label="全屏">${I.expand}</button></span></div>
    </div>
  </section>`;
  CTL.forEach(([k, , , , , u]) => {
    const r = $('#r-' + k);
    const upd = () => { r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); };
    upd();
    r.addEventListener('input', () => { board[k] = +r.value; $('#o-' + k).innerHTML = `${board[k]}<small>${u}</small>`; upd(); saveBoard(); });
  });
  app.addEventListener('click', stepHandler);
  $('#resetBoard').onclick = () => { board = { ...DEFAULT_BOARD }; boardCar = null; saveBoard(); setup(); };
  $('#pickCar').onclick = () => openSpot('pick');
  $('#calBtn').onclick = calibrate;
  $('#fsBtn').onclick = () => { const el = $('#boardCard'); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.().catch(() => toast('当前浏览器不支持全屏')); };
  drawBoard();
}
function stepHandler(e) {
  const b = e.target.closest('[data-step]'); if (!b) return;
  const k = b.dataset.step, r = $('#r-' + k); if (!r) return;
  r.value = Math.round((+r.value + +b.dataset.d) * 10) / 10; r.dispatchEvent(new Event('input'));
}
function boardCarHtml() {
  const c = boardCar && BY_ID.get(boardCar);
  return c ? `${img(c.thumb, '')}<div><b>${esc(c.name)}</b><span>已带入车壳尺寸 · 点击更换</span></div>${I.arrow}` : `<div><b>从车壳库带入尺寸</b><span>选择一款车壳，自动填入轴距与轮距</span></div>${I.arrow}`;
}
function loadCarToBoard(c, rerender = true) {
  if (c.wb) board.wheelbase = Math.min(300, Math.max(50, c.wb));
  if (c.ft) board.frontTrack = Math.min(250, Math.max(30, c.ft));
  if (c.rt) board.rearTrack = Math.min(250, Math.max(30, c.rt));
  boardCar = c.id; saveBoard();
  if (rerender) { if (route().name === 'setup') setup(); else location.hash = '#/setup'; toast('已带入「' + c.name + '」，请核对底盘实际轮距'); }
}
function saveBoard() { store.set('board', board); store.set('boardCar', boardCar); drawBoard(); }
function drawBoard() {
  const canvas = $('#board'); if (!canvas) return;
  const rect = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const ok = cal && cal.key === screenKey();
  const g = SetupBoard.draw(ctx, rect.width, rect.height, ok ? cal.scale : { x: 3.78, y: 3.78 }, board, !!ok, null, null, false);
  const st = $('#boardStatus');
  st.classList.toggle('ok', !!ok);
  st.innerHTML = '<i></i>' + (ok ? '已按尺校准 · 1:1' : '未校准 · 仅示意') + (g.fits ? '' : ' · 超出屏幕');
}
function calibrate() {
  let x = cal?.scale.x * 50 || 189, y = cal?.scale.y * 50 || 189;
  const el = document.createElement('div'); el.className = 'cal';
  el.innerHTML = `<div class="cal-stage"><div class="cal-x"></div><div class="cal-y"></div><p>把尺子贴在屏幕上，拖动下面两个滑块，让绿色横线和竖线都正好是 <b style="color:var(--text)">5 cm</b>。</p></div>
    <div class="cal-ctl"><div class="ctl"><div class="ctl-head"><span>横向 5 cm</span><output id="cx"></output></div><div class="stepper"><button data-c="x" data-d="-0.5">−</button><input type="range" id="calx" min="80" max="600" step=".1" value="${x}"><button data-c="x" data-d="0.5">+</button></div></div>
    <div class="ctl"><div class="ctl-head"><span>纵向 5 cm</span><output id="cy"></output></div><div class="stepper"><button data-c="y" data-d="-0.5">−</button><input type="range" id="caly" min="80" max="600" step=".1" value="${y}"><button data-c="y" data-d="0.5">+</button></div></div>
    <div style="display:flex;gap:10px;justify-content:center"><button class="btn secondary" id="calCancel">取消</button><button class="btn primary" id="calOk">我已用尺核对，保存</button></div></div>`;
  document.body.appendChild(el); document.body.classList.add('locked');
  const upd = () => { $('.cal-x', el).style.width = x + 'px'; $('.cal-y', el).style.height = y + 'px'; $('#cx', el).textContent = x.toFixed(1) + ' px'; $('#cy', el).textContent = y.toFixed(1) + ' px'; $('#calx', el).value = x; $('#caly', el).value = y; };
  upd();
  $('#calx', el).oninput = e => { x = +e.target.value; upd(); };
  $('#caly', el).oninput = e => { y = +e.target.value; upd(); };
  el.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; if (b.dataset.c === 'x') x += +b.dataset.d; else y += +b.dataset.d; upd(); });
  const close = () => { el.remove(); document.body.classList.remove('locked'); };
  $('#calCancel', el).onclick = close;
  $('#calOk', el).onclick = () => { const s = SetupBoard.calibration(x, y); if (!s) return toast('数值超出范围'); cal = { scale: s, key: screenKey() }; store.set('calibration', cal); close(); drawBoard(); toast('校准已保存'); };
}

/* ---------- detail sheet ---------- */
const sheet = $('#sheet');
let sheetOpen = false;
function topView(c) {
  const wb = c.wb || 100, ft = c.ft || 80, rt = c.rt || 80, len = c.len || wb + 80;
  const bodyW = Math.max(ft, rt) + 8, W = bodyW + 70, H = len + 50;
  const fy = -wb / 2, ry = wb / 2, front = -len / 2;
  const body = `M${-bodyW / 2 + 14} ${front} Q0 ${front - 6} ${bodyW / 2 - 14} ${front} Q${bodyW / 2} ${front + 4} ${bodyW / 2} ${front + 26} L${bodyW / 2} ${len / 2 - 14} Q${bodyW / 2} ${len / 2} ${bodyW / 2 - 12} ${len / 2} L${-bodyW / 2 + 12} ${len / 2} Q${-bodyW / 2} ${len / 2} ${-bodyW / 2} ${len / 2 - 14} L${-bodyW / 2} ${front + 26} Q${-bodyW / 2} ${front + 4} ${-bodyW / 2 + 14} ${front}Z`;
  const wheel = (x, y) => `<rect x="${x - 5}" y="${y - 12}" width="10" height="24" rx="3" fill="#f5f5f7"/>`;
  return `<svg class="topview" viewBox="${-W / 2} ${-H / 2} ${W} ${H}" role="img" aria-label="俯视尺寸示意">
    <path d="${body}" fill="rgba(0,255,102,.06)" stroke="#00ff66" stroke-width="1" class="draw"/>
    ${wheel(-ft / 2, fy)}${wheel(ft / 2, fy)}${wheel(-rt / 2, ry)}${wheel(rt / 2, ry)}
    <g stroke="#6e6e73" stroke-width=".6"><path d="M${-ft / 2} ${fy}H${ft / 2}M${-rt / 2} ${ry}H${rt / 2}"/><path d="M${bodyW / 2 + 14} ${fy}V${ry}M${bodyW / 2 + 10} ${fy}h8M${bodyW / 2 + 10} ${ry}h8"/>${c.len ? `<path d="M${-bodyW / 2 - 14} ${front}V${len / 2}M${-bodyW / 2 - 18} ${front}h8M${-bodyW / 2 - 18} ${len / 2}h8"/>` : ''}</g>
    <text x="0" y="${fy - 16}" text-anchor="middle">${dim(c.ft)}</text><text x="0" y="${ry + 24}" text-anchor="middle">${dim(c.rt)}</text>
    <text x="${bodyW / 2 + 18}" y="3">${dim(c.wb)}</text>${c.len ? `<text x="${-bodyW / 2 - 18}" y="3" text-anchor="end">${c.len}</text>` : ''}
    <text x="0" y="${front - 10}" text-anchor="middle" fill="#00ff66">车头 ↑</text>
  </svg>`;
}
function openDetail(id) {
  const c = BY_ID.get(id); if (!c) { toast('这款车壳不存在'); return closeDetail(); }
  const imgs = [c.cover, c.finished, c.scan, ...c.parts].filter(Boolean);
  const labels = [['封面', c.cover], ['成品照片', c.finished], ['宽体扫描图', c.scan]].filter(x => x[1]).map(x => x[0]).concat(c.parts.map((_, i) => `板件 ${i + 1}`));
  const cm = COMMENTS.filter(x => x.car === id);
  const related = CARS.filter(x => x.id !== id && (x.model === c.model && c.model !== '其他' || (x.wb && c.wb && Math.abs(x.wb - c.wb) <= 2))).slice(0, 10);
  $('#sheetBody').innerHTML = `
    <div class="d-hero"><div class="d-gallery" id="gallery">${imgs.map((s, i) => `<figure data-lb="${i}"><img src="${esc(s)}" alt="${esc(c.name)} ${labels[i]}" ${i ? 'loading="lazy"' : ''}><figcaption><span class="pill glass">${labels[i]}</span></figcaption></figure>`).join('')}</div>
      ${imgs.length > 1 ? `<div class="d-dots">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>
    <div class="d-content">
      <div class="d-title"><div><span class="eyebrow">${esc(c.brand)} · ${esc(c.model)} · ${esc(c.scale)}${c.wide ? ' · 宽体' : ''}</span><h2>${esc(c.name)}</h2>
        <div class="d-by">${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}<span>@${esc(c.by)} · ${fmtDate(c.time)} · ${c.views} 次浏览</span></div></div>
        <div class="d-actions">
          <button class="btn secondary ${liked.has(id) ? 'liked' : ''}" data-like="${esc(id)}">${I.heart}<span>${likeCount(c)}</span></button>
          <button class="btn secondary ${saved.has(id) ? 'saved' : ''}" data-save="${esc(id)}">${I.bookmark}<span>${saved.has(id) ? '已收藏' : '收藏'}</span></button>
          <button class="btn secondary" data-compare="${esc(id)}">${I.compare}<span>${compare.includes(id) ? '已在对比' : '加入对比'}</span></button>
          <button class="btn secondary" data-share="${esc(id)}" aria-label="复制链接">${I.share}</button>
        </div></div>
      <div class="d-specs">
        <div><b>${dim(c.wb)}<small>mm</small></b><span>轴距</span></div><div><b>${dim(c.ft)}<small>mm</small></b><span>前轮距</span></div>
        <div><b>${dim(c.rt)}<small>mm</small></b><span>后轮距</span></div><div><b>${dim(c.len)}<small>${c.len ? 'mm' : ''}</small></b><span>车身长度</span></div>
      </div>
      <div class="d-grid">
        <div class="panel"><h3>俯视尺寸</h3><p class="muted">按实测数据等比绘制，轮距按轮眉位置测量。</p>${topView(c)}</div>
        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:20px">
          <div><h3>上调车板对照</h3><p class="muted">把这款车壳的轴距和轮距带入电子调车板，按 1:1 实尺在屏幕上画出来。装车前请核对底盘实际轮距。</p></div>
          <button class="btn primary" data-board="${esc(id)}">${I.ruler} 带入调车板</button>
          ${c.note ? `<div><h3 style="font-size:17px">备注</h3><p class="note" style="margin-top:8px;padding:0;background:none">${esc(c.note)}</p></div>` : ''}
          ${c.wideLink ? `<div><h3 style="font-size:17px;margin-bottom:8px">宽体套件来源</h3><div class="linkrow" style="background:var(--card2)"><span>${esc(c.wideLink)}</span><button class="btn small secondary" data-copy="${esc(c.wideLink)}">复制</button></div></div>` : ''}
        </div>
      </div>
      ${cm.length ? `<div class="d-section"><h3>车友评论 <span class="muted" style="font-size:17px;font-weight:500">${cm.length}</span></h3><div class="comments">${cm.map(x => `<div class="comment">${x.avatar ? `<img src="${esc(x.avatar)}" alt="" loading="lazy">` : `<span class="av">${esc(x.by.slice(0, 1))}</span>`}<div class="comment-bubble"><small><b class="${x.admin ? 'tag-admin' : ''}">${esc(x.by)}${x.admin ? ' · 管理员' : ''}</b>${ago(x.time)}</small><p>${esc(x.text)}</p></div></div>`).join('')}</div></div>` : ''}
      ${related.length ? `<div class="d-section"><h3>尺寸相近 / 同车型</h3><div class="shelf related" style="padding-left:0;margin-left:0">${related.map(card).join('')}</div></div>` : ''}
    </div>`;
  sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); document.body.classList.add('locked'); sheetOpen = true;
  $('.sheet-body').scrollTop = 0;
  const gal = $('#gallery'), dots = $$('.d-dots i');
  gal.addEventListener('scroll', () => { const i = Math.round(gal.scrollLeft / gal.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
  gal.addEventListener('click', e => { const f = e.target.closest('[data-lb]'); if (f) openLightbox(imgs, +f.dataset.lb); });
  $('.sheet', sheet).focus({ preventScroll: true });
}
function closeDetail() {
  if (!sheetOpen) return;
  sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); document.body.classList.remove('locked'); sheetOpen = false;
  if (route().name === 'car') history.replaceState(null, '', lastPage || '#/');
  setTimeout(() => { if (!sheetOpen) $('#sheetBody').innerHTML = ''; }, 600);
}
sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDetail(); });
// drag down to dismiss (iOS style)
(() => {
  const el = $('.sheet', sheet); let y0 = null, dy = 0;
  el.addEventListener('pointerdown', e => { if (e.clientY - el.getBoundingClientRect().top > 60 && $('.sheet-body').scrollTop > 0) return; if (e.target.closest('button,a,input')) return; y0 = e.clientY; dy = 0; });
  addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); if (dy > 6) { el.classList.add('dragging'); el.style.transform = `translate(-50%,${dy}px)`; } });
  addEventListener('pointerup', () => { if (y0 == null) return; el.classList.remove('dragging'); el.style.transform = ''; if (dy > 120) closeDetail(); y0 = null; });
})();

/* ---------- lightbox ---------- */
const lb = $('#lightbox'); let lbList = [], lbI = 0;
function openLightbox(list, i) { lbList = list; lbI = i; showLb(); lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false'); }
function showLb() { $('img', lb).src = lbList[lbI]; $('.lb-count', lb).textContent = `${lbI + 1} / ${lbList.length}`; $$('.lb-nav', lb).forEach(b => b.hidden = lbList.length < 2); }
function closeLb() { lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); }
lb.addEventListener('click', e => {
  if (e.target.closest('.prev')) { lbI = (lbI - 1 + lbList.length) % lbList.length; showLb(); }
  else if (e.target.closest('.next')) { lbI = (lbI + 1) % lbList.length; showLb(); }
  else if (e.target.closest('[data-close]') || e.target === lb) closeLb();
});

/* ---------- spotlight search / car picker ---------- */
const spot = $('#spotlight'), spotInput = $('#spotInput'), spotRes = $('#spotResults');
let spotMode = 'go', spotSel = 0, spotList = [];
function openSpot(mode = 'go') {
  spotMode = mode; spot.classList.add('open'); spot.setAttribute('aria-hidden', 'false');
  spotInput.placeholder = mode === 'pick' ? '选择一款车壳带入调车板' : '搜索车壳、品牌、车型、上传者';
  spotInput.value = ''; renderSpot(); setTimeout(() => spotInput.focus(), 50);
}
function closeSpot() { spot.classList.remove('open'); spot.setAttribute('aria-hidden', 'true'); spotInput.blur(); }
function renderSpot() {
  const q = spotInput.value.trim().toLowerCase();
  spotList = (q ? CARS.filter(c => [c.name, c.brand, c.model, c.by].join(' ').toLowerCase().includes(q)) : (spotMode === 'pick' ? CARS : [...CARS].sort((a, b) => b.views - a.views))).slice(0, 30);
  spotSel = 0;
  spotRes.innerHTML = spotList.length ? spotList.map((c, i) => `<div class="sr ${i ? '' : 'on'}" data-i="${i}">${img(c.thumb, '')}<div><b>${esc(c.name)}</b><span>${esc(c.brand)} · ${esc(c.model)} · 轴距 ${dim(c.wb)} · 轮距 ${dim(c.ft)}/${dim(c.rt)}</span></div></div>`).join('') : `<div class="sr-empty">没有找到「${esc(spotInput.value)}」</div>`;
}
function chooseSpot(i) {
  const c = spotList[i]; if (!c) return; closeSpot();
  if (spotMode === 'pick') loadCarToBoard(c); else location.hash = '#/car/' + c.id;
}
spotInput.addEventListener('input', renderSpot);
spotInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); spotSel = Math.max(0, Math.min(spotList.length - 1, spotSel + (e.key === 'ArrowDown' ? 1 : -1)));
    $$('.sr', spotRes).forEach((r, i) => r.classList.toggle('on', i === spotSel)); $$('.sr', spotRes)[spotSel]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') chooseSpot(spotSel);
});
spotRes.addEventListener('click', e => { const r = e.target.closest('.sr'); if (r) chooseSpot(+r.dataset.i); });
spot.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSpot(); });
$('#openSearch').addEventListener('click', () => openSpot());

/* ---------- global actions ---------- */
function toggleSave(id, btn) {
  if (saved.has(id)) { saved.delete(id); toast('已取消收藏'); } else { saved.add(id); toast('已收藏'); }
  store.set('saved', [...saved]); updateBadge();
  $$(`[data-save="${CSS.escape(id)}"]`).forEach(b => {
    const on = saved.has(id); b.classList.toggle('on', on); b.classList.toggle('saved', on);
    if (b.classList.contains('save-btn')) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    const s = $('span', b); if (s) s.textContent = on ? '已收藏' : '收藏';
  });
  if (route().name === 'saved' && !sheetOpen) savedPage();
}
function toggleCompare(id) {
  if (compare.includes(id)) compare = compare.filter(x => x !== id);
  else { if (compare.length >= 3) compare.shift(); compare.push(id); toast('已加入对比'); }
  store.set('compare', compare); renderDock();
  $$(`[data-compare="${CSS.escape(id)}"] span`).forEach(s => s.textContent = compare.includes(id) ? '已在对比' : '加入对比');
}
function renderDock() {
  const d = $('#compareDock');
  if (!compare.length || route().name === 'compare') { d.hidden = true; return; }
  d.hidden = false;
  d.innerHTML = compare.map(id => `<img src="${esc(BY_ID.get(id).thumb)}" alt="">`).join('') + `<span>${compare.length} 款待对比</span><a class="btn small primary" href="#/compare">开始对比</a><button class="round" style="width:30px;height:30px" id="clearCmp" aria-label="清空对比">${I.x}</button>`;
  $('#clearCmp').onclick = () => { compare = []; store.set('compare', compare); renderDock(); };
}
function updateBadge() { const b = $('#savedCount'); b.hidden = !saved.size; b.textContent = saved.size; }
document.addEventListener('click', e => {
  const save = e.target.closest('[data-save]'); if (save) { e.preventDefault(); e.stopPropagation(); return toggleSave(save.dataset.save, save); }
  const like = e.target.closest('[data-like]');
  if (like) {
    const id = like.dataset.like; liked.has(id) ? liked.delete(id) : liked.add(id); store.set('liked', [...liked]);
    like.classList.toggle('liked', liked.has(id)); $('span', like).textContent = likeCount(BY_ID.get(id));
    like.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    return;
  }
  const cmp = e.target.closest('[data-compare]'); if (cmp) return toggleCompare(cmp.dataset.compare);
  const un = e.target.closest('[data-uncompare]'); if (un) { toggleCompare(un.dataset.uncompare); return comparePage(); }
  const bd = e.target.closest('[data-board]'); if (bd) { closeDetail(); return loadCarToBoard(BY_ID.get(bd.dataset.board)); }
  const sh = e.target.closest('[data-share]'); if (sh) { const url = location.href.split('#')[0] + '#/car/' + sh.dataset.share; navigator.share ? navigator.share({ title: BY_ID.get(sh.dataset.share).name, url }).catch(() => {}) : copy(url); return; }
  const cp = e.target.closest('[data-copy]'); if (cp) return copy(cp.dataset.copy);
  const sb = e.target.closest('[data-shelf]'); if (sb) { const s = $('#' + sb.dataset.shelf); s.scrollBy({ left: sb.dataset.dir * s.clientWidth * .8, behavior: 'smooth' }); return; }
  const c = e.target.closest('[data-car]'); if (c && !e.target.closest('a')) { location.hash = '#/car/' + c.dataset.car; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (lb.classList.contains('open')) closeLb(); else if (spot.classList.contains('open')) closeSpot(); else closeDetail(); }
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName))) { e.preventDefault(); openSpot(); }
  if (lb.classList.contains('open') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { lbI = (lbI + (e.key === 'ArrowLeft' ? -1 : 1) + lbList.length) % lbList.length; showLb(); }
  if (e.key === 'Enter' && document.activeElement.matches?.('.card,.pick-car')) document.activeElement.click();
});
function copy(text) { navigator.clipboard?.writeText(text).then(() => toast('已复制'), () => toast('复制失败')); }

/* ---------- effects ---------- */
let io;
function reveal() {
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(el => io.observe(el));
}
function countUp() {
  $$('[data-count]').forEach(el => {
    const target = +el.dataset.count;
    if (reduceMotion) { el.textContent = target.toLocaleString(); return; }
    const o = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; o.disconnect();
      const t0 = performance.now(), d = 1400;
      const tick = t => { const p = Math.min(1, (t - t0) / d), v = 1 - Math.pow(1 - p, 4); el.textContent = Math.round(target * v).toLocaleString(); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    o.observe(el);
  });
}
function bindShelves() {
  $$('.shelf').forEach(s => {
    const btns = $$(`[data-shelf="${s.id}"]`);
    const upd = () => { if (!btns.length) return; btns[0].disabled = s.scrollLeft < 8; btns[1].disabled = s.scrollLeft + s.clientWidth >= s.scrollWidth - 8; };
    s.addEventListener('scroll', upd, { passive: true }); upd();
  });
}
function parallax() {
  const f = $('#featured'); if (!f || reduceMotion) return;
  const im = $('img', f);
  const on = () => { if (!document.body.contains(f)) return removeEventListener('scroll', on); const r = f.getBoundingClientRect(); const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; im.style.setProperty('--py', (p * -40).toFixed(1) + 'px'); };
  addEventListener('scroll', on, { passive: true }); on();
}
addEventListener('scroll', () => $('#nav').classList.toggle('scrolled', scrollY > 8), { passive: true });
addEventListener('resize', () => { drawBoard(); moveSeg($('#sortSeg')); });
document.addEventListener('fullscreenchange', () => setTimeout(drawBoard, 60));

/* ---------- router ---------- */
let lastPage = '#/', currentPage = null;
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [name, arg] = h.split('/');
  return { name: name || 'home', arg };
}
const PAGES = { home, library, rank, setup, saved: savedPage, compare: comparePage };
function render() {
  const r = route();
  if (r.name === 'car') {
    if (!currentPage) renderPage((lastPage.replace(/^#\/?/, '').split(/[?/]/)[0]) || 'home');
    openDetail(decodeURIComponent(r.arg || ''));
    return;
  }
  closeDetail(); closeSpot();
  const key = location.hash || '#/';
  if (key === currentPage) return;
  lastPage = key;
  renderPage(r.name);
}
function renderPage(name) {
  app.removeEventListener('click', stepHandler);
  const fn = PAGES[name] || home;
  const go = () => { fn(); currentPage = location.hash || '#/'; if (route().name === 'car') currentPage = lastPage; reveal(); renderDock(); updateNav(name); };
  if (document.startViewTransition && !reduceMotion && currentPage) document.startViewTransition(go); else go();
  if (route().name !== 'car') scrollTo({ top: 0, behavior: 'instant' });
}
function updateNav(name) { $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name)); }
addEventListener('hashchange', render);
$('#footMeta').textContent = `数据迁移自「头蚊字 Dou」小程序 · 快照时间 ${fmtDate(DATA.exportedAt)} · 共 ${CARS.length} 款车壳、${COMMENTS.length} 条评论`;
updateBadge();
render();
})();
