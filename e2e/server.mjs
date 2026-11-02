import { build } from 'esbuild';
import { createServer } from 'node:http';
import JSZip from 'jszip';
const bundle = await build({ entryPoints: ['e2e/harness.ts'], bundle: true, write: false, platform: 'browser' });
const zip = new JSZip();
zip.file('page1.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
const comic = await zip.generateAsync({ type: 'nodebuffer' });
zip.file('payload.bin', Buffer.alloc(2 * 1024 * 1024, 37));
const large = await zip.generateAsync({ type: 'nodebuffer' });
createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (req.url === '/comic.cbz') { res.setHeader('Content-Length', comic.length); res.end(comic); }
  else if (req.url === '/large.cbz') { res.setHeader('Content-Length', large.length); res.end(large); }
  else if (req.url === '/stall.cbz') { res.setHeader('Content-Length', comic.length); res.write(comic.subarray(0, 32)); }
  else if (req.url === '/invalid.cbz') res.end('<html>Not a comic</html>');
  else res.end('<!doctype html><title>Storage tests</title><script src="/bundle.js"></script>');
}).listen(4319, '127.0.0.1');
