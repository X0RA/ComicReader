/** Browser-only file operations. No browser APIs run during server rendering. */
let capability: Promise<boolean> | undefined;
export const OPFS_WRITES_ENABLED = true;
export async function archiveDirectory() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle('archives', { create: true });
}
export function supportsOPFS() {
  return capability ??= (async () => {
    if (!OPFS_WRITES_ENABLED || !navigator.storage?.getDirectory || !navigator.locks) return false;
    const name = `.probe-${uniqueId()}`;
    try {
      const dir = await archiveDirectory();
      try {
        const handle = await dir.getFileHandle(name, { create: true });
        const writer = await handle.createWritable();
        await writer.write('ok');
        await writer.close();
        return await (await handle.getFile()).text() === 'ok';
      } finally { await dir.removeEntry(name).catch(() => {}); }
    } catch { return false; }
  })();
}
export async function openArchive(name: string) {
  return (await (await archiveDirectory()).getFileHandle(name)).getFile();
}
export async function removeArchive(name: string) {
  try { await (await archiveDirectory()).removeEntry(name); }
  catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
}
export async function writeArchive(name: string, stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const file = await (await archiveDirectory()).getFileHandle(name, { create: true });
  const writer = await file.createWritable();
  try { await stream.pipeTo(writer, { signal }); }
  catch (error) { await removeArchive(name).catch(() => {}); throw error; }
  return openArchive(name);
}
// IDs also work on plain HTTP, where randomUUID is unavailable.
export function uniqueId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
const queues = new Map<string, Promise<unknown>>();
export function namedLock<T>(name: string, fn: () => Promise<T>, mode: 'shared' | 'exclusive' = 'exclusive', signal?: AbortSignal): Promise<T> {
  if (navigator.locks) return navigator.locks.request(name, { mode, signal }, fn);
  const run = async () => { signal?.throwIfAborted(); return fn(); };
  const result = (queues.get(name) ?? Promise.resolve()).then(run, run);
  const tail = result.catch(() => {});
  queues.set(name, tail);
  void tail.finally(() => { if (queues.get(name) === tail) queues.delete(name); });
  return result;
}
export async function tryLock<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (navigator.locks) return navigator.locks.request(name, { ifAvailable: true }, lock => lock ? fn() : undefined);
  if (queues.has(name)) return undefined;
  return namedLock(name, fn);
}
export const writerKey = (id: string) => `comic-writer:${id}`;
export const leaseKey = (id: string) => `comic-reader:${id}`;
export const storageLock = <T>(fn: () => Promise<T>) => namedLock('comic-storage-v3', fn);
export async function verifyZip(blob: Blob) {
  const tail = new Uint8Array(await blob.slice(-1024 * 1024).arrayBuffer());
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6 &&
        i + 22 + tail[i + 20] + (tail[i + 21] << 8) <= tail.length) return;
  }
  const { default: JSZip } = await import('jszip');
  await JSZip.loadAsync(blob); // Compatibility path for unusual but valid ZIP layouts.
}
