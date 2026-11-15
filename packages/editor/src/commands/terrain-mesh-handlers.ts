import { clampCm, createTerrainSampler, decodeTile, encodeTile, isValidMesh, meshFrame, recordChange, tileIdOf, tileOfCell, TILE_CELLS } from '@navi/core'
import type { CampusDocument, TerrainMesh } from '@navi/core'
import type { Command, CommandHandler, MutationResult } from './types'
import { restoreCommand, snapshot } from './terrain-handlers'

/**
 * Terrain list (owner 2026-11-15): meshes are editable shapes saved inside the terrain part; every command here is
 * undone by putting back the terrain snapshot (terrain.restore), like the other terrain commands.
 */
type Snapshot = ReturnType<typeof snapshot>

function changeTerrain(document: CampusDocument, label: string, apply: () => string | null): MutationResult {
  if (!document.terrain) return { success: false, error: 'Set up the terrain first.' }
  const previous = snapshot(document)
  const error = apply()
  if (error) {
    if (previous.terrain) document.terrain = previous.terrain
    return { success: false, error }
  }
  recordChange(document, { entityId: 'terrain', entityType: 'terrain', operation: 'updated' })
  return { success: true, entityId: 'terrain', data: { previous, label } }
}

const undo = (label: string) => (_payload: Record<string, unknown>, result: MutationResult): Command | null => {
  const previous = result.data?.previous as Snapshot | undefined
  return previous ? restoreCommand(previous, label) : null
}

const meshes = (document: CampusDocument): TerrainMesh[] => document.terrain?.meshes ?? []
const setMeshes = (document: CampusDocument, list: TerrainMesh[]) => {
  if (!document.terrain) return
  if (list.length > 0) document.terrain.meshes = list
  else delete document.terrain.meshes
}

export const terrainMeshAddHandler: CommandHandler = {
  id: 'terrain.mesh.add',
  execute(document, payload) {
    return changeTerrain(document, 'Add mesh', () => {
      if (!isValidMesh(payload.mesh)) return 'That mesh is not valid.'
      if (meshes(document).some((m) => m.id === (payload.mesh as TerrainMesh).id)) return 'A mesh with that id already exists.'
      setMeshes(document, [...meshes(document), structuredClone(payload.mesh as TerrainMesh)])
      return null
    })
  },
  inverse: undo('Undo add mesh'),
}

export const terrainMeshUpdateHandler: CommandHandler = {
  id: 'terrain.mesh.update',
  execute(document, payload) {
    return changeTerrain(document, 'Edit mesh', () => {
      if (!isValidMesh(payload.mesh)) return 'That mesh is not valid.'
      const next = payload.mesh as TerrainMesh
      const list = meshes(document)
      const at = list.findIndex((m) => m.id === next.id)
      if (at < 0) return 'That mesh no longer exists.'
      setMeshes(document, list.map((m, i) => (i === at ? structuredClone(next) : m)))
      return null
    })
  },
  inverse: undo('Undo edit mesh'),
}

export const terrainMeshRemoveHandler: CommandHandler = {
  id: 'terrain.mesh.remove',
  execute(document, payload) {
    return changeTerrain(document, 'Delete mesh', () => {
      const list = meshes(document)
      if (!list.some((m) => m.id === payload.meshId)) return 'That mesh no longer exists.'
      setMeshes(document, list.filter((m) => m.id !== payload.meshId))
      return null
    })
  },
  inverse: undo('Undo delete mesh'),
}

export const terrainMeshReorderHandler: CommandHandler = {
  id: 'terrain.mesh.reorder',
  execute(document, payload) {
    return changeTerrain(document, 'Move mesh', () => {
      const list = [...meshes(document)]
      const from = list.findIndex((m) => m.id === payload.meshId)
      const to = Number(payload.toIndex)
      if (from < 0) return 'That mesh no longer exists.'
      if (!Number.isInteger(to) || to < 0 || to >= list.length) return 'That position is outside the list.'
      const [moved] = list.splice(from, 1)
      list.splice(to, 0, moved)
      setMeshes(document, list)
      return null
    })
  },
  inverse: undo('Undo move mesh'),
}

/** Bakes one mesh into the Sculpting tiles (its effect on the ground below it, cell by cell) and removes it. */
export const terrainMeshMergeHandler: CommandHandler = {
  id: 'terrain.mesh.merge',
  execute(document, payload) {
    return changeTerrain(document, 'Merge mesh into ground', () => {
      const list = meshes(document)
      const index = list.findIndex((m) => m.id === payload.meshId)
      if (index < 0) return 'That mesh no longer exists.'
      const grid = document.terrain!.grid
      const below = createTerrainSampler(document, { meshesOverride: list.slice(0, index) })
      const withIt = createTerrainSampler(document, { meshesOverride: list.slice(0, index + 1) })
      if (!below || !withIt) return 'The terrain could not be read.'
      const { box } = meshFrame(list[index], grid)
      const tiles = { ...(document.terrainTiles ?? {}) } as Record<string, string>
      const decoded = new Map<string, Int16Array>()
      const cellsOf = (id: string) => {
        let cells = decoded.get(id)
        if (!cells) {
          cells = tiles[id] ? decodeTile(tiles[id]) : new Int16Array(TILE_CELLS * TILE_CELLS)
          decoded.set(id, cells)
        }
        return cells
      }
      for (let y = Math.floor(box.minY) - 1; y <= Math.ceil(box.maxY) + 1; y++) {
        for (let x = Math.floor(box.minX) - 1; x <= Math.ceil(box.maxX) + 1; x++) {
          const delta = withIt.groundAt(x, y) - below.groundAt(x, y)
          if (Math.abs(delta) < 0.005) continue
          const { col, row, i } = tileOfCell(x, y)
          const cells = cellsOf(tileIdOf(col, row))
          cells[i] = clampCm(cells[i] + delta * 100)
        }
      }
      for (const [id, cells] of decoded) tiles[id] = encodeTile(cells)
      document.terrainTiles = tiles as CampusDocument['terrainTiles']
      setMeshes(document, list.filter((_, i) => i !== index))
      return null
    })
  },
  inverse: undo('Undo merge mesh'),
}

export const terrainSculptingClearHandler: CommandHandler = {
  id: 'terrain.sculpting.clear',
  execute(document) {
    return changeTerrain(document, 'Clear sculpting', () => {
      delete document.terrainTiles
      return null
    })
  },
  inverse: undo('Undo clear sculpting'),
}

/** Studio's view toggles (publishing ignores them): one mesh's eye, or the Sculpting eye. */
export const terrainSetViewHandler: CommandHandler = {
  id: 'terrain.set-view',
  execute(document, payload) {
    return changeTerrain(document, 'Show or hide', () => {
      if (typeof payload.sculptingHidden === 'boolean') {
        if (payload.sculptingHidden) document.terrain!.sculptingHidden = true
        else delete document.terrain!.sculptingHidden
      }
      if (payload.meshId !== undefined) {
        const list = meshes(document)
        if (!list.some((m) => m.id === payload.meshId)) return 'That mesh no longer exists.'
        setMeshes(document, list.map((m) => {
          if (m.id !== payload.meshId) return m
          const next = { ...m }
          if (payload.hidden === true) next.hidden = true
          else delete next.hidden
          return next
        }))
      }
      return null
    })
  },
  inverse: undo('Undo show or hide'),
}
