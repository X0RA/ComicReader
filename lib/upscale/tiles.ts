export interface Tile { x: number; y: number; width: number; height: number; left: number; top: number; inputWidth: number; inputHeight: number }
export function upscaleTiles(width: number, height: number, tileSize = 256, overlap = 16, multiple = 1): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y += tileSize) for (let x = 0; x < width; x += tileSize) {
    const w = Math.min(tileSize, width - x), h = Math.min(tileSize, height - y);
    const left = Math.max(0, x - overlap), top = Math.max(0, y - overlap);
    tiles.push({ x, y, width: w, height: h, left, top,
      inputWidth: Math.ceil((Math.min(width, x + w + overlap) - left) / multiple) * multiple,
      inputHeight: Math.ceil((Math.min(height, y + h + overlap) - top) / multiple) * multiple });
  }
  return tiles;
}
export function reflectPixel(value: number, size: number): number {
  if (size <= 1) return 0;
  const period = 2 * (size - 1), n = ((value % period) + period) % period;
  return n < size ? n : period - n;
}
