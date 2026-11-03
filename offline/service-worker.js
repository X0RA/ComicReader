/* Generated build constants are prepended by scripts/build-offline.mjs. */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      // Publish a complete version or keep the previous worker. No forced update
      // while an existing reader is using the old version.
      await cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) { await caches.delete(APP_CACHE); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('comic-reader-app-') && name !== APP_CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (!['OFFLINE_STATUS', 'OFFLINE_PREPARE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(APP_CACHE);
      const missing = (await Promise.all(PRECACHE.map(async url => await cache.match(url) ? null : url))).filter(Boolean);
      // Browsers may reclaim cache storage. Repair it on the next online launch.
      if (missing.length && event.data.type === 'OFFLINE_PREPARE') {
        await cache.addAll(missing.map(url => new Request(url, { cache: 'reload' })));
      }
      event.ports[0]?.postMessage({ ready: !missing.length || event.data.type === 'OFFLINE_PREPARE' });
    } catch { event.ports[0]?.postMessage({ ready: false }); }
  })());
});
const appRoute = path => path === '/' || /^\/(?:bookmarks|downloaded|backup|import)(?:\/|$)/.test(path) || path.startsWith('/read/');
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && appRoute(url.pathname)) {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (response.status < 500) return response;
      } catch { /* Offline, captive portal timeout, or unavailable deployment. */ }
      finally { clearTimeout(timer); }
      return await (await caches.open(APP_CACHE)).match('/offline/index.html') || new Response('Connect once to prepare offline reading.', { status: 503 });
    })());
    return;
  }
  // Only immutable, versioned offline assets are cached. Comic archives and
  // model weights already have their own stores; transfer API data is never cached.
  if (PRECACHE.includes(url.pathname)) event.respondWith((async () =>
    await (await caches.open(APP_CACHE)).match(url.pathname) || fetch(request))());
});
