'use client'

import { useState } from 'react'
import { useEditor } from '@navi/editor'
import { useFloorComponent } from '@/hooks/floor-graph-selectors'

const DEFAULT_ROOM_WIDTH = 4
const DEFAULT_ROOM_HEIGHT = 5
const DEFAULT_FLOOR = 0

interface ComponentPropertiesProps {
  componentId: string | null
  onClose: () => void
}

export function ComponentProperties({ componentId, onClose }: ComponentPropertiesProps) {
  const component = useFloorComponent(componentId)
  const dispatcher = useEditor().services.get('dispatcher')!

  const [name, setName] = useState(component?.name ?? '')
  const [width, setWidth] = useState(component?.dimensions?.width ?? DEFAULT_ROOM_WIDTH)
  const [height, setHeight] = useState(component?.dimensions?.height ?? DEFAULT_ROOM_HEIGHT)
  const [rangeFrom, setRangeFrom] = useState(component?.range?.from ?? component?.floor ?? DEFAULT_FLOOR)
  const [rangeTo, setRangeTo] = useState(component?.range?.to ?? (component?.floor ?? DEFAULT_FLOOR) + 1)

  if (!component) return null

  const isRoom = component.type === 'room'
  const isEntrance = component.type === 'entrance'
  const isStairOrElevator = component.type === 'stair' || component.type === 'elevator'

  const handleSave = () => {
    const changes: Record<string, unknown> = { name }
    if (isRoom) {
      changes.dimensions = { width, height }
    }
    if (isStairOrElevator) {
      changes.range = { from: rangeFrom, to: rangeTo }
    }
    if (isEntrance) {
      changes.label = name
    }
    dispatcher.execute({
      id: 'entity.update',
      label: 'Update Properties',
      payload: { entityId: component.id, changes },
    })
  }

  const handleDelete = () => {
    const cmdId = ({ room: 'room.delete', hallway: 'hallway.delete', stair: 'staircase.delete', elevator: 'elevator.delete', entrance: 'entrance.delete', restroom: 'room.delete' })[component.type]
    const payloadKey = ({ room: 'roomId', hallway: 'hallwayId', stair: 'staircaseId', elevator: 'elevatorId', entrance: 'entranceId', restroom: 'roomId' })[component.type]
    if (cmdId && payloadKey) {
      dispatcher.execute({ id: cmdId, label: `Delete ${component.type}`, payload: { [payloadKey]: component.id } })
    }
    onClose()
  }

  return (
    <div style={{ borderTop: '1px solid var(--navi-border)' }}>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Properties
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }}>NAME</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
                background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }}>TYPE</label>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--navi-content)', color: 'var(--navi-text-secondary)', textTransform: 'uppercase' }}>
              {component.type}
            </span>
          </div>

          {isRoom && (
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }}>WIDTH</label>
                <input type="number" min={1} value={width} onChange={(e) => setWidth(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }}>HEIGHT</label>
                <input type="number" min={1} value={height} onChange={(e) => setHeight(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          {isEntrance && (
            <div>
              <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }}>FLOOR</label>
              <span style={{ fontSize: 11, color: 'var(--navi-text)' }}>
                {component.floor === 0 ? 'GF' : component.floor > 0 ? `${component.floor}F` : `${component.floor}F`}
              </span>
            </div>
          )}

          {isStairOrElevator && (
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }}>FROM FLOOR</label>
                <input type="number" value={rangeFrom} onChange={(e) => setRangeFrom(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)', display: 'block', marginBottom: 2 }}>TO FLOOR</label>
                <input type="number" value={rangeTo} onChange={(e) => setRangeTo(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)',
                    background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button onClick={handleSave}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 4, border: 'none',
                background: 'var(--navi-primary)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >Save</button>
            <button onClick={handleDelete}
              style={{
                padding: '5px 10px', borderRadius: 4, border: 'none',
                background: '#DC2625', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >Delete</button>
          </div>
        </div>
      </div>
    </div>
  )
}
