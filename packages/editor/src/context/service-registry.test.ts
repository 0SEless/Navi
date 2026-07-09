import { describe, it, expect, beforeEach } from 'vitest'
import { ServiceRegistry } from './service-registry'

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry

  beforeEach(() => {
    registry = new ServiceRegistry()
  })

  it('registers and retrieves a service', () => {
    const svc = { foo: 'bar' }
    registry.register('test', svc)
    expect(registry.get('test')).toBe(svc)
  })

  it('returns undefined for unknown service', () => {
    expect(registry.get('nope')).toBeUndefined()
  })

  it('has() checks existence', () => {
    registry.register('a', {})
    expect(registry.has('a')).toBe(true)
    expect(registry.has('b')).toBe(false)
  })

  it('remove() deletes a service', () => {
    registry.register('x', {})
    registry.remove('x')
    expect(registry.has('x')).toBe(false)
  })

  it('calls init on lifecycle services', async () => {
    let inited = false
    registry.register('test', { init: () => { inited = true } })
    await registry.init()
    expect(inited).toBe(true)
  })

  it('calls destroy on lifecycle services', async () => {
    let destroyed = false
    registry.register('test', { destroy: () => { destroyed = true } })
    await registry.destroy()
    expect(destroyed).toBe(true)
  })

  it('clears all services on destroy', async () => {
    registry.register('a', {})
    registry.register('b', {})
    await registry.destroy()
    expect(registry.size).toBe(0)
  })

  it('tracks size correctly', () => {
    expect(registry.size).toBe(0)
    registry.register('a', {})
    expect(registry.size).toBe(1)
    registry.register('b', {})
    expect(registry.size).toBe(2)
    registry.remove('a')
    expect(registry.size).toBe(1)
  })
})
