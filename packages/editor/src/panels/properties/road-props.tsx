import { useCallback } from 'react'
import type { Road } from '@navi/core'
import { useEditor, useEditingEngine } from '../../context'
import { Field, selectStyle } from './field'

interface Props { road: Road }

export function RoadProperties({ road }: Props) {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    for (const [property, value] of Object.entries(changes)) {
      editEngine.begin({ kind: 'assign', entityId: road.id, property, value })
      editEngine.doCommit()
    }
    dispatcher.execute({ id: 'entity.update', label: 'Edit Road', payload: { entityId: road.id, changes } })
  }, [editEngine, dispatcher, road.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Road</div>
      <Field label="Name"><input value={road.name} onChange={e => update({ name: e.target.value })} /></Field>
      <Field label="Width (m)">
        <input type="range" min={2} max={20} step={1} value={road.width} onChange={e => update({ width: parseFloat(e.target.value) })} />
        <span style={{ marginLeft: 4, color: '#888' }}>{road.width}m</span>
      </Field>
      <Field label="Surface">
        <select value={road.surface} onChange={e => update({ surface: e.target.value })} style={selectStyle}>
          {['paved','concrete','brick','gravel','grass','unpaved'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Type">
        <select value={road.type} onChange={e => update({ type: e.target.value })} style={selectStyle}>
          {['arterial','connector','service'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
    </div>
  )
}
