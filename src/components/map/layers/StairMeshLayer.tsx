'use client'

import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import { createMeshLayer } from '@/lib/three-d/mesh-layer'
import { styleReady } from '@/lib/terrain/style-ready'

type StairMesh = { origin: { lat: number; lng: number }; mesh: Float32Array } | null | undefined

/**
 * Smooth stairs (owner 2026-11-16): draws floor stair meshes (see floorStairMesh) with the terrain editor's mesh
 * layer — one MapLibre custom layer per origin (a building), meshes of the same origin joined. Visual only: picking
 * and editing keep using the stair solids.
 */
export function StairMeshLayer({ map, id, meshes, visible = true, beforePrefix }: {
  map: maplibregl.Map | null; id: string; meshes: readonly StairMesh[]; visible?: boolean
  /** Go before the first 3D block layer whose id starts with this (NAVI Web: after the flat room fills, 2026-11-18). */
  beforePrefix?: string
}) {
  useEffect(() => {
    if (!map || !visible) return
    const groups = new Map<string, { origin: { lat: number; lng: number }; parts: Float32Array[] }>()
    for (const m of meshes) {
      if (!m || m.mesh.length === 0) continue
      const key = `${m.origin.lat.toFixed(9)},${m.origin.lng.toFixed(9)}`
      const group = groups.get(key) ?? { origin: m.origin, parts: [] }
      group.parts.push(m.mesh)
      groups.set(key, group)
    }
    const ids = [...groups.keys()].map((_, i) => `${id}-${i}`)
    const add = () => {
      if (!styleReady(map)) return
      // Before the first 3D block layer: drawn after MapLibre's translucent extrusions, a custom layer is lost
      // (2026-11-16: stairs invisible in the floor editor); among the blocks, the depth test sorts it correctly.
      // NAVI Web (owner 2026-11-18: white pieces over the stair): the floor's flat room fills come after the shells,
      // and drawn after the mesh they paint over it; so go just before the floor's own blocks when asked.
      const order = typeof map.getLayersOrder === 'function' ? map.getLayersOrder() : []
      const block = (lid: string) => map.getLayer(lid)?.type === 'fill-extrusion'
      const wanted = beforePrefix ? order.find((lid) => lid.startsWith(beforePrefix) && block(lid)) : undefined
      const before = wanted ?? order.find(block)
      ;[...groups.values()].forEach((group, i) => {
        if (map.getLayer(ids[i])) {
          // Added before the floor's blocks existed: move in front of them once they do.
          const at = order.indexOf(ids[i])
          if (wanted && at > -1 && order.indexOf(wanted) !== at + 1) map.moveLayer?.(ids[i], wanted)
          return
        }
        const mesh = new Float32Array(group.parts.reduce((n, p) => n + p.length, 0))
        let offset = 0
        for (const p of group.parts) { mesh.set(p, offset); offset += p.length }
        const layer = createMeshLayer(ids[i], group.origin)
        layer.setMesh(mesh)
        map.addLayer(layer, before)
      })
      if (groups.size > 0) map.triggerRepaint?.()
    }
    add()
    // Re-add after anything rebuilds the map's layers (style reloads, editor view switches); 'idle' also catches
    // rebuilds whose own events fired before the style was ready again.
    map.on('style.load', add)
    map.on('styledata', add)
    map.on('idle', add)
    return () => {
      map.off('style.load', add)
      map.off('styledata', add)
      map.off('idle', add)
      try { for (const lid of ids) if (map.getLayer(lid)) map.removeLayer(lid) } catch { /* map already removed */ }
    }
  }, [map, id, meshes, visible, beforePrefix])
  return null
}
