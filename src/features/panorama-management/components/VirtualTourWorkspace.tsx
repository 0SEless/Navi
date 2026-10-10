'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Camera, ChevronRight, Eye, Info, LogOut, MapPin, PanelLeft, PanelRight } from 'lucide-react'
import type { Panorama } from '@navi/core'
import { TourViewer } from '@/components/tour/TourViewer'
import { InformationCard } from '@/components/tour/InformationCard'
import type { TourHotspot } from '@/components/tour/types'
import type { PanoramaView } from '../selectors'
import type { PanoramaManagementPhase } from '../state'
import { resolveTourSelection, toTourPanoramas } from '../tour-selectors'
import { SceneExplorer } from './SceneExplorer'
import { SceneInspector } from './SceneInspector'
import styles from './VirtualTourWorkspace.module.css'

export interface VirtualTourWorkspaceProps {
  phase: PanoramaManagementPhase
  campuses: Array<{ id: string; name: string }>
  selectedCampusId: string | null
  requestedSceneId: string | null
  panoramas: Panorama[]
  inventory: PanoramaView[]
  results: PanoramaView[]
  query: string
  onQueryChange: (query: string) => void
  onCampusChange: (id: string) => void
  onSceneSelect: (id: string) => void
  onRetry: () => void
}
const subscribeCompact = (notify: () => void) => {
  const query = window.matchMedia('(max-width: 1100px)')
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
const compactSnapshot = () => window.matchMedia('(max-width: 1100px)').matches
const serverSnapshot = () => false
const PHASE_MESSAGES = {
  'campus-list-loading': 'Loading panoramas…', 'loading': 'Loading panoramas…',
  'campus-list-failed': 'Campuses could not be loaded.', 'no-campus-selected': 'Select a campus to manage its panoramas.',
  'campus-not-found': 'That campus is no longer available.', 'document-unavailable': 'This campus has no authored dataset yet.',
}

export function VirtualTourWorkspace(props: VirtualTourWorkspaceProps) {
  const { phase, campuses, selectedCampusId, requestedSceneId, panoramas, inventory, results, query, onQueryChange, onCampusChange, onSceneSelect, onRetry } = props
  const [preview, setPreview] = useState(false)
  const previewButton = useRef<HTMLButtonElement>(null)
  const exitPreviewButton = useRef<HTMLButtonElement>(null)
  const wasPreview = useRef(false)
  useEffect(() => {
    if (preview) exitPreviewButton.current?.focus()
    else if (wasPreview.current) previewButton.current?.focus()
    wasPreview.current = preview
    if (!preview) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"]')) setPreview(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [preview])
  const [panel, setPanel] = useState<'scenes' | 'inspector' | null>(null)
  const panelReturnFocus = useRef<HTMLElement | null>(null)
  const openPanel = (next: 'scenes' | 'inspector') => { panelReturnFocus.current = document.activeElement as HTMLElement; setPanel(next) }
  const [tab, setTab] = useState<'scene' | 'hotspots'>('scene')
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null)
  const [information, setInformation] = useState<TourHotspot | null>(null)
  const compact = useSyncExternalStore(subscribeCompact, compactSnapshot, serverSnapshot)
  const tourScenes = useMemo(() => toTourPanoramas(panoramas), [panoramas])
  const selection = resolveTourSelection(panoramas, requestedSceneId)
  const selected = selection.kind === 'selected' ? tourScenes[selection.index] : null
  const view = inventory.find(scene => scene.id === selected?.id)
  const ready = phase.kind === 'ready'
  const selectScene = (id: string) => { setSelectedHotspotId(null); setPanel(null); onSceneSelect(id) }
  const explorer = <SceneExplorer scenes={ready ? results : []} total={ready ? inventory.length : 0} selectedId={selected?.id ?? null} query={query} onQueryChange={onQueryChange} onSelect={selectScene} />
  const inspector = selected && view ? <SceneInspector scene={selected} view={view} scenes={tourScenes} tab={tab} onTabChange={setTab} selectedHotspotId={selectedHotspotId} onHotspotSelect={setSelectedHotspotId} onNavigate={selectScene} onInformation={setInformation} /> : <div className={styles.emptyInspector}><Info size={24} /><p>Select a scene to inspect its details.</p></div>
  let message: string | null = null
  if (!ready) message = 'message' in phase ? phase.message : PHASE_MESSAGES[phase.kind as keyof typeof PHASE_MESSAGES]
  else if (!panoramas.length) message = 'No Virtual Tour scenes have been added to this campus yet.'
  else if (selection.kind === 'not-found') message = 'Scene not found'
  else if (selection.kind === 'none') message = 'Select a scene to open its 360° view.'
  else if (!selected?.imageUrl) message = 'This scene has no panorama image.'
  const failure = ['campus-list-failed', 'load-failed', 'sync'].includes(phase.kind)
  return <div className={styles.workspace} data-preview={preview}>
    <header className={styles.toolbar}>
      <a href="/dashboard" className={styles.brand} aria-label="NAVI dashboard"><MapPin size={23} />NAVI</a>
      <div className={styles.breadcrumb}><Camera size={16} /><h1>Virtual Tour</h1><ChevronRight size={14} /><label><span className={styles.srOnly}>Campus</span><select aria-label="Campus" value={campuses.some(campus => campus.id === selectedCampusId) ? selectedCampusId! : ''} disabled={preview} onChange={event => onCampusChange(event.target.value)}><option value="" disabled>Select campus</option>{campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label></div>
      <div className={styles.toolbarActions}>{preview ? <button ref={exitPreviewButton} onClick={() => setPreview(false)}>Exit Preview</button> : <><a href="/dashboard"><LogOut size={16} /><span>Exit</span></a><button ref={previewButton} disabled={!ready || !selected?.imageUrl} onClick={() => { setPreview(true); setPanel(null) }}><Eye size={16} /><span>Preview Tour</span></button><a className={styles.primary} href={selectedCampusId ? `/studio/${encodeURIComponent(selectedCampusId)}/edit` : '/studio'} title="Scene authoring and saving are in NAVI Studio">Edit Scenes in Studio</a></>}</div>
    </header>
    <div className={styles.body}>
      {!preview && !compact && <aside className={styles.leftPanel} aria-label="Scene explorer">{explorer}</aside>}
      <main className={styles.center}>
        {!preview && compact && <div className={styles.mobileTools}><button onClick={event => { event.currentTarget.focus(); openPanel('scenes') }}><PanelLeft size={17} />Scenes</button><span>{selected?.label || 'Virtual Tour'}</span><button onClick={event => { event.currentTarget.focus(); openPanel('inspector') }}><PanelRight size={17} />Inspector</button></div>}
        <div className={styles.viewport}>
          {message ? <div className={styles.empty} role={failure ? 'alert' : 'status'}><Camera size={38} /><h2>{message}</h2>{selection.kind === 'not-found' && ready && <p>Choose an available scene from Scenes.</p>}{failure && <button onClick={onRetry}>Retry</button>}{compact && !preview && <button onClick={event => { event.currentTarget.focus(); openPanel('scenes') }}>Browse scenes</button>}</div> : selected && <TourViewer panoramas={tourScenes} initialIndex={selection.kind === 'selected' ? selection.index : 0} className={styles.viewer} onPanoramaChange={index => { const target = tourScenes[index]; if (target) selectScene(target.id) }} />}
          {preview && <span className={styles.previewBadge}>Previewing: {selected?.label}</span>}
        </div>
        {!preview && <footer className={styles.dock}>
          <div><strong>Scene authoring</strong><p>Manage panorama scenes and hotspots in NAVI Studio.</p></div>
        </footer>}
      </main>
      {!preview && !compact && <aside className={styles.rightPanel} aria-label="Scene inspector">{inspector}</aside>}
    </div>
    {compact && !preview && <Dialog.Root open={panel !== null} onOpenChange={open => { if (!open) setPanel(null) }}><Dialog.Portal container={typeof document === 'undefined' ? undefined : (document.fullscreenElement as HTMLElement | null) ?? undefined}><Dialog.Overlay className={styles.dialogOverlay} /><Dialog.Content className={styles.panelDialog} aria-describedby={undefined} onCloseAutoFocus={event => { if (panelReturnFocus.current?.isConnected) { event.preventDefault(); panelReturnFocus.current.focus() } }}><div className={styles.panelHeading}><Dialog.Title>{panel === 'scenes' ? 'Scene explorer' : 'Scene inspector'}</Dialog.Title><Dialog.Close aria-label="Close panel">×</Dialog.Close></div>{panel === 'scenes' ? explorer : inspector}</Dialog.Content></Dialog.Portal></Dialog.Root>}
    {information?.content && <InformationCard content={information.content} onClose={() => setInformation(null)} />}
  </div>
}
