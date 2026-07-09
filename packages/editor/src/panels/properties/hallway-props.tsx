import { useCallback } from 'react'
import type { Hallway } from '@navi/core'
import { useEditor } from '../../context'
import { Field } from './field'

interface Props { hallway: Hallway }

export function HallwayProperties({ hallway }: Props) {
  const { services } = useEditor()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    dispatcher.execute({ id: 'entity.update', label: 'Edit Hallway', payload: { entityId: hallway.id, changes } })
  }, [dispatcher, hallway.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Hallway</div>
      <Field label="Name"><input value={hallway.name} onChange={e => update({ name: e.target.value })} /></Field>
      <Field label="Width (m)">
        <input type="range" min={1} max={10} step={0.5} value={hallway.width} onChange={e => update({ width: parseFloat(e.target.value) })} />
        <span style={{ marginLeft: 4, color: '#888' }}>{hallway.width}m</span>
      </Field>
      <Field label="Color"><input type="color" value={hallway.color || '#B0C4DE'} onChange={e => update({ color: e.target.value })} /></Field>
    </div>
  )
}
