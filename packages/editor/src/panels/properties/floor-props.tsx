import { useCallback } from 'react'
import type { Floor } from '@navi/core'
import { useEditor } from '../../context'
import { Field, inputStyle } from './field'

interface Props { floor: Floor }

export function FloorProperties({ floor }: Props) {
  const { services } = useEditor()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    dispatcher.execute({ id: 'entity.update', label: 'Edit Floor', payload: { entityId: floor.id, changes } })
  }, [dispatcher, floor.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Floor</div>
      <Field label="Label"><input value={floor.label} onChange={e => update({ label: e.target.value })} /></Field>
      <Field label="Level"><input type="number" value={floor.level} disabled style={{ ...inputStyle, opacity: 0.5 }} /></Field>
      <Field label="Elevation (m)"><input type="number" value={floor.elevation} onChange={e => update({ elevation: parseFloat(e.target.value) || 0 })} /></Field>
    </div>
  )
}
