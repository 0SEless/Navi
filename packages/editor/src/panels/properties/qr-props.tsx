import { useCallback } from 'react'
import type { QRCheckpoint } from '@navi/core'
import { useEditor, useEditingEngine } from '../../context'
import { Field } from './field'

interface Props { qr: QRCheckpoint }

export function QRProperties({ qr }: Props) {
  const { services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get<any>('dispatcher')

  const update = useCallback((changes: Record<string, unknown>) => {
    for (const [property, value] of Object.entries(changes)) {
      editEngine.begin({ kind: 'assign', entityId: qr.id, property, value })
      editEngine.doCommit()
    }
    dispatcher.execute({ id: 'entity.update', label: 'Edit QR', payload: { entityId: qr.id, changes } })
  }, [editEngine, dispatcher, qr.id])

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>QR Checkpoint</div>
      <Field label="Label"><input value={qr.label} onChange={e => update({ label: e.target.value })} /></Field>
      <Field label="Code"><input value={qr.code} onChange={e => update({ code: e.target.value })} /></Field>
    </div>
  )
}
