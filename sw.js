/* 头蚊字 Dou — service worker
 * 页面和脚本：先走网络，断网时用缓存（网站一更新，App 立刻跟着更新）
 * 车壳图片：先用缓存，没有再下载（翻过的车壳断网也能看）
 * Supabase 接口（评论、点赞、登录）：不缓存，直接走网络
 */
const VERSION = 'dou-v2';
const SHELL = `${VERSION}-shell`;
const IMGS = `${VERSION}-img`;
const IMG_LIMIT = 400;
const CORE = [
  './',
  './index.html',
  './style.css?v=16',
  './app.js?v=17',
  './board.js?v=4',
  './steering.js?v=1',
  './data.js?v=2',
  './config.js?v=3',
  './manifest.webmanifest',
  './icon.png',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isImg = (req, url) => req.destination === 'image' || /\.(jpe?g|png|webp|gif|avif)$/i.test(url.pathname);

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheKey) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(cacheKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(cacheKey || req, { ignoreSearch: false }) || await c.match(cacheKey || req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await c.match('./index.html')) || (await c.match('./'));
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(IMGS);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(IMGS, IMG_LIMIT); }
  return res;
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase 存储里的车壳图片 → 缓存优先
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.startsWith('/storage/v1/object/public/') && isImg(req, url)) e.respondWith(cacheFirst(req));
    return; // 数据接口不缓存
  }
  // supabase-js 等 CDN 脚本，以及 jsDelivr 上的车壳图
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(isImg(req, url) ? cacheFirst(req) : staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, './index.html')); return; }
  if (isImg(req, url) && url.pathname.includes('/img/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req));
});
