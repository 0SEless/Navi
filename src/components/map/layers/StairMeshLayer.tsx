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
export function StairMeshLayer({ map, id, meshes, visible = true }: { map: maplibregl.Map | null; id: string; meshes: readonly StairMesh[]; visible?: boolean }) {
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
      ;[...groups.values()].forEach((group, i) => {
        if (map.getLayer(ids[i])) return
        const mesh = new Float32Array(group.parts.reduce((n, p) => n + p.length, 0))
        let offset = 0
        for (const p of group.parts) { mesh.set(p, offset); offset += p.length }
        const layer = createMeshLayer(ids[i], group.origin)
        layer.setMesh(mesh)
        // Before the first 3D block layer: drawn after MapLibre's translucent extrusions, a custom layer is lost
        // (2026-11-16: stairs invisible in the floor editor); among the blocks, the depth test sorts it correctly.
        const order = typeof map.getLayersOrder === 'function' ? map.getLayersOrder() : []
        const before = order.find((lid) => map.getLayer(lid)?.type === 'fill-extrusion')
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
  }, [map, id, meshes, visible])
  return null
}
