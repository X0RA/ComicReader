import { build } from 'esbuild';
import { readHomeHtml } from './offline-html.mjs';
import { readFile, writeFile, mkdir, readdir, rm, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
if (!/^[a-zA-Z0-9_-]+$/.test(buildId)) throw new Error("Invalid build ID");
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
const html = await readHomeHtml('.next/server');
const bodyClass = /<body[^>]*class="([^"]*)"/.exec(html)?.[1] || '';
await cp('public/upscale-runtime', `${directory}/upscale-runtime`, { recursive: true });
const allBundleFiles = (await files(directory)).map(file => file.replace('public', ''));
const upscalePrefix = `/offline/${buildId}/upscale-runtime/`;
const upscaleRuntime = allBundleFiles.filter(url => url.startsWith(upscalePrefix));
const bundleFiles = allBundleFiles.filter(url => !url.startsWith(upscalePrefix));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const assets = [...bundleFiles, ...css, ...fonts, ...iconFiles, '/manifest.json'];
const shell = `<!doctype html><html lang="en" data-offline-app="true" data-upscale-runtime="/offline/${buildId}/upscale-runtime"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Comic Reader"><title>Comic Reader</title><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">${[...css, ...bundleFiles.filter(url => url.endsWith('.css'))].map(url => `<link rel="stylesheet" href="${escape(url)}">`).join('')}</head><body class="${escape(bodyClass)}"><div id="offline-root"><p>Opening your library…</p></div><script type="module" src="/offline/${buildId}/app.js"></script></body></html>`;
const shellPath = `/offline/${buildId}/index.html`;
await writeFile(`public${shellPath}`, shell);
await writeFile('public/offline/index.html', shell);
const worker = await readFile('offline/service-worker.js', 'utf8');
await writeFile('public/sw.js', `const APP_CACHE = ${JSON.stringify(`comic-reader-app-${buildId}`)};\nconst UPSCALE_CACHE = ${JSON.stringify(`comic-reader-upscale-runtime-${buildId}`)};\nconst SHELL = ${JSON.stringify(shellPath)};\nconst PRECACHE = ${JSON.stringify([shellPath, ...assets])};\nconst UPSCALE_RUNTIME = ${JSON.stringify(upscaleRuntime)};\n${worker}`);
console.log(`Offline reader built: ${assets.length + 1} precached assets (+${upscaleRuntime.length} on-demand upscale runtime assets), version ${buildId}`);
