import { defineConfig } from '@playwright/test'

const chromePath = process.env.NAVI_TEST_CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const draftsDisabled = process.env.NAVI_TRACK_C1_DRAFTS_DISABLED === '1'
const scopedHistoryMode = process.env.NAVI_TRACK_E2_SCOPED_HISTORY === '1' ? 'flag-on' : 'flag-off'
const appPort = Number(process.env.NAVI_TRACK_C1_PORT ?? (draftsDisabled ? 3188 : 3187))
const authPort = Number(process.env.NAVI_TRACK_C1_AUTH_PORT ?? (draftsDisabled ? 3990 : 3989))
const healthPort = Number(process.env.NAVI_TRACK_C1_HEALTH_PORT ?? (draftsDisabled ? 4190 : 4189))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/track-c1-local-drafts.spec.ts',
  outputDir: './reports/navi-studio-1.5-track-e2/logs/playwright-artifacts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: `./reports/navi-studio-1.5-track-e2/logs/playwright-results-${scopedHistoryMode}.json` }]],
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    headless: true,
    launchOptions: { executablePath: chromePath },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/support/track-c1-local-server.mjs',
    env: {
      NAVI_TRACK_C1_PORT: String(appPort),
      NAVI_TRACK_C1_AUTH_PORT: String(authPort),
      NAVI_TRACK_C1_HEALTH_PORT: String(healthPort),
    },
    url: `http://127.0.0.1:${healthPort}/ready`,
    reuseExistingServer: process.env.NAVI_TRACK_E2_REUSE_VERIFIED_SERVER === '1',
    timeout: 180_000,
  },
})
