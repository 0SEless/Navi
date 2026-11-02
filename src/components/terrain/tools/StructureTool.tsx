'use client'

import { useEffect, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { resolveStructureEnds, type CampusDocument, type TerrainSampler } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { newStair, structureAt } from '@/lib/terrain/structure-edit'
import { StructureHandles } from '../StructureHandles'
import { StructurePanel } from '../StructurePanel'

function newStructureId(): string {
  return `structure-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`
}

/**
 * The Stairs tool: click an empty spot to place a 3 m block on the ground, click a stair to select it,
 * then stretch its ends with the handles. Stairs are free parts (no lock).
 */
export function StructureTool({ document, sampler, map, active, dispatch }: {
  document: CampusDocument
  sampler: TerrainSampler | null
  map: maplibregl.Map | null
  active: boolean
  dispatch: (command: Command) => MutationResult | undefined
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const latest = useRef({ document, sampler, dispatch })
  latest.current = { document, sampler, dispatch }

  useEffect(() => {
    if (!active) setSelectedId(null)
  }, [active])

  useEffect(() => {
    if (!map || !active) return
    const onClick = (event: maplibregl.MapMouseEvent) => {
      const { document: doc, sampler: s, dispatch: run } = latest.current
      if (!s) return
      const at = { lat: event.lngLat.lat, lng: event.lngLat.lng }
      const hit = structureAt(doc, s, at)
      if (hit) {
        setSelectedId(hit)
        return
      }
      const created = newStair(newStructureId(), s.grid, at)
      const result = run({ id: 'structure.create', label: 'Add stair', payload: { structure: created } })
      if (result?.success !== false) setSelectedId(created.id)
    }
    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [map, active])

  if (!active) return null
  const selected = document.structures?.find((s) => s.id === selectedId) ?? null
  const resolved = selected && sampler ? resolveStructureEnds(document, sampler, selected) : null
  return (
    <>
      {map && sampler && selected && resolved && (
        <StructureHandles map={map} document={document} sampler={sampler} structure={selected} resolved={resolved} dispatch={dispatch} />
      )}
      <StructurePanel document={document} structure={selected} resolved={resolved} dispatch={dispatch} onDeleted={() => setSelectedId(null)} />
    </>
  )
}
