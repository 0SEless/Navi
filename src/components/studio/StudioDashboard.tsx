'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCampusMapStore } from '@/store/campus-map-store'
import { MapCard } from './MapCard'

export function StudioDashboard() {
  const router = useRouter()
  const maps = useCampusMapStore((s) => s.maps)
  const load = useCampusMapStore((s) => s.load)
  const deleteMap = useCampusMapStore((s) => s.deleteMap)

  useEffect(() => { load() }, [load])

  const handleDelete = (id: string) => {
    const map = maps.find((m) => m.id === id)
    if (!map) return
    if (window.confirm(`Delete "${map.name}"? This cannot be undone.`)) {
      deleteMap(id)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--navi-text)', margin: 0 }}>NAVI Studio</h1>
          <p style={{ color: 'var(--navi-text-secondary)', fontSize: 12, margin: '2px 0 0' }}>
            {maps.length} map{maps.length !== 1 ? 's' : ''} · {maps.reduce((s, m) => s + (m.stats?.buildings ?? 0), 0)} buildings
          </p>
        </div>
      </div>
      <div style={{ padding: '0 24px 24px', flex: 1 }}>
        {maps.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--navi-text-secondary)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No maps yet</div>
            <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300 }}>Create your first campus map to start tracing buildings and setting up navigation.</div>
            <button
              onClick={() => router.push('/studio/create')}
              style={{
                marginTop: 8,
                padding: '8px 20px',
                background: 'var(--navi-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Create Map
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            <MapCard onCreate={() => router.push('/studio/create')} />
            {maps.map((map) => (
              <MapCard
                key={map.id}
                map={map}
                onView={(id) => router.push(`/studio/${id}/preview`)}
                onEdit={(id) => router.push(`/studio/${id}/edit`)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
