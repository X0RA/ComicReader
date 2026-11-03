"use client";
import { useEffect, useRef, useState } from "react";
import type { ReaderPage } from "@/lib/reader-pages";
import type { ReaderSettings } from "@/lib/reader-settings";
import { selectedUpscaleModel } from "@/lib/upscale/models";
import { BrowserUpscaleWorker, checkUpscaleSupport } from "@/lib/upscale/client";
import { loadUpscaleModel } from "@/lib/upscale/model-cache";
import { UpscaleQueue, type UpscaleState } from "@/lib/upscale/queue";
const EMPTY: UpscaleState = { status: "idle", download: 0, active: [], images: new Map(), rendered: 0, bytes: 0 };
export function useUpscaling(pages: ReaderPage[], visible: number[], settings: ReaderSettings, phone: boolean) {
  const model = selectedUpscaleModel(settings);
  const queue = useRef<UpscaleQueue | undefined>(undefined);
  const [state, setState] = useState(EMPTY);
  const latest = useRef({ pages, visible });
  latest.current = { pages, visible };
  useEffect(() => {
    setState(EMPTY);
    if (!model) return;
    let alive = true;
    const instance = new UpscaleQueue(model, settings.upscaleJobs, (phone ? 384 : 768) * 1024 ** 2, {
      check: checkUpscaleSupport,
      load: (signal, progress) => loadUpscaleModel(model, signal, progress),
      worker: weights => new BrowserUpscaleWorker(model, weights),
      decode: async result => {
        const url = URL.createObjectURL(result.blob), image = new Image();
        image.src = url;
        try { await image.decode(); }
        catch (error) { URL.revokeObjectURL(url); throw error; }
        return { url, bytes: result.blob.size + result.width * result.height * 4, release: () => { image.src = ""; URL.revokeObjectURL(url); } };
      },
      publish: value => { if (alive) setState(value); },
    });
    queue.current = instance;
    instance.update(latest.current.pages, latest.current.visible);
    return () => { alive = false; instance.dispose(); queue.current = undefined; };
  }, [model, settings.upscaleJobs, phone]);
  const visibleKey = visible.join(",");
  useEffect(() => { queue.current?.update(pages, latest.current.visible); }, [pages, visibleKey]);
  return { model, state, start: () => { void queue.current?.start(); }, pause: () => queue.current?.pause(), resume: () => queue.current?.resume(), stop: () => queue.current?.stop() };
}
export type Upscaling = ReturnType<typeof useUpscaling>;
