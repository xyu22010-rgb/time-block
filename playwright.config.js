// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  /* 🌈 這裡「只留這一個」use 區塊，把舊的全部刪掉 */
  use: {
    /* 強制指向 127.0.0.1，避免 localhost 找不到路 */
    baseURL: 'http://127.0.0.1:5173',

    /* 只在第一次重試時紀錄追蹤 (Trace) */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    // 增加 --host 確保它強制監聽 127.0.0.1
    command: 'npm run dev -- --host 127.0.0.1', 
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    // 雲端電腦慢，我們給它 5 分鐘時間啟動
    timeout: 300000, 
  },

});