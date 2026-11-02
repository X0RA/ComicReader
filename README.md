# Comic Reader

A web-based comic reader built with Next.js, React, TypeScript, and Tailwind CSS. Browse a comic library, read ZIP/CBZ archives, and pick up where you left off with saved reading progress.

- Browse a folder-based library and sort comics by name, size, or file type.
- Read in a responsive, vertically scrolling layout with previous/next comic navigation.
- Automatically track your current page and reading status, then resume where you left off.
- Return to your last-opened folder and manage downloaded comics.

The app loads its catalogue from a hosted JSON file. Opening a comic downloads its ZIP/CBZ archive, extracts the page images in your browser, and displays them in order. Saved downloads are reused when available, and the next comic can preload in the background. Reading progress stays on your device.

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
