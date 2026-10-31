import { describe, expect, it } from 'vitest'
import * as routeModule from '../route'

async function getRouteModule() { return routeModule as unknown as Record<string, unknown> }

function request(body: unknown, url = 'http://localhost/api/studio/scoped-save') {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('scoped-save route runtime gate', () => {
  it('keeps the real POST route disabled in the Vitest/test runtime without connecting to auth or PostgreSQL', async () => {
    const route = await getRouteModule()
    if (!route) return
    const response = await (route.POST as (request: Request) => Promise<Response>)(request({}))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'DISABLED' })
  })

  it('keeps the real GET baseline route disabled by default', async () => {
    const route = await getRouteModule()
    if (!route) return
    const response = await (route.GET as (request: Request) => Promise<Response>)(new Request('http://localhost/api/studio/scoped-save?campusId=e8-synthetic'))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ ok: false, code: 'DISABLED' })
  })

  it('rejects non-loopback callers before authentication or PostgreSQL access', async () => {
    const route = await getRouteModule()
    if (!route) return
    const response = await (route.POST as (request: Request) => Promise<Response>)(request({}, 'http://192.0.2.10/api/studio/scoped-save'))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'LOOPBACK_ONLY' })
  })
})
