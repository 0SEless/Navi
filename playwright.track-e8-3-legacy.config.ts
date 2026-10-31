import { defineConfig } from '@playwright/test'

const env = process.env

export default defineConfig({
  testDir: './e2e',
  testMatch: 'track-e8-3-legacy-save.spec.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  outputDir: env.NAVI_E8_LEGACY_RUN_DIR ?? 'reports/navi-studio-1.5-track-e8-3/logs/legacy-output',
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
        NAVI_STUDIO_DURABLE_SCOPED_SAVE: '0',
        NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS: 'false',
        NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY: 'false',
        NEXT_PUBLIC_NAVI_STUDIO_DURABLE_SCOPED_SAVE: 'false',
        NAVI_E8_LEGACY_CAMPUS_ID: env.NAVI_E8_LEGACY_CAMPUS_ID ?? 'navi-e8-legacy-synthetic',
      },
    },
  ],
})
