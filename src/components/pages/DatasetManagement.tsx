'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Database, School } from 'lucide-react'
import type { CampusDocument } from '@navi/core'
import { useCampusMapStore } from '@/store/campus-map-store'
import { MapCard } from '@/components/studio/MapCard'
import {
  getCampusDisplayStats,
  type CampusDisplayStats,
  type GraphStatsSource,
} from '@/components/studio/studio-display-stats'

/**
 * Dataset Management — entry screen.
 *
 * Shows the campuses already authored in NAVI Studio (single source of truth:
 * `useCampusMapStore`). Selecting a campus opens its Dataset workspace.
 * Campus creation/authoring stays in NAVI Studio — this screen never creates
 * or edits campus data.
 *
 * Card statistics are display-only and derived from the actual loaded
 * campus dataset via the shared authoritative helper (same precedence as
 * Studio): authoredDocument → contentful campus-matching graph → the
 * existing `campus.stats` fallback. Graph reads are keyed GET-only
 * requests; nothing is ever saved, synced, or published.
 */

interface LoadedCampusData {
  graph: GraphStatsSource | null
  authoredDocument: CampusDocument | null
}

export function DatasetManagement() {
  const router = useRouter()
  const maps = useCampusMapStore((s) => s.maps)
  const load = useCampusMapStore((s) => s.load)
  const deleteMap = useCampusMapStore((s) => s.deleteMap)

  useEffect(() => { load() }, [load])

  // Display-accurate statistics: read-only GET of each campus's graph
  // snapshot (once per campus id). Never saves, syncs, or publishes.
  const [loaded, setLoaded] = useState<Record<string, LoadedCampusData>>({})

  useEffect(() => {
    if (maps.length === 0 || typeof fetch !== 'function') return
    const missing = maps.filter((m) => !(m.id in loaded))
    if (missing.length === 0) return
    let cancelled = false
    void (async () => {
      for (const campus of missing) {
        try {
          const res = await fetch(
            `/api/graph?campus_id=${encodeURIComponent(campus.id)}`,
            { credentials: 'include' }
          )
          if (!res.ok) continue
          const payload = await res.json()
          // Stale graph guard: only data that identifies as this campus
          // is used (same guard as the Studio statistics path).
          const payloadCampusId = payload?.campusId ?? payload?.id
          if (payloadCampusId !== campus.id) continue
          if (cancelled) return
          setLoaded((prev) =>
            campus.id in prev
              ? prev
              : {
                  ...prev,
                  [campus.id]: {
                    graph: (payload as GraphStatsSource) ?? null,
                    authoredDocument: (payload?.authoredDocument as CampusDocument | undefined) ?? null,
                  },
                }
          )
        } catch {
          // Failed/missing graphs keep the existing campus.stats fallback.
        }
      }
    })()
    return () => { cancelled = true }
  }, [maps, loaded])

  const displayStatsById = useMemo(() => {
    const out: Record<string, CampusDisplayStats> = {}
    for (const m of maps) {
      const source = loaded[m.id]
      out[m.id] = getCampusDisplayStats({
        campus: m,
        authoredDocument: source?.authoredDocument ?? null,
        graph: source?.graph ?? null,
      })
    }
    return out
  }, [maps, loaded])

  const handleDelete = (id: string) => {
    const map = maps.find((m) => m.id === id)
    if (!map) return
    if (window.confirm(`Delete "${map.name}"? This cannot be undone.`)) {
      deleteMap(id)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--navi-text)', margin: 0 }}>Dataset Management</h1>
        <p style={{ color: 'var(--navi-text-secondary)', fontSize: 12, margin: '2px 0 0' }}>
          Select an authored campus to manage its dataset
        </p>
        <Link href="/dataset/tools" style={{ display: 'inline-block', marginTop: 8, color: 'var(--navi-primary)', fontSize: 12, fontWeight: 600 }}>
          Legacy export, import, validation, and backup tools
        </Link>
      </div>

      {/* Campus selection grid */}
      <div style={{ padding: '0 24px 24px', flex: 1 }}>
        {maps.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--navi-text-secondary)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--navi-card)', border: '1px solid var(--navi-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={20} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No authored campuses yet</div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 340 }}>
              Campuses are authored in NAVI Studio. Create one there, then return here to manage its dataset.
            </div>
            <button
              type="button"
              onClick={() => router.push('/studio')}
              style={{ marginTop: 8, padding: '8px 20px', background: 'var(--navi-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <School size={14} /> Open NAVI Studio
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 11, color: 'var(--navi-text-secondary)', margin: '0 0 12px' }}>
              {maps.length} campus{maps.length !== 1 ? 'es' : ''} available
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {maps.map((map) => (
                <MapCard
                  key={map.id}
                  map={map}
                  displayStats={displayStatsById[map.id]}
                  onView={(id) => router.push(`/dataset/${id}`)}
                  onEdit={(id) => router.push(`/studio/${id}/edit`)}
                  onCaptureLibrary={(id) => router.push(`/studio/${id}/edit/capture-library`)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
