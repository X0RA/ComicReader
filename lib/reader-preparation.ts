export const READER_PREPARE_RADIUS = 8;

/** One-based page numbers, current first, then alternating ahead and behind. */
export function readerPreparationWindow(total: number, current: number): number[] {
  if (total < 1) return [];
  const centre = Math.max(1, Math.min(total, Math.trunc(current) || 1));
  const pages = [centre];
  for (let distance = 1; distance <= READER_PREPARE_RADIUS; distance++) {
    if (centre + distance <= total) pages.push(centre + distance);
    if (centre - distance >= 1) pages.push(centre - distance);
  }
  return pages;
}

/** Finish the opening window before publishing it. After that, prepare one page
 * per turn of the event loop so reading stays responsive. Re-evaluate priority
 * after every page, including when the reader jumps ahead of background work.
 */
export async function prepareReaderPages({ total, initialPage, currentPage, prepare, opened, progress, signal }: {
  total: number;
  initialPage: number;
  currentPage: () => number;
  prepare: (page: number) => Promise<void>;
  opened: () => void | Promise<void>;
  progress: (completed: number, openingTotal: number, background: boolean) => void;
  signal: AbortSignal;
}): Promise<void> {
  const opening = readerPreparationWindow(total, initialPage);
  const pending = new Set(Array.from({ length: total }, (_, index) => index + 1));
  let cursor = 0, completed = 0;
  const run = async (number: number, background: boolean) => {
    signal.throwIfAborted();
    pending.delete(number);
    await prepare(number);
    signal.throwIfAborted();
    progress(++completed, opening.length, background);
  };
  await Promise.all(Array.from({ length: Math.min(3, opening.length) }, async () => {
    while (cursor < opening.length && !signal.aborted) await run(opening[cursor++], false);
  }));
  signal.throwIfAborted();
  await opened();
  while (pending.size) {
    // Always yield, even when archive extraction and image decoding are cached.
    await new Promise<void>(resolve => setTimeout(resolve, 16));
    signal.throwIfAborted();
    const centre = Math.max(1, Math.min(total, currentPage()));
    let next = -1, distance = Infinity;
    for (const number of pending) {
      const candidate = Math.abs(number - centre);
      if (candidate < distance || (candidate === distance && number > next)) { next = number; distance = candidate; }
    }
    await run(next, true);
  }
}
