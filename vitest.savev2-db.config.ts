import { defineConfig } from 'vitest/config'
import path from 'path'

// Database tests for Save v2. They need the disposable Postgres from
// scripts/save-v2/db-up.ps1 and are excluded from the default `vitest run`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/studio-v2/db/**/*.db.test.ts'],
    fileParallelism: false,
  },
})
