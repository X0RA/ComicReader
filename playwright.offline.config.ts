import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './offline-tests', fullyParallel: false, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4322', viewport: { width: 390, height: 844 }, hasTouch: true },
  webServer: [
    { command: 'npm run start -- --port 4321', url: 'http://127.0.0.1:4321', reuseExistingServer: false },
    { command: 'node offline-tests/server.mjs', url: 'http://127.0.0.1:4322', reuseExistingServer: false },
  ],
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({ name: browserName, use: { browserName: browserName as 'chromium' | 'firefox' | 'webkit' } })),
});
