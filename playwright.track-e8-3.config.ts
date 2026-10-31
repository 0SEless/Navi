import { defineConfig } from '@playwright/test'

const env = process.env
const outputDir = env.NAVI_E8_BROWSER_RUN_DIR ?? 'reports/navi-studio-1.5-track-e8-3/logs/playwright-output'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'track-e8-3-scoped-acceptance.spec.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  outputDir,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3118', headless: true, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node scripts/track-e8-browser-acceptance/auth-stub.mjs',
      url: 'http://127.0.0.1:45678/health',
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3118',
      url: 'http://127.0.0.1:3118/',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: 'development',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:45678',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e8-local-synthetic-anon-key',
        NEXT_PUBLIC_MOCK_AUTH: 'false',
        NAVI_STUDIO_DURABLE_SCOPED_SAVE: '1',
        NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS: 'true',
        NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY: 'true',
        NEXT_PUBLIC_NAVI_STUDIO_DURABLE_SCOPED_SAVE: 'true',
        NEXT_PUBLIC_NAVI_E8_SAVE_DIAGNOSTICS: 'true',
        NAVI_E5_PG_HOST: env.NAVI_E5_PG_HOST ?? '127.0.0.1',
        NAVI_E5_PG_PORT: env.NAVI_E5_PG_PORT ?? '55433',
        NAVI_E5_PG_DATABASE: env.NAVI_E5_PG_DATABASE ?? 'navi_e4_test',
        NAVI_E5_PG_USER: env.NAVI_E5_PG_USER ?? 'navi_e4_runner',
        NAVI_E5_PG_PASSWORD: env.NAVI_E5_PG_PASSWORD ?? '',
        NAVI_E8_BROWSER_CAMPUS_ID: env.NAVI_E8_BROWSER_CAMPUS_ID ?? '',
      },
    },
  ],
})
