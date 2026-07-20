import { useCallback } from 'react'
import type { Panorama } from '@navi/core'
import { useEditor, useEditingEngine } from '../../context'
import { Field } from './field'

interface Props { panorama: Panorama }

export function PanoramaProperties({ panorama }: Props) {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    for (const [property, value] of Object.entries(changes)) {
      editEngine.begin({ kind: 'assign', entityId: panorama.id, property, value })
      editEngine.doCommit()
    }
    dispatcher.execute({ id: 'entity.update', label: 'Edit Panorama', payload: { entityId: panorama.id, changes } })
  }, [editEngine, dispatcher, panorama.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Panorama</div>
      <Field label="Label"><input value={panorama.label} onChange={e => update({ label: e.target.value })} /></Field>
      <Field label="Heading (°)">
        <input type="range" min={0} max={360} step={1} value={panorama.heading} onChange={e => update({ heading: parseFloat(e.target.value) })} />
        <span style={{ marginLeft: 4, color: '#888' }}>{panorama.heading}°</span>
      </Field>
      <Field label="Image Asset"><input value={panorama.imageAssetId} onChange={e => update({ imageAssetId: e.target.value })} /></Field>
      <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
        Hotspots: {panorama.hotspots.length}
      </div>
    </div>
  )
}
