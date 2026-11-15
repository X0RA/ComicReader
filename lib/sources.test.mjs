import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import { DEFAULT_SOURCE, SOURCES_KEY, SOURCES_CHANGED, fetchCatalog, parseCatalog, getSources, saveSources, filterActiveSources } from './sources.ts';

const extra = { id: 'extra', name: 'Extra', url: 'https://extra.example/contents.json' };
const comic = { id: '1', name: 'Issue.cbz', type: 'file', link: 'comics/1.cbz', extension: 'cbz' };
function storage(t, sources = [extra]) {
  const values = new Map([[SOURCES_KEY, JSON.stringify(sources)]]);
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
}

test('catalogs validate nested entries and accept all three wrappers', () => {
  for (const raw of [[comic], { type: 'folder', children: [comic] }, { content: [comic] }]) {
    assert.deepEqual(parseCatalog(raw), [comic]);
  }
  for (const raw of [[null], [{ id: '1', type: 'file' }], [{ ...comic, link: '' }],
    [{ id: 'folder', name: 'Folder', type: 'folder', children: [{}] }],
    [{ id: 'folder', name: 'Folder', type: 'folder' }], [comic, comic]]) {
    assert.throws(() => parseCatalog(raw));
  }
});

test('fetch resolves relative links against the final response URL', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, url: 'https://cdn.example/library/catalog.json', json: async () => [structuredClone(comic)] }));
  assert.equal((await fetchCatalog(extra))[0].link, 'https://cdn.example/library/comics/1.cbz');
});

test('deadline aborts a stalled request or response body', async t => {
  for (const stallBody of [false, true]) {
    let aborted = false;
    t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
      const stall = () => new Promise((_, reject) => signal.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true }));
      return stallBody ? { ok: true, json: stall } : stall();
    });
    await assert.rejects(fetchCatalog(extra, 10), /too long/);
    assert.equal(aborted, true);
  }
});

test('reset notifies the mounted settings subscriber and later additions do not restore old sources', t => {
  storage(t);
  let displayed = getSources();
  window.addEventListener(SOURCES_CHANGED, () => { displayed = getSources(); });
  saveSources([]);
  assert.deepEqual(displayed, [DEFAULT_SOURCE]);
  const added = { ...extra, id: 'new', url: 'https://new.example/catalog.json' };
  saveSources([...getSources(), added]);
  assert.deepEqual(displayed, [DEFAULT_SOURCE, added]);
  assert.deepEqual(filterActiveSources([{ id: 'source:extra' }, { id: 'source:new' }, comic]), [{ id: 'source:new' }, comic]);
});

// Bundle the real DB module in memory, replacing only its storage boundary.
const built = await build({ entryPoints: ['lib/dexieDB.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['dexie'] });
const filename = `${process.cwd()}/sources-review.cjs`;
const compiled = new Module(filename);
compiled.paths = Module._nodeModulePaths(process.cwd());
compiled._compile(built.outputFiles[0].text, filename);
const { db } = compiled.exports;
function database(t, root) {
  const cache = new Map(root === undefined ? [] : [['root', { id: 'root', content: root }]]);
  t.mock.method(db.comics, 'get', async id => structuredClone(cache.get(id)));
  t.mock.method(db.comics, 'put', async row => { cache.set(row.id, structuredClone(row)); });
  t.mock.method(db, 'getReadComics', async () => []);
  t.mock.method(console, 'error', () => {});
  return cache;
}

test('malformed extra source does not discard healthy default updates', async t => {
  storage(t);
  const cache = database(t, []);
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, json: async () => url === extra.url
    ? [{ id: 'bad', type: 'file' }, { id: 'bad2', type: 'file' }] : [structuredClone(comic)] }));
  const result = await db.updateFromRemoteDB();
  assert.equal(result[0].id, comic.id);
  assert.equal(cache.has('source:extra'), false);
});

test('offline reads and failed refreshes omit removed source folders', async t => {
  storage(t, []);
  const cache = database(t, [comic, { id: 'source:extra', name: 'Extra', type: 'folder', children: [comic] }]);
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
  assert.deepEqual((await db.getComicsData()).map(item => item.id), ['1']);
  assert.deepEqual((await db.updateFromRemoteDB()).map(item => item.id), ['1']);
  assert.deepEqual(cache.get('root').content.map(item => item.id), ['1']);
});

test('all failed sources rebuild from their individual saved catalogs', async t => {
  storage(t);
  const cache = database(t);
  cache.set('source:default', { id: 'source:default', content: [comic] });
  cache.set('source:extra', { id: 'source:extra', content: [comic] });
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
  const result = await db.updateFromRemoteDB();
  assert.deepEqual(new Set(result.map(item => item.id)), new Set(['1', 'source:extra']));
  assert.equal(result.find(item => item.id === 'source:extra').children[0].id, 'extra:1');
});
