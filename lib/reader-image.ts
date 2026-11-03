import { detectUniformMargins, FULL_PAGE, type CropBounds, type ReaderPage } from "./reader-pages";

function imageCrop(image: HTMLImageElement): CropBounds {
  const canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, 500 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(8, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(8, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return FULL_PAGE;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return detectUniformMargins(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  } catch {
    // A failed canvas read must not prevent an otherwise readable page from opening.
    return FULL_PAGE;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Prepare geometry during the existing decode pass, before pages reach the view.
 * Keep bounds even when cropping is off so toggling it never needs another decode.
 */
export function prepareReaderPage(url: string, name: string): Promise<ReaderPage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const release = () => { image.onload = image.onerror = null; image.src = ""; };
    image.onload = () => {
      const page = { url, name, width: image.naturalWidth, height: image.naturalHeight, crop: imageCrop(image) };
      release();
      resolve(page);
    };
    image.onerror = () => { release(); reject(new Error("A page image could not be decoded.")); };
    image.src = url;
  });
}
