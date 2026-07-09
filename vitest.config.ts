import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'packages/core/src/**/*.test.ts', 'packages/editor/src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    server: {
      deps: {
        inline: ['maplibre-gl'],
      },
    },
  },
})
