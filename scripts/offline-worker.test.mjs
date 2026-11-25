import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const worker = await readFile(new URL('../offline/service-worker.js', import.meta.url), 'utf8');
const origin = 'https://reader.test';
const app = 'comic-reader-app-';
const runtime = 'comic-reader-upscale-runtime-';
const assets = ['/offline/new/upscale-runtime/worker.js', '/offline/new/upscale-runtime/runtime.wasm'];

function workerFixture() {
  const stores = new Map(), handlers = new Map(), fetched = [];
  const caches = {
    keys: async () => [...stores.keys()],
    delete: name => stores.delete(name),
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Set());
      const urls = stores.get(name);
      return {
        keys: async () => [...urls],
        match: async url => urls.has(new URL(url, origin).pathname) ? new Response('cached') : undefined,
        addAll: async requests => requests.forEach(request => urls.add(new URL(request.url, origin).pathname)),
      };
    },
  };
  vm.runInNewContext(worker, {
    APP_CACHE: app + 'new', UPSCALE_CACHE: runtime + 'new', UPSCALE_RUNTIME: assets,
    SHELL: '/offline/new/index.html', PRECACHE: ['/offline/new/index.html', '/offline/new/app.js'],
    self: { location: { origin }, skipWaiting() {}, clients: { claim() {} }, addEventListener: (type, fn) => handlers.set(type, fn) },
    Request: class { constructor(path) { this.url = new URL(path, origin).href; } },
    URL, Response, AbortSignal, setTimeout, clearTimeout, caches,
    fetch: async request => {
      fetched.push(request.url);
      return request.mode === 'navigate' ? new Response('online', { headers: { 'x-comic-reader': '1' } }) : Response.error();
    },
  });
  function dispatch(type, event = {}) {
    let result;
    const capture = promise => { result = promise; };
    handlers.get(type)({ ...event, waitUntil: capture, respondWith: capture });
    return result;
  }
  return { dispatch, stores, fetched };
}

test('an upgrade prepares the new runtime and keeps the previous shell and its runtime usable', async () => {
  const { dispatch, stores } = workerFixture();
  for (const version of ['oldest', 'previous']) {
    stores.set(app + version, new Set());
    stores.set(runtime + version, new Set(['/offline/' + version + '/upscale-runtime/worker.js']));
  }
  await dispatch('install');
  await dispatch('activate');
  assert.deepEqual([...stores.get(runtime + 'new')], assets);
  assert.ok(stores.has(runtime + 'previous'));
  assert.ok(stores.has(app + 'previous'));
  assert.equal(stores.has(runtime + 'oldest'), false);
});

test('only the matching tab and route consume the offline navigation shortcut', async () => {
  const { dispatch, fetched, stores } = workerFixture();
  await dispatch('install');
  assert.equal(stores.has(runtime + 'new'), false);
  const request = (mode, path) => ({ mode, url: origin + path, method: 'GET', headers: new Headers() });
  const fail = () => dispatch('fetch', { clientId: 'tab-a', request: request('cors', '/read/a?page=2&_rsc=1') });
  const navigate = async (id, path) => (await dispatch('fetch', { replacesClientId: id, request: request('navigate', path) })).text();
  await fail();
  assert.equal(await navigate('tab-b', '/read/a?page=2'), 'online');
  assert.equal(await navigate('tab-a', '/backup'), 'online');
  await fail();
  const before = fetched.length;
  assert.equal(await navigate('tab-a', '/read/a?page=2'), 'cached');
  assert.equal(fetched.length, before);
  assert.equal(await navigate('tab-a', '/read/a?page=2'), 'online');
});
