import { describe, it, expect } from 'vitest'
import { ValidationRegistry } from './registry'
import type { ValidatorPlugin, ValidationIssue, ValidationScope } from './registry'

const createValidator = (
  id: string,
  scope: ValidationScope = 'entity',
  cost: 'cheap' | 'expensive' = 'cheap',
): ValidatorPlugin => ({
  id,
  label: id,
  scope,
  cost,
  validate: () => [],
})

describe('ValidationRegistry', () => {
  it('registers a validator plugin', () => {
    const reg = new ValidationRegistry()
    reg.register(createValidator('test'))
    expect(reg.get('test')).toBeDefined()
  })

  it('throws on duplicate registration', () => {
    const reg = new ValidationRegistry()
    reg.register(createValidator('test'))
    expect(() => reg.register(createValidator('test'))).toThrow('test')
  })

  it('unregisters a validator', () => {
    const reg = new ValidationRegistry()
    reg.register(createValidator('test'))
    reg.unregister('test')
    expect(reg.get('test')).toBeUndefined()
  })

  it('validateAll returns issues from all registered validators', () => {
    const reg = new ValidationRegistry()
    reg.register({
      id: 'v1', label: 'V1', scope: 'entity', cost: 'cheap',
      validate: () => [{ id: 'i1', severity: 'error', category: 'geometry', scope: 'entity', entityId: 'a', entityType: 'building', message: 'err', fixable: false, validatorId: 'v1' }],
    })
    reg.register({
      id: 'v2', label: 'V2', scope: 'entity', cost: 'cheap',
      validate: () => [{ id: 'i2', severity: 'warning', category: 'metadata', scope: 'entity', entityId: 'b', entityType: 'room', message: 'warn', fixable: false, validatorId: 'v2' }],
    })
    const issues = reg.validateAll({} as any)
    expect(issues).toHaveLength(2)
  })

  it('catches validator crashes and reports them as issues', () => {
    const reg = new ValidationRegistry()
    reg.register({
      id: 'crash', label: 'Crash', scope: 'entity', cost: 'cheap',
      validate: () => { throw new Error('boom') },
    })
    const issues = reg.validateAll({} as any)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toContain('crash')
    expect(issues[0].validatorId).toBe('system')
  })

  it('returns all registered validators via all getter', () => {
    const reg = new ValidationRegistry()
    reg.register(createValidator('v1'))
    reg.register(createValidator('v2'))
    expect(reg.all).toHaveLength(2)
  })

  describe('editor/publish groups', () => {
    it('registers validators in "editor" group by default', () => {
      const reg = new ValidationRegistry()
      reg.register(createValidator('v1'))
      expect(reg.editorValidators).toHaveLength(1)
      expect(reg.publishValidators).toHaveLength(0)
    })

    it('registers validators in "publish" group explicitly', () => {
      const reg = new ValidationRegistry()
      reg.register(createValidator('v1'), 'publish')
      expect(reg.editorValidators).toHaveLength(0)
      expect(reg.publishValidators).toHaveLength(1)
    })

    it('validateAll defaults to editor-only validation', () => {
      const reg = new ValidationRegistry()
      reg.register({
        id: 'editor-v', label: 'Editor', scope: 'entity', cost: 'cheap',
        validate: () => [{ id: 'i1', severity: 'error', category: 'geometry', scope: 'entity', entityId: 'a', entityType: 'building', message: 'err', fixable: false, validatorId: 'editor-v' }],
      })
      reg.register({
        id: 'publish-v', label: 'Publish', scope: 'campus', cost: 'expensive',
        validate: () => [{ id: 'i2', severity: 'error', category: 'reference', scope: 'campus', entityId: null, entityType: null, message: 'publish err', fixable: false, validatorId: 'publish-v' }],
      }, 'publish')
      const issues = reg.validateAll({} as any)
      expect(issues).toHaveLength(1)
      expect(issues[0].validatorId).toBe('editor-v')
    })
  })
})
