export interface PageSize { width: number; height: number }
export interface CropBounds { left: number; top: number; right: number; bottom: number }
export interface ReaderPage extends PageSize { url: string; name: string }
export const FULL_PAGE: CropBounds = { left: 0, top: 0, right: 1, bottom: 1 };

/** Page numbers are one-based throughout navigation and persisted progress. */
export function pairReaderPages(pages: readonly PageSize[], coverAlone: boolean, wideAlone: boolean): number[][] {
  const spreads: number[][] = [];
  let pending: number[] = [];
  pages.forEach((page, index) => {
    if ((coverAlone && index === 0) || (wideAlone && page.width > page.height)) {
      if (pending.length) spreads.push(pending);
      pending = [];
      spreads.push([index + 1]);
    } else {
      pending.push(index + 1);
      if (pending.length === 2) { spreads.push(pending); pending = []; }
    }
  });
  if (pending.length) spreads.push(pending);
  return spreads;
}

export function readerPageWidth(page: PageSize, fit: "width" | "height" | "original", availableWidth: number, availableHeight: number, zoom: number, noUpscale: boolean): number {
  const base = fit === "original" ? 1 : fit === "height" ? availableHeight / page.height : availableWidth / page.width;
  const scale = base * zoom / 100;
  return Math.max(1, page.width * (noUpscale ? Math.min(1, scale) : scale));
}

/** Conservative edge scan: every sampled pixel must be uniform black/white.
 * Only contiguous outer margins (at most 15% per edge) are removed, retaining
 * one sample pixel of padding. Full blank pages and coloured edges are untouched.
 */
export function detectUniformMargins(data: Uint8ClampedArray, width: number, height: number): CropBounds {
  if (width < 8 || height < 8 || data.length !== width * height * 4) return { ...FULL_PAGE };
  const tone = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 250) return -1;
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    return min >= 240 ? 255 : max <= 15 ? 0 : -1;
  };
  const row = (y: number, t: number) => {
    for (let x = 0; x < width; x++) if (tone(x, y) !== t) return false;
    return true;
  };
  const col = (x: number, t: number, top: number, bottom: number) => {
    for (let y = top; y < bottom; y++) if (tone(x, y) !== t) return false;
    return true;
  };
  let top = 0, bottom = height, left = 0, right = width;
  const topTone = tone(0, 0), bottomTone = tone(0, height - 1);
  if (topTone >= 0) while (top < height * .15 && row(top, topTone)) top++;
  if (bottomTone >= 0) while (bottom > height * .85 && row(bottom - 1, bottomTone)) bottom--;
  // A uniform region extending beyond the safety bound may be artwork: leave it intact.
  if (top >= height * .15) top = 0;
  if (bottom <= height * .85) bottom = height;
  const leftTone = tone(0, top), rightTone = tone(width - 1, top);
  if (leftTone >= 0) while (left < width * .15 && col(left, leftTone, top, bottom)) left++;
  if (rightTone >= 0) while (right > width * .85 && col(right - 1, rightTone, top, bottom)) right--;
  if (left >= width * .15) left = 0;
  if (right <= width * .85) right = width;
  return {
    left: Math.max(0, left - 1) / width, top: Math.max(0, top - 1) / height,
    right: Math.min(width, right + 1) / width, bottom: Math.min(height, bottom + 1) / height,
  };
}

export function archiveImageNames(names: readonly string[]): string[] {
  return names.filter(name => !name.split("/").some(part => part.startsWith(".") || part === "__MACOSX") && /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}
