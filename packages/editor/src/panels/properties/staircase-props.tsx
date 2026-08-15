import { useCallback } from 'react'
import type { LegacyStaircase } from '@navi/core'
import { useEditor, useEditingEngine } from '../../context'
import { Field, selectStyle } from './field'

interface Props { staircase: LegacyStaircase }

export function StaircaseProperties({ staircase }: Props) {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    for (const [property, value] of Object.entries(changes)) {
      editEngine.begin({ kind: 'assign', entityId: staircase.id, property, value })
      editEngine.doCommit()
    }
    dispatcher.execute({ id: 'entity.update', label: 'Edit Staircase', payload: { entityId: staircase.id, changes } })
  }, [editEngine, dispatcher, staircase.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Staircase</div>
      <Field label="Name"><input value={staircase.name} onChange={e => update({ name: e.target.value })} /></Field>
      <Field label="From Level"><input type="number" value={staircase.fromLevel} onChange={e => update({ fromLevel: parseInt(e.target.value) || 0 })} /></Field>
      <Field label="To Level"><input type="number" value={staircase.toLevel} onChange={e => update({ toLevel: parseInt(e.target.value) || 0 })} /></Field>
      <Field label="Type">
        <select value={staircase.type} onChange={e => update({ type: e.target.value })} style={selectStyle}>
          {['open','enclosed','emergency'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
    </div>
  )
}
