'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 6000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'off',
    actionTimeout: 10000,
    navigationTimeout: 15000
  },
  outputDir: 'test-results/artifacts',
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3100/health',
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      TEST_MODE: '1',
      PORT: '3100',
      DATA_FILE: 'data/test-db.json'
    }
  }
});
