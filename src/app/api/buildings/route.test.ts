// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { DELETE, GET, POST } from './route'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
const create = vi.mocked(createServerClient)
const query = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  order: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
}
const client = { from: vi.fn(() => query) }
const authHeaders = { cookie: 'sb-test-auth-token=test-session' }
const request = (url: string, method: string, body?: unknown) => new NextRequest(url, {
  method,
  headers: { ...authHeaders, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('campus-scoped building identity API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockReturnValue(client as never)
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.delete.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({ data: { id: 'same-id', campus_id: 'campus-a' }, error: null } as never)
    query.upsert.mockResolvedValue({ error: null } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('requires campus_id when a building is addressed by ID', async () => {
    const response = await GET(new NextRequest('http://localhost/api/buildings?id=same-id'))
    expect(response.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('looks up an ID only within the requested campus', async () => {
    const response = await GET(new NextRequest('http://localhost/api/buildings?id=same-id&campus_id=campus-a'))
    expect(response.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith('campus_id', 'campus-a')
    expect(query.eq).toHaveBeenCalledWith('id', 'same-id')
  })

  it('upserts by the campus-scoped composite identity', async () => {
    const response = await POST(request('http://localhost/api/buildings', 'POST', { id: 'same-id', campus_id: 'campus-a', name: 'A' }))
    expect(response.status).toBe(200)
    expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'same-id', campus_id: 'campus-a' }), { onConflict: 'campus_id,id' })
  })

  it('requires campus_id before deleting an ID', async () => {
    const response = await DELETE(request('http://localhost/api/buildings?id=same-id', 'DELETE'))
    expect(response.status).toBe(400)
    expect(query.delete).not.toHaveBeenCalled()
  })

  it('deletes only the matching campus and entity ID', async () => {
    const response = await DELETE(request('http://localhost/api/buildings?id=same-id&campus_id=campus-a', 'DELETE'))
    expect(response.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith('campus_id', 'campus-a')
    expect(query.eq).toHaveBeenCalledWith('id', 'same-id')
  })
})
