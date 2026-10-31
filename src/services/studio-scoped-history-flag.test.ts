import { describe, expect, it } from 'vitest'
import { isStudioDurableScopedSaveEnabled, isStudioScopedHistoryEnabled } from './studio-scoped-history-flag'

describe('Studio scoped-history feature flag', () => {
  it('is enabled only in opted-in development with local drafts enabled', () => {
    expect(isStudioScopedHistoryEnabled({ nodeEnv: 'development', scopedFlag: 'true', draftFlag: 'true' })).toBe(true)
  })

  it.each([
    { nodeEnv: 'development', scopedFlag: undefined, draftFlag: 'true' },
    { nodeEnv: 'development', scopedFlag: 'false', draftFlag: 'true' },
    { nodeEnv: 'development', scopedFlag: 'true', draftFlag: 'false' },
    { nodeEnv: 'production', scopedFlag: 'true', draftFlag: 'true' },
    { nodeEnv: 'test', scopedFlag: 'true', draftFlag: 'true' },
  ])('stays disabled for $nodeEnv with scoped=$scopedFlag drafts=$draftFlag', (env) => {
    expect(isStudioScopedHistoryEnabled(env)).toBe(false)
  })

  it('enables durable local saving only when every existing local gate is enabled', () => {
    expect(isStudioDurableScopedSaveEnabled({ nodeEnv: 'development', scopedFlag: 'true', draftFlag: 'true', durableFlag: 'true' })).toBe(true)
    expect(isStudioDurableScopedSaveEnabled({ nodeEnv: 'development', scopedFlag: 'false', draftFlag: 'true', durableFlag: 'true' })).toBe(false)
    expect(isStudioDurableScopedSaveEnabled({ nodeEnv: 'production', scopedFlag: 'true', draftFlag: 'true', durableFlag: 'true' })).toBe(false)
  })
})
