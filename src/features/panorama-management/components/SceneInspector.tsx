'use client'

import { ArrowUp, CheckCircle2, Info, ImageOff } from 'lucide-react'
import type { PanoramaView } from '../selectors'
import type { TourPanorama, TourHotspot } from '@/components/tour/types'
import styles from './VirtualTourWorkspace.module.css'

export function SceneInspector({ scene, view, scenes, tab, onTabChange, selectedHotspotId, onHotspotSelect, onNavigate, onInformation }: { scene: TourPanorama; view: PanoramaView; scenes: TourPanorama[]; tab: 'scene' | 'hotspots'; onTabChange: (tab: 'scene' | 'hotspots') => void; selectedHotspotId: string | null; onHotspotSelect: (id: string) => void; onNavigate: (id: string) => void; onInformation: (hotspot: TourHotspot) => void }) {
  const selected = scene.hotspots.find(hotspot => hotspot.id === selectedHotspotId)
  return <div className={styles.inspector}>
    <div role="tablist" aria-label="Scene inspector" className={styles.tabs} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 'scene' : event.key === 'End' ? 'hotspots' : tab === 'scene' ? 'hotspots' : 'scene'
      onTabChange(next)
      event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus()
    }}>
      <button role="tab" id="scene-tab" tabIndex={tab === 'scene' ? 0 : -1} aria-controls="scene-panel" aria-selected={tab === 'scene'} onClick={() => onTabChange('scene')}>Scene</button>
      <button role="tab" id="hotspots-tab" tabIndex={tab === 'hotspots' ? 0 : -1} aria-controls="hotspots-panel" aria-selected={tab === 'hotspots'} onClick={() => onTabChange('hotspots')}>Hotspots ({scene.hotspots.length})</button>
    </div>
    {tab === 'scene' ? <div role="tabpanel" id="scene-panel" aria-labelledby="scene-tab" className={styles.panelBody}>
      <div className={styles.imageNotice}>{view.hasImage ? <><CheckCircle2 size={24} /><strong>360° image available</strong><span>Displayed in the viewer</span></> : <><ImageOff size={24} /><strong>Missing image</strong></>}
        <button disabled>Change Image</button>
      </div>
      <dl className={styles.fields}>
        <div><dt>Scene ID</dt><dd>{scene.id}</dd></div>
        <div><dt>Scene Label</dt><dd>{scene.label}</dd></div>
        <div><dt>Building</dt><dd>{view.scope === 'outdoor' ? 'Outdoor' : view.buildingName || 'Unknown building'}</dd></div>
        {view.scope === 'building' && <div><dt>Floor</dt><dd>{view.floorLabel || 'Unassigned floor'}</dd></div>}
        <div><dt>Position ({view.position.kind})</dt><dd>{view.position.display}</dd></div>
        <div><dt>Heading</dt><dd>{view.heading}°</dd></div>
      </dl>
      <section className={styles.sceneStatus}><h3>Scene Status</h3><strong data-health={view.health}>{view.health.replaceAll('-', ' ')}</strong><p>{scene.hotspots.length} hotspots · {view.hasImage ? 'Image reference available' : 'Image required'}</p>
        {view.issues.map((issue, index) => <p key={index}>{issue.message}</p>)}
      </section>
      <p className={styles.panelNote}>Scene and image editing await the standalone saving connection.</p>
    </div> : <div role="tabpanel" id="hotspots-panel" aria-labelledby="hotspots-tab" className={styles.panelBody}>
      {!scene.hotspots.length && <p>No hotspots in this scene.</p>}
      {scene.hotspots.map(hotspot => <button className={styles.hotspotRow} key={hotspot.id} aria-pressed={selectedHotspotId === hotspot.id} onClick={() => onHotspotSelect(hotspot.id)}>
        <span className={styles.markerIcon} data-type={hotspot.type}>{hotspot.type === 'information' ? <Info size={20} /> : <ArrowUp size={20} />}</span><span><strong>{hotspot.label}</strong><small>{hotspot.type === 'navigation' ? 'Navigation' : 'Information'}</small><small>{hotspot.type === 'navigation' ? `→ ${scenes.find(scene => scene.id === hotspot.targetPanoramaId)?.label || 'Unavailable target'}` : hotspot.content?.title || 'No content title'}</small></span>
      </button>)}
      {selected && <section className={styles.hotspotDetail}><h3>{selected.label}</h3><p>{selected.type === 'navigation' ? 'Navigation Hotspot' : 'Information Hotspot'}</p><p>Yaw {selected.yaw.toFixed(1)}° · Pitch {selected.pitch.toFixed(1)}°</p>
        {selected.type === 'navigation' ? <><p>Target: {scenes.find(candidate => candidate.id === selected.targetPanoramaId)?.label || 'Unavailable scene target'}</p><button disabled={!scenes.some(candidate => candidate.id === selected.targetPanoramaId)} onClick={() => selected.targetPanoramaId && onNavigate(selected.targetPanoramaId)}>Go to scene</button></> : <><p>{selected.content?.title || 'No title'}</p><p>{selected.content?.description || 'No description'}</p><button disabled={!selected.content} onClick={() => onInformation(selected)}>Open information</button></>}
        <p className={styles.panelNote}>Hotspot updates and deletion await the standalone saving connection.</p>
      </section>}
    </div>}
  </div>
}
