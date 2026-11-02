export const READER_SETTINGS_KEY = "comic-reader-view-options";

export interface ReaderSettings {
  layout: "webtoon" | "single" | "spread";
  maxWidth: number;
  gap: boolean;
  direction: "ltr" | "rtl";
  autoSpread: boolean;
  spineGap: number;
  coverAlone: boolean;
  wideAlone: boolean;
  fit: "width" | "height" | "original";
  zoom: number;
  noUpscale: boolean;
  crop: boolean;
  tapZones: "off" | "sides" | "vertical";
  swapTapZones: boolean;
  wheel: "scroll" | "turn";
  transition: "none" | "slide" | "fade";
  autoScroll: number;
  autoAdvance: boolean;
  background: "black" | "grey" | "white";
  brightness: number;
  warmth: number;
  shadow: boolean;
  greyscale: boolean;
  keepAwake: boolean;
}

export function defaultReaderSettings(phone: boolean): ReaderSettings {
  return {
    layout: phone ? "webtoon" : "spread", maxWidth: 760, gap: false,
    direction: "ltr", autoSpread: phone, spineGap: 2, coverAlone: true, wideAlone: true,
    fit: phone ? "width" : "height", zoom: 100, noUpscale: true, crop: false,
    tapZones: "sides", swapTapZones: false, wheel: "scroll", transition: "slide",
    autoScroll: 0, autoAdvance: true, background: "black", brightness: 100,
    warmth: 0, shadow: !phone, greyscale: false, keepAwake: true,
  };
}

const choices = {
  layout: ["webtoon", "single", "spread"], direction: ["ltr", "rtl"],
  fit: ["width", "height", "original"], tapZones: ["off", "sides", "vertical"],
  wheel: ["scroll", "turn"], transition: ["none", "slide", "fade"],
  background: ["black", "grey", "white"],
};
const ranges = { maxWidth: [400, 1200], spineGap: [0, 24], zoom: [50, 200], autoScroll: [0, 10], brightness: [20, 100], warmth: [0, 100] };

/** Only known, correctly typed values enter rendering or CSS; old/partial settings are safe. */
export function parseReaderSettings(raw: string | null, phone: boolean): ReaderSettings {
  const result = defaultReaderSettings(phone);
  if (!raw) return result;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return result;
    const source = saved as Record<string, unknown>;
    const target = result as unknown as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      const value = source[key];
      if (key in choices) {
        if (typeof value === "string" && (choices[key as keyof typeof choices] as readonly string[]).includes(value)) target[key] = value;
      } else if (key in ranges) {
        const [min, max] = ranges[key as keyof typeof ranges];
        if (typeof value === "number" && Number.isFinite(value)) target[key] = Math.min(max, Math.max(min, value));
      } else if (typeof value === "boolean") target[key] = value;
    }
  } catch { /* Corrupt or unavailable storage never prevents reading. */ }
  if (result.layout === "webtoon" && result.fit === "height") result.fit = "width";
  return result;
}

export function effectiveReaderLayout(settings: ReaderSettings, landscape: boolean): ReaderSettings["layout"] {
  if (settings.layout === "webtoon" || !settings.autoSpread) return settings.layout;
  return landscape ? "spread" : "single";
}

export function tapNavigation(settings: ReaderSettings, fraction: number, paged: boolean): -1 | 0 | 1 {
  if (settings.tapZones === "off" || (fraction >= 1 / 3 && fraction <= 2 / 3)) return 0;
  let direction = fraction < 1 / 3 ? -1 : 1;
  if (paged && settings.tapZones === "sides" && settings.direction === "rtl") direction *= -1;
  if (settings.swapTapZones) direction *= -1;
  return direction as -1 | 1;
}
