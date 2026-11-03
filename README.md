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

## Offline reading / Home Screen apps

Open the installed app online once and wait for **Offline reading ready** in
the library or Storage. Download the comics you want to take offline. You can
then close the app, disconnect, reopen it, and read those downloads, including
comics whose reader page has never been visited. Bookmarks, notes, reading
progress, themes, reader settings, and JSON backups work locally too.

On iPhone/iPad, perform setup and downloads inside the installed Home Screen
app; its storage may be separate from a Safari tab. Browser storage still needs
space and can be cleared by the user or browser. Storage has a **Request
persistent storage** button. Catalog refreshes, new comic/model downloads,
and server transfer codes require a connection. GPU upscaling also needs its
runtime loaded online; basic reading and border cropping work fully offline.

Deploy with **`npm run build`** (including its `postbuild` lifecycle), then
`npm start` or Vercel. Offline support requires HTTPS, or localhost for testing;
it intentionally does not register a worker in `next dev`.

The build generates a small standalone React interface using the same reader
and library components. A versioned service worker caches that interface,
styles, fonts, and icons, and serves it on failed document navigations. This
avoids requiring Next server navigation responses for unvisited comic URLs.
Comic archives remain in their existing IndexedDB/OPFS stores. Processed pages
are not persisted. Updates install a complete new interface before activation,
wait for existing tabs to close, and remove only older app-interface caches.
Missing interface assets are repaired on the next online launch.

Production offline tests (build first):
`npx playwright test --config playwright.offline.config.ts --project=chromium --project=firefox`.
Add `--project=webkit` on a host with Playwright WebKit's system dependencies.
Tests cut off service-worker network requests as well as page requests, and
cover unvisited downloads, both archive stores, saved progress/bookmarks/options,
missing catalog entries, cache repair, and a full browser restart.

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

## Backups and device transfers

Open **Backup & transfer** from the library header, Storage, or Bookmarks.
It exports reader/upscaling settings, theme, bookmarks and their notes, reading
progress, and the last-opened comic/folder. Comic archives, catalog data, model
weights and rendered images are excluded.

- **JSON:** download or import a versioned backup file (up to 10 MiB).
- **Import link:** compressed, URL-safe Base64 data in `/import#...`. Opening it
  imports automatically, then removes the payload from the address bar. The
  fragment is not sent in HTTP requests. `/import/<payload>` is also supported
  for shorter links, but request-length limits apply to that form. Links are
  capped at 128,000 payload characters; larger backups should use JSON files.
- **Temporary code (experimental):** create a code, then enter it on another
  device's Backup & transfer page on the same site. Data is held only in server
  process memory, expires after ten minutes, and may disappear earlier. Anyone
  with the code can read it until expiry. No storage service or account is needed.

Imports add missing bookmarks using `(comicId, page)` as the identity. Existing
bookmarks, including their notes, win on duplicates. Reading progress keeps the
furthest page and completed status; navigation keeps the newer timestamp.
Settings/theme are replaced by the imported settings. Imports validate the whole
backup before writing, and bookmarks/progress/navigation merge in one IndexedDB
transaction. Re-importing a backup does not duplicate bookmarks.

The code API uses a single Node route, `POST /api/transfer`, for creation and
retrieval. A process-local cache is shared across requests to that warm instance
only. Vercel can route another request to a different instance or restart it;
there is **no guarantee** a valid code will be found, even before expiry. Use
JSON or a self-contained link when that happens. A durable shared store would
be required to guarantee cross-instance retrieval. Responses are `no-store`;
entries, bytes, request bodies and per-client attempts are bounded. Payloads
are not logged by application code. Creating a new code does not renew an old
one, and retrieval does not extend expiry.

Validation: `npx playwright test e2e/backups.spec.ts --project=chromium --project=firefox`
and `node --test lib/transfer-cache.test.mjs`.
