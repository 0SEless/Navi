'use client'

import { useState } from 'react'
import type { CampusDocument } from '@navi/core'
import type { BuildingConnectivityReport } from '@/studio-v2/server/building-connectivity'

const outdoorLabels = {
  connected: 'Outdoor point reachable', unassigned: 'No outdoor assignment',
  broken: 'Entrance bridge could not be built', unreachable: 'Outdoor point unreachable from start',
  'no-origin': 'Outdoor link exists, start unavailable',
}
const indoorLabels = { connected: 'Indoor route connected', 'room-only': 'Direct room access only', missing: 'Indoor route missing' }
const floorLinkLabels = {
  indoor: 'Connected indoors', outdoor: 'Connected via outdoor route',
  missing: 'No route between floors', 'no-waypoints': 'Missing floor waypoints',
}
const linkTones = {
  indoor: 'bg-emerald-500/15 text-[var(--navi-text)]',
  outdoor: 'bg-sky-500/15 text-[var(--navi-text)]',
  missing: 'bg-red-500/15 text-[var(--navi-error)]',
  'no-waypoints': 'bg-red-500/15 text-[var(--navi-error)]',
}
const problemRow = 'border-l-2 border-red-500 bg-red-500/10 px-2 py-1'
const roomLabels = { connected: 'Reachable', 'search-only': 'Search only', unreachable: 'No route from start', 'no-origin': 'Start unavailable' }
type CheckResult =
  | { revision: number; roadId: string; report: BuildingConnectivityReport }
  | { revision: number; roadId: string; error: string }

export function BuildingConnectivityPanel({ document, buildingId, activeLevel, revision, onReviewRoutes, onChooseOutdoorRoute }: {
  document: CampusDocument; buildingId: string; activeLevel: number; revision: number
  onReviewRoutes?: () => void
  onChooseOutdoorRoute?: (entranceId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [roadId, setRoadId] = useState('')
  const [floorId, setFloorId] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const fresh = result?.revision === revision && result.roadId === roadId
  const report = result && fresh && 'report' in result ? result.report : null
  const floorLabels = new Map(report?.floors.map(floor => [floor.id, floor.label]))
  const linkMissing = (status: keyof typeof floorLinkLabels) => status === 'missing' || status === 'no-waypoints'
  const needsReview = report?.floors.length === 0 || report?.floorLinks.some(link => linkMissing(link.forward) || linkMissing(link.reverse))
    || report?.floors.some(floor =>
    floor.groups.length !== 1 || floor.groups.some(group => group.reachable !== group.total)
    || floor.entrances.some(entrance => entrance.outdoor !== 'connected' || entrance.indoor === 'missing')
    || floor.rooms.some(room => room.status !== 'connected') || floor.issues.length > 0,
  )
  const selectedFloorId = report?.floors.some(floor => floor.id === floorId) ? floorId : ''

  async function check() {
    setPending(true)
    setResult(null)
    try {
      const response = await fetch('/api/studio/v2/building-connectivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: { ...document, terrainTiles: undefined, _changeJournal: undefined }, buildingId, ...(roadId ? { roadId } : {}) }),
        cache: 'no-store',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || 'Building validation is unavailable.')
      }
      const report = await response.json() as BuildingConnectivityReport
      setResult({ revision, roadId, report })
    } catch (error) {
      setResult({ revision, roadId, error: error instanceof Error ? error.message : 'Building validation is unavailable.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mt-2 space-y-2 border-t border-[var(--navi-border)] pt-2 text-xs">
      <button type="button" aria-expanded={open} className="text-left font-semibold" onClick={() => setOpen(value => !value)}>
        Validate Building
      </button>
      {open && (
        <div className="space-y-2">
          <label className="block">
            Outdoor start
            <select value={roadId} onChange={event => setRoadId(event.target.value)} className="block w-full rounded border border-[var(--navi-border)] bg-[var(--navi-content)] p-1">
              <option value="">Campus gate</option>
              {document.roads.map(road => <option key={road.id} value={road.id}>{road.name?.trim() || 'Unnamed road'} · {road.id}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void check()} disabled={pending}
            className="w-full rounded border border-[var(--navi-border)] bg-[var(--navi-content)] px-2 py-1 disabled:opacity-50">
            {pending ? 'Checking draft…' : 'Check current draft'}
          </button>
          <div aria-live="polite">
            {result && !fresh && <p>Draft or start changed. Run the check again.</p>}
            {result && fresh && 'error' in result && <p role="alert">{result.error}</p>}
            {report && <p>{report.origin ? `From ${report.origin.label}` : 'No routable start found. Select an outdoor road and check again.'}</p>}
          </div>
          {report && (
            <>
              {report.origin && (
                <p className="font-semibold">{needsReview ? 'Building connectivity needs review' : 'Building routes connected from this start'}</p>
              )}
              <label className="block">
                Floor to inspect
                <select value={selectedFloorId} onChange={event => setFloorId(event.target.value)} className="block w-full rounded border border-[var(--navi-border)] bg-[var(--navi-content)] p-1">
                  <option value="">All floors</option>
                  {report.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.label}</option>)}
                </select>
              </label>
              {report.floorLinks.length > 0 && (
                <details open className="rounded border border-[var(--navi-border)] p-2">
                  <summary className="cursor-pointer font-semibold">Routes between floors</summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {report.floorLinks.filter(link => !selectedFloorId || link.from === selectedFloorId || link.to === selectedFloorId).map(link => (
                      <li key={`${link.from}-${link.to}`} className={`rounded px-2 py-1 ${linkTones[linkMissing(link.reverse) ? link.reverse : link.forward]}`}>
                        <div>{floorLabels.get(link.from)} {link.forward === link.reverse ? '↔' : '→'} {floorLabels.get(link.to)}</div>
                        <div className="font-semibold">{floorLinkLabels[link.forward]}</div>
                        {link.forward !== link.reverse && <div>Return · {floorLinkLabels[link.reverse]}</div>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="max-h-80 space-y-2 overflow-auto">
                {report.floors.filter(floor => !selectedFloorId || floor.id === selectedFloorId).map(floor => {
                  const total = floor.groups.reduce((count, group) => count + group.total, 0)
                  const reached = floor.groups.reduce((count, group) => count + group.reachable, 0)
                  const needsFloorReview = total === 0 || (report.origin && reached !== total) || floor.groups.length > 1
                    || floor.entrances.some(entrance => (entrance.outdoor !== 'connected' && entrance.outdoor !== 'no-origin') || entrance.indoor === 'missing')
                    || floor.rooms.some(room => room.status === 'search-only' || room.status === 'unreachable') || floor.issues.length > 0
                  return (
                    <details key={floor.id} open={Boolean(selectedFloorId) || floor.level === activeLevel} className="rounded border border-[var(--navi-border)] p-2">
                      <summary className={`cursor-pointer font-semibold ${needsFloorReview ? 'text-[var(--navi-error)]' : ''}`}>
                        {floor.label}{needsFloorReview ? ' · Needs review' : ''}
                      </summary>
                      <div className="mt-2 space-y-2">
                        <p>{total === 0 ? 'No indoor waypoints' : report.origin ? `${reached}/${total} waypoints reachable · ${floor.groups.length} route groups`
                          : `${total} waypoints · ${floor.groups.length} route groups`}</p>
                        {floor.groups.length > 1 && (
                          <ul className="space-y-1">
                            {floor.groups.map((group, index) => (
                              <li key={index} className={`break-words ${report.origin && group.reachable < group.total ? problemRow : ''}`}>Group {index + 1} · {report.origin ? `${group.reachable}/${group.total} reachable` : `${group.total} waypoints`} · {group.waypointId}</li>
                            ))}
                          </ul>
                        )}
                        {floor.transitions.length > 0 && <p>Indoor floor links · {floor.transitions.join(', ')}</p>}
                        {floor.issues.length > 0 && (
                          <details>
                            <summary className="cursor-pointer">Floor validation issues · {floor.issues.length}</summary>
                            <ul className="mt-1 space-y-1">
                              {floor.issues.map(issue => <li key={issue.id} className="break-words">{issue.message}</li>)}
                            </ul>
                          </details>
                        )}
                        {floor.level === activeLevel && needsFloorReview && onReviewRoutes && (
                          <button type="button" onClick={onReviewRoutes} className="underline">Review floor connections</button>
                        )}
                        <h4 className="font-semibold">Entrances</h4>
                        {floor.entrances.length === 0 && <p>No entrances on this floor</p>}
                        <ul className="space-y-2">
                          {floor.entrances.map(entrance => (
                            <li key={entrance.id} className={`break-words ${
                              entrance.outdoor === 'unassigned' || entrance.outdoor === 'unreachable' || entrance.outdoor === 'broken' || entrance.indoor === 'missing' ? problemRow : ''
                            }`}>
                              <strong>{entrance.label} · {entrance.id}</strong>
                              <div>{outdoorLabels[entrance.outdoor]}{entrance.road ? ` · ${entrance.road}` : ''}</div>
                              <div>{indoorLabels[entrance.indoor]}</div>
                              {floor.level === activeLevel && onChooseOutdoorRoute && (entrance.outdoor === 'unassigned' || entrance.outdoor === 'unreachable') && (
                                <button type="button" onClick={() => onChooseOutdoorRoute(entrance.id)} className="mt-1 underline">
                                  {entrance.outdoor === 'unassigned' ? 'Choose outdoor route' : 'Review outdoor route'}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        <details>
                          <summary className="cursor-pointer">Searchable rooms · {report.origin
                            ? `${floor.rooms.filter(room => room.status === 'connected').length}/${floor.rooms.length} reachable`
                            : floor.rooms.length}</summary>
                          <ul className="mt-1 space-y-1">
                            {floor.rooms.map(room => <li key={room.id} className={room.status === 'search-only' || room.status === 'unreachable' ? problemRow : ''}>{room.label} · {roomLabels[room.status]}</li>)}
                          </ul>
                        </details>
                      </div>
                    </details>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
