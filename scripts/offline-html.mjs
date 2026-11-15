import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Next.js can emit prerendered HTML in either the legacy app directory or
// the source-route-keyed cache. Do not assume the local build's layout on CI.
export async function readHomeHtml(serverDirectory) {
  const legacy = join(serverDirectory, 'app', 'index.html');
  try {
    return await readFile(legacy, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const cache = join(serverDirectory, 'route-cache', 'APP_PAGE');
  let entries;
  try {
    entries = await readdir(cache, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      return await readFile(join(cache, entry.name, '$', 'index.html'), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Cannot build the offline shell: no prerendered home HTML in ${legacy} or ${cache}.`);
}
