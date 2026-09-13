'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Building2, ChevronDown, ChevronRight, Route, ArrowUpDown, Layers, Trash2, Square, LogIn } from 'lucide-react'
import { useEditor, useEditingEngine } from '@navi/editor'
import { isSemanticRoomComponent, useFloorComponentsAll } from '@/hooks/floor-graph-selectors'
import type { Building, Component, ComponentType } from '@/types/nav-types'
import { getSemanticRoomIdentity } from './semantic-room-interaction'

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
  { type: 'door', label: 'Doors', icon: LogIn },
  { type: 'entrance', label: 'Entrances', icon: LogIn },
  { type: 'stair', label: 'Stairs', icon: ArrowUpDown },
  { type: 'elevator', label: 'Elevators', icon: Layers },
  { type: 'route-node', label: 'Route Nodes', icon: Route },
  { type: 'route-edge', label: 'Route Edges', icon: Route },
]

export function FloorOutliner({ building, activeFloor, mapId, selectedId, onSelect }: FloorOutlinerProps) {
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(new Set([activeFloor]))
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(building.floors.flatMap((floor) => [`${floor}:route-node`, `${floor}:route-edge`])),
  )
  const components = useFloorComponentsAll(building.id)
  const dispatcher = useEditor().services.get('dispatcher')!
  const editEngine = useEditingEngine()

  const toggleFloor = (f: number) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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

  const selectedOutlineComponent = selectedId ? components.find((component) => component.id === selectedId) : undefined
  const selectedOutlinePath = selectedOutlineComponent
    ? `${selectedOutlineComponent.floor}:${selectedOutlineComponent.type}:${typeof selectedOutlineComponent.metadata?.roomId === 'string' ? selectedOutlineComponent.metadata.roomId : ''}`
    : ''

  useEffect(() => {
    const selected = selectedOutlineComponent
    if (!selected) return
    setExpandedFloors((previous) => previous.has(selected.floor) ? previous : new Set(previous).add(selected.floor))
    setCollapsedGroups((previous) => {
      const next = new Set(previous)
      const before = next.size
      next.delete(`${selected.floor}:${selected.type}`)
      if (selected.type === 'door' && typeof selected.metadata?.roomId === 'string') {
        next.delete(`${selected.floor}:room`)
        next.delete(`${selected.floor}:room:${selected.metadata.roomId}`)
      }
      return next.size === before ? previous : next
    })
  }, [selectedId, selectedOutlinePath]) // eslint-disable-line react-hooks/exhaustive-deps -- open once per stable selection path; manual collapse stays respected

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const comp = components.find((c) => c.id === id)
    if (comp) {
      const semanticIdentity = getSemanticRoomIdentity(comp)
      if (semanticIdentity) {
        dispatcher.execute({ id: 'roomAttributes.unassign', label: 'Unassign Room', payload: { ...semanticIdentity } })
      } else if (comp.type === 'route-node') {
        dispatcher.execute({ id: 'route.node.delete', label: 'Delete Route Node', payload: { nodeId: id } })
      } else if (comp.type === 'route-edge') {
        dispatcher.execute({ id: 'route.edge.delete', label: 'Delete Route Edge', payload: { edgeId: id } })
      } else {
        editEngine.begin({ kind: 'delete', entityIds: [id] })
        editEngine.doCommit()
        if (comp.type === 'stair' || comp.type === 'elevator') {
          const featureId = comp.featureId || (id.includes('-') ? id.split('-')[0] : id)
          dispatcher.execute({ id: 'feature.delete', label: `Delete ${comp.type}`, payload: { featureId } })
        } else {
          const cmdId = ({ room: 'room.delete', hallway: 'hallway.delete', entrance: 'entrance.delete', restroom: 'room.delete', area: 'area.delete', door: 'door.delete' })[comp.type]
          const payloadKey = ({ room: 'roomId', hallway: 'hallwayId', entrance: 'entranceId', restroom: 'roomId', area: 'areaId', door: 'doorId' })[comp.type]
          if (cmdId && payloadKey) {
            dispatcher.execute({ id: cmdId, label: `Delete ${comp.type}`, payload: { [payloadKey]: id } })
          }
        }
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
          const roomIds = new Set((floorComps?.get('room') ?? []).map((room) => room.id))
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
                    const allItems = floorComps?.get(type) ?? []
                    const items = type === 'door'
                      ? allItems.filter((door) => typeof door.metadata?.roomId !== 'string' || !roomIds.has(door.metadata.roomId))
                      : allItems
                    if (items.length === 0) return null
                    const groupKey = `${f}:${type}`
                    const expandedGroup = !collapsedGroups.has(groupKey)

                    return (
                      <div key={type} style={{ marginBottom: 2 }}>
                        <button type="button" aria-label={`${expandedGroup ? 'Collapse' : 'Expand'} ${groupLabel}`} onClick={() => toggleGroup(groupKey)} style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                          fontWeight: 600, color: 'var(--navi-text-secondary)',
                          width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
                        }}>
                          {expandedGroup ? <ChevronDown size={10} /> : <ChevronRight size={10} />}<Icon size={10} /> {groupLabel} ({items.length})
                        </button>
                        {expandedGroup && items.map((c) => {
                          const isSelected = selectedId === c.id
                          const assignedDoors = type === 'room'
                            ? (floorComps?.get('door') ?? []).filter((door) => door.metadata?.roomId === c.id)
                            : []
                          const roomKey = `${f}:room:${c.id}`
                          const roomExpanded = !collapsedGroups.has(roomKey)
                          return (
                            <div key={c.id}>
                              <div
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
                                {assignedDoors.length > 0 && (
                                  <button type="button" aria-label={`${roomExpanded ? 'Collapse' : 'Expand'} Room ${c.name}`} onClick={(event) => { event.stopPropagation(); toggleGroup(roomKey) }}
                                    style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: 'inherit', cursor: 'pointer' }}>
                                    {roomExpanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                                  </button>
                                )}
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.name}
                                </span>
                                {isSemanticRoomComponent(c) && (
                                  <span title="Derived from wall face" style={{ fontSize: 8, opacity: isSelected ? 0.9 : 0.65, fontStyle: 'italic' }}>
                                    derived
                                  </span>
                                )}
                                {isActive && (
                                  <button aria-label={`Delete ${c.name}`} onClick={(e) => handleDelete(e, c.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: isSelected ? 'white' : 'var(--navi-text-secondary)', display: 'flex', opacity: 0.6 }}>
                                    <Trash2 size={9} />
                                  </button>
                                )}
                              </div>
                              {roomExpanded && assignedDoors.map((door) => {
                                const doorSelected = selectedId === door.id
                                return (
                                  <div key={door.id} onClick={() => isActive && onSelect(doorSelected ? null : door.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 32px', cursor: isActive ? 'pointer' : 'default', background: doorSelected ? 'var(--navi-primary)' : 'transparent', color: doorSelected ? 'white' : 'var(--navi-text-secondary)', borderRadius: 3, margin: '1px 4px' }}>
                                    <LogIn size={9} />
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{door.name}</span>
                                    {isActive && <button aria-label={`Delete ${door.name}`} onClick={(event) => handleDelete(event, door.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex', opacity: 0.6 }}><Trash2 size={9} /></button>}
                                  </div>
                                )
                              })}
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
