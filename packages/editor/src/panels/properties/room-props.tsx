import { useCallback } from 'react'
import type { Room } from '@navi/core'
import { useEditor } from '../../context'
import { Field, selectStyle } from './field'

interface Props { room: Room }

export function RoomProperties({ room }: Props) {
  const { services } = useEditor()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    dispatcher.execute({ id: 'entity.update', label: 'Edit Room', payload: { entityId: room.id, changes } })
  }, [dispatcher, room.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Room</div>
      <Field label="Name"><input value={room.name} onChange={e => update({ name: e.target.value })} /></Field>
      <Field label="Number"><input value={room.number} onChange={e => update({ number: e.target.value })} /></Field>
      <Field label="Category">
        <select value={room.category} onChange={e => update({ category: e.target.value })} style={selectStyle}>
          {['classroom','office','lab','restroom','stairwell','elevator_lobby','lobby','storage','meeting','auditorium','server','utility','other'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Capacity"><input type="number" value={room.capacity ?? ''} onChange={e => update({ capacity: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
      <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
        Polygon: {room.polygon.points.length} vertices
      </div>
    </div>
  )
}
