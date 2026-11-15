import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { readHomeHtml } from './offline-html.mjs';

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'comic-offline-html-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, html] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), html);
  }
  return root;
}

test('reads the legacy prerendered home shell', async t => {
  const html = '<body class="geist-sans geist-mono antialiased">Home</body>';
  const root = await fixture(t, { 'app/index.html': html });
  assert.equal(await readHomeHtml(root), html);
});

test('reads route-cache home HTML when app/index.html is absent', async t => {
  const html = '<body class="generated-font-classes antialiased">Home</body>';
  const root = await fixture(t, {
    'route-cache/APP_PAGE/another-route/$/downloaded.html': 'Storage',
    'route-cache/APP_PAGE/home-route-hash/$/index.html': html,
    'pages/404.html': 'Not found',
  });
  assert.equal(await readHomeHtml(root), html);
});

test('fails clearly instead of silently dropping fonts when no home shell exists', async t => {
  const root = await fixture(t, { 'app/downloaded.html': 'Storage' });
  await assert.rejects(readHomeHtml(root), /no prerendered home HTML/);
});
