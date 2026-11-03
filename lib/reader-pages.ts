export interface PageSize { width: number; height: number }
export interface CropBounds { left: number; top: number; right: number; bottom: number }
export interface ReaderPage extends PageSize { url: string; name: string; crop: CropBounds; tightCrop: CropBounds }
export const FULL_PAGE: CropBounds = { left: 0, top: 0, right: 1, bottom: 1 };

/** Interpolate prepared bounds, so adjusting tightness never triggers image work. */
export function readerCropBounds(page: ReaderPage, enabled: boolean, tightness: number): CropBounds {
  if (!enabled) return FULL_PAGE;
  const amount = Number.isFinite(tightness) ? Math.max(0, Math.min(100, tightness)) / 100 : 0;
  const blend = (key: keyof CropBounds) => page.crop[key] + (page.tightCrop[key] - page.crop[key]) * amount;
  return { left: blend("left"), top: blend("top"), right: blend("right"), bottom: blend("bottom") };
}

export function croppedPageSize(page: PageSize, bounds: CropBounds): PageSize {
  return { width: page.width * (bounds.right - bounds.left), height: page.height * (bounds.bottom - bounds.top) };
}

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

/** Find near-neutral paper/black margins without letting isolated scan specks
 * stop a whole edge. Work on the preparation thumbnail, never the visible image.
 * Each edge gets its own background estimate; no assumption of symmetric margins.
 */
export function detectTightMargins(data: Uint8ClampedArray, width: number, height: number): CropBounds {
  if (width < 8 || height < 8 || data.length !== width * height * 4) return { ...FULL_PAGE };
  const result = { ...FULL_PAGE };
  const cache = new Map<string, CropBounds>();
  const background = (vertical: boolean, end: boolean): number[] | undefined => {
    const channels: number[][] = [[], [], []];
    const length = vertical ? height : width;
    for (let offset = 0; offset < length; offset++) {
      const x = vertical ? (end ? width - 1 : 0) : offset;
      const y = vertical ? offset : (end ? height - 1 : 0);
      const i = (y * width + x) * 4;
      // Transparent borders are ambiguous; do not infer a paper colour from them.
      if (data[i + 3] < 250) return;
      for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
    }
    const median = channels.map(values => values.sort((a, b) => a - b)[Math.floor(length / 2)]);
    const min = Math.min(...median), max = Math.max(...median);
    if (max <= 40 || (min >= 200 && max - min <= 55)) return median;
  };
  const contentBounds = (colour: number[]): CropBounds => {
    const key = colour.join(",");
    const cached = cache.get(key);
    if (cached) return cached;
    const mask = new Uint8Array(width * height);
    for (let pixel = 0; pixel < mask.length; pixel++) {
      const i = pixel * 4;
      mask[pixel] = data[i + 3] < 250 || colour.some((value, c) => Math.abs(data[i + c] - value) > 18) ? 1 : 0;
    }
    // An eight-connected mark with at least three pixels is content, including
    // thin lines, lettering and page numbers. Only isolated one/two-pixel marks
    // are dust. Local neighbour checks avoid labelling the entire artwork.
    const neighbour = (pixel: number, except = -1): number => {
      const x = pixel % width, y = Math.floor(pixel / width);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const index = ny * width + nx;
          if (index !== pixel && index !== except && mask[index]) return index;
        }
      }
      return -1;
    };
    let left = width, top = height, right = 0, bottom = 0;
    for (let pixel = 0; pixel < mask.length; pixel++) {
      if (!mask[pixel]) continue;
      if (data[pixel * 4 + 3] >= 250) {
        const first = neighbour(pixel);
        if (first < 0 || (neighbour(pixel, first) < 0 && neighbour(first, pixel) < 0)) continue;
      }
      const x = pixel % width, y = Math.floor(pixel / width);
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
    // A blank page or an unusually wide margin is ambiguous. Keep the existing
    // 15% safety limit per edge, and a quarter sample pixel of antialias padding.
    const bounds = right === 0 ? { ...FULL_PAGE } : {
      left: left < width * .15 ? Math.max(0, left - .25) / width : 0,
      top: top < height * .15 ? Math.max(0, top - .25) / height : 0,
      right: right > width * .85 ? Math.min(width, right + .25) / width : 1,
      bottom: bottom > height * .85 ? Math.min(height, bottom + .25) / height : 1,
    };
    cache.set(key, bounds);
    return bounds;
  };
  for (const [edge, vertical, end] of [
    ["left", true, false], ["right", true, true], ["top", false, false], ["bottom", false, true],
  ] as const) {
    const colour = background(vertical, end);
    if (colour) result[edge] = contentBounds(colour)[edge];
  }
  return result;
}

export function archiveImageNames(names: readonly string[]): string[] {
  return names.filter(name => !name.split("/").some(part => part.startsWith(".") || part === "__MACOSX") && /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}
