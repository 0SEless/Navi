import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'track-e8-durable-scoped-save.spec.ts',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3108', headless: true },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3108',
    url: 'http://127.0.0.1:3108/',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: 'development',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:65432',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e8-browser-test-no-auth',
      NAVI_STUDIO_DURABLE_SCOPED_SAVE: '0',
      NEXT_PUBLIC_NAVI_STUDIO_DURABLE_SCOPED_SAVE: 'false',
    },
  },
})
