import { describe, it, expect } from 'vitest'
import { ValidationRegistry } from './registry'
import { polygonClosureValidator, selfIntersectionValidator, duplicateIdsValidator } from './validators'
import { createDocument } from '../../test-helpers'

describe('ValidationRegistry', () => {
  it('registers and returns validators', () => {
    const reg = new ValidationRegistry()
    reg.register(polygonClosureValidator)
    expect(reg.size).toBe(1)
    expect(reg.get('polygon-closure')).toBeDefined()
  })

  it('throws on duplicate id', () => {
    const reg = new ValidationRegistry()
    reg.register(polygonClosureValidator)
    expect(() => reg.register(polygonClosureValidator)).toThrow('already registered')
  })

  it('unregisters a validator', () => {
    const reg = new ValidationRegistry()
    reg.register(polygonClosureValidator)
    reg.unregister('polygon-closure')
    expect(reg.size).toBe(0)
  })

  it('runs all validators and collects issues', () => {
    const doc = createDocument()
    const reg = new ValidationRegistry()
    reg.register(duplicateIdsValidator)
    const issues = reg.validateAll(doc)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('catches validator crashes gracefully', () => {
    const reg = new ValidationRegistry()
    reg.register({
      id: 'crashy',
      label: 'Crashy',
      validate: () => { throw new Error('boom') },
    })
    const doc = createDocument()
    const issues = reg.validateAll(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toContain('crashed')
  })
})
