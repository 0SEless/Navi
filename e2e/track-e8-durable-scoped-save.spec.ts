import { expect, test } from '@playwright/test'

test.describe('E8 durable scoped-save browser gate', () => {
  test('GET and POST stay disabled by default before authentication or PostgreSQL access', async ({ request }) => {
    const getResponse = await request.get('/api/studio/scoped-save?campusId=e8-browser-synthetic')
    expect(getResponse.status()).toBe(404)
    expect(await getResponse.json()).toMatchObject({ ok: false, code: 'DISABLED' })

    const postResponse = await request.post('/api/studio/scoped-save', {
      data: { campusId: 'e8-browser-synthetic', expectedCampusRevision: 0, operations: [] },
    })
    expect(postResponse.status()).toBe(404)
    expect(await postResponse.json()).toMatchObject({ ok: false, code: 'DISABLED' })
  })
})
