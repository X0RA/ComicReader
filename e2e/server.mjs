import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import JSZip from 'jszip';
const bundle = await build({ entryPoints: ['e2e/harness.ts'], bundle: true, write: false, platform: 'browser' });
const readerBundle = await build({ entryPoints: ['e2e/reader-harness.tsx'], bundle: true, write: false, platform: 'browser', loader: { '.module.css': 'empty' } });
const upscaleBundle = await build({ entryPoints: ['e2e/upscale-harness.tsx'], bundle: true, write: false, platform: 'browser', loader: { '.module.css': 'empty' } });
const transferBundle = await build({ entryPoints: ['app/api/transfer/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { POST: transfer } = await import('data:text/javascript;base64,' + Buffer.from(transferBundle.outputFiles[0].contents).toString('base64'));
const zip = new JSZip();
zip.file('page1.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
const comic = await zip.generateAsync({ type: 'nodebuffer' });
zip.file('payload.bin', Buffer.alloc(2 * 1024 * 1024, 37));
const large = await zip.generateAsync({ type: 'nodebuffer' });
createServer(async (req, res) => {
  if (req.url === '/api/transfer') {
    const response = await transfer(new Request('http://127.0.0.1:4319/api/transfer', { method: req.method, headers: req.headers, body: Readable.toWeb(req), duplex: 'half' }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
  }
  if (/^\/upscale-(models|runtime)\/[a-zA-Z0-9._-]+$/.test(req.url || '')) {
    try { const data = await readFile('public' + req.url); res.setHeader('Content-Type', req.url.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(req.url) ? 'text/javascript' : 'application/octet-stream'); res.end(data); } catch { res.writeHead(404); res.end(); }
    return;
  }
  if (req.url === '/upscale.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(upscaleBundle.outputFiles[0].contents); return; }
  if (req.url === '/upscale') { res.end('<!doctype html><title>Upscaling tests</title><body><script src="/upscale.js"></script></body>'); return; }
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (req.url === '/reader.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(readerBundle.outputFiles[0].contents); }
  else if (req.url === '/reader') res.end('<!doctype html><title>Reader tests</title><body><script src="/reader.js"></script></body>');
  else if (req.url === '/comic.cbz') { res.setHeader('Content-Length', comic.length); res.end(comic); }
  else if (req.url === '/large.cbz') { res.setHeader('Content-Length', large.length); res.end(large); }
  else if (req.url === '/stall.cbz') { res.setHeader('Content-Length', comic.length); res.write(comic.subarray(0, 32)); }
  else if (req.url === '/invalid.cbz') res.end('<html>Not a comic</html>');
  else res.end('<!doctype html><title>Storage tests</title><script src="/bundle.js"></script>');
}).listen(4319, '127.0.0.1');
