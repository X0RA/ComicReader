/* Generated build constants are prepended by scripts/build-offline.mjs. */
async function prepareUpscaleRuntime() {
  const cache = await caches.open(UPSCALE_CACHE);
  const missing = (await Promise.all(UPSCALE_RUNTIME.map(async url => await cache.match(url) ? null : url))).filter(Boolean);
  if (missing.length) await cache.addAll(missing.map(url => new Request(url, { cache: 'reload' })));
}

async function hasSavedUpscaler() {
  for (const name of await caches.keys()) {
    if (name.startsWith('comic-reader-upscale-runtime-') || name.startsWith('comic-reader-upscale-models-')) {
      if ((await (await caches.open(name)).keys()).length) return true;
    }
  }
  return false;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      await cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })));
      if (await hasSavedUpscaler()) await prepareUpscaleRuntime();
      await self.skipWaiting();
    } catch (error) { await caches.delete(APP_CACHE); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const previous = keys.filter(name => name.startsWith('comic-reader-app-') && name !== APP_CACHE);
    for (const name of previous.slice(0, -1)) await caches.delete(name);
    const previousRuntime = previous.at(-1)?.replace('comic-reader-app-', 'comic-reader-upscale-runtime-');
    for (const name of keys) {
      if (name.startsWith('comic-reader-upscale-runtime-') && name !== UPSCALE_CACHE && name !== previousRuntime) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'UPSCALE_PREPARE') {
    event.waitUntil((async () => {
      try {
        await prepareUpscaleRuntime();
        event.ports[0]?.postMessage({ ready: true });
      } catch { event.ports[0]?.postMessage({ ready: false }); }
    })());
    return;
  }
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
const failedRoutes = new Map();
function recordFailure(clientId, url) {
  if (!clientId) return;
  const now = Date.now();
  for (const [id, failure] of failedRoutes) if (failure.expires <= now) failedRoutes.delete(id);
  url.searchParams.delete('_rsc');
  failedRoutes.set(clientId, { route: url.pathname + url.search, expires: now + 5000 });
}
function isFallbackNavigation(event, url) {
  const clientId = event.replacesClientId || event.clientId;
  const failure = failedRoutes.get(clientId);
  if (!failure) return false;
  failedRoutes.delete(clientId);
  return event.request.cache !== 'reload' && failure.expires > Date.now() && failure.route === url.pathname + url.search;
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // History entries created before the worker took control (or fullscreen chapter
  // turns) can still use the Next router. A non-RSC response tells that router to
  // retry as a document navigation.
  if (request.mode !== 'navigate' && appRoute(url.pathname) && (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc'))) {
    event.respondWith(fetch(request, { signal: AbortSignal.timeout(2500) })
      .then(response => {
        if (response.ok && response.headers.get('x-comic-reader') === '1') return response;
        recordFailure(event.clientId, url);
        return new Response('', { headers: { 'Content-Type': 'text/html' } });
      })
      .catch(() => {
        recordFailure(event.clientId, url);
        return new Response('', { headers: { 'Content-Type': 'text/html' } });
      }));
    return;
  }
  if (request.mode === 'navigate' && appRoute(url.pathname)) {
    event.respondWith((async () => {
      if (!isFallbackNavigation(event, url)) {
        let timer;
        try {
          const timeout = new Promise(resolve => { timer = setTimeout(resolve, request.cache === 'reload' ? 15000 : 2500); });
          const pending = fetch(request);
          pending.catch(() => {});
          const response = await Promise.race([pending, timeout]);
          if (response?.ok && response.headers.get('x-comic-reader') === '1') return response;
        } catch { /* Network unavailable. */ }
        finally { clearTimeout(timer); }
      }
      const cache = await caches.open(APP_CACHE);
      const [shell, script] = await Promise.all([cache.match(SHELL), cache.match(new URL('app.js', new URL(SHELL, self.location.origin)))]);
      if (shell && script) return shell;
      return new Response('Connect once to prepare offline reading. Your downloaded comics stay on this device.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })());
    return;
  }
  if (UPSCALE_RUNTIME.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(UPSCALE_CACHE);
      const saved = await cache.match(url.pathname);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(url.pathname, response.clone()).catch(() => {});
      return response;
    })());
    return;
  }
  // Only immutable, versioned offline assets are cached. Comic archives and
  // model weights already have their own stores; transfer API data is never cached.
  if ((url.pathname.startsWith('/offline/') || url.pathname.startsWith('/_next/static/')) && !PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(saved => saved || fetch(request)));
    return;
  }
  if (PRECACHE.includes(url.pathname)) event.respondWith((async () =>
    await (await caches.open(APP_CACHE)).match(url.pathname) || fetch(request))());
});
