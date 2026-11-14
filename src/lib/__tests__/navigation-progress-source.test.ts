import { describe, expect, it } from 'vitest'
import { isGoodFix, nextProgressMode, progressModeLabel, shouldWarnOffRoute } from '../navigation-progress-source'

describe('navigation progress source', () => {
  it('selects GPS only for accurate outdoor fixes and holds it through brief dropouts', () => {
    expect(nextProgressMode({ previous: 'step', fix: { accuracy: 15, timestamp: 1 }, now: 1, lastGoodFixAt: 1, indoors: false })).toBe('gps')
    expect(nextProgressMode({ previous: 'step', fix: { accuracy: 16, timestamp: 1 }, now: 1, lastGoodFixAt: null, indoors: false })).toBe('step')
    expect(nextProgressMode({ previous: 'gps', fix: { accuracy: 40, timestamp: 4000 }, now: 4000, lastGoodFixAt: 0, indoors: false })).toBe('gps')
    expect(nextProgressMode({ previous: 'gps', fix: null, now: 5001, lastGoodFixAt: 0, indoors: false })).toBe('step')
    expect(nextProgressMode({ previous: 'gps', fix: { accuracy: 4, timestamp: 1 }, now: 1, lastGoodFixAt: 1, indoors: true })).toBe('step')
  })

  it('labels modes and warns only for accurate GPS fixes beyond 30 m', () => {
    expect(progressModeLabel('gps')).toBe('Following GPS')
    expect(progressModeLabel('step')).toBe('Tap Next at each step')
    expect(isGoodFix({ accuracy: 15, timestamp: 0 })).toBe(true)
    expect(shouldWarnOffRoute({ mode: 'gps', accuracy: 10, distanceFromRouteM: 31 })).toBe(true)
    expect(shouldWarnOffRoute({ mode: 'gps', accuracy: 20, distanceFromRouteM: 80 })).toBe(false)
    expect(shouldWarnOffRoute({ mode: 'step', accuracy: 4, distanceFromRouteM: 80 })).toBe(false)
  })
})
