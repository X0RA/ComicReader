import { test as base } from '@playwright/test';
export { expect } from '@playwright/test';

// WebKit's ephemeral context rejects IndexedDB Blob writes. The installed app
// uses persistent storage. An empty profile path creates a fresh temporary profile.
export const test = base.extend({
  context: async ({ browserName, playwright, context, baseURL, viewport, hasTouch }, use) => {
    if (browserName !== 'webkit') return use(context);
    const profile = await playwright.webkit.launchPersistentContext('', { baseURL, viewport, hasTouch });
    try { await use(profile); } finally { await profile.close(); }
  },
});
