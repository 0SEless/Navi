'use client'

import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { PanoramaView } from '../selectors'
import { groupTourScenes } from '../tour-selectors'
import styles from './VirtualTourWorkspace.module.css'

export interface HotspotDraftPoint { type: 'navigation' | 'information'; yaw: number; pitch: number }
/** A transient placement review. Does not own or write a tour document. */
export function HotspotDialog({ draft, scenes, sourceId, onClose }: { draft: HotspotDraftPoint; scenes: PanoramaView[]; sourceId: string; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const returnFocus = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement)
  const [target, setTarget] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const navigation = draft.type === 'navigation'
  const canAdvance = navigation ? Boolean(target) : Boolean(title.trim())
  const steps = [navigation ? 'Target' : 'Content', 'Style', 'Confirm']
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal container={typeof document === 'undefined' ? undefined : (document.fullscreenElement as HTMLElement | null) ?? undefined}>
    <Dialog.Overlay className={styles.dialogOverlay} /><Dialog.Content className={styles.dialog} aria-describedby="hotspot-draft-note" onCloseAutoFocus={event => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus() } }}>
      <div className={styles.panelHeading}><Dialog.Title>Add {navigation ? 'Navigation' : 'Information'} Hotspot</Dialog.Title><Dialog.Close aria-label="Close hotspot dialog">×</Dialog.Close></div>
      <ol className={styles.steps}>{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
      <Dialog.Description id="hotspot-draft-note" className={styles.panelNote}>Placement draft only. Creating hotspots is unavailable until canonical saving is connected.</Dialog.Description>
      {step === 0 && (navigation ? <label className={styles.dialogField}>Target Scene<select aria-label="Target Scene" value={target} onChange={event => setTarget(event.target.value)}><option value="">Select destination scene…</option>{groupTourScenes(scenes.filter(scene => scene.id !== sourceId)).map(group => <optgroup key={group.id} label={group.label}>{group.sections.flatMap(section => section.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.label}{section.label ? ` · ${section.label}` : ''}</option>))}</optgroup>)}</select></label> : <>
        <label className={styles.dialogField}>Title<input value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className={styles.dialogField}>Description<textarea rows={4} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label className={styles.dialogField}>Link URL (optional)<input type="url" value={link} onChange={event => setLink(event.target.value)} /></label>
      </>)}
      {step === 1 && <div className={styles.stylePreview}><span className={styles.markerIcon} data-type={draft.type}>{navigation ? '↑' : 'i'}</span><strong>Standard {navigation ? 'navigation' : 'information'} marker</strong><p>Green scene transition / blue information marker. Custom styling is not supported by the current hotspot format.</p></div>}
      {step === 2 && <div className={styles.confirm}><h3>{navigation ? scenes.find(scene => scene.id === target)?.label : title}</h3>{!navigation && <><p>{description}</p>{link && <p>{link}</p>}</>}<p>Yaw {draft.yaw.toFixed(1)}° · Pitch {draft.pitch.toFixed(1)}°</p><p>Source scene: {scenes.find(scene => scene.id === sourceId)?.label}</p></div>}
      <div className={styles.dialogActions}><Dialog.Close>Cancel</Dialog.Close>{step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}{step < 2 ? <button className={styles.primary} disabled={!canAdvance} onClick={() => setStep(step + 1)}>Next</button> : <button className={styles.primary} disabled>Create Hotspot</button>}</div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
