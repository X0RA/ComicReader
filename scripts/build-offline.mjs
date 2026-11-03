import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const directory = `public/offline/${buildId}`;
await rm('public/offline', { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await build({ entryPoints: ['offline/entry.tsx'], outfile: `${directory}/app.js`, bundle: true, minify: true, format: 'esm', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { 'next/link': resolve('offline/link.tsx'), 'next/navigation': resolve('offline/navigation.ts') },
});
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]))).flat();
}
const staticFiles = await files('.next/static');
const css = staticFiles.filter(file => file.endsWith('.css')).map(file => file.replace('.next', '/_next'));
const fonts = staticFiles.filter(file => /\.(?:woff2?|ttf|otf)$/.test(file)).map(file => file.replace('.next', '/_next'));
const iconFiles = (await files('public/icons')).filter(file => /\.png$/.test(file)).map(file => file.replace('public', ''));
const html = await readFile('.next/server/app/index.html', 'utf8');
const bodyClass = /<body[^>]*class="([^"]*)"/.exec(html)?.[1] || '';
const assets = [`/offline/${buildId}/app.js`, `/offline/${buildId}/app.css`, ...css, ...fonts, ...iconFiles, '/manifest.json'];
await writeFile('public/offline/index.html', `<!doctype html><html lang="en" data-offline-app="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Comic Reader"><title>Comic Reader</title><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">${[...css, `/offline/${buildId}/app.css`].map(url => `<link rel="stylesheet" href="${url}">`).join('')}</head><body class="${bodyClass}"><div id="offline-root"><p>Opening your library…</p></div><script type="module" src="/offline/${buildId}/app.js"></script></body></html>`);
const worker = await readFile('offline/service-worker.js', 'utf8');
await writeFile('public/sw.js', `const APP_CACHE = ${JSON.stringify(`comic-reader-app-${buildId}`)};\nconst PRECACHE = ${JSON.stringify(['/offline/index.html', ...assets])};\n${worker}`);
console.log(`Offline reader built: ${assets.length + 1} assets, version ${buildId}`);
