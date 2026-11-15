(function () {
'use strict';
const DATA = window.DOU_DATA;
const CARS = DATA.cars;
const BY_ID = new Map(CARS.map(c => [c.id, c]));
let COMMENTS = DATA.comments.filter(c => BY_ID.has(c.car));
const CFG = window.DOU_CONFIG || {};
const sb = (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
let remote = false, isAdmin = false;
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
let TOKEN = store.get('token', null) || (() => { const t = [...crypto.getRandomValues(new Uint8Array(20))].map(b => b.toString(16).padStart(2, '0')).join(''); store.set('token', t); return t; })();
let myComments = new Set(store.get('myComments', []));
let nickname = store.get('nick', '');
let myCars = new Set();
let weekTop = null; // [{car_id, views}] for the current week, from Supabase
let profile = store.get('profile', null); // {public_id, nickname, avatar}
let wxLogged = store.get('wx', false);
if (profile?.nickname && !nickname) nickname = profile.nickname;
const COLS = 'id,name,brand,model,scale,wide,wide_link,len,wb,ft,rt,cover,thumb,ratio,finished,scan,parts,note,by_name,by_id,avatar,views,base_likes,like_count,week,week_key,created_ms,status';
const BRANDS = ['田宫', '青岛社', '长谷川', '富士美', '京商', '其他'];
const MODEL_RULES = [['RX-7', 'rx[ -]?7|fd3s|fc3s'], ['Supra', 'supra|苏普拉|牛魔王'], ['GT-R', 'gt[ -]?r|skyline|斯凯莱茵|(^|[^a-z0-9])r3[2345]([^a-z0-9]|$)'], ['86/BRZ', 'gt[ -]?86|gr[ -]?86|brz|(^|[^a-z0-9])86([^a-z0-9]|$)'], ['AE86', 'ae[ -]?86|豆腐店|trueno|levin'], ['Silvia', 'silvia|西尔维娅|180[ -]?sx|240[ -]?sx|(^|[^a-z0-9])s1[345]([^a-z0-9]|$)'], ['Fairlady Z', 'fairlady|350[ -]?z|370[ -]?z|400[ -]?z|(^|[^a-z0-9])z3[234]([^a-z0-9]|$)'], ['Lancer Evo', 'lancer|evolution|(^|[^a-z])evo([^a-z]|$)|蓝瑟'], ['Impreza', 'impreza|wrx|翼豹'], ['NSX', 'nsx'], ['MX-5', 'mx[ -]?5|miata|马自达小跑'], ['S2000', 's[ -]?2000'], ['Civic', 'civic|思域']];
const MODEL_NAMES = MODEL_RULES.map(r => r[0]).concat('其他');
function inferModel(name) { for (const i of [4, 0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]) if (new RegExp(MODEL_RULES[i][1], 'i').test(name || '')) return MODEL_RULES[i][0]; return '其他'; }

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
const likeCount = c => c.likes + (!remote && liked.has(c.id) ? 1 : 0);
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
  if (weekTop && weekTop.length) { const c = BY_ID.get(weekTop[0].car_id); if (c) { c.week = weekTop[0].views; return c; } }
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
function splitChars(text, cls, delay) {
  return `<span class="h2-line ${cls}">${[...text].map((ch, i) => `<span class="ch" style="--d:${(delay + i) * 55}ms">${esc(ch)}</span>`).join('')}</span>`;
}
function heroWall() {
  const pool = [...CARS].filter(c => c.thumb).sort((a, b) => b.views - a.views).slice(0, 36);
  const rows = [0, 1, 2].map(r => pool.filter((_, i) => i % 3 === r));
  return rows.map((row, r) => `<div class="h2-row" style="--dur:${70 + r * 18}s;--dir:${r % 2 ? 'reverse' : 'normal'}">${[...row, ...row].map((c, i) => `<img src="${esc(c.thumb)}" alt="" ${i < row.length ? '' : 'aria-hidden="true"'} loading="${r === 1 && i < 6 ? 'eager' : 'lazy'}" decoding="async">`).join('')}</div>`).join('');
}
let heroCleanup = null;
function heroFx() {
  heroCleanup?.();
  const hero = $('#hero2'); if (!hero) return;
  const wall = $('#h2wall'), copy = $('#h2copy'), scrollHint = $('.h2-scroll', hero);
  requestAnimationFrame(() => hero.classList.add('ready'));
  if (reduceMotion) return;
  let mx = 0, my = 0, tx = 0, ty = 0, raf = 0, alive = true;
  const onMove = e => { const r = hero.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - .5; my = (e.clientY - r.top) / r.height - .5; hero.style.setProperty('--gx', (e.clientX - r.left) + 'px'); hero.style.setProperty('--gy', (e.clientY - r.top) + 'px'); };
  const tick = () => {
    if (!alive) return;
    tx += (mx - tx) * .06; ty += (my - ty) * .06;
    const p = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight * .9)));
    wall.style.transform = `translate3d(${tx * -40}px, ${ty * -24 + p * -60}px, 0) rotateX(${26 - p * 14 + ty * 4}deg) rotateZ(${-9 + tx * 3}deg) scale(${1.32 - p * .12})`;
    wall.style.opacity = String(.62 - p * .4);
    copy.style.transform = `translate3d(0, ${p * -90}px, 0) scale(${1 - p * .1})`;
    copy.style.opacity = String(1 - p * 1.3);
    copy.style.filter = p > .02 ? `blur(${p * 8}px)` : '';
    if (scrollHint && p > .02) { scrollHint.style.transition = 'opacity .2s'; scrollHint.style.opacity = String(Math.max(0, 1 - p * 4)); } else if (scrollHint) scrollHint.style.opacity = '';
    raf = requestAnimationFrame(tick);
  };
  hero.addEventListener('pointermove', onMove);
  raf = requestAnimationFrame(tick);
  heroCleanup = () => { alive = false; cancelAnimationFrame(raf); hero.removeEventListener('pointermove', onMove); heroCleanup = null; };
}
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
  <section class="hero2" id="hero2" aria-label="头蚊字 Dou 车壳库">
    <div class="h2-stage">
      <div class="h2-wall" id="h2wall" aria-hidden="true">${heroWall()}</div>
      <div class="h2-floor" aria-hidden="true"></div>
      <div class="h2-glow" aria-hidden="true"></div>
      <div class="h2-shade" aria-hidden="true"></div>
      <div class="h2-copy" id="h2copy">
        <p class="h2-eyebrow"><span class="dot"></span>1/28 RC 车壳尺寸库 · ${CARS.length} 款实测</p>
        <h1 class="h2-title">${splitChars('每一毫米，', 'grad', 0)}<br>${splitChars('都有车友量过。', '', 5)}</h1>
        <p class="h2-lead">轴距、轮距、车身长度与实拍图。挑壳、对比、上调车板，一站完成。</p>
        <div class="hero-cta h2-cta"><a class="btn primary" href="#/library">浏览车壳库</a><a class="btn secondary" href="#/submit">投稿车壳</a><a class="btn ghost" href="#/setup">打开电子调车板 ${I.arrow}</a></div>
      </div>
      <a class="h2-scroll" href="#stats" aria-label="向下滑动"><span></span></a>
    </div>
  </section>
  <section class="wrap" id="stats"><div class="stats reveal">
      <div class="stat"><b data-count="${CARS.length}">0</b><span>款实测车壳</span></div>
      <div class="stat"><b data-count="${contributors}">0</b><span>位车友贡献</span></div>
      <div class="stat"><b data-count="${totalViews}">0</b><span>次浏览</span></div>
      <div class="stat"><b data-count="${totalLikes}">0</b><span>个点赞</span></div>
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
  <section class="section reveal"><div class="wrap"><div class="section-head"><div><h2>调车，不止看尺寸。</h2><p>从车壳到车架，再到每一次试车记录。</p></div></div>
    <div class="tool-tiles">
      <a class="tool-tile" href="#/setup"><b>电子调车板</b><span>1:1 实尺、前束外倾、AKM 转向对照</span><i>${I.ruler}</i></a>
      <a class="tool-tile" href="#/tools"><b>调车工具与记录</b><span>前束换算、四角配重、A/B 调校记录</span><i>${I.sliders}</i></a>
      <a class="tool-tile" href="#/chassis"><b>车架资料库</b><span>厂家规格、实测与调校方案，受邀提供</span><i>${I.compare}</i></a>
    </div></div></section>
  <section class="wrap"><div class="cta-band reveal">
    <div><p class="eyebrow">电子调车板</p><h2>把屏幕，<br>变成 1:1 实尺。</h2><p>用尺子校准一次，任何车壳的轴距和轮距都能按真实毫米画在屏幕上，直接对照前束和外倾。</p><a class="btn primary" href="#/setup">开始调车</a></div>
    ${miniBoard()}
  </div></section>`;
  countUp(); bindShelves(); parallax(); heroFx();
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
  <section class="wrap lib-head page-enter lib-head-row"><div><h1>车壳库</h1><p>${CARS.length} 款车壳，全部由车友实测。</p></div><a class="btn primary" href="#/submit">＋ 投稿</a></section>
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

let rankTab = 'likes';
function rank() {
  const weekly = rankTab === 'week';
  let list;
  if (weekly) {
    const src = weekTop && weekTop.length ? weekTop.map(w => ({ c: BY_ID.get(w.car_id), v: w.views })) : (() => { const wk = CARS.reduce((m, c) => c.weekKey > m ? c.weekKey : m, ''); return CARS.filter(c => c.weekKey === wk && c.week > 0).map(c => ({ c, v: c.week })); })();
    list = src.filter(x => x.c).sort((a, b) => b.v - a.v);
  } else list = [...CARS].sort((a, b) => likeCount(b) - likeCount(a) || b.views - a.views).map(c => ({ c, v: likeCount(c) }));
  const top = list.slice(0, 3);
  const val = v => weekly ? `<svg viewBox="0 0 24 24" class="eye"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>${v}` : `${I.heart}${v}`;
  app.innerHTML = `
  <section class="wrap lib-head page-enter lib-head-row"><div><h1>${weekly ? '本周榜' : '点赞榜'}</h1><p>${weekly ? '这周被看得最多的车壳（每周一零点按北京时间重新计算）。' : '车友们最喜欢的车壳。'}</p></div>
    <div class="seg" id="rankSeg"><i></i><button data-r="likes">点赞总榜</button><button data-r="week">本周浏览</button></div></section>
  <section class="wrap">
    ${list.length ? `<div class="podium">${top.map((x, i) => `<div class="p${i + 1} reveal" style="position:relative"><span class="medal">${i + 1}</span>${card(x.c)}</div>`).join('')}</div>
    <div class="rank-list reveal">${list.slice(3, 50).map((x, i) => `<div class="rank-row" data-car="${esc(x.c.id)}"><span class="n">${i + 4}</span>${img(x.c.thumb, '')}<div><h4>${esc(x.c.name)}</h4><p>${esc(x.c.brand)} · ${esc(x.c.model)} · @${esc(x.c.by)}</p></div><span class="v">${val(x.v)}</span></div>`).join('')}</div>`
    : `<div class="empty"><b>这周还没有浏览记录。</b>去车壳库逛逛，第一位就是你看的那款。</div>`}
  </section>`;
  $$('#rankSeg button').forEach(b => b.classList.toggle('on', b.dataset.r === rankTab)); moveSeg($('#rankSeg'));
  $('#rankSeg').onclick = e => { const b = e.target.closest('[data-r]'); if (b && b.dataset.r !== rankTab) { rankTab = b.dataset.r; rank(); reveal(); } };
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
const DEFAULT_BOARD = { wheelbase: 98, frontTrack: 76, rearTrack: 78, frontToe: 0, rearToe: 0, frontCamber: 0, rearCamber: 0, caster: 0 };
// Tyre outline defaults per scale — starting points only; the user should type their own tyre's size.
const SCALES = { '1/24': { d: 30, w: 10 }, '1/28': { d: 24, w: 8 } };
let rig = Object.assign({ scale: '1/24', tireD: 30, tireW: 10, shellOn: true }, store.get('rig', {}));
if (!SCALES[rig.scale]) Object.assign(rig, { scale: '1/24', tireD: 30, tireW: 10 });
const saveRig = () => { store.set('rig', rig); drawBoard(); };
let board = SetupBoard.validate(store.get('board', DEFAULT_BOARD)) || { ...DEFAULT_BOARD };
let boardCar = store.get('boardCar', null);
let cal = store.get('calibration', null);
const screenKey = () => [screen.width, screen.height, devicePixelRatio].join('x');
const CTL = [
  ['wheelbase', '轴距', 50, 300, 0.5, 'mm'], ['frontTrack', '前轮距', 30, 250, 0.5, 'mm'], ['rearTrack', '后轮距', 30, 250, 0.5, 'mm'],
  ['frontToe', '前束（前）', -5, 5, 0.5, '°'], ['rearToe', '前束（后）', -10, 10, 0.5, '°'], ['frontCamber', '外倾（前）', -20, 20, 0.5, '°'], ['rearCamber', '外倾（后）', -20, 20, 0.5, '°'],
  ['caster', '主销后倾 Caster', 0, 25, 0.5, '°']
];
function setup() {
  const q = parseQuery();
  if (q.car && BY_ID.has(q.car)) loadCarToBoard(BY_ID.get(q.car), false);
  const ctl = ([k, l, min, max, step, u]) => `<div class="ctl"><div class="ctl-head"><span>${l}</span><output id="o-${k}">${board[k]}<small>${u}</small></output></div><div class="stepper"><button data-step="${k}" data-d="-${step}" aria-label="减少${l}">−</button><input type="range" id="r-${k}" min="${min}" max="${max}" step="${step}" value="${board[k]}" aria-label="${l}"><button data-step="${k}" data-d="${step}" aria-label="增加${l}">+</button></div></div>`;
  app.innerHTML = `
  <section class="wrap lib-head page-enter lib-head-row"><div><h1>电子调车板</h1><p>按真实毫米绘制。先用尺子校准一次，再对照前束、外倾和轮距。</p></div><span class="mini-actions"><a class="btn secondary" href="#/chassis">车架资料</a><a class="btn secondary" href="#/tools">调车工具与记录 ${I.arrow}</a></span></section>
  <section class="wrap setup">
    <div class="controls">
      <div class="ctl scale-card"><div class="ctl-head"><span>比例与轮胎</span><small class="muted">按你的轮胎改</small></div>
        <div class="seg seg-full" id="scaleSeg"><i></i>${Object.keys(SCALES).map(k => `<button data-scale="${k}">${k}</button>`).join('')}</div>
        <div class="mini-grid" style="margin-top:10px"><label class="mini-f"><span>轮胎外径</span><div class="unit"><input id="tireD" inputmode="decimal" value="${rig.tireD}"><em>mm</em></div></label><label class="mini-f"><span>轮胎宽度</span><div class="unit"><input id="tireW" inputmode="decimal" value="${rig.tireW}"><em>mm</em></div></label></div></div>
      <div class="pick-car" id="pickCar" role="button" tabindex="0">${boardCarHtml()}</div>
      ${ctl(CTL[0])}${ctl(CTL[1])}${ctl(CTL[2])}
      <div class="ctl-pair">${ctl(CTL[3])}${ctl(CTL[4])}</div>
      <div class="ctl-pair">${ctl(CTL[5])}${ctl(CTL[6])}</div>
      ${ctl(CTL[7])}
      <div class="ctl steer-card"><div class="ctl-head"><span>转向 · AKM</span><a class="link-mini" href="#/tools">调车工具 ${I.arrow}</a></div>
        <div class="seg seg-full" id="steerSeg"><i></i>${STEER_MODES.map(([k, l]) => `<button data-mode="${k}">${l}</button>`).join('')}</div>
        <div id="steerPanel"></div></div>
      <button class="btn secondary" id="resetBoard">恢复默认</button>
    </div>
    <div class="board-card" id="boardCard"><canvas id="board"></canvas>
      <div class="wheel-dock" id="wheelDock" hidden>
        <div class="steer-wheel" id="steerWheel" role="slider" tabindex="0" aria-label="方向盘" aria-valuemin="-100" aria-valuemax="100"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="9"/><path d="M6 50h35M59 50h35M50 59v35"/><path class="tick" d="M50 6v10"/></svg></div>
        <div class="wheel-read" id="wheelRead"></div>
        <input type="range" id="steerPos" min="-100" max="100" step="1" value="0" aria-label="转向位置">
      </div>
      <div class="board-bar"><span class="status" id="boardStatus"><i></i>未校准</span><span style="display:flex;gap:8px"><button class="btn small secondary" id="calBtn">${I.ruler} 校准</button><button class="round" id="fsBtn" aria-label="全屏">${I.expand}</button></span></div>
    </div>
  </section>
  <section class="wrap tune" id="tune">
    <div class="section-head"><div><p class="eyebrow">RWD DRIFT TUNING</p><h2>后驱漂移调校。</h2><p>参考 1/24 车友经验整理，个别项借鉴 1/10 后驱教学。没有一套适合所有车的数值：每次只改一项，试车后记下来。</p></div></div>
    <div class="seg tune-seg" id="tuneSeg"><i></i><button data-t="base">起步设定</button><button data-t="fix">症状诊断</button><button data-t="fit">车壳适配</button></div>
    <div id="tuneBody"></div>
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
  bindSteering();
  bindRig();
  renderTune();
  $('#fsBtn').onclick = () => { const el = $('#boardCard'); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.().catch(() => toast('当前浏览器不支持全屏')); };
  drawBoard();
}
/* ---------- 比例 / 起步设定 / 症状诊断 / 车壳适配 ---------- */
const SRC = {
  rcf24: ['RCFans · 1/24 后驱漂移入坑记', 'https://bbs.rcfans.com/forum.php?mod=viewthread&tid=1127598'],
  rcfTune: ['RCFans · 漂移车就该这么去调', 'https://bbs.rcfans.com/thread-1207519-1-1.html'],
  rcfYear: ['RCFans · 帮朋友调了一年的车', 'https://rcfans.com/thread-1206165-1-1.html'],
  rcfJ2: ['RCFans · RWD 后驱漂移基本设定经验', 'https://rcfans.com/thread-752046-1-1.html'],
  rcfTable: ['RCFans · 漂移车架设定（闹仔调车表）', 'https://www.rcfans.com/thread-401862-1-1.html'],
  ae: ['1/10 RWD Drift Setup Guide', 'https://www.applianceelectronics.co.uk/blogs/rc-drift-setup-example'],
  bmr: ['BMR-X Pro 1/24 后驱车架介绍', 'https://k.sina.cn/article_1760441023_68ee32bf00100zhnb.html']
};
const BASELINES = {
  '1/24': { title: '1/24 后驱蚊车', note: '蚊车本身容易过甩，思路是「减甩」：后轮也要给负外倾，场地越小束角可以越大。轴距越长越难控。', src: ['rcf24', 'rcfTune', 'rcfYear', 'rcfJ2', 'ae'], rows: [
    ['frontCamber', '前外倾', '−4° ~ −6°', -5, '太大会让转向角变小、后轮抓地变差'],
    ['rearCamber', '后外倾', '−2° ~ −3°', -2.5, '1/24 必须给后轮负外倾来减甩'],
    ['frontToe', '前束（单侧）', '0° ~ −1°（外八）', -0.5, '外八有助于横走、入弯'],
    ['rearToe', '后束（单侧）', '+1° ~ +3°（内八）', 2, '内八多，推力更多指向车身中线；小场地车友会给到更大'],
    ['caster', '主销后倾', '适量，参考 1/10 的 8° ~ 10°', 8, '帮陀螺仪感受路面、减少抖动；太大车尾会把车头拉离轨迹']] }
};
const FIXES = [
  { k: 'push', t: '推头 · 转向不足', d: '车头往外跑，尾巴甩不起来，横不过去。', src: ['rcfTable'], acts: [
    ['frontCamber', -1, '前外倾加大（更负）'], ['rearCamber', 0.5, '后外倾减小'], ['caster', -1, '主销后倾减小'], ['frontTrack', -1, '前轮距减小'], ['rearTrack', -1, '后轮距减小（低速场）']],
    tips: ['后轮车高差（Droop）加大。'] },
  { k: 'spin', t: '过甩 · 转向过度', d: '尾巴甩太快、容易打转，反打接不住。蚊车最常见。', src: ['rcfTable', 'rcf24', 'rcfJ2', 'rcfTune'], acts: [
    ['rearCamber', -0.5, '后外倾加大（蚊车减甩）'], ['frontCamber', 0.5, '前外倾减小'], ['caster', 1, '主销后倾加大'], ['frontTrack', 1, '前轮距加大（比后轮距略大）'], ['rearToe', 0.5, '后束（内八）加大']],
    tips: ['后轮车高差（Droop）减小。', '正阿克曼别给太多：容易扎弯心，让车尾走得更快。', '轴距越长越难控，可以试短一点的轴距。'] },
  { k: 'shake', t: '方向抖 · 回正乱', d: '直线或漂移中前轮来回抖，像和陀螺仪打架。', src: ['rcfYear', 'rcfJ2'], acts: [['caster', 1, '主销后倾加一点']],
    tips: ['先查陀螺仪方向：拉着车尾往左甩，前轮应往左打；往右甩，应往右打。', '陀螺仪感度不够或反向，比角度问题更常见。', '主销后倾适量即可，过大会让大 offset 轮毂加重舵机负担。'] },
  { k: 'lock', t: '转向角不够 · 前轮吃不住', d: '打死了还是横不起来，或前轮一打角就打滑。', src: ['rcfYear', 'rcfTune'], acts: [['frontCamber', 0.5, '前外倾减小']],
    tips: ['前外倾太大会让转向角变小、前轮转向几何变化。', '打死方向后再调拉杆：保持一点点正阿克曼，看对侧前轮离避震约 1 cm。'] }
];
let tuneTab = 'base';
function bindRig() {
  const seg = $('#scaleSeg');
  const mark = () => { $$('#scaleSeg button').forEach(b => b.classList.toggle('on', b.dataset.scale === rig.scale)); moveSeg(seg); };
  seg.onclick = e => { const b = e.target.closest('[data-scale]'); if (!b) return; rig.scale = b.dataset.scale; rig.tireD = SCALES[rig.scale].d; rig.tireW = SCALES[rig.scale].w; $('#tireD').value = rig.tireD; $('#tireW').value = rig.tireW; mark(); saveRig(); renderTune(); };
  [['tireD', 10, 120], ['tireW', 3, 60]].forEach(([k, lo, hi]) => $('#' + k).oninput = e => { const v = parseFloat(e.target.value); if (v >= lo && v <= hi) { rig[k] = v; saveRig(); } });
  mark();
}
function setBoardValue(k, v) {
  const c = CTL.find(x => x[0] === k); if (!c) return false;
  v = Math.round(Math.max(c[2], Math.min(c[3], v)) * 10) / 10;
  board[k] = v; const r = $('#r-' + k);
  if (r) { r.value = v; r.dispatchEvent(new Event('input')); } else saveBoard();
  return true;
}
function srcLinks(keys) { return `<div class="src-row">${keys.map(k => `<a href="${esc(SRC[k][1])}" target="_blank" rel="noopener">${esc(SRC[k][0])} ↗</a>`).join('')}</div>`; }
function renderTune() {
  const body = $('#tuneBody'); if (!body) return;
  $$('#tuneSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === tuneTab)); moveSeg($('#tuneSeg'));
  $('#tuneSeg').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tuneTab = b.dataset.t; renderTune(); } };
  if (tuneTab === 'base') {
    const B = BASELINES['1/24'];
    body.innerHTML = `<div class="form-card"><div class="lib-head-row"><div><h3>${B.title} · 起步参考</h3><p class="muted">${B.note}</p></div>
</div>
      <div class="base-table">${B.rows.map(([k, l, range, v, why]) => `<div class="base-row"><div><b>${l}</b><small>${esc(why)}</small></div><span class="range">${range}</span><span class="now">当前 ${board[k]}°</span><button class="btn small secondary" data-set="${k}" data-v="${v}">设为 ${v}°</button></div>`).join('')}</div>
      <div class="mini-actions"><button class="btn primary" id="applyBase">全部套用到调车板</button></div>
      <p class="muted small-note">这些是起点，不是答案。路面、轮胎、车架几何不同，结果会差很多。套用后建议在「调车工具 → 调校记录」记一笔再试车。</p>${srcLinks(B.src)}</div>`;
    $$('#tuneBody [data-set]').forEach(b => b.onclick = () => { setBoardValue(b.dataset.set, +b.dataset.v); renderTune(); });
    $('#applyBase').onclick = () => { B.rows.forEach(([k, , , v]) => setBoardValue(k, v)); toast(`已套用 ${B.title} 起步参考`); renderTune(); };
  }
  if (tuneTab === 'fix') {
    body.innerHTML = `<div class="fix-grid">${FIXES.map(f => `<article class="fix-card"><h3>${f.t}</h3><p class="muted">${f.d}</p>
      ${f.acts.length ? `<div class="fix-acts">${f.acts.map(([k, d, l]) => `<button class="fix-act" data-k="${k}" data-d="${d}"><span>${l}</span><b>${d > 0 ? '+' : ''}${d}${['frontTrack', 'rearTrack'].includes(k) ? ' mm' : '°'}</b></button>`).join('')}</div>` : ''}
      ${f.tips.length ? `<ul class="fix-tips">${f.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${srcLinks(f.src)}</article>`).join('')}</div>
      <p class="muted small-note">点一项就在调车板上改一小步，屏幕上能看到车轮变化。这是方向，不是定量：先改一项、试车、再决定要不要继续。</p>`;
    $$('#tuneBody .fix-act').forEach(b => b.onclick = () => { const k = b.dataset.k, d = +b.dataset.d; setBoardValue(k, (board[k] || 0) + d); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); toast(`${b.querySelector('span').textContent}：现在 ${board[k]}${['frontTrack', 'rearTrack'].includes(k) ? ' mm' : '°'}`); });
  }
  if (tuneTab === 'fit') {
    const c = boardCar && BY_ID.get(boardCar);
    if (!c) { body.innerHTML = `<div class="empty small"><b>还没有叠加车壳。</b>选一款车壳，画板上会用黄色虚线画出它的轮眉，和底盘车轮对照。<br><br><button class="btn primary" id="fitPick">选择车壳</button></div>`; $('#fitPick').onclick = () => openSpot('pick'); return; }
    const row = (label, chassis, shell, perSide) => {
      if (chassis == null || shell == null) return `<div class="fit-row"><b>${label}</b><span class="muted">车壳缺少这项数据</span></div>`;
      const d = Math.round((chassis - shell) * 10) / 10, side = Math.round(d / 2 * 10) / 10;
      const ok = Math.abs(perSide ? side : d) <= (perSide ? 0.5 : 1);
      const say = perSide ? (ok ? '对正' : d > 0 ? `每侧外凸 ${side} mm` : `每侧内缩 ${-side} mm`) : (ok ? '对正' : d > 0 ? `底盘长 ${d} mm` : `底盘短 ${-d} mm`);
      const hint = perSide ? (ok ? '' : d > 0 ? '换 offset 更小的轮毂，或减垫片' : `可加约 ${-side} mm 轮毂垫片 / 换更大 offset`) : (ok ? '' : '可调轴距的车架往车壳轴距靠');
      return `<div class="fit-row ${ok ? 'ok' : 'off'}"><b>${label}</b><span>底盘 ${chassis} · 车壳 ${shell}</span><span class="say">${say}</span><small>${hint}</small></div>`;
    };
    body.innerHTML = `<div class="form-card"><div class="lib-head-row"><div><h3>${esc(c.name)}</h3><p class="muted">${esc(c.brand)} · 车壳尺寸按轮眉中心测；底盘按轮胎中心。黄色虚线 = 车壳轮眉。</p></div>
      <label class="switch-row small"><span>显示轮眉</span><input type="checkbox" id="shellOn" ${rig.shellOn ? 'checked' : ''}><i class="switch"></i></label></div>
      <div class="fit-list">${row('轴距', board.wheelbase, c.wb, false)}${row('前轮距', board.frontTrack, c.ft, true)}${row('后轮距', board.rearTrack, c.rt, true)}</div>
      <div class="mini-actions"><button class="btn secondary" id="fitApply">把底盘设成车壳尺寸</button><button class="btn secondary" id="fitOther">换一款车壳</button><button class="btn small danger" id="fitClear">移除</button></div>
      <p class="muted small-note">可调轴距的 1/24 车架能兼容大部分静态车壳（例如 BMR-X Pro 标称轴距 99.5–117 mm）。实际装车前请用卡尺复核。</p>${srcLinks(['bmr'])}</div>`;
    $('#shellOn').onchange = e => { rig.shellOn = e.target.checked; saveRig(); };
    $('#fitApply').onclick = () => { applyShellToChassis(c); setup(); tuneTab = 'fit'; toast('底盘尺寸已设成车壳尺寸'); };
    $('#fitOther').onclick = () => openSpot('pick');
    $('#fitClear').onclick = () => { boardCar = null; saveBoard(); setup(); };
  }
}
/* ---------- steering (ported from the mini program's AKM tools) ---------- */
const STEER_MODES = [['off', '关'], ['target', '三段目标'], ['rack', '横杆几何'], ['measured', '实测回放'], ['rdx', 'RDX 参考']];
const RACK_FIELDS = [['pivotWidth', '转向轴心间距'], ['rackWidth', '横杆内球头间距'], ['rackOffset', '内球头前后偏移'], ['armInward', '轮端球头向内偏移'], ['armRearward', '轮端球头前后偏移'], ['travel', '横杆单侧最大行程']];
let steer = Object.assign({ mode: 'off', pos: 0, scale: false, stages: { early: 2, middle: 10, end: 4 }, maximum: 60, rack: {}, rackOn: null, measured: null }, store.get('steer', {}));
const saveSteer = () => store.set('steer', steer);
const steerCtx = () => SteeringProfile.context({ wheelbase: board.wheelbase, frontTrack: board.frontTrack, frontToe: board.frontToe }, {});
function relationOf(left, right, pos) {
  const c = steerCtx(); const dir = pos > 0 ? 'right' : 'left';
  const inner = dir === 'left' ? left : -right, outer = dir === 'left' ? right : -left, rad = Math.PI / 180;
  const diff = Math.round((left - right) * 10) / 10;
  const percent = pos !== 0 && inner > 0 && outer > 0 && c ? ((1 / Math.tan(outer * rad) - 1 / Math.tan(inner * rad)) * c.wheelbase / c.track * 100).toFixed(1) + '%' : '—';
  const relation = pos === 0 ? '回中' : inner < 0 || outer < 0 ? '两轮异向' : diff === 0 ? '平行' : diff > 0 ? '正阿克曼' : '反阿克曼';
  return { left, right, difference: diff.toFixed(1), percent, relation };
}
function steeringNow() {
  const pos = steer.pos, c = steerCtx();
  if (steer.mode === 'off' || !c) return { draw: null };
  if (steer.mode === 'target') {
    const s = SteeringProfile.stagedReference(c, steer.stages, steer.maximum);
    if (s.error) return { draw: null, error: s.error };
    const r = SteeringProfile.sample(s.profile, pos, c);
    if (r.error) return { draw: null, error: r.error };
    return { draw: Object.assign({}, r.result, { showScale: steer.scale }), read: r.result };
  }
  if (steer.mode === 'measured') {
    if (!steer.measured) return { draw: null, error: '还没有实测记录：把实车打到对应档位，量两轮角度后记录' };
    const r = SteeringProfile.sample(steer.measured, pos, c);
    if (r.error) return { draw: null, error: r.error };
    return { draw: Object.assign({}, r.result, { showScale: steer.scale }), read: r.result };
  }
  if (steer.mode === 'rack') {
    if (!steer.rackOn) return { draw: null, error: '填好横杆尺寸后点「应用」' };
    const r = RackSteering.sample(steer.rackOn, pos, board.frontToe, board.frontTrack);
    if (r.error) return { draw: null, error: r.error };
    return { draw: Object.assign({}, r.result, { showScale: steer.scale }), read: Object.assign(relationOf(r.result.left, r.result.right, pos), { sourceText: r.result.sourceText }) };
  }
  if (steer.mode === 'rdx') {
    const r = RdxReference.sample(pos, board.frontToe, board.frontTrack);
    return { draw: Object.assign({}, r, { showScale: steer.scale }), read: Object.assign(relationOf(r.left, r.right, pos), { sourceText: r.sourceText }) };
  }
  return { draw: null };
}
function renderWheelRead(st) {
  const dock = $('#wheelDock'); if (!dock) return;
  dock.hidden = steer.mode === 'off';
  const w = $('#steerWheel'); w.style.transform = `rotate(${steer.pos * 1.8}deg)`; w.setAttribute('aria-valuenow', steer.pos);
  $('#steerPos').value = steer.pos;
  const pos = steer.pos, where = pos === 0 ? '回中' : (pos < 0 ? '左 ' : '右 ') + Math.abs(pos) + '%';
  $('#wheelRead').innerHTML = st.error ? `<b>${where}</b><p class="warn">${esc(st.error)}</p>` : st.read ? `<b>${where} · ${esc(st.read.relation)}</b>
    <div class="wr-grid"><div><span>左轮</span>${st.read.left}°</div><div><span>右轮</span>${st.read.right}°</div><div><span>角差</span>${st.read.difference}°</div><div><span>阿克曼</span>${st.read.percent}</div></div>
    <p>${esc(st.read.sourceText || '')}</p>` : '';
}
function steerPanelHtml() {
  const n = (k, l, v, u = '°') => `<label class="mini-f"><span>${l}</span><div class="unit"><input data-sv="${k}" inputmode="decimal" value="${v ?? ''}"><em>${u}</em></div></label>`;
  const scale = `<label class="switch-row small"><span>轮角刻度</span><input type="checkbox" id="steerScale" ${steer.scale ? 'checked' : ''}><i class="switch"></i></label>`;
  if (steer.mode === 'off') return `<p class="muted mini">打开后，前轮会按方向盘位置画出左右轮角。方向盘只是软件里的转向档位（左负右正），不是遥控器读数。</p>`;
  if (steer.mode === 'target') return `<p class="muted mini">设定小 / 中 / 大打角（20% / 50% / 100%）时想要的内外轮角差，中间线性过渡，左右对称。这是目标，不是实车结果。</p>
    <div class="mini-grid">${n('early', '小打角角差', steer.stages.early)}${n('middle', '中打角角差', steer.stages.middle)}${n('end', '大打角角差', steer.stages.end)}${n('maximum', '满舵内轮角', steer.maximum)}</div>${scale}`;
  if (steer.mode === 'rack') return `<p class="muted mini">填实测毫米尺寸，按对称二维平面横杆模型计算两轮角度。不含 Camber / Caster / KPI、球头高度差和间隙。前后偏移向车尾为正；轴心间距不等于轮距。</p>
    <div class="mini-grid">${RACK_FIELDS.map(([k, l]) => n('rack.' + k, l, steer.rack[k], 'mm')).join('')}</div>
    <div class="mini-actions"><button class="btn small primary" id="rackApply">应用</button>${steer.rackOn ? '<button class="btn small secondary" id="rackOff">停用</button>' : ''}</div><p class="warn mini" id="rackErr"></p>${scale}`;
  if (steer.mode === 'measured') {
    const rows = steer.measured ? SteeringProfile.rows(steer.measured) : [], sym = steer.measured ? SteeringProfile.symmetry(steer.measured) : [];
    return `<p class="muted mini">先把软件和遥控器打到同一档位，用外部量具量两轮的俯视绝对角（相对车身中线朝左为正），填好后点记录。先测回中，再分别测左右。只在已测范围内回放。</p>
      <div class="mini-grid">${n('mLeft', '左轮角', '')}${n('mRight', '右轮角', '')}</div>
      <div class="mini-actions"><button class="btn small primary" id="mRecord">记录当前档位</button>${rows.length ? '<button class="btn small secondary" id="mClear">清空重测</button>' : ''}</div><p class="warn mini" id="mErr"></p>
      ${rows.length ? `<table class="m-table"><tr><th>档位</th><th>左</th><th>右</th><th>角差</th></tr>${rows.map(r => `<tr data-pos="${r.position}"><td>${r.label}</td><td>${r.left}°</td><td>${r.right}°</td><td>${r.difference}°</td></tr>`).join('')}</table>` : ''}
      ${sym.length ? `<p class="muted mini">左右对称差（内 / 外）：${sym.map(s => `${s.position}% ${s.inner}° / ${s.outer}°`).join('，')}</p>` : ''}${scale}`;
  }
  if (steer.mode === 'rdx') return `<p class="muted mini">RDX 满舵端点（内 73° / 外 77°）是从图片估算的，中间过程是线性插值，只作示意，不是厂家数据。</p>${scale}`;
  return '';
}
function bindSteering() {
  const seg = $('#steerSeg'), panel = $('#steerPanel');
  const refresh = () => { $$('#steerSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === steer.mode)); moveSeg(seg); panel.innerHTML = steerPanelHtml(); bindPanel(); drawBoard(); };
  seg.onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; steer.mode = b.dataset.mode; if (steer.mode === 'off') steer.pos = 0; saveSteer(); refresh(); };
  function bindPanel() {
    panel.querySelectorAll('[data-sv]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.sv, v = inp.value.trim();
      if (k.startsWith('rack.')) { steer.rack[k.slice(5)] = v; saveSteer(); return; }
      if (k === 'mLeft' || k === 'mRight') return;
      const num = parseFloat(v); if (!isFinite(num)) return;
      if (k === 'maximum') steer.maximum = num; else steer.stages[k] = num;
      saveSteer(); drawBoard();
    }));
    const sc = $('#steerScale'); if (sc) sc.onchange = () => { steer.scale = sc.checked; saveSteer(); drawBoard(); };
    const ra = $('#rackApply'); if (ra) ra.onclick = () => {
      const g = RackSteering.validate(steer.rack);
      const err = !g ? '请把六项尺寸都填成有效数字（横杆内球头间距要小于轴心间距）' : [-100, -50, 50, 100].map(p => RackSteering.sample(g, p, board.frontToe, board.frontTrack).error).find(Boolean);
      if (err) { $('#rackErr').textContent = err; return; }
      steer.rackOn = g; saveSteer(); refresh(); toast('横杆几何已应用');
    };
    const ro = $('#rackOff'); if (ro) ro.onclick = () => { steer.rackOn = null; saveSteer(); refresh(); };
    const mr = $('#mRecord'); if (mr) mr.onclick = () => {
      const c = steerCtx(); if (!c) return;
      if (!steer.measured || !SteeringProfile.sameContext(SteeringProfile.restore(steer.measured)?.context, c)) steer.measured = SteeringProfile.create(c, 'measured');
      const left = parseFloat($('[data-sv=mLeft]').value), right = parseFloat($('[data-sv=mRight]').value);
      const r = SteeringProfile.insert(steer.measured, { position: steer.pos, left, right });
      if (r.error) { $('#mErr').textContent = r.error; return; }
      steer.measured = r.profile; saveSteer(); refresh(); toast('已记录 ' + (steer.pos === 0 ? '回中' : steer.pos + '%'));
    };
    const mc = $('#mClear'); if (mc) mc.onclick = () => { if (confirm('清空这组实测？')) { steer.measured = null; saveSteer(); refresh(); } };
    panel.querySelectorAll('tr[data-pos]').forEach(tr => tr.onclick = () => setPos(+tr.dataset.pos));
  }
  const setPos = p => { steer.pos = Math.max(-100, Math.min(100, Math.round(p))); saveSteer(); drawBoard(); };
  $('#steerPos').oninput = e => setPos(+e.target.value);
  const wheel = $('#steerWheel');
  let start = null;
  wheel.addEventListener('pointerdown', e => { wheel.setPointerCapture(e.pointerId); const r = wheel.getBoundingClientRect(); start = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, a: Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)), pos: steer.pos }; });
  wheel.addEventListener('pointermove', e => { if (!start) return; let d = Math.atan2(e.clientY - start.cy, e.clientX - start.cx) - start.a; d = Math.atan2(Math.sin(d), Math.cos(d)); start.pos += d * 180 / Math.PI / 1.8; start.a += d; setPos(start.pos); });
  wheel.addEventListener('pointerup', () => { start = null; });
  wheel.addEventListener('dblclick', () => setPos(0));
  wheel.addEventListener('keydown', e => { const k = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -1, ArrowUp: 1 }[e.key]; if (k) { e.preventDefault(); setPos(steer.pos + k); } if (e.key === 'Home' || e.key === '0') setPos(0); });
  refresh();
}
function stepHandler(e) {
  const b = e.target.closest('[data-step]'); if (!b) return;
  const k = b.dataset.step, r = $('#r-' + k); if (!r) return;
  r.value = Math.round((+r.value + +b.dataset.d) * 10) / 10; r.dispatchEvent(new Event('input'));
}
function boardCarHtml() {
  const c = boardCar && BY_ID.get(boardCar);
  return c ? `${img(c.thumb, '')}<div><b>${esc(c.name)}</b><span>车壳轮眉已叠加在画板上 · ${fitSummary(c)}</span></div>${I.arrow}` : `<div><b>叠加一款车壳</b><span>对照轮眉位置，看轮子是否对正</span></div>${I.arrow}`;
}
function fitSummary(c) {
  if (!c.wb) return '缺少轴距数据';
  const d = Math.round((board.wheelbase - c.wb) * 10) / 10;
  return Math.abs(d) <= 1 ? '轴距对正' : `轴距${d > 0 ? '长' : '短'} ${Math.abs(d)} mm`;
}
function loadCarToBoard(c, rerender = true) {
  boardCar = c.id; rig.shellOn = true; store.set('rig', rig); saveBoard();
  if (rerender) { if (route().name === 'setup') setup(); else location.hash = '#/setup'; toast('已叠加「' + c.name + '」的轮眉，在「车壳适配」里看对正情况'); }
}
function applyShellToChassis(c) {
  if (c.wb) board.wheelbase = Math.min(300, Math.max(50, c.wb));
  if (c.ft) board.frontTrack = Math.min(250, Math.max(30, c.ft));
  if (c.rt) board.rearTrack = Math.min(250, Math.max(30, c.rt));
  saveBoard();
}
function saveBoard() { store.set('board', board); store.set('boardCar', boardCar); drawBoard(); const pc = $('#pickCar'); if (pc) pc.innerHTML = boardCarHtml(); if (tuneTab === 'fit' && $('#tuneBody') && !saveBoard.busy) { saveBoard.busy = true; renderTune(); saveBoard.busy = false; } }
function drawBoard() {
  const canvas = $('#board'); if (!canvas) return;
  const rect = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const ok = cal && cal.key === screenKey();
  const st0 = steeringNow();
  const sc = boardCar && rig.shellOn && BY_ID.get(boardCar);
  const g = SetupBoard.draw(ctx, rect.width, rect.height, ok ? cal.scale : { x: 3.78, y: 3.78 }, board, !!ok, null, st0.draw, false, null,
    { tire: { w: rig.tireW, d: rig.tireD }, shell: sc && sc.wb ? { wb: sc.wb, ft: sc.ft, rt: sc.rt, name: sc.name } : null });
  renderWheelRead(st0);
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
    <label class="f"><span>或者按平板型号估算（仍建议用尺核对）</span><select id="calPreset"><option value="">选择型号…</option>${TabletCalibration.presets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
    <div style="display:flex;gap:10px;justify-content:center"><button class="btn secondary" id="calCancel">取消</button><button class="btn primary" id="calOk">我已用尺核对，保存</button></div></div>`;
  document.body.appendChild(el); document.body.classList.add('locked');
  const upd = () => { $('.cal-x', el).style.width = x + 'px'; $('.cal-y', el).style.height = y + 'px'; $('#cx', el).textContent = x.toFixed(1) + ' px'; $('#cy', el).textContent = y.toFixed(1) + ' px'; $('#calx', el).value = x; $('#caly', el).value = y; };
  upd();
  $('#calx', el).oninput = e => { x = +e.target.value; upd(); };
  $('#caly', el).oninput = e => { y = +e.target.value; upd(); };
  $('#calPreset', el).onchange = e => { const r = TabletCalibration.estimate(e.target.value, { screenWidth: screen.width, screenHeight: screen.height }); if (!r) { if (e.target.value) toast('这块屏幕和所选型号对不上'); return; } x = r.x; y = r.y; upd(); toast('已按 ' + r.name + ' 估算，请用尺核对'); };
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
  const related = CARS.filter(x => x.id !== id && (x.model === c.model && c.model !== '其他' || (x.wb && c.wb && Math.abs(x.wb - c.wb) <= 2))).slice(0, 10);
  $('#sheetBody').innerHTML = `
    <div class="d-hero"><div class="d-gallery" id="gallery">${imgs.map((s, i) => `<figure data-lb="${i}"><img src="${esc(s)}" alt="${esc(c.name)} ${labels[i]}" ${i ? 'loading="lazy"' : ''}><figcaption><span class="pill glass">${labels[i]}</span></figcaption></figure>`).join('')}</div>
      ${imgs.length > 1 ? `<div class="d-dots">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>
    <div class="d-content">
      <div class="d-title"><div><span class="eyebrow">${esc(c.brand)} · ${esc(c.model)} · ${esc(c.scale)}${c.wide ? ' · 宽体' : ''}</span><h2>${esc(c.name)}</h2>
        <a class="d-by" href="#/u/${encodeURIComponent(c.byId || c.by)}">${avatarHtml(c.avatar, c.by)}<span><b>@${esc(c.by)}</b> · ${fmtDate(c.time)} · ${c.views} 次浏览</span></a></div>
        <div class="d-actions">
          <button class="btn secondary ${liked.has(id) ? 'liked' : ''}" data-like="${esc(id)}">${I.heart}<span>${likeCount(c)}</span></button>
          <button class="btn secondary ${saved.has(id) ? 'saved' : ''}" data-save="${esc(id)}">${I.bookmark}<span>${saved.has(id) ? '已收藏' : '收藏'}</span></button>
          <button class="btn secondary" data-compare="${esc(id)}">${I.compare}<span>${compare.includes(id) ? '已在对比' : '加入对比'}</span></button>
          <button class="btn secondary" data-share="${esc(id)}" aria-label="复制链接">${I.share}</button>
          ${isAdmin ? `<button class="btn secondary admin-only" data-hide-car="${esc(id)}">隐藏车壳</button>` : ''}
          ${remote && (myCars.has(id) || isAdmin) ? `<button class="btn secondary danger" data-del-car="${esc(id)}">删除${isAdmin && !myCars.has(id) ? '车壳' : '我的投稿'}</button>` : ''}
        </div></div>
      <div class="d-specs">
        <div><b>${dim(c.wb)}<small>mm</small></b><span>轴距</span></div><div><b>${dim(c.ft)}<small>mm</small></b><span>前轮距</span></div>
        <div><b>${dim(c.rt)}<small>mm</small></b><span>后轮距</span></div><div><b>${dim(c.len)}<small>${c.len ? 'mm' : ''}</small></b><span>车身长度</span></div>
      </div>
      <div class="d-grid">
        <div class="panel"><h3>俯视尺寸</h3><p class="muted">按实测数据等比绘制，轮距按轮眉位置测量。</p>${topView(c)}</div>
        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:20px">
          <div><h3>上调车板对照</h3><p class="muted">把这款车壳的轮眉位置叠加到电子调车板上，和你的底盘车轮对照，看轴距、轮距差多少。</p></div>
          <button class="btn primary" data-board="${esc(id)}">${I.ruler} 叠加到调车板</button>
          ${c.note ? `<div><h3 style="font-size:17px">备注</h3><p class="note" style="margin-top:8px;padding:0;background:none">${esc(c.note)}</p></div>` : ''}
          ${c.wideLink ? `<div><h3 style="font-size:17px;margin-bottom:8px">宽体套件来源</h3><div class="linkrow" style="background:var(--card2)"><span>${esc(c.wideLink)}</span><button class="btn small secondary" data-copy="${esc(c.wideLink)}">复制</button></div></div>` : ''}
        </div>
      </div>
      <div class="d-section" id="commentsBox"><h3>车友评论 <span class="muted" id="cmCount" style="font-size:17px;font-weight:500"></span></h3>
        ${sb ? `<form class="composer" id="composer"><input id="cmNick" maxlength="20" placeholder="昵称" value="${esc(nickname)}" aria-label="昵称" required><div class="composer-row"><textarea id="cmText" maxlength="300" rows="1" placeholder="说点什么…" aria-label="评论内容" required></textarea><button class="btn primary small" type="submit">发送</button></div></form>` : ''}
        <div class="comments" id="cmList"></div></div>
      ${related.length ? `<div class="d-section"><h3>尺寸相近 / 同车型</h3><div class="shelf related" style="padding-left:0;margin-left:0">${related.map(card).join('')}</div></div>` : ''}
    </div>`;
  sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); document.body.classList.add('locked'); sheetOpen = true;
  $('.sheet-body').scrollTop = 0;
  const gal = $('#gallery'), dots = $$('.d-dots i');
  gal.addEventListener('scroll', () => { const i = Math.round(gal.scrollLeft / gal.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
  gal.addEventListener('click', e => { const f = e.target.closest('[data-lb]'); if (f) openLightbox(imgs, +f.dataset.lb); });
  $('.sheet', sheet).focus({ preventScroll: true });
  renderComments(id, COMMENTS.filter(x => x.car === id));
  loadComments(id);
  bindComposer(id);
  if (remote && !viewed.has(id)) { viewed.add(id); sb.rpc('cs_view', { p_car: id }).then(() => {}); }
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
    const id = like.dataset.like, car = BY_ID.get(id);
    if (remote) {
      const was = liked.has(id); was ? liked.delete(id) : liked.add(id); car.likes += was ? -1 : 1;
      sb.rpc('cs_toggle_like', { p_car: id, p_token: TOKEN }).then(({ data, error }) => {
        if (error) { was ? liked.add(id) : liked.delete(id); car.likes += was ? 1 : -1; toast('点赞失败，请重试'); }
        else { data.liked ? liked.add(id) : liked.delete(id); car.likes = data.count; }
        like.classList.toggle('liked', liked.has(id)); $('span', like).textContent = likeCount(car);
      });
    } else { liked.has(id) ? liked.delete(id) : liked.add(id); store.set('liked', [...liked]); }
    like.classList.toggle('liked', liked.has(id)); $('span', like).textContent = likeCount(car);
    like.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    return;
  }
  const del = e.target.closest('[data-del-comment]'); if (del) return deleteComment(del.dataset.delComment, del);
  const dc = e.target.closest('[data-del-car]'); if (dc) return deleteCar(dc.dataset.delCar);
  const hide = e.target.closest('[data-hide-car]'); if (hide) return hideCar(hide.dataset.hideCar);
  const cmp = e.target.closest('[data-compare]'); if (cmp) return toggleCompare(cmp.dataset.compare);
  const un = e.target.closest('[data-uncompare]'); if (un) { toggleCompare(un.dataset.uncompare); return comparePage(); }
  const bd = e.target.closest('[data-board]'); if (bd) { closeDetail(); return loadCarToBoard(BY_ID.get(bd.dataset.board)); }
  const sh = e.target.closest('[data-share]'); if (sh) { const url = location.href.split('#')[0] + '#/car/' + sh.dataset.share; navigator.share ? navigator.share({ title: BY_ID.get(sh.dataset.share).name, url }).catch(() => {}) : copy(url); return; }
  const cp = e.target.closest('[data-copy]'); if (cp) return copy(cp.dataset.copy);
  const shelfBtn = e.target.closest('[data-shelf]'); if (shelfBtn) { const s = $('#' + shelfBtn.dataset.shelf); s.scrollBy({ left: shelfBtn.dataset.dir * s.clientWidth * .8, behavior: 'smooth' }); return; }
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

/* ---------- Supabase ---------- */
const viewed = new Set();
const fromRow = r => ({
  id: r.id, name: r.name, brand: r.brand, model: r.model, scale: r.scale, wide: r.wide, wideLink: r.wide_link,
  len: num(r.len), wb: num(r.wb), ft: num(r.ft), rt: num(r.rt), cover: r.cover, thumb: r.thumb || r.cover, ratio: +r.ratio || 1.33,
  finished: r.finished, scan: r.scan, parts: r.parts || [], note: r.note, by: r.by_name, byId: r.by_id, avatar: r.avatar,
  views: r.views, likes: r.like_count, week: r.week, weekKey: r.week_key, time: +r.created_ms, comments: 0, status: r.status
});
function num(v) { return v == null ? null : +v; }
async function loadRemote() {
  if (!sb) return;
  try {
    const [{ data: rows, error }, mine, sess] = await Promise.all([
      sb.from('cs_cars').select(COLS).order('created_ms', { ascending: false }).limit(2000),
      sb.rpc('cs_my_likes', { p_token: TOKEN }),
      sb.auth.getSession(),
      sb.rpc('cs_my_cars', { p_token: TOKEN }).then(r => { myCars = new Set(r.data || []); }),
      sb.rpc('cs_week_top', { p_limit: 50 }).then(r => { weekTop = r.error ? null : (r.data || []); }),
      sb.rpc('cs_get_profile', { p_token: TOKEN }).then(r => { if (r.data) { profile = r.data; if (profile.nickname) nickname = profile.nickname; store.set('profile', profile); } })
    ]);
    if (error || !rows || !rows.length) throw error || new Error('empty');
    CARS.length = 0; BY_ID.clear();
    rows.map(fromRow).forEach(c => { CARS.push(c); BY_ID.set(c.id, c); });
    liked = new Set(mine.data || []);
    remote = true;
    await checkAdmin(sess.data.session);
    footMeta();
    const r = route();
    currentPage = null;
    if (r.name === 'car') { renderPage((lastPage.replace(/^#\/?/, '').split(/[?/]/)[0]) || 'home'); openDetail(decodeURIComponent(r.arg || '')); }
    else render();
  } catch (e) { console.warn('Supabase unavailable, using snapshot', e); }
}
async function checkAdmin(session) {
  isAdmin = false;
  if (session) { const { data } = await sb.rpc('is_admin'); isAdmin = !!data; }
  document.body.classList.toggle('admin', isAdmin);
  $('#adminLink').textContent = isAdmin ? '退出管理' : '管理员';
}
function renderComments(id, list) {
  const box = $('#cmList'); if (!box) return;
  $('#cmCount').textContent = list.length || '';
  box.innerHTML = list.length ? list.map(x => {
    const canDel = remote && x.uid && (isAdmin || myComments.has(x.uid));
    return `<div class="comment" data-cid="${esc(x.uid || '')}">${x.avatar ? `<img src="${esc(x.avatar)}" alt="" loading="lazy">` : `<span class="av">${esc((x.by || '?').slice(0, 1))}</span>`}<div class="comment-bubble"><small><b class="${x.admin ? 'tag-admin' : ''}">${esc(x.by)}${x.admin ? ' · 管理员' : ''}</b>${ago(x.time)}${canDel ? `<button class="cm-del" data-del-comment="${esc(x.uid)}">删除</button>` : ''}</small><p>${esc(x.text)}</p></div></div>`;
  }).join('') : `<p class="muted" style="font-size:15px">${sb ? '还没有评论，来说第一句吧。' : '还没有评论。'}</p>`;
}
async function loadComments(id) {
  if (!remote) return;
  const { data, error } = await sb.from('cs_comments').select('id,car_id,content,nickname,avatar,is_admin,created_at').eq('car_id', id).order('created_at').limit(500);
  if (error || !sheetOpen) return;
  renderComments(id, data.map(r => ({ uid: r.id, car: r.car_id, text: r.content, by: r.nickname, avatar: r.avatar, admin: r.is_admin, time: Date.parse(r.created_at) })));
}
function bindComposer(id) {
  const f = $('#composer'); if (!f) return;
  const ta = $('#cmText');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!remote) return toast('评论服务暂时不可用');
    const nick = $('#cmNick').value.trim(), text = ta.value.trim();
    if (!nick) return $('#cmNick').focus();
    if (!text) return ta.focus();
    const btn = $('button[type=submit]', f); btn.disabled = true;
    const { data, error } = await sb.rpc('cs_add_comment', { p_car: id, p_content: text, p_nickname: nick, p_token: TOKEN });
    btn.disabled = false;
    if (error) return toast(error.message || '发送失败');
    nickname = nick; store.set('nick', nick);
    myComments.add(data.id); store.set('myComments', [...myComments]);
    ta.value = ''; ta.style.height = 'auto';
    toast('评论已发布');
    loadComments(id);
  });
}
async function deleteComment(cid, btn) {
  if (!confirm('删除这条评论？')) return;
  btn.disabled = true;
  const { data, error } = await sb.rpc('cs_delete_comment', { p_id: cid, p_token: TOKEN });
  if (error || !data) { btn.disabled = false; return toast('删除失败'); }
  myComments.delete(cid); store.set('myComments', [...myComments]);
  $(`[data-cid="${CSS.escape(cid)}"]`)?.remove();
  const n = $$('#cmList .comment').length; $('#cmCount').textContent = n || '';
  toast('已删除');
}
async function hideCar(id) {
  if (!isAdmin || !confirm('从网站上隐藏这款车壳？（可在 Supabase 表里把 status 改回 active 恢复）')) return;
  const { error } = await sb.from('cs_cars').update({ status: 'hidden' }).eq('id', id);
  if (error) return toast('操作失败');
  const i = CARS.findIndex(c => c.id === id); if (i >= 0) CARS.splice(i, 1); BY_ID.delete(id);
  closeDetail(); currentPage = null; render(); toast('已隐藏');
}
function adminLogin() {
  if (isAdmin) { sb.auth.signOut().then(() => { checkAdmin(null); toast('已退出管理'); }); return; }
  if (!sb) return toast('未连接数据库');
  const el = document.createElement('div'); el.className = 'cal';
  el.innerHTML = `<form class="login-card" id="loginForm"><h2>管理员登录</h2><p class="muted">登录后可删除任何评论、隐藏车壳。</p>
    <input type="email" id="lEmail" placeholder="邮箱" autocomplete="username" required><input type="password" id="lPass" placeholder="密码" autocomplete="current-password" required>
    <p class="login-err" id="lErr"></p><div style="display:flex;gap:10px"><button type="button" class="btn secondary" id="lCancel">取消</button><button class="btn primary" type="submit">登录</button></div></form>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  $('#lCancel', el).onclick = close;
  $('#loginForm', el).onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#lEmail', el).value.trim(), password: $('#lPass', el).value });
    if (error) { $('#lErr', el).textContent = '登录失败：' + error.message; return; }
    await checkAdmin(data.session);
    if (!isAdmin) { $('#lErr', el).textContent = '这个账号还不是管理员'; await sb.auth.signOut(); return; }
    close(); toast('已进入管理模式'); if (sheetOpen) loadComments(route().arg);
  };
}
function footMeta() {
  $('#footMeta').innerHTML = remote
    ? `${CARS.length} 款车壳 · 数据实时来自车友 · <button id="adminLink" class="link-btn">${isAdmin ? '退出管理' : '管理员'}</button>`
    : `数据迁移自「头蚊字 Dou」小程序 · 快照 ${fmtDate(DATA.exportedAt)} · 共 ${CARS.length} 款车壳 · <button id="adminLink" class="link-btn">管理员</button>`;
  $('#adminLink').onclick = adminLogin;
}

/* ---------- profile ---------- */
function avatarHtml(src, name, cls = '') {
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">` : `<span class="av ${cls}">${esc((name || '车').slice(0, 1))}</span>`;
}
function statsOf(list) {
  return { n: list.length, likes: list.reduce((s, c) => s + likeCount(c), 0), views: list.reduce((s, c) => s + c.views, 0) };
}
function profileHead({ avatar, name, sub, stats, editable }) {
  return `<section class="wrap page-enter"><div class="profile-card">
    <div class="profile-top">
      <button class="profile-avatar ${editable ? 'editable' : ''}" ${editable ? 'id="avatarBtn" aria-label="更换头像"' : 'tabindex="-1"'}>${avatarHtml(avatar, name)}${editable ? '<i>更换</i>' : ''}</button>
      <div class="profile-name"><p class="eyebrow">${editable ? 'DOU / PROFILE' : 'GARAGE'}</p><h1>${esc(name)}</h1><p class="muted">${sub}</p></div>
      ${editable ? `<div class="profile-actions"><button class="btn secondary small" id="editName">编辑昵称</button>${wxLogged ? '<button class="btn small secondary" id="wxLogout">退出微信登录</button>' : `<button class="btn small wx-btn" id="wxLoginBtn">${WX_ICON} 微信登录</button>`}</div>` : ''}
    </div>
    <div class="profile-stats"><div><b>${stats.n}</b><span>投稿</span></div><div><b>${stats.likes}</b><span>获赞</span></div><div><b>${stats.views}</b><span>浏览</span></div></div>
  </div></section>`;
}
function mePage() {
  const mine = CARS.filter(c => myCars.has(c.id));
  const savedList = CARS.filter(c => saved.has(c.id));
  const likedList = remote ? CARS.filter(c => liked.has(c.id)) : [];
  const name = profile?.nickname || nickname || '车友';
  app.innerHTML = profileHead({ avatar: profile?.avatar, name, editable: !!sb,
      sub: wxLogged ? '已用微信登录 · 小程序里的车壳和评论都在这里，换设备再登录一次就能同步。' : remote ? (profile?.nickname ? '这台设备上的车库。换设备或清理浏览器数据后会变成新身份。' : '设置昵称和头像，评论和投稿都会带上。') : '连接服务器后可设置昵称和头像。',
      stats: statsOf(mine) }) + `
  <section class="wrap"><a class="publish-card reveal" href="#/submit"><div><b>发布车壳</b><span>记录作品与实测尺寸</span></div><i>＋</i></a></section>
  <section class="wrap me-section reveal"><div class="section-head"><div><h2>我的投稿</h2></div></div>
    ${mine.length ? `<div class="grid">${mine.map(card).join('')}</div>` : `<div class="empty small"><b>还没有上传过车壳。</b>${isAdmin ? '小程序时代传过的车壳，可以在对应上传者的主页点「认领到这台设备」。' : ''}</div>`}</section>
  <section class="wrap me-section reveal"><div class="section-head"><div><h2>收藏</h2><p>保存在这台设备的浏览器里。</p></div></div>
    ${savedList.length ? `<div class="shelf">${savedList.map(card).join('')}</div>` : `<div class="empty small"><b>还没有收藏。</b>点车壳卡片右上角的书签即可收藏。</div>`}</section>
  ${remote ? `<section class="wrap me-section reveal"><div class="section-head"><div><h2>赞过的</h2></div></div>
    ${likedList.length ? `<div class="shelf">${likedList.map(card).join('')}</div>` : `<div class="empty small"><b>还没有点过赞。</b></div>`}</section>
  <section class="wrap me-section reveal"><div class="section-head"><div><h2>我的评论</h2></div></div><div id="myComments" class="my-comments"><p class="muted">加载中…</p></div></section>` : ''}`;
  if (!sb) return;
  $('#editName').onclick = () => editProfile();
  if ($('#wxLoginBtn')) $('#wxLoginBtn').onclick = () => wxLoginDialog();
  if ($('#wxLogout')) $('#wxLogout').onclick = wxLogout;
  $('#avatarBtn').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => i.files[0] && saveAvatar(i.files[0]); i.click(); };
  if (remote) sb.rpc('cs_my_comments', { p_token: TOKEN }).then(({ data }) => {
    const box = $('#myComments'); if (!box) return;
    const list = (data || []).filter(x => BY_ID.has(x.car_id));
    box.innerHTML = list.length ? list.map(x => { const c = BY_ID.get(x.car_id); return `<a class="my-comment" href="#/car/${esc(c.id)}">${img(c.thumb, '')}<div><p>${esc(x.content)}</p><span>${esc(c.name)} · ${ago(Date.parse(x.created_at))}</span></div></a>`; }).join('') : `<div class="empty small"><b>还没有发过评论。</b></div>`;
  });
}
async function saveProfile(nick, avatar) {
  const { data, error } = await sb.rpc('cs_save_profile', { p_token: TOKEN, p_nickname: nick, p_avatar: avatar || '' });
  if (error) { toast(error.message); return false; }
  profile = data; nickname = data.nickname; store.set('profile', profile); store.set('nick', nickname);
  CARS.forEach(c => { if (myCars.has(c.id)) { c.by = data.nickname; c.avatar = data.avatar; c.byId = data.public_id; } });
  return true;
}
function editProfile() {
  const el = document.createElement('div'); el.className = 'cal';
  el.innerHTML = `<form class="login-card"><h2>编辑昵称</h2><p class="muted">会同步到你发过的评论和投稿上。</p><input id="pNick" maxlength="20" value="${esc(profile?.nickname || nickname)}" placeholder="昵称" required><p class="login-err" id="pErr"></p><div style="display:flex;gap:10px"><button type="button" class="btn secondary" id="pCancel">取消</button><button class="btn primary" type="submit">保存</button></div></form>`;
  document.body.appendChild(el); $('#pNick', el).focus();
  $('#pCancel', el).onclick = () => el.remove();
  $('form', el).onsubmit = async e => { e.preventDefault(); const n = $('#pNick', el).value.trim(); if (!n) return; if (await saveProfile(n, profile?.avatar)) { el.remove(); toast('已保存'); currentPage = null; render(); } };
}
async function saveAvatar(file) {
  try {
    toast('正在上传头像…');
    const im = await loadImage(file), s = Math.min(im.naturalWidth, im.naturalHeight);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
    const url = await upload(await new Promise(r => c.toBlob(r, 'image/jpeg', .85)));
    if (await saveProfile(profile?.nickname || nickname || '车友', url)) { toast('头像已更新'); currentPage = null; render(); }
  } catch (e) { toast(e.message || '上传失败'); }
}
function userPage() {
  const id = decodeURIComponent(location.hash.split('/')[2] || '');
  const list = CARS.filter(c => (c.byId || c.by) === id);
  if (!list.length) { app.innerHTML = `<section class="wrap lib-head page-enter"><h1>车友车库</h1><p>没有找到这位车友的投稿。</p></section>`; return; }
  const latest = list[0];
  const isMe = list.some(c => myCars.has(c.id));
  app.innerHTML = profileHead({ avatar: latest.avatar, name: latest.by, sub: isMe ? '这是你的车库 · <a href="#/me" style="color:var(--accent)">去我的主页</a>' : `最近投稿 ${fmtDate(latest.time)}`, stats: statsOf(list) }) + `
  ${isAdmin && !isMe ? `<section class="wrap"><div class="admin-bar"><span>管理员：把这位车友小程序时代的车壳认领到当前设备（只对还没有设备归属的车壳生效）。</span><button class="btn small secondary" id="claimBtn">认领到这台设备</button></div></section>` : ''}
  <section class="wrap me-section"><div class="section-head"><div><h2>TA 的车壳</h2></div></div><div class="grid">${list.map(card).join('')}</div></section>`;
  const cb = $('#claimBtn');
  if (cb) cb.onclick = async () => {
    if (!confirm(`把「${latest.by}」名下的车壳归到这台设备？之后可在「我的」里管理它们。`)) return;
    const { data, error } = await sb.rpc('cs_claim', { p_by_id: id, p_token: TOKEN });
    if (error) return toast(error.message);
    toast(`已认领 ${data} 款`); loadRemote().then(() => { location.hash = '#/me'; });
  };
}

/* ---------- 调车工具与记录 ---------- */
const TOOL_SOURCES = [
  ['Atomic：小比例 DRZ3 转向结构说明', 'https://www.rcatomic.com/atomic/index.php?cPath=47_330&main_page=product_info&products_id=6341'],
  ['GL Racing：小比例车架与工具官方手册', 'https://gl-racing.com/store/index.php?journal_blog_post_id=1&route=journal3%2Fblog%2Fpost'],
  ['Yokomo：转向与 Ackermann 实车调校', 'https://ameblo.jp/t-yokomo/entry-12239515532.html'],
  ['Marcus：RWD 漂移转向变化与调校记录', 'https://ameblo.jp/marcus38060/entry-12359289271.html'],
  ['Yokomo：漂移车官方设置表', 'https://teamyokomo.com/downloadfiles/%2101%21SETTING_SHEET/%21217%21MD1.0/MD1.0_Blank_Setup_sheet.pdf'],
  ['SkyRC：四角配重秤说明书', 'https://www.skyrc.com/files/65/Corner_Weight_System_Manual.pdf'],
  ['SkyRC：外倾角仪测量说明', 'https://www.skyrc.com/files/235/500042_DigitalCamberGauge_Instruction_Manual_En_1.0.pdf'],
  ['RC Maker：实测 Camber Gain 工具', 'https://www.rcmaker.com.au/products/3dx-carbon-digital-camber-gain-attachment-for-1-10th-onroad-offroad-4mm-axle']
];
const LOG_FIELDS = [['car', '车架 / 版本'], ['surface', '场地 / 路面'], ['tyre', '轮胎'], ['change', '这次只改了什么'], ['before', '调整前的表现'], ['after', '试车后的表现']];
const CMP_FIELDS = [['wheelbase', '轴距', 'mm'], ['frontTrack', '前轮距', 'mm'], ['rearTrack', '后轮距', 'mm'], ['frontToe', '前单侧 Toe', '°'], ['rearToe', '后单侧 Toe', '°'], ['frontCamber', '前 Camber', '°'], ['rearCamber', '后 Camber', '°'], ['caster', 'Caster', '°']];
let toolTab = 'measure', toolDraft = store.get('toolDraft', {}), cmpIds = [];
function toolsPage() {
  const tabs = [['measure', '测量换算'], ['weight', '四角配重'], ['log', '调校记录'], ['guide', '怎么测']];
  app.innerHTML = `<section class="wrap lib-head page-enter"><p class="eyebrow">DOU / PIT TOOLS</p><h1>调车工具与记录</h1><p>测量、记录，再试车。一次改一项，保留能回退的设置。</p></section>
  <section class="wrap tools"><div class="seg tools-seg" id="toolSeg"><i></i>${tabs.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div><div id="toolBody"></div></section>`;
  $('#toolSeg').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { toolTab = b.dataset.tab; renderTools(); } };
  renderTools();
}
function tField(group, key, label, unit = '') {
  const v = (toolDraft[group] || {})[key] ?? '';
  return `<label class="f"><span>${label}</span><div class="unit"><input data-g="${group}" data-k="${key}" inputmode="decimal" value="${esc(v)}">${unit ? `<em>${unit}</em>` : ''}</div></label>`;
}
function renderTools() {
  $$('#toolSeg button').forEach(b => b.classList.toggle('on', b.dataset.tab === toolTab)); moveSeg($('#toolSeg'));
  const body = $('#toolBody');
  if (toolTab === 'measure') body.innerHTML = `<div class="tool-grid">
    <div class="form-card"><h3>前束：毫米换角度</h3><p class="muted">适合左右对称的前束。用卡尺量两轮前、后相同高度的间距；测量基线是每个车轮前后两个测点之间的距离，不是轴距。</p>
      <div class="f-grid">${tField('toe', 'front', '两轮前侧间距', 'mm')}${tField('toe', 'rear', '两轮后侧间距', 'mm')}${tField('toe', 'diameter', '测量基线', 'mm')}</div><div class="result" id="toeRes"></div>
      <p class="muted small-note">左右不对称时，这个换算给不出各轮独立角度。轮胎鼓包、测点不同都会带来误差。</p><button class="btn small secondary" id="toeToBoard" hidden>把单侧前束带入调车板</button></div>
    <div class="form-card"><h3>压缩时的外倾变化</h3><p class="muted">用外倾尺分别实测正常车高和压缩后的角度。轮顶内收记负数；压缩量指车轮相对车身的垂向位移。</p>
      <div class="f-grid">${tField('gain', 'base', '正常车高 Camber', '°')}${tField('gain', 'compressed', '压缩后 Camber', '°')}${tField('gain', 'travel', '压缩量', 'mm')}</div><div class="result" id="gainRes"></div>
      <p class="muted small-note">这是两次实测的差值，不能外推整段悬架曲线，也不能代替打角时的外倾测量。</p></div></div>`;
  if (toolTab === 'weight') body.innerHTML = `<div class="form-card weight-card"><h3>四角称重</h3><p class="muted">装好日常行驶的电池和装备，四个秤在同一水平面归零后再放车，按实际读数填写。</p>
    <div class="corner-pad"><div class="car-outline"></div>${[['lf', '左前'], ['rf', '右前'], ['lr', '左后'], ['rr', '右后']].map(([k, l]) => `<div class="corner c-${k}">${tField('corner', k, l, 'g')}</div>`).join('')}</div>
    <div class="result" id="cornerRes"></div><p class="muted small-note">不同车型和玩法没有统一的最佳配重。这些数字用来比较你自己的两次调整，不判断「合格」。</p></div>`;
  if (toolTab === 'log') {
    const logs = store.get('toolLogs', []);
    body.innerHTML = `<div class="form-card"><h3>一次改动，一次记录</h3>
      <div class="f-grid">${LOG_FIELDS.map(([k, l]) => `<label class="f ${['change', 'before', 'after'].includes(k) ? 'span2' : ''}"><span>${l}</span><textarea data-g="log" data-k="${k}" rows="${['change', 'before', 'after'].includes(k) ? 2 : 1}" maxlength="300">${esc((toolDraft.log || {})[k] || '')}</textarea></label>`).join('')}</div>
      <button class="btn primary" id="saveLog">保存记录</button><p class="muted small-note">会同时存下调车板当前的尺寸、前束、外倾和转向设置。只存在这台设备的浏览器里，最多 50 条。</p></div>
      ${cmpIds.length ? `<div class="form-card" id="cmpCard">${cmpHtml(logs)}</div>` : ''}
      <div class="log-list">${logs.length ? logs.map(l => `<article class="log-item ${cmpIds.includes(l.id) ? 'picked' : ''}"><header><b>${esc(l.fields.car)}</b><span>${esc(l.date)}</span></header>
        <p>${esc(l.fields.change)}</p><small>${esc([l.fields.surface, l.fields.tyre].filter(Boolean).join(' · '))}</small>
        <details><summary>调整前后</summary><p>调整前：${esc(l.fields.before || '—')}</p><p>调整后：${esc(l.fields.after)}</p><p class="muted">尺寸：轴距 ${l.board?.wheelbase ?? '—'} · 轮距 ${l.board?.frontTrack ?? '—'}/${l.board?.rearTrack ?? '—'} · Toe ${l.board?.frontToe ?? '—'}/${l.board?.rearToe ?? '—'} · Camber ${l.board?.frontCamber ?? '—'}/${l.board?.rearCamber ?? '—'}</p></details>
        <div class="mini-actions"><button class="btn small secondary" data-log-copy="${l.id}">复制</button><button class="btn small secondary" data-log-cmp="${l.id}">${cmpIds.includes(l.id) ? '已选对比' : '加入对比'}</button><button class="btn small secondary" data-log-load="${l.id}">载入调车板</button><button class="btn small danger" data-log-del="${l.id}">删除</button></div></article>`).join('') : '<div class="empty small"><b>还没有记录。</b>先从原厂设置开始，记下路面和轮胎，试完再写结果。</div>'}</div>`;
  }
  if (toolTab === 'guide') body.innerHTML = `<div class="tool-grid">
    <div class="form-card"><h3>先把测量条件固定</h3><ol class="guide-list"><li>使用平整、水平的基准面，按行驶状态装电池和装备，核对正常车高。</li><li>车轮回中，检查前束和左右对称；从小打角、中段到满舵，分别看两轮实际朝向。</li><li>改过前束、连杆孔位或定位后，重新核对转向和机械干涉。不要把所有车型的垫片调整方向当成相同。</li><li>每次只改一项，在同一路面、同款轮胎上试车，记录前后差别。</li></ol></div>
    <div class="form-card"><h3>工具怎么配合</h3><ul class="guide-list"><li><b>平板</b>：实尺网格、俯视轮框、轮角刻度和对照记录。</li><li><b>卡尺 / 调车尺</b>：轮距、连杆长度及前后间距。</li><li><b>外倾尺 / 数字角度仪</b>：Camber；观察打角和压缩行程中的实测变化。</li><li><b>专用夹具或主销几何资料</b>：Caster。平放的屏幕测不出它。</li><li><b>车高尺 / 下垂尺</b>：车高和 Droop。<b>四角秤</b>：实际重量分布。</li></ul><p class="muted small-note">资料里的工具多是 1/10、1/8 尺寸，不能直接当成适合小比例车。先核对轮轴、量程和尺寸。</p></div>
    <div class="form-card span-all"><h3>来源与进一步阅读</h3><p class="muted">厂家资料与玩家经验分开参考；不提供「一套适合所有车」的漂移数值。</p><div class="source-list">${TOOL_SOURCES.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} <span>↗</span></a>`).join('')}</div></div></div>`;
  bindTools();
}
function cmpHtml(logs) {
  const a = logs.find(l => l.id === cmpIds[0]), b = logs.find(l => l.id === cmpIds[1]);
  if (!a || !b) return `<h3>A / B 设置对比</h3><p class="muted">已选 ${cmpIds.length} / 2 条，再选一条。</p>`;
  return `<h3>A / B 设置对比</h3><p class="muted">A：${esc(a.fields.car)} · ${esc(a.date)} → B：${esc(b.fields.car)} · ${esc(b.date)}。差值为 B − A，没记录的值不补零。</p>
    <table class="m-table cmp-table"><tr><th></th><th>A</th><th>B</th><th>差值</th></tr>${CMP_FIELDS.map(([k, l, u]) => { const x = a.board?.[k], y = b.board?.[k]; const d = x == null || y == null ? null : Math.round((y - x) * 10) / 10; return `<tr><td>${l}</td><td>${x ?? '未记录'}${x == null ? '' : u}</td><td>${y ?? '未记录'}${y == null ? '' : u}</td><td class="${d ? (d > 0 ? 'up' : 'down') : ''}">${d == null ? '—' : (d > 0 ? '+' : '') + d + u}</td></tr>`; }).join('')}
    <tr><td>转向模式</td><td>${esc(modeName(a.steer?.mode))}</td><td>${esc(modeName(b.steer?.mode))}</td><td></td></tr></table>`;
}
const modeName = m => (STEER_MODES.find(x => x[0] === m) || ['', '未记录'])[1];
function bindTools() {
  const calc = () => {
    const t = SetupTools.toe(toolDraft.toe || {}), g = SetupTools.camberGain(toolDraft.gain || {}), c = SetupTools.corner(toolDraft.corner || {});
    if ($('#toeRes')) { $('#toeRes').innerHTML = t ? `<b>${t.relation}</b><div class="res-grid"><div><span>单侧</span>${t.side}°</div><div><span>总前束</span>${t.total}°</div><div><span>后 − 前</span>${t.delta} mm</div></div>` : ''; $('#toeToBoard').hidden = !t; }
    if ($('#gainRes')) $('#gainRes').innerHTML = g ? `<div class="res-grid"><div><span>变化</span>${g.difference}°</div><div><span>平均</span>${g.rate}°/mm</div></div>` : '';
    if ($('#cornerRes')) $('#cornerRes').innerHTML = c ? `<div class="res-grid five"><div><span>总重</span>${c.total} g</div><div><span>前 / 后</span>${c.front} / ${c.rear}</div><div><span>左 / 右</span>${c.left} / ${c.right}</div><div><span>左前＋右后</span>${c.cross}</div><div><span>右前＋左后</span>${c.otherCross}</div></div>` : '';
  };
  $$('#toolBody [data-g]').forEach(inp => inp.addEventListener('input', () => { const g = inp.dataset.g; toolDraft[g] = Object.assign({}, toolDraft[g], { [inp.dataset.k]: inp.value }); store.set('toolDraft', toolDraft); calc(); }));
  calc();
  const tb = $('#toeToBoard'); if (tb) tb.onclick = () => { const t = SetupTools.toe(toolDraft.toe || {}); const v = Math.max(-5, Math.min(5, Math.round(parseFloat(t.side) * 2) / 2)); board.frontToe = v; saveBoard(); toast(`已把前束 ${v}° 带入调车板（按 0.5° 取整）`); };
  const sl = $('#saveLog'); if (sl) sl.onclick = () => {
    const f = Object.fromEntries(LOG_FIELDS.map(([k]) => [k, String((toolDraft.log || {})[k] || '').trim().slice(0, 300)]));
    if (!f.car || !f.change || !f.after) return toast('至少填写车架、这次改动和试车结果');
    const logs = store.get('toolLogs', []);
    if (logs.length >= 50) return toast('已存满 50 条，请先删掉旧记录');
    logs.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: new Date().toLocaleDateString('zh-CN'), fields: f, board: { ...board }, steer: { mode: steer.mode, stages: steer.stages, maximum: steer.maximum }, car: boardCar });
    store.set('toolLogs', logs); toolDraft.log = {}; store.set('toolDraft', toolDraft); toast('已保存，附上了调车板当前设置'); renderTools();
  };
  $$('#toolBody [data-log-del]').forEach(b => b.onclick = () => { if (!confirm('删除这条记录？建议先复制留存。')) return; store.set('toolLogs', store.get('toolLogs', []).filter(l => l.id !== b.dataset.logDel)); cmpIds = cmpIds.filter(x => x !== b.dataset.logDel); renderTools(); });
  $$('#toolBody [data-log-cmp]').forEach(b => b.onclick = () => { const id = b.dataset.logCmp; if (cmpIds.includes(id)) cmpIds = cmpIds.filter(x => x !== id); else if (cmpIds.length < 2) cmpIds.push(id); else return toast('已选两条，再点已选的可取消'); renderTools(); });
  $$('#toolBody [data-log-load]').forEach(b => b.onclick = () => { const l = store.get('toolLogs', []).find(x => x.id === b.dataset.logLoad); const v = l && SetupBoard.validate(l.board); if (!v) return toast('这条记录的尺寸无效'); board = v; saveBoard(); location.hash = '#/setup'; toast('已载入记录里的调车板设置'); });
  $$('#toolBody [data-log-copy]').forEach(b => b.onclick = () => { const l = store.get('toolLogs', []).find(x => x.id === b.dataset.logCopy); if (!l) return; copy(['Dou 调车记录 · ' + l.date].concat(LOG_FIELDS.map(([k, n]) => n + '：' + (l.fields[k] || '—')), CMP_FIELDS.map(([k, n, u]) => n + '：' + (l.board?.[k] ?? '未记录') + u), ['转向：' + modeName(l.steer?.mode)]).join('\n')); });
}

/* ---------- 车架资料库 ---------- */
const CH_TYPES = [['manufacturer', '厂家规格'], ['measured', '确认实测'], ['setup', '调校方案']];
const CH_NUMS = [['wheelbase', 'wheelbase', '轴距 mm', 1], ['frontTrack', 'front_track', '前轮中心距 mm'], ['rearTrack', 'rear_track', '后轮中心距 mm'], ['frontCamber', 'front_camber', '前 Camber °'], ['rearCamber', 'rear_camber', '后 Camber °'], ['caster', 'caster', 'Caster °'], ['frontToe', 'front_toe', '前单侧 Toe °'], ['rearToe', 'rear_toe', '后单侧 Toe °']];
let chScope = 'public', chAccount = { admin: false, editor: false }, chMine = new Set();
async function chassisPage() {
  app.innerHTML = `<section class="wrap lib-head page-enter lib-head-row"><div><p class="eyebrow">CHASSIS</p><h1>车架资料库</h1><p>受邀提供 · 车架规格与调校方案</p></div><div id="chHeadBtn"></div></section>
  <section class="wrap ch-wrap"><p class="muted ch-intro">分开标注厂家规格、确认实测和玩家调校。查看时请核对车架版本及测量条件；玩家实测和方案不代表厂家认证。</p>
    <div id="chAccess"></div><div id="chForm"></div><div class="chips" id="chScopes"></div><div id="chList"><p class="muted">正在打开资料库…</p></div></section>`;
  if (!sb) { $('#chList').innerHTML = '<div class="empty small"><b>资料库暂时连不上。</b>请稍后再试。</div>'; return; }
  const [acc, mine] = await Promise.all([sb.rpc('cs_chassis_account', { p_token: TOKEN }), sb.rpc('cs_chassis_mine', { p_token: TOKEN })]);
  if (acc.error) { $('#chList').innerHTML = '<div class="empty small"><b>资料库还没开通。</b>管理员运行 supabase/chassis.sql 后即可使用。</div>'; return; }
  chAccount = acc.data || {}; chMine = new Set(mine.data || []);
  if (chScope === 'hidden' && !chAccount.admin || chScope === 'mine' && !chAccount.editor) chScope = 'public';
  renderChassisChrome(); loadChassis();
}
function renderChassisChrome() {
  $('#chHeadBtn').innerHTML = chAccount.editor ? '<button class="btn primary" id="chOpen">＋ 填写资料</button>' : '';
  const acc = $('#chAccess');
  acc.innerHTML = (!chAccount.editor ? `<details class="ch-access"><summary>填写资料仅限受邀人员 · 我有邀请口令</summary>
      <form id="chRedeem" class="mini-grid" style="margin-top:12px"><label class="mini-f"><span>资料署名</span><input id="chName" maxlength="20" value="${esc(profile?.nickname || nickname)}" placeholder="例如：D0UZ1"></label><label class="mini-f"><span>单次邀请口令</span><input id="chCode" maxlength="40" placeholder="32 位口令"></label><button class="btn small primary" type="submit">验证邀请</button></form>
      <p class="muted mini">口令首次使用后绑定到${wxLogged ? '你的微信账号' : '这台设备（建议先在「我的」用微信登录，换设备也能继续填写）'}。</p></details>` : `<p class="muted mini">你已获得填写权限${chAccount.name ? `，署名「${esc(chAccount.name)}」` : ''}。发布后直接公开。</p>`) +
    (chAccount.admin ? `<div class="admin-bar"><span>管理员：生成单次邀请口令（7 天有效），或管理填写权限。</span><span class="mini-actions"><button class="btn small secondary" id="chInvite">生成邀请</button><button class="btn small secondary" id="chMembers">填写权限</button></span></div><div id="chAdminOut"></div>` : '');
  const scopes = [['public', '公开资料']].concat(chAccount.editor ? [['mine', '我的资料']] : [], chAccount.admin ? [['hidden', '已下架']] : []);
  $('#chScopes').innerHTML = scopes.map(([k, l]) => `<button class="chip ${k === chScope ? 'on' : ''}" data-scope="${k}">${l}</button>`).join('');
  $('#chScopes').onclick = e => { const b = e.target.closest('[data-scope]'); if (b) { chScope = b.dataset.scope; renderChassisChrome(); loadChassis(); } };
  if ($('#chOpen')) $('#chOpen').onclick = () => chassisForm();
  if ($('#chRedeem')) $('#chRedeem').onsubmit = async e => { e.preventDefault(); const { error } = await sb.rpc('cs_chassis_redeem', { p_token: TOKEN, p_code: $('#chCode').value.trim().toLowerCase(), p_name: $('#chName').value.trim() }); if (error) return toast(error.message); toast('邀请已验证，可以填写资料了'); chassisPage(); };
  if ($('#chInvite')) $('#chInvite').onclick = async () => { const { data, error } = await sb.rpc('cs_chassis_invite'); if (error) return toast(error.message); $('#chAdminOut').innerHTML = `<div class="linkrow"><span class="mono">${esc(data)}</span><button class="btn small secondary" data-copy="${esc(data)}">复制</button></div><p class="muted mini">口令 7 天有效，首次使用后绑定对方的设备或微信账号。请只交给你信任的人。</p>`; };
  if ($('#chMembers')) $('#chMembers').onclick = async () => { const { data, error } = await sb.rpc('cs_chassis_members_list'); if (error) return toast(error.message);
    $('#chAdminOut').innerHTML = data.length ? `<table class="m-table">${data.map(m => `<tr><td>${esc(m.display_name)}</td><td>${m.active ? '可填写' : '已停用'}</td><td>${fmtDate(Date.parse(m.joined_at))}</td><td>${m.active ? `<button class="btn small danger" data-revoke="${esc(m.public_id)}">收回权限</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted mini">暂时没有受邀成员。</p>';
    $$('[data-revoke]').forEach(b => b.onclick = async () => { if (!confirm('收回后，该成员不能再提交资料，已公开的资料保留。')) return; const r = await sb.rpc('cs_chassis_revoke', { p_public_id: b.dataset.revoke }); if (r.error) return toast(r.error.message); $('#chMembers').click(); }); };
}
async function loadChassis() {
  const box = $('#chList'); box.innerHTML = '<p class="muted">加载中…</p>';
  let q = sb.from('cs_chassis').select('id,name,brand,version,source_type,source_note,source_url,wheelbase,front_track,rear_track,front_camber,rear_camber,caster,front_toe,rear_toe,contributor,status,updated_at').order('updated_at', { ascending: false }).limit(200);
  q = chScope === 'hidden' ? q.eq('status', 'hidden') : q.eq('status', 'published');
  const { data, error } = await q;
  if (error) { box.innerHTML = '<div class="empty small"><b>暂时无法加载资料库。</b></div>'; return; }
  const list = chScope === 'mine' ? data.filter(r => chMine.has(r.id)) : data;
  box.innerHTML = list.length ? `<div class="ch-grid">${list.map(r => `<article class="ch-card reveal in">
    <header><span class="pill ${r.source_type === 'manufacturer' ? '' : 'glass'}">${(CH_TYPES.find(t => t[0] === r.source_type) || [, '资料'])[1]}</span>${r.status === 'hidden' ? '<span class="pill glass">已下架</span>' : ''}</header>
    <h3>${esc(r.brand)} · ${esc(r.name)}</h3><p class="muted">版本：${esc(r.version)}</p>
    <div class="ch-specs">${CH_NUMS.map(([, col, label]) => `<div><span>${label.replace(' mm', '').replace(' °', '')}</span><b>${r[col] == null ? '—' : +r[col]}${r[col] == null ? '' : label.endsWith('mm') ? '<small>mm</small>' : '°'}</b></div>`).join('')}</div>
    <p class="ch-note">${esc(r.source_note)}</p>
    <footer><span>提供者：${esc(r.contributor)} · ${fmtDate(Date.parse(r.updated_at))}</span><span class="mini-actions">
      ${r.source_url ? `<a class="btn small secondary" href="${esc(r.source_url)}" target="_blank" rel="noopener">资料来源 ↗</a>` : ''}
      ${r.wheelbase && r.front_track && r.rear_track ? `<button class="btn small secondary" data-ch-board="${esc(r.id)}">带入调车板</button>` : ''}
      ${chAccount.admin ? `<button class="btn small ${r.status === 'hidden' ? 'secondary' : 'danger'}" data-ch-hide="${esc(r.id)}" data-h="${r.status !== 'hidden'}">${r.status === 'hidden' ? '恢复' : '下架'}</button>` : ''}</span></footer></article>`).join('')}</div>`
    : `<div class="empty small"><b>${chScope === 'hidden' ? '暂无下架资料。' : chScope === 'mine' ? '还没有发布资料。' : '资料整理中。'}</b>${chScope === 'public' ? '受邀人员发布后会在这里展示。' : ''}</div>`;
  $$('[data-ch-hide]').forEach(b => b.onclick = async () => { if (!confirm(b.dataset.h === 'true' ? '下架后不再对外展示，原始资料保留。' : '恢复公开这份资料？')) return; const r = await sb.rpc('cs_chassis_hide', { p_id: b.dataset.chHide, p_hidden: b.dataset.h === 'true' }); if (r.error) return toast(r.error.message); loadChassis(); });
  $$('[data-ch-board]').forEach(b => b.onclick = () => { const r = list.find(x => x.id === b.dataset.chBoard); const v = SetupBoard.validate({ ...board, wheelbase: +r.wheelbase, frontTrack: +r.front_track, rearTrack: +r.rear_track, frontToe: r.front_toe == null ? board.frontToe : Math.max(-5, Math.min(5, +r.front_toe)), rearToe: r.rear_toe == null ? board.rearToe : Math.max(-5, Math.min(5, +r.rear_toe)), frontCamber: r.front_camber == null ? board.frontCamber : +r.front_camber, rearCamber: r.rear_camber == null ? board.rearCamber : +r.rear_camber }); if (!v) return toast('这份资料的数值超出调车板范围'); board = v; boardCar = null; saveBoard(); location.hash = '#/setup'; toast('已带入车架资料，请核对测量条件'); });
}
function chassisForm() {
  const box = $('#chForm');
  box.innerHTML = `<form class="form-card ch-form" id="chSubmit"><div class="lib-head-row"><h3>填写车架资料</h3><button type="button" class="btn small secondary" id="chClose">收起</button></div>
    <div class="f-grid"><label class="f"><span>车架名称 <i>*</i></span><input name="name" maxlength="60" placeholder="具体车架型号"></label><label class="f"><span>厂商 <i>*</i></span><input name="brand" maxlength="30"></label>
    <label class="f"><span>版本 / 改装状态 <i>*</i></span><input name="version" maxlength="60" placeholder="版本号、原装或改装件"></label><label class="f"><span>资料类型</span><select name="sourceType">${CH_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></div>
    <div class="f-grid">${CH_NUMS.map(([k, , l, req]) => `<label class="f"><span>${l}${req ? ' <i>*</i>' : ''}</span><input name="${k}" inputmode="decimal" maxlength="8" placeholder="${req ? '' : '未测可留空'}"></label>`).join('')}</div>
    <p class="muted mini">轮距为轮胎中心距；Toe 为单侧角，内八为正；Camber 轮顶内收为负；Caster 转向轴上端向车尾倾为正。</p>
    <label class="f"><span>测量方法 / 资料出处 / 适用条件 <i>*</i></span><textarea name="sourceNote" maxlength="300" rows="3" placeholder="厂家资料页；或测量工具、姿态、轮胎、路面等条件。调校方案请写明配置及使用场景。"></textarea></label>
    <label class="f"><span>厂家或参考链接（选填）</span><input name="sourceUrl" maxlength="400" placeholder="https://"></label>
    <button class="btn primary submit-btn" type="submit">发布资料</button></form>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#chClose').onclick = () => { box.innerHTML = ''; };
  $('#chSubmit').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    if (!f.name.trim() || !f.brand.trim() || !f.version.trim() || !f.sourceNote.trim() || !f.wheelbase.trim()) return toast('请补全名称、厂商、版本、轴距和来源');
    if (f.sourceUrl.trim() && !/^https:\/\/\S+$/i.test(f.sourceUrl.trim())) return toast('来源链接需以 https:// 开头');
    const btn = $('button[type=submit]', e.target); btn.disabled = true;
    const { data, error } = await sb.rpc('cs_chassis_submit', { p_token: TOKEN, p: f });
    btn.disabled = false;
    if (error) return toast(error.message);
    chMine.add(data); box.innerHTML = ''; chScope = 'mine'; toast('资料已公开'); renderChassisChrome(); loadChassis();
  };
}

/* ---------- WeChat login (via the mini program's one-time wx.login code) ---------- */
const WX_ICON = '<svg viewBox="0 0 24 24" class="wx-ico"><path d="M9 4C5 4 2 6.7 2 10c0 1.9 1 3.6 2.6 4.7L4 17l2.6-1.3c.8.2 1.6.3 2.4.3h.4A5.6 5.6 0 0 1 9 14c0-3.3 3.1-6 7-6h.4C15.6 5.7 12.6 4 9 4z"/><path d="M22 14c0-2.8-2.7-5-6-5s-6 2.2-6 5 2.7 5 6 5c.7 0 1.3-.1 1.9-.3L20 20l-.5-2c1.5-1 2.5-2.4 2.5-4z"/></svg>';
function parseWxCode(text) {
  const t = String(text || '').trim(), m = t.match(/#\/wx\/([A-Za-z0-9_-]{10,128})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{10,128}$/.test(t) ? t : '');
}
async function wxLogin(code) {
  if (!sb) throw new Error('服务器暂时连不上');
  const r = await fetch(CFG.SUPABASE_URL + '/functions/v1/wx-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (CFG.FUNCTIONS_JWT || CFG.SUPABASE_ANON_KEY) },
    body: JSON.stringify({ code, token: TOKEN })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.token) throw new Error(data.error || '登录失败，请重试');
  TOKEN = data.token; store.set('token', TOKEN); store.set('wx', true); wxLogged = true;
  profile = data.profile; store.set('profile', profile); if (profile?.nickname) { nickname = profile.nickname; store.set('nick', nickname); }
  store.set('myComments', []); myComments = new Set();
  return data.profile;
}
function wxLoginDialog() {
  const el = document.createElement('div'); el.className = 'cal';
  el.innerHTML = `<form class="login-card wx-card"><div class="wx-badge">${WX_ICON}</div><h2>微信登录</h2>
    <ol class="wx-steps"><li>在微信里打开小程序 <b>「头蚊字 Dou」</b></li><li>点 <b>「登录网站」</b>，会复制一条登录链接</li><li>手机上：直接在浏览器打开这条链接<br>电脑上：发到「文件传输助手」后点开，或粘贴到下面</li></ol>
    <input id="wxCode" placeholder="粘贴登录链接" autocomplete="off"><p class="login-err" id="wxErr"></p>
    <div style="display:flex;gap:10px"><button type="button" class="btn secondary" id="wxCancel">取消</button><button class="btn primary" type="submit" id="wxGo">登录</button></div>
    <p class="muted" style="font-size:12px">登录后，你在小程序上传过的车壳和评论会自动回到你名下；这台设备之前的收藏、点赞、投稿也会一起合并。</p></form>`;
  document.body.appendChild(el);
  const inp = $('#wxCode', el); setTimeout(() => inp.focus(), 50);
  $('#wxCancel', el).onclick = () => el.remove();
  $('form', el).onsubmit = async e => {
    e.preventDefault();
    const code = parseWxCode(inp.value); if (!code) { $('#wxErr', el).textContent = '没认出登录链接，请重新复制'; return; }
    const btn = $('#wxGo', el); btn.disabled = true; btn.textContent = '登录中…';
    try { const p = await wxLogin(code); el.remove(); afterWxLogin(p); }
    catch (ex) { $('#wxErr', el).textContent = ex.message; btn.disabled = false; btn.textContent = '登录'; }
  };
}
function afterWxLogin(p) {
  const extra = (p?.claimed_cars || p?.claimed_comments) ? `，找回 ${p.claimed_cars} 款车壳、${p.claimed_comments} 条评论` : '';
  toast(`欢迎回来，${p?.nickname || '车友'}${extra}`);
  history.replaceState(null, '', '#/me'); lastPage = '#/me'; currentPage = null;
  loadRemote().then(() => { if (route().name !== 'me') location.hash = '#/me'; });
}
function wxLogout() {
  if (!confirm('退出微信登录？这台设备会变回一个新的匿名身份。')) return;
  TOKEN = [...crypto.getRandomValues(new Uint8Array(20))].map(b => b.toString(16).padStart(2, '0')).join('');
  store.set('token', TOKEN); store.set('wx', false); wxLogged = false;
  profile = null; store.set('profile', null); store.set('myComments', []); myComments = new Set(); myCars = new Set(); liked = new Set();
  toast('已退出'); currentPage = null; loadRemote().then(render);
}

/* ---------- submit (投稿) ---------- */
async function deleteCar(id) {
  if (!confirm('删除这款车壳？删除后无法恢复。')) return;
  const { data, error } = await sb.rpc('cs_delete_car', { p_id: id, p_token: TOKEN });
  if (error || !data) return toast('删除失败');
  const i = CARS.findIndex(c => c.id === id); if (i >= 0) CARS.splice(i, 1); BY_ID.delete(id); myCars.delete(id);
  closeDetail(); currentPage = null; render(); toast('已删除');
}
function loadImage(file) {
  return new Promise((res, rej) => { const url = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = () => rej(new Error('图片读取失败，请换一张 JPG/PNG')); im.src = url; });
}
async function compress(file, max, q) {
  const im = await loadImage(file);
  const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return { blob, w: c.width, h: c.height };
}
async function upload(blob) {
  const d = new Date(), path = `uploads/${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await sb.storage.from('carshell').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw new Error('图片上传失败：' + error.message);
  return sb.storage.from('carshell').getPublicUrl(path).data.publicUrl;
}
function submitPage() {
  if (!sb) { app.innerHTML = `<section class="wrap lib-head page-enter"><h1>投稿</h1><p>投稿服务暂时不可用，请稍后再试。</p></section>`; return; }
  const files = { cover: null, finished: null, scan: null, parts: [] };
  const numField = (k, l, ph, req) => `<label class="f"><span>${l}${req ? ' <i>*</i>' : ''}</span><div class="unit"><input id="f-${k}" inputmode="decimal" placeholder="${ph}" ${req ? 'required' : ''}><em>mm</em></div></label>`;
  app.innerHTML = `
  <section class="wrap lib-head page-enter"><p class="eyebrow">BUILD YOUR GARAGE</p><h1>投稿车壳</h1><p>记录尺寸与细节，让下一位车友搭配更有把握。</p></section>
  <section class="wrap"><form class="submit-form" id="submitForm" novalidate>
    <div class="drop cover-drop" id="coverDrop" tabindex="0" role="button" aria-label="上传封面图"><input type="file" accept="image/*" id="fCover" hidden><div class="drop-empty"><b>＋</b><span>点击上传封面图 <i>*</i></span><small>建议横拍，能看清车壳整体</small></div></div>
    <div class="form-card">
      <label class="f"><span>车壳名称 <i>*</i></span><input id="f-name" maxlength="40" placeholder="如：尼桑400Z LBWK宽体" required></label>
      <div class="f"><span>生产公司</span><div class="chips" id="fBrand">${BRANDS.map((b, i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-v="${b}">${b}</button>`).join('')}</div></div>
      <label class="f"><span>车型分类 <small class="muted" id="modelHint">按名称自动识别，可修改</small></span><select id="f-model">${MODEL_NAMES.map(m => `<option>${m}</option>`).join('')}</select></label>
    </div>
    <div class="form-card"><h3>尺寸</h3><p class="muted">用游标卡尺测量，精确到 0.1 mm，填写时取整数即可。</p>
      <details class="measure-guide"><summary>测量标准（第一次投稿请看）</summary>
        <img src="img/measure-guide.jpg" alt="车壳测量示意图" loading="lazy">
        <dl><dt style="--c:#ba68c8">车身长度</dt><dd>车头最前端到车尾最后端的总长度</dd><dt style="--c:#4fc3f7">轴距</dt><dd>前后轮眉中心点之间的纵向距离</dd>
        <dt style="--c:#e94560">前轮距</dt><dd>左右前轮眉中心点之间的距离（车壳前轮眉位置的宽度）</dd><dt style="--c:#66bb6a">后轮距</dt><dd>左右后轮眉中心点之间的距离（车壳后轮眉位置的宽度）</dd></dl></details>
      <div class="f-grid">${numField('wb', '轴距', '如 98', 1)}${numField('ft', '前轮距', '如 76', 1)}${numField('rt', '后轮距', '如 78', 1)}${numField('len', '车身长度', '选填', 0)}</div>
    </div>
    <div class="form-card">
      <label class="switch-row"><span>宽体车壳</span><input type="checkbox" id="f-wide"><i class="switch"></i></label>
      <div id="wideBox" hidden>
        <label class="f"><span>宽体购买链接</span><input id="f-link" maxlength="300" placeholder="淘宝/闲鱼链接（选填）"></label>
        <div class="f"><span>宽体 3D 扫描图</span><div class="drop small-drop" id="scanDrop" tabindex="0" role="button"><input type="file" accept="image/*" id="fScan" hidden><div class="drop-empty"><b>＋</b><span>上传扫描图</span></div></div></div>
      </div>
    </div>
    <div class="form-card"><h3>照片</h3>
      <div class="f"><span>成品照片</span><div class="drop small-drop" id="finDrop" tabindex="0" role="button"><input type="file" accept="image/*" id="fFin" hidden><div class="drop-empty"><b>＋</b><span>上传成品照片</span></div></div></div>
      <div class="f"><span>板件图 <small class="muted">最多 9 张</small></span><div class="parts-pick" id="partsPick"><label class="part-add"><input type="file" accept="image/*" multiple id="fParts" hidden><b>＋</b></label></div></div>
    </div>
    <div class="form-card">
      <label class="f"><span>备注</span><textarea id="f-note" maxlength="200" rows="2" placeholder="涂装、改装、注意事项（选填）"></textarea></label>
      <label class="f"><span>你的昵称 <i>*</i></span><input id="f-by" maxlength="20" value="${esc(nickname)}" placeholder="车友昵称" required></label>
    </div>
    <p class="form-err" id="formErr" role="alert"></p>
    <button class="btn primary submit-btn" type="submit" id="submitBtn">发布车壳</button>
    <p class="muted" style="font-size:13px;text-align:center;margin-top:12px">发布后立即上架。用同一台设备可以删除自己的投稿。</p>
  </form></section>`;
  const preview = (drop, file) => { const u = URL.createObjectURL(file); drop.classList.add('has'); drop.querySelector('.drop-empty').innerHTML = `<img src="${u}" alt=""><span class="drop-change">更换</span>`; };
  const bindDrop = (dropId, inputId, key) => {
    const d = $('#' + dropId), inp = $('#' + inputId);
    d.addEventListener('click', () => inp.click());
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', () => { const f = inp.files[0]; if (f) { files[key] = f; preview(d, f); } });
  };
  bindDrop('coverDrop', 'fCover', 'cover'); bindDrop('scanDrop', 'fScan', 'scan'); bindDrop('finDrop', 'fFin', 'finished');
  const renderParts = () => {
    const box = $('#partsPick');
    $$('.part-thumb', box).forEach(n => n.remove());
    files.parts.forEach((f, i) => box.insertAdjacentHTML('beforeend', `<div class="part-thumb"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-rm="${i}" aria-label="移除">×</button></div>`));
    $('.part-add', box).hidden = files.parts.length >= 9;
  };
  $('#fParts').addEventListener('change', e => { files.parts = files.parts.concat([...e.target.files]).slice(0, 9); e.target.value = ''; renderParts(); });
  $('#partsPick').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { files.parts.splice(+b.dataset.rm, 1); renderParts(); } });
  let brand = BRANDS[0], modelTouched = false;
  $('#fBrand').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; brand = b.dataset.v; $$('#fBrand .chip').forEach(c => c.classList.toggle('on', c === b)); });
  $('#f-name').addEventListener('input', e => { if (!modelTouched) $('#f-model').value = inferModel(e.target.value); });
  $('#f-model').addEventListener('change', () => { modelTouched = true; });
  $('#f-wide').addEventListener('change', e => { $('#wideBox').hidden = !e.target.checked; });
  $('#submitForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#formErr'), btn = $('#submitBtn'), v = id => $('#f-' + id).value.trim();
    const fail = (msg, el) => { err.textContent = msg; el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.focus?.(); };
    if (!files.cover) return fail('请上传封面图', $('#coverDrop'));
    if (!v('name')) return fail('请填写车壳名称', $('#f-name'));
    for (const [k, l, lo, hi] of [['wb', '轴距', 50, 300], ['ft', '前轮距', 30, 250], ['rt', '后轮距', 30, 250]]) { const n = parseFloat(v(k)); if (!(n >= lo && n <= hi)) return fail(`${l}需要填 ${lo}–${hi} 之间的数字`, $('#f-' + k)); }
    if (v('len') && !(parseFloat(v('len')) >= 50 && parseFloat(v('len')) <= 500)) return fail('车身长度需要在 50–500 mm', $('#f-len'));
    if (!v('by')) return fail('请填写你的昵称', $('#f-by'));
    err.textContent = ''; btn.disabled = true;
    const total = 2 + (files.finished ? 1 : 0) + ($('#f-wide').checked && files.scan ? 1 : 0) + files.parts.length; let done = 0;
    const step = () => { btn.textContent = `正在上传图片 ${++done}/${total}…`; };
    try {
      btn.textContent = '正在处理图片…';
      const big = await compress(files.cover, 1800, .82), small = await compress(files.cover, 720, .78);
      const cover = await upload(big.blob); step(); const thumb = await upload(small.blob); step();
      const one = async f => { const r = await upload((await compress(f, 1800, .82)).blob); step(); return r; };
      const finished = files.finished ? await one(files.finished) : '';
      const scan = $('#f-wide').checked && files.scan ? await one(files.scan) : '';
      const parts = []; for (const f of files.parts) parts.push(await one(f));
      btn.textContent = '正在发布…';
      const payload = { name: v('name'), brand, model: $('#f-model').value, wb: v('wb'), ft: v('ft'), rt: v('rt'), len: v('len'), wide: $('#f-wide').checked, wideLink: v('link'), note: v('note'), by: v('by'), cover, thumb, ratio: +(big.w / big.h).toFixed(3), finished, scan, parts };
      const { data: id, error } = await sb.rpc('cs_add_car', { p: payload, p_token: TOKEN });
      if (error) throw new Error(error.message);
      nickname = v('by'); store.set('nick', nickname); myCars.add(id);
      const { data: row } = await sb.from('cs_cars').select(COLS).eq('id', id).single();
      if (row) { const c = fromRow(row); CARS.unshift(c); BY_ID.set(c.id, c); }
      toast('发布成功，谢谢分享！');
      lastPage = '#/library'; currentPage = null; location.hash = '#/car/' + id;
    } catch (ex) { btn.disabled = false; btn.textContent = '发布车壳'; fail(ex.message || '发布失败，请重试'); }
  });
}

/* ---------- router ---------- */
let lastPage = '#/', currentPage = null;
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [name, arg] = h.split('/');
  return { name: name || 'home', arg };
}
const PAGES = { home, library, rank, setup, saved: savedPage, compare: comparePage, submit: submitPage, me: mePage, u: userPage, tools: toolsPage, chassis: chassisPage };
function render() {
  const r = route();
  if (r.name === 'wx') {
    const code = parseWxCode(location.hash);
    history.replaceState(null, '', '#/me'); lastPage = '#/me';
    renderPage('me'); currentPage = '#/me';
    if (!code) { toast('登录链接无效'); return; }
    toast('正在用微信登录…');
    const go = () => wxLogin(code).then(afterWxLogin, ex => { toast(ex.message); });
    sb ? go() : toast('服务器暂时连不上');
    return;
  }
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
  heroCleanup?.();
  const fn = PAGES[name] || home;
  const go = () => { fn(); currentPage = location.hash || '#/'; if (route().name === 'car') currentPage = lastPage; reveal(); renderDock(); updateNav(name); };
  if (document.startViewTransition && !reduceMotion && currentPage) document.startViewTransition(go); else go();
  if (route().name !== 'car') scrollTo({ top: 0, behavior: 'instant' });
}
function updateNav(name) { $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name)); }
addEventListener('hashchange', render);
footMeta();
updateBadge();
render();
loadRemote();
})();
