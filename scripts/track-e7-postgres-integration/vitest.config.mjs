const config = {
  root: process.cwd(),
  test: {
    include: ['scripts/track-e7-postgres-integration/editor-workflow.integration.test.mjs'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
  },
}

export default config
