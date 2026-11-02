This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Validation

Run `npm run build` to compile the app and check TypeScript. The legacy
`npm run lint` command was removed because Next.js 16 no longer provides
`next lint`; the current Next.js ESLint integration does not support TypeScript 7.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Browser storage

Comic metadata and reading progress use Dexie / IndexedDB schema v3. Archive
bytes stream into private OPFS files when a write/read probe and Web Locks are
available. Other environments keep archive Blobs in IndexedDB, separately from
metadata queries. There is no browser API access during server rendering.

Downloads and migration use per-comic writer locks. Readers hold shared per-comic
leases, so a slow transfer or migration does not block unrelated comics. Only
short metadata publication and orphan-sweep operations use the origin-wide lock.
Leaving the reader cancels its download interest; a transfer continues if another
local caller still needs it. Cancelled attempts are never reused on reopening.
Without Web Locks, serialization is limited to the current tab; older insecure
origins still support the IndexedDB fallback, but not cross-tab exclusion.
Cancellation is broadcast between tabs when supported.

Existing v2 downloads migrate one at a time, keeping the original Blob until a
complete byte comparison succeeds. Insufficient space defers migration. Startup
maintenance removes interrupted downloads and unreferenced files. Download
metadata is the publication record; a file alone never counts as a download.

The cache budget is the smaller of 2 GiB and 25% of the browser's estimated quota.
Eviction runs after successful foreground downloads, uses last-opened time, and
preserves reading progress and the newest comic even if it exceeds the budget.
Preloads skip downloads that would exceed the budget and never evict existing
comics. Quota failures leave existing comics intact; free space explicitly and
retry. Transient file-read and reader/extraction errors preserve cached archives. Persistence can be
requested from the downloads page; it does not prevent deliberate site-data
clearing. This is a disposable cache, not a guaranteed offline app shell.

The reader still uses JSZip to extract every image. URL cleanup and natural page
sorting are fixed, but lazy extraction, workers, resumable HTTP downloads and an
offline service worker remain separate follow-up work.

### Validation

- `npm run build` checks production compilation and types.
- `npx playwright install chromium firefox webkit` installs test browsers.
- `npm run test:storage` exercises the real storage modules against browser
  IndexedDB, OPFS and Web Locks using a standalone local fixture server. The test
  harness is not shipped as an application route.
- Before claiming performance improvements, compare 44 MB and 330 MB archives
  on actual Android and iOS devices: download/publish time, peak memory, time to
  first page, and storage reclaimed after deletion. Desktop browser tests do not
  establish mobile performance or durability under OS-level termination.
