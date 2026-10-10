import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PM-3 / STEP 28 + 31 + 32 — architecture guards for Panorama Management.
 *
 * Source-level assertions, following the existing repo convention
 * (`src/app/demo/navigate/client-boundary.test.ts`,
 * `src/__tests__/dependency-boundary.test.ts`).
 *
 * These lock the invariants that the runtime tests cannot fully observe: that
 * the Panorama Management module tree contains no navigation-graph coupling, no
 * mutation path or map-editor command context. The dedicated tool may reuse
 * the existing viewer and image resolver.
 */

/** `src/` — this file lives at src/features/panorama-management/. */
const ROOT = resolve(__dirname, '..', '..')

/** Every source file PM-3 owns. */
const PM3_SOURCES = [
  'features/panorama-management/selectors.ts',
  'features/panorama-management/state.ts',
  'features/panorama-management/tour-selectors.ts',
  'features/panorama-management/components/VirtualTourWorkspace.tsx',
  'features/panorama-management/components/SceneExplorer.tsx',
  'features/panorama-management/components/SceneInspector.tsx',
  'features/panorama-management/components/HotspotDialog.tsx',
  'app/(admin)/panoramas/page.tsx',
]

/** Test files are excluded: they legitimately name forbidden symbols in fixtures. */
const FORBIDDEN_IN_SOURCE: Array<[label: string, pattern: RegExp]> = [
  // STEP 28 — navigation-graph independence.
  ['GraphAdapter', /\bGraphAdapter\b/],
  ['hasPanorama', /hasPanorama/],
  ['N-pano-', /N-pano-/],
  ['panoramaId metadata', /metadata\s*[?!]?\.?\s*panoramaId|\bpanoramaId\b/],
  ['panoramaUrl metadata', /panoramaUrl/],
  ['graph.nodes', /graph\s*\.\s*nodes/],
  ['A* / routing engine', /\bAStar\b|\baStar\b|\brouteGraph\b|computeRoute|findPath/],
  // Studio links are allowed; Studio command contexts and alternate stores are not.
  ['Studio command context or alternate authoring store', /useEditor|createEditorContext|useAuthoringStore|executeCommand|dispatchCommand/],
  // STEP 32 — read-only.
  ['panorama.create', /panorama\.create/],
  ['entity.update', /entity\.update/],
  ['panorama.delete', /panorama\.delete/],
  ['panorama.restore', /panorama\.restore/],
  ['uploadPanoramaAsset', /uploadPanoramaAsset/],
  ['panorama-upload', /panorama-upload/],
  ['updateNode', /updateNode/],
  // STEP 27/29 — legacy/base64 and backup independence.
  ['base64 image data', /data:image/],
  ['campus backup module', /campus-backup/],
  ['panoramaIndex', /panoramaIndex/],
  ['panorama_assets table', /panorama_assets/],
]

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

describe('PM-3 architecture guards', () => {
  it('routes scene authoring to the existing Studio editor', () => {
    const source = read('features/panorama-management/components/VirtualTourWorkspace.tsx')
    expect(source).toContain('Edit Scenes in Studio')
    expect(source).toMatch(/\/studio\/.*\/edit/)
  })
  it('covers the expected source files', () => {
    for (const file of PM3_SOURCES) {
      expect(() => statSync(join(ROOT, file))).not.toThrow()
    }
  })

  describe.each(PM3_SOURCES)('%s', (file) => {
    it.each(FORBIDDEN_IN_SOURCE)('does not reference %s', (_label, pattern) => {
      const source = read(file)
      const offending = source
        .split(/\r?\n/)
        // Skip comments and doc text: prose may legitimately describe what is banned.
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .filter((line) => pattern.test(line))
      expect(offending).toEqual([])
    })
  })

  it('the selectors module imports nothing from the graph, editor bridge or viewer layer', () => {
    const source = read('features/panorama-management/selectors.ts')
    // Match whole (possibly multi-line) import statements.
    const statements = source.match(/import\s+(?:type\s+)?[\s\S]*?from\s+['"][^'"]+['"]/g) ?? []
    expect(statements.length).toBeGreaterThan(0)
    // Only @navi/core is needed, and only for types + canonical validators.
    const unexpected = statements.filter((statement) => !statement.includes("from '@navi/core'"))
    expect(unexpected).toEqual([])
    expect(statements.join('\n')).toContain('validatePanoramaCoordinates')
    expect(statements.join('\n')).toContain('validatePanoramaHotspots')
  })

  it('the selectors module is React-free and store-free', () => {
    const source = read('features/panorama-management/selectors.ts')
    expect(source).not.toMatch(/from ['"]react['"]/)
    expect(source).not.toMatch(/useState|useEffect|useMemo/)
    expect(source).not.toMatch(/@\/store\//)
  })

  it('the state module is React-free and store-free', () => {
    const source = read('features/panorama-management/state.ts')
    expect(source).not.toMatch(/from ['"]react['"]/)
    expect(source).not.toMatch(/@\/store\//)
  })

  it('the page declares no panorama mutation handler at all', () => {
    const source = read('app/(admin)/panoramas/page.tsx')
    // loadMapData is a READ. Nothing that writes a Panorama or an asset may appear.
    expect(source).not.toMatch(/useGraphStore\(\(state\)\s*=>\s*state\.(update|add|remove|delete|create)/)
    expect(source).not.toMatch(/executeCommand|dispatchCommand|runCommand/)
    // The campus store is used read-only too.
    expect(source).not.toMatch(/useCampusMapStore\(\(state\)\s*=>\s*state\.(createMap|updateMap|deleteMap|updateMapStats)/)
  })

  it('the Panorama client reads the canonical effective document helper rather than raw panorama sources', () => {
    const source = read('app/(admin)/panoramas/PanoramaManagementClient.tsx')
    expect(source).toContain('resolveEffectiveDatasetDocument')
    // Inventory flows exclusively through the pure selector.
    expect(source).toContain('buildPanoramaViews')
  })

  it('no Panorama Management source declares a second Panorama type', () => {
    for (const file of PM3_SOURCES) {
      const source = read(file)
      const declares = /interface\s+Panorama\s*\{|type\s+Panorama\s*=/.test(
        source.replace(/PanoramaView|PanoramaScope|PanoramaHealth|PanoramaFilters|PanoramaMetrics|PanoramaPositionView|PanoramaIssueView|PanoramaBuildingOption|PanoramaCampusOption|PanoramaManagementPhase|PanoramaValidationState/g, ''),
      )
      expect(declares).toBe(false)
    }
  })
})

describe('PM-3 leaves protected systems alone', () => {
  it('does not import AppLayout into the panorama feature', () => {
    const appLayout = join(ROOT, 'components/layout/AppLayout.tsx')
    // Present but never imported by PM-3.
    for (const file of PM3_SOURCES) {
      expect(read(file)).not.toContain('AppLayout')
    }
    expect(() => statSync(appLayout)).not.toThrow()
  })

  it('does not modify the VT-2 backup implementation', () => {
    for (const file of PM3_SOURCES) {
      expect(read(file)).not.toMatch(/campus-backup|CAMPUS_BACKUP/)
    }
  })
})
