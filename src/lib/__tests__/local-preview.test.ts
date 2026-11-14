import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readLocalPreview, LOCAL_PREVIEW_KEY } from '../local-preview'

beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, '', '/map') })
afterEach(() => { vi.unstubAllEnvs() })

it('reads ?localPreview=campus:save and remembers it for this tab', () => {
  window.history.replaceState(null, '', '/map?localPreview=map-asu-ibajay:7')
  expect(readLocalPreview()).toEqual({ campusId: 'map-asu-ibajay', commitNo: 7 })
  window.history.replaceState(null, '', '/map/explore')
  expect(readLocalPreview()).toEqual({ campusId: 'map-asu-ibajay', commitNo: 7 })
  expect(sessionStorage.getItem(LOCAL_PREVIEW_KEY)).toBe('map-asu-ibajay:7')
})

it('?localPreview=off clears it; bad values are ignored', () => {
  sessionStorage.setItem(LOCAL_PREVIEW_KEY, 'map-asu-ibajay:7')
  window.history.replaceState(null, '', '/map?localPreview=off')
  expect(readLocalPreview()).toBeNull()
  window.history.replaceState(null, '', '/map?localPreview=asu:zero')
  expect(readLocalPreview()).toBeNull()
})

it('never works on a production build', () => {
  vi.stubEnv('NODE_ENV', 'production')
  window.history.replaceState(null, '', '/map?localPreview=map-asu-ibajay:7')
  expect(readLocalPreview()).toBeNull()
})
