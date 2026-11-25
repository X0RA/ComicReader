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
        try { await writer.write('ok'); await writer.close(); }
        catch (error) { await writer.abort().catch(() => {}); throw error; }
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
interface Waiter { mode: LockMode; start: () => void }
interface LocalLock { readers: number; writing: boolean; queue: Waiter[] }
const queues = new Map<string, LocalLock>();
function drain(name: string, lock: LocalLock) {
  while (!lock.writing && lock.queue.length) {
    const next = lock.queue[0];
    if (lock.readers && next.mode === 'exclusive') return;
    lock.queue.shift();
    if (next.mode === 'exclusive') lock.writing = true; else lock.readers++;
    next.start();
  }
  if (!lock.writing && !lock.readers && !lock.queue.length) queues.delete(name);
}
export async function namedLock<T>(name: string, fn: () => Promise<T>, mode: LockMode = 'exclusive', signal?: AbortSignal): Promise<T> {
  if (navigator.locks) return navigator.locks.request(name, { mode, signal }, fn);
  signal?.throwIfAborted();
  const lock = queues.get(name) ?? { readers: 0, writing: false, queue: [] };
  queues.set(name, lock);
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      lock.queue.splice(lock.queue.indexOf(waiter), 1);
      drain(name, lock);
      reject(signal?.reason);
    };
    const waiter: Waiter = { mode, start: async () => {
      signal?.removeEventListener('abort', abort);
      try { resolve(await fn()); } catch (error) { reject(error); }
      finally {
        if (mode === 'exclusive') lock.writing = false; else lock.readers--;
        drain(name, lock);
      }
    } };
    signal?.addEventListener('abort', abort, { once: true });
    lock.queue.push(waiter);
    drain(name, lock);
  });
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
  const view = new DataView(tail.buffer);
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6 &&
        i + 22 + view.getUint16(i + 20, true) === tail.length) {
      const offset = view.getUint32(i + 16, true), size = view.getUint32(i + 12, true);
      const count = view.getUint16(i + 10, true);
      if (count && size >= 46 * count && offset + size === blob.size - tail.length + i) {
        const signature = new DataView(await blob.slice(offset, offset + 4).arrayBuffer());
        if (signature.getUint32(0, true) === 0x02014b50) return;
      }
    }
  }
  const { default: JSZip } = await import('jszip');
  await JSZip.loadAsync(blob); // Compatibility path for unusual but valid ZIP layouts.
}
