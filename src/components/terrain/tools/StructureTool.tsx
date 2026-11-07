'use client'

import { useEffect, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { resolveStructureEnds, structureCentreline, type CampusDocument, type TerrainSampler } from '@navi/core'
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
export function StructureTool({ document, sampler, map, active, dispatch, onSelect, showHandles = true, requestedId = null }: {
  document: CampusDocument
  sampler: TerrainSampler | null
  map: maplibregl.Map | null
  active: boolean
  dispatch: (command: Command) => MutationResult | undefined
  /** The selected stair (Shift+Z edits it). */
  onSelect?: (structureId: string | null) => void
  /** Off while Shift+Z height mode is on, so its drag gets the mouse. */
  showHandles?: boolean
  /** A stair to open on (the map editor's "Edit in terrain editor"): selected and framed once the tool is active. */
  requestedId?: string | null
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })
  useEffect(() => {
    onSelectRef.current?.(selectedId)
  }, [selectedId])
  const latest = useRef({ document, sampler, dispatch })
  latest.current = { document, sampler, dispatch }

  useEffect(() => {
    if (!active) setSelectedId(null)
  }, [active])

  const requestDone = useRef(false)
  useEffect(() => {
    if (requestDone.current || !active || !requestedId || !map) return
    const requested = document.structures?.find((s) => s.id === requestedId)
    if (!requested) return
    requestDone.current = true
    setSelectedId(requestedId)
    const line = structureCentreline(document, requested)
    const middle = line?.[Math.floor(line.length / 2)]
    if (middle) map.easeTo({ center: [middle.lng, middle.lat], zoom: Math.max(map.getZoom?.() ?? 19, 19) })
  }, [active, requestedId, map, document])

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
      {map && sampler && selected && resolved && showHandles && (
        <StructureHandles map={map} document={document} sampler={sampler} structure={selected} resolved={resolved} dispatch={dispatch} />
      )}
      <StructurePanel document={document} structure={selected} resolved={resolved} dispatch={dispatch} onDeleted={() => setSelectedId(null)} />
    </>
  )
}
