# Comic Reader

A web-based comic reader built with Next.js, React, TypeScript, and Tailwind CSS. Browse a comic library, read ZIP/CBZ archives, and pick up where you left off with saved reading progress.

- Browse a folder-based library and sort comics by name, size, or file type.
- Read in a responsive, vertically scrolling layout with previous/next comic navigation.
- Automatically track your current page and reading status, then resume where you left off.
- Bookmark pages with optional notes, browse them across comics, or open the current comic's bookmark sidebar.
- Zoom at the mouse pointer with the desktop mouse wheel, drag to pan, and reset to your reading size.
- Manually upscale nearby pages with Anime4K, Real-ESRGAN Anime v3, Real-CUGAN, or AnimeSharp V3, with pause/resume and 1–3 parallel jobs.
- Return to your last-opened folder and manage downloaded comics.

The app loads its catalogue from a hosted JSON file. Opening a comic downloads its ZIP/CBZ archive, extracts the page images in your browser, and displays them in order. Saved downloads are reused when available, and the next comic can preload in the background. Reading progress and bookmarks stay on your device. Clearing downloads keeps bookmarks; resetting all app storage removes them.

## Getting started

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).

## Comic source

[example_data.json](example_data.json) shows a small catalogue: folders contain `children`, and each comic has a display `name`, a `size` in bytes, an `extension` (`cbz` or `zip`), and a `link` to its archive. Give every folder and comic a unique, stable string `id`. Reading progress is managed by the app and does not need to be included.

To use your own catalogue, change the URL passed to `fetch()` in `updateFromRemoteDB()` in [lib/dexieDB.ts](lib/dexieDB.ts). Each comic's `link` in your JSON controls where its archive downloads from. Replace the example URLs and sizes with your own; `example_data.json` is a template and is not loaded automatically.

## Production

```bash
npm run build
npm start
```

## Browser upscaling

Choose a model in **View options → Upscaling**, then click **Render from here** in
the reader header. Selecting a model never starts a download or render. The
current page/spread goes first, followed by the selected number of pages ahead (0–32; default 8). Reading
forward continues an already-started job; pause and stop are available in its
progress panel. The render-ahead slider updates an active job without restarting it; zero renders only the current page/spread. The memory budget can limit both parallel jobs and the number of prepared pages, with an explanation in the progress panel. Going back to evicted pages requires another explicit start.

Verified model weights stay in browser storage; enhanced pages only live in a
bounded memory buffer and are discarded when leaving the comic. Clear cached
weights in Upscaling settings. Changing the model, its mode/scale, or job count
stops the current job. GPU acceleration requires a WebGPU-capable browser and
hardware. One job is the default; more jobs may be slower on some devices.

Model artifacts, licenses, runtime/build details and GPU test instructions are
documented in [public/upscale-models/README.md](public/upscale-models/README.md).
AnimeSharp V3 carries a non-commercial license.
