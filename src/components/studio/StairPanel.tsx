'use client'

// Stair route links (2026-11-07): the panel for a selected outdoor stair or ramp in the map editor — its state,
// Connect to route (suggestion → optional other route picked on the map → Confirm), Disconnect, and the way to the
// terrain editor where stairs are shaped. Everything it writes goes through one executeBatch (one undo step).
import { useMemo, useState } from 'react'
import {
  stairRouteOf,
  suggestStairConnection,
  type CampusDocument,
  type StairConnectionOptions,
  type StairEndRoute,
} from '@navi/core'
import { stairConnectCommands, stairDisconnectCommands, type Command } from '@navi/editor'
import { validateRouteNetwork } from '@navi/editor/src/validation/rules/modules/route-network'

export interface StairPanelProps {
  document: CampusDocument
  structureId: string
  mapId: string
  toWorld: StairConnectionOptions['toWorld']
  /** A route the owner clicked on the map while choosing (replaces the suggested bottom route). */
  pickedBottom: StairEndRoute | null
  onChoosingChange(choosing: boolean): void
  ensureZone(zones: string[]): Promise<boolean>
  executeBatch(commands: Command[]): { success: boolean; error?: string }
  onClose(): void
}

const box: React.CSSProperties = {
  position: 'absolute', top: 56, right: 12, width: 280, zIndex: 30, background: 'var(--navi-card, #fff)',
  border: '1px solid var(--navi-border, #d0d7de)', borderRadius: 8, padding: 12, fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 8,
}
const button: React.CSSProperties = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--navi-border, #d0d7de)', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent' }
const primary: React.CSSProperties = { ...button, background: 'var(--navi-primary, #2563eb)', color: '#fff', border: 'none' }

/** The route problem Validate reports for this stair, if any. */
export function stairProblem(document: CampusDocument, structureId: string): string | null {
  const found = validateRouteNetwork(document, 'draft').find((i) => i.ruleId === 'route-stair' && i.targets.some((t) => t.entityType === 'structure' && t.entityId === structureId))
  return found?.message ?? null
}

export function StairPanel({ document, structureId, mapId, toWorld, pickedBottom, onChoosingChange, ensureZone, executeBatch, onClose }: StairPanelProps) {
  const [choosing, setChoosing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const structure = (document.structures ?? []).find((s) => s.id === structureId)
  const route = stairRouteOf(document, structureId)
  const problem = route ? stairProblem(document, structureId) : null
  const suggestion = useMemo(() => (choosing ? suggestStairConnection(document, structureId, { toWorld }) : null), [choosing, document, structureId, toWorld])
  if (!structure) return null

  const kind = structure.form === 'ramp' ? 'ramp' : 'stair'
  const roadName = (id: string) => document.roads.find((r) => r.id === id)?.name || 'a route'
  const connection = suggestion ? { ...suggestion, bottom: pickedBottom ?? suggestion.bottom } : null
  const top = connection?.top ?? null
  const building = top && top.kind !== 'route' ? document.buildings.find((b) => b.id === top.buildingId) : undefined
  const floor = top && top.kind !== 'route' ? building?.floors.find((f) => f.id === top.floorId) : undefined
  const floorLabel = floor?.label ?? 'that floor'
  const zones = top && top.kind === 'entrance' ? [`building:${top.buildingId}`] : []
  const ready = Boolean(connection?.bottom && top && top.kind !== 'missing')

  const choose = (on: boolean) => {
    setChoosing(on)
    setMessage(null)
    onChoosingChange(on)
  }
  const lockedOut = async (zoneList: string[], buildingName: string | undefined) => {
    if (zoneList.length === 0 || (await ensureZone(zoneList))) return false
    setMessage(`${buildingName ?? 'This building'} is being edited by someone else. Try again when they are done.`)
    return true
  }
  const confirm = async () => {
    if (!connection) return
    const commands = stairConnectCommands(document, connection)
    if (!Array.isArray(commands)) {
      setMessage(commands.error)
      return
    }
    if (await lockedOut(zones, building?.name)) return
    const result = executeBatch(commands)
    if (!result.success) {
      setMessage(result.error ?? `The ${kind} could not be connected.`)
      return
    }
    choose(false)
  }
  const disconnect = async () => {
    const linked = document.buildings.find((b) => b.floors.some((f) => (f.entranceAccess ?? []).some((a) => a.outdoorRouteId === route?.id)))
    if (await lockedOut(linked ? [`building:${linked.id}`] : [], linked?.name)) return
    const result = executeBatch(stairDisconnectCommands(document, structureId))
    if (!result.success) setMessage(result.error ?? `The ${kind} could not be disconnected.`)
  }

  return (
    <div role="dialog" aria-label={`Outdoor ${kind}`} style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Outdoor {kind}</strong>
        <button type="button" aria-label="Close" style={{ ...button, border: 'none' }} onClick={() => { choose(false); onClose() }}>×</button>
      </div>
      <div>{problem ?? (route ? 'Connected' : 'Not connected')}</div>

      {!route && !choosing && (
        <button type="button" style={primary} onClick={() => choose(true)}>Connect to route</button>
      )}

      {!route && choosing && (
        <>
          <div>{connection?.bottom ? `Bottom: ${roadName(connection.bottom.roadId)}` : 'Bottom: click a route on the map'}</div>
          {top?.kind === 'route' && <div>Top: {roadName(top.route.roadId)}</div>}
          {top?.kind === 'entrance' && (
            <div>Top: {floor?.entrances.find((e) => e.id === top.entranceId)?.label || 'Entrance'} ({floorLabel})</div>
          )}
          {top?.kind === 'entrance' && top.replacesRoadId && (
            <div style={{ color: 'var(--navi-warning, #b45309)' }}>
              This entrance is linked to {roadName(top.replacesRoadId)}; it will be linked to the stair instead.
            </div>
          )}
          {top?.kind === 'missing' && (
            <>
              <div style={{ color: 'var(--navi-warning, #b45309)' }}>
                {top.reason === 'entrance' ? `Add an entrance on ${floorLabel} here first` : `Connect this entrance to ${floorLabel}'s routes first`}
              </div>
              <a href={`/studio/${encodeURIComponent(mapId)}/edit/building/${encodeURIComponent(top.buildingId)}/floor/${floor?.level ?? 0}`}>
                Open {floorLabel} in the floor editor
              </a>
            </>
          )}
          {!top && <div>Top: click a route on the map</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={primary} disabled={!ready} onClick={() => void confirm()}>Confirm</button>
            <button type="button" style={button} onClick={() => choose(false)}>Cancel</button>
          </div>
        </>
      )}

      {route && <button type="button" style={button} onClick={() => void disconnect()}>Disconnect</button>}
      {message && <div role="alert" style={{ color: 'var(--navi-danger, #b91c1c)' }}>{message}</div>}
      <a href={`/studio/${encodeURIComponent(mapId)}/edit/terrain?stair=${encodeURIComponent(structureId)}`}>Edit in terrain editor</a>
    </div>
  )
}
