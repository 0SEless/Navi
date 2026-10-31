export default {
  root: process.cwd(),
  test: {
    include: ['scripts/track-e8-browser-acceptance/postgres-browser-acceptance.integration.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
}
