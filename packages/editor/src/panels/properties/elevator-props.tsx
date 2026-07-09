import { useCallback } from 'react'
import type { Elevator } from '@navi/core'
import { useEditor } from '../../context'
import { Field } from './field'

interface Props { elevator: Elevator }

export function ElevatorProperties({ elevator }: Props) {
  const { services } = useEditor()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    dispatcher.execute({ id: 'entity.update', label: 'Edit Elevator', payload: { entityId: elevator.id, changes } })
  }, [dispatcher, elevator.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Elevator</div>
      <Field label="Name"><input value={elevator.name} onChange={e => update({ name: e.target.value })} /></Field>
      <Field label="From Level"><input type="number" value={elevator.fromLevel} onChange={e => update({ fromLevel: parseInt(e.target.value) || 0 })} /></Field>
      <Field label="To Level"><input type="number" value={elevator.toLevel} onChange={e => update({ toLevel: parseInt(e.target.value) || 0 })} /></Field>
    </div>
  )
}
