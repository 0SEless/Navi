import { useCallback } from 'react'
import type { Building } from '@navi/core'
import { useEditor } from '../../context'
import { Field, inputStyle, selectStyle } from './field'

interface Props { building: Building }

export function BuildingProperties({ building }: Props) {
  const { services } = useEditor()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    dispatcher.execute({ id: 'entity.update', label: 'Edit Building', payload: { entityId: building.id, changes } })
  }, [dispatcher, building.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Building</div>
      <Field label="Name"><input value={building.name} onChange={e => update({ name: e.target.value })} /></Field>
      <Field label="Code"><input value={building.code} onChange={e => update({ code: e.target.value })} /></Field>
      <Field label="Category">
        <select value={building.category} onChange={e => update({ category: e.target.value })} style={selectStyle}>
          {['academic','residential','administrative','facility','library','dining','sports','parking','health','other'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Description"><textarea value={building.description} onChange={e => update({ description: e.target.value })} rows={2} /></Field>
      <Field label="Color"><input type="color" value={building.color} onChange={e => update({ color: e.target.value })} /></Field>
      <Field label="Base Elevation (m)"><input type="number" value={building.baseElevation} onChange={e => update({ baseElevation: parseFloat(e.target.value) || 0 })} /></Field>
      <Field label="Height (m)"><input type="number" value={building.height} onChange={e => update({ height: parseFloat(e.target.value) || 0 })} /></Field>
    </div>
  )
}
