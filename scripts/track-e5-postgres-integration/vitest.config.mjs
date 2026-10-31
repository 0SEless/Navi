export default {
  root: process.cwd(),
  test: {
    include: ['scripts/track-e5-postgres-integration/real-adapter.integration.test.mjs'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
  },
}
