import { useCallback } from 'react'
import type { Entrance } from '@navi/core'
import { useEditor, useEditingEngine } from '../../context'
import { Field, selectStyle } from './field'

interface Props { entrance: Entrance }

export function EntranceProperties({ entrance }: Props) {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    for (const [property, value] of Object.entries(changes)) {
      editEngine.begin({ kind: 'assign', entityId: entrance.id, property, value })
      editEngine.doCommit()
    }
    dispatcher.execute({ id: 'entity.update', label: 'Edit Entrance', payload: { entityId: entrance.id, changes } })
  }, [editEngine, dispatcher, entrance.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Entrance</div>
      <Field label="Label"><input value={entrance.label} onChange={e => update({ label: e.target.value })} /></Field>
      <Field label="Type">
        <select value={entrance.type} onChange={e => update({ type: e.target.value })} style={selectStyle}>
          {['main','side','service','emergency'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Has QR">
        <input type="checkbox" checked={entrance.hasQR} onChange={e => update({ hasQR: e.target.checked })} />
      </Field>
      <Field label="Has Panorama">
        <input type="checkbox" checked={entrance.hasPanorama} onChange={e => update({ hasPanorama: e.target.checked })} />
      </Field>
    </div>
  )
}
