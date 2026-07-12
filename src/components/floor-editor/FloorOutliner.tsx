'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Building2, ChevronDown, ChevronRight, Route, ArrowUpDown, Layers, Trash2, Square, LogIn } from 'lucide-react'
import { useEditor } from '@navi/editor'
import { useFloorComponentsAll } from '@/hooks/floor-graph-selectors'
import type { Building, Component, ComponentType } from '@/types/nav-types'

interface FloorOutlinerProps {
  building: Building
  activeFloor: number
  mapId: string
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function floorLabel(f: number) {
  return f === 0 ? 'GF' : f > 0 ? `${f}F` : `${f}F`
}

const TYPE_GROUPS: { type: ComponentType; label: string; icon: React.ElementType }[] = [
  { type: 'hallway', label: 'Hallways', icon: Route },
  { type: 'room', label: 'Rooms', icon: Square },
  { type: 'entrance', label: 'Entrances', icon: LogIn },
  { type: 'stair', label: 'Stairs', icon: ArrowUpDown },
  { type: 'elevator', label: 'Elevators', icon: Layers },
]

export function FloorOutliner({ building, activeFloor, mapId, selectedId, onSelect }: FloorOutlinerProps) {
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(new Set([activeFloor]))
  const components = useFloorComponentsAll(building.id)
  const dispatcher = useEditor().services.get('dispatcher')!

  const toggleFloor = (f: number) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  const floorComponents = useMemo(() => {
    const map = new Map<number, Map<ComponentType, Component[]>>()
    for (const c of components) {
      if (c.buildingId !== building.id) continue
      if (!map.has(c.floor)) map.set(c.floor, new Map())
      const typeMap = map.get(c.floor)!
      if (!typeMap.has(c.type)) typeMap.set(c.type, [])
      typeMap.get(c.type)!.push(c)
    }
    return map
  }, [components, building.id])

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const comp = components.find((c) => c.id === id)
    if (comp) {
      const cmdId = ({ room: 'room.delete', hallway: 'hallway.delete', stair: 'staircase.delete', elevator: 'elevator.delete', entrance: 'entrance.delete', restroom: 'room.delete' })[comp.type]
      const payloadKey = ({ room: 'roomId', hallway: 'hallwayId', stair: 'staircaseId', elevator: 'elevatorId', entrance: 'entranceId', restroom: 'roomId' })[comp.type]
      if (cmdId && payloadKey) {
        dispatcher.execute({ id: cmdId, label: `Delete ${comp.type}`, payload: { [payloadKey]: id } })
      }
    }
    if (selectedId === id) onSelect(null)
  }

  return (
    <div style={{
      width: 200,
      background: 'var(--navi-card)',
      borderRight: '1px solid var(--navi-border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--navi-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Outliner
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          fontSize: 11, fontWeight: 600, color: 'var(--navi-text)',
        }}>
          <Building2 size={14} style={{ color: building.color || '#1C6BEB' }} />
          {building.name}
        </div>

        {building.floors.map((f) => {
          const isActive = f === activeFloor
          const expanded = expandedFloors.has(f)
          const floorComps = floorComponents.get(f)
          return (
            <div key={f}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 28px',
                background: isActive ? 'var(--navi-content)' : 'transparent',
              }}>
                <button onClick={() => toggleFloor(f)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navi-text-secondary)', display: 'flex', padding: 2 }}>
                  {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>
                {isActive ? (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--navi-primary)', flex: 1,
                  }}>{floorLabel(f)}</span>
                ) : (
                  <Link href={`/studio/${mapId}/edit/building/${building.id}/floor/${f}`}
                    style={{ fontSize: 11, fontWeight: 500, color: 'var(--navi-text)', flex: 1, textDecoration: 'none' }}>
                    {floorLabel(f)}
                  </Link>
                )}
              </div>

              {expanded && (
                <div style={{ paddingLeft: 40, fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                  {TYPE_GROUPS.map(({ type, label: groupLabel, icon: Icon }) => {
                    const items = floorComps?.get(type) ?? []
                    if (items.length === 0) return null

                    return (
                      <div key={type} style={{ marginBottom: 2 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                          fontWeight: 600, color: 'var(--navi-text-secondary)',
                        }}>
                          <Icon size={10} /> {groupLabel} ({items.length})
                        </div>
                        {items.map((c) => {
                          const isSelected = selectedId === c.id
                          return (
                            <div key={c.id}
                              onClick={() => isActive && onSelect(isSelected ? null : c.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 18px',
                                cursor: isActive ? 'pointer' : 'default',
                                background: isSelected ? 'var(--navi-primary)' : 'transparent',
                                color: isSelected ? 'white' : 'var(--navi-text-secondary)',
                                borderRadius: 3,
                                margin: '1px 4px',
                              }}
                              onMouseEnter={(e) => { if (isActive && !isSelected) e.currentTarget.style.background = 'var(--navi-content)' }}
                              onMouseLeave={(e) => { if (isActive && !isSelected) e.currentTarget.style.background = 'transparent' }}
                            >
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.name}
                              </span>
                              {isActive && (
                                <button onClick={(e) => handleDelete(e, c.id)}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                    color: isSelected ? 'white' : 'var(--navi-text-secondary)',
                                    display: 'flex', opacity: 0.6,
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
                                >
                                  <Trash2 size={9} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {(!floorComps || floorComps.size === 0) && (
                    <div style={{ padding: '3px 6px', fontStyle: 'italic', opacity: 0.5 }}>
                      No components
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
