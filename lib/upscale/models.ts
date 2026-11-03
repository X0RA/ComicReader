export interface UpscaleSettings {
  upscaleModel: "off" | "anime4k" | "anime-v3" | "cugan" | "anime-sharp";
  upscaleMode: "A" | "B" | "C";
  upscaleScale: "2" | "3" | "4";
  upscaleDenoise: "conservative" | "none" | "denoise3x";
  upscaleJobs: number;
}
export interface UpscaleModel {
  id: string; label: string; url: string; bytes: number; sha256: string; scale: number; multiple: number;
}
export const UPSCALE_MODELS: readonly UpscaleModel[] = [
  {
    "id": "anime-sharp",
    "label": "AnimeSharp V3",
    "url": "/upscale-models/2x-AnimeSharp.onnx",
    "bytes": 67026738,
    "sha256": "f169a47dbfc03b0eeba725ffa4c387b49bcf728a9f2d9d9bf1ff2d0218687975",
    "scale": 2,
    "multiple": 2
  },
  {
    "id": "cugan-2-conservative",
    "label": "Real-CUGAN \u00b7 2\u00d7 Conservative",
    "url": "/upscale-models/up2x-conservative.onnx",
    "bytes": 5164398,
    "sha256": "35094231850a60ece725cdd9b06098c06be3b5fb9232782246d3d2c4e77da0b6",
    "scale": 2,
    "multiple": 4
  },
  {
    "id": "cugan-2-none",
    "label": "Real-CUGAN \u00b7 2\u00d7 No denoise",
    "url": "/upscale-models/up2x-no-denoise.onnx",
    "bytes": 5164398,
    "sha256": "0aafc80b5262922b090f42439c8287e80cee5fd84e48ac46b8672ebe41f01ac6",
    "scale": 2,
    "multiple": 4
  },
  {
    "id": "cugan-2-denoise3x",
    "label": "Real-CUGAN \u00b7 2\u00d7 Strong denoise",
    "url": "/upscale-models/up2x-denoise3x.onnx",
    "bytes": 5164398,
    "sha256": "4245098d847f8e59391248901d66ba922c63679490269db5d885988975532898",
    "scale": 2,
    "multiple": 4
  },
  {
    "id": "cugan-3-conservative",
    "label": "Real-CUGAN \u00b7 3\u00d7 Conservative",
    "url": "/upscale-models/up3x-conservative.onnx",
    "bytes": 5171312,
    "sha256": "fefa502b4387975cac40f1b13d04d520b542d63ec7d8d477944a58481aab6e4e",
    "scale": 3,
    "multiple": 4
  },
  {
    "id": "cugan-4-conservative",
    "label": "Real-CUGAN \u00b7 4\u00d7 Conservative",
    "url": "/upscale-models/up4x-conservative.onnx",
    "bytes": 5655498,
    "sha256": "3a340135eb6aeee1d6e8bcfa50dbefa64c5a078f6459fcd5525732f9cc5499c3",
    "scale": 4,
    "multiple": 4
  },
  {
    "id": "anime-v3",
    "label": "Real-ESRGAN Anime v3",
    "url": "/upscale-models/realesr-animevideov3.onnx",
    "bytes": 2495481,
    "sha256": "cb530f8e55aaa1b39061ccaed885ba5ceb31da99ac23e93a3c0c73e6ef099005",
    "scale": 4,
    "multiple": 1
  },
  {
    "id": "anime4k-a",
    "label": "Anime4K \u00b7 Mode A",
    "url": "/upscale-models/anime4k-v4-mode-a-x2.onnx",
    "bytes": 84451,
    "sha256": "bdfb1fcef104eaa675e5ed1e4458ae0ea3fd22045cadb495742b68d389a6a204",
    "scale": 2,
    "multiple": 2
  },
  {
    "id": "anime4k-b",
    "label": "Anime4K \u00b7 Mode B",
    "url": "/upscale-models/anime4k-v4-mode-b-x2.onnx",
    "bytes": 84456,
    "sha256": "228b4210968ad0b2bacffbf056b79393846f6bba30e39d20c916c139544719ae",
    "scale": 2,
    "multiple": 2
  },
  {
    "id": "anime4k-c",
    "label": "Anime4K \u00b7 Mode C",
    "url": "/upscale-models/anime4k-v4-mode-c-x2.onnx",
    "bytes": 41894,
    "sha256": "ff726ee09d9b98b653c1c04f14b1fc2c26131bfa8f652142084d79b672d5d338",
    "scale": 2,
    "multiple": 2
  }
];
export function selectedUpscaleModel(settings: UpscaleSettings): UpscaleModel | undefined {
  const id = settings.upscaleModel === "anime4k" ? `anime4k-${settings.upscaleMode.toLowerCase()}`
    : settings.upscaleModel === "cugan" ? `cugan-${settings.upscaleScale}-${settings.upscaleScale === "2" ? settings.upscaleDenoise : "conservative"}`
    : settings.upscaleModel;
  return UPSCALE_MODELS.find(model => model.id === id);
}
