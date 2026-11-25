import { detectTightMargins, detectUniformMargins, FULL_PAGE, type CropBounds, type ReaderPage } from "./reader-pages";

function imageCrops(image: HTMLImageElement): { crop: CropBounds; tightCrop: CropBounds } {
  const canvas = document.createElement("canvas");
  const fallback = { crop: FULL_PAGE, tightCrop: FULL_PAGE };
  try {
    const scale = Math.min(1, 500 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(8, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(8, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const crop = detectUniformMargins(data, canvas.width, canvas.height);
    const tight = detectTightMargins(data, canvas.width, canvas.height);
    // Increasing tightness must never undo a known uniform-margin crop.
    const tightCrop = { left: Math.max(crop.left, tight.left), top: Math.max(crop.top, tight.top),
      right: Math.min(crop.right, tight.right), bottom: Math.min(crop.bottom, tight.bottom) };
    return { crop, tightCrop };
  } catch {
    // A failed canvas read must not prevent an otherwise readable page from opening.
    return fallback;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Prepare geometry during the existing decode pass, before pages reach the view.
 * Keep bounds even when cropping is off so toggling it never needs another decode.
 */
export function prepareReaderPage(url: string, name: string, signal?: AbortSignal, includeCover = false): Promise<ReaderPage & { coverThumbnail?: string }> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const image = new Image();
    const release = () => {
      signal?.removeEventListener("abort", abort);
      image.onload = image.onerror = null;
      image.removeAttribute("src");
    };
    const abort = () => { release(); reject(signal?.reason); };
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) { release(); reject(new Error("The page has no image dimensions.")); return; }
      let coverThumbnail: string | undefined;
      if (includeCover) {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 128 / image.naturalWidth, 184 / image.naturalHeight);
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        try {
          const context = canvas.getContext("2d");
          if (context) {
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            coverThumbnail = canvas.toDataURL("image/jpeg", .75);
          }
        } catch { /* The cover is optional when canvas storage is unavailable. */ }
        finally { canvas.width = canvas.height = 0; }
      }
      const page = { url, name, coverThumbnail, width: image.naturalWidth, height: image.naturalHeight, ...imageCrops(image) };
      release();
      resolve(page);
    };
    image.onerror = () => { release(); reject(new Error("A page image could not be decoded.")); };
    image.src = url;
  });
}
