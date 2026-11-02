import { defineConfig } from '@playwright/test'

// Run through `node e2e/save-v2/run.mjs`: it resets the local test database and sets
// NAVI_STUDIO_DATABASE_URL. The dev server talks only to 127.0.0.1 (local DB, auth stub);
// the spec blocks every browser request that leaves 127.0.0.1.
const databaseUrl = process.env.NAVI_STUDIO_DATABASE_URL ?? ''
if (!databaseUrl.includes('@127.0.0.1:55434/navi_savev2_test')) {
  throw new Error('Run the Save v2 probe through e2e/save-v2/run.mjs (local test database only).')
}

export default defineConfig({
  testDir: '.',
  testMatch: ['save-behaviour.spec.ts', 'parity.spec.ts', 'terrain.spec.ts'],
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  outputDir: '../../reports/save-v2/raw/playwright-output',
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3118', headless: true, trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: 'node scripts/track-e8-browser-acceptance/auth-stub.mjs',
      cwd: '../..',
      url: 'http://127.0.0.1:45678/health',
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3118',
      cwd: '../..',
      url: 'http://127.0.0.1:3118/login',
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: 'development',
        // Supabase clients point at the local synthetic stub; nothing reaches a real project.
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:45678',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e8-local-synthetic-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: '',
        NEXT_PUBLIC_MOCK_AUTH: 'true',
        NEXT_PUBLIC_NAVI_SAVE_V2: '1',
        NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS: '1',
        // NAVI Web reads only Save v2 publications (P10, P12).
        NAVI_SAVE_V2_PUBLIC_READ: '1',
        NAVI_STUDIO_DATABASE_URL: databaseUrl,
        NAVI_PROTECTED_CAMPUS_WRITES: '',
      },
    },
  ],
})
