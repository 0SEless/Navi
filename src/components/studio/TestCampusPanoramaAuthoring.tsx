'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useEditor } from '@navi/editor'
import type { CampusDocument, Panorama } from '@navi/core'
import { TourViewer } from '@/components/tour/TourViewer'
import { toTourPanoramas } from '@/features/panorama-management/tour-selectors'
import { useGraphStore } from '@/store/graph-store'
import { isTestCampusCatalogEnabled, TEST_CAMPUS_ID, TEST_CAMPUS_OPT_IN_KEY } from '@/lib/studio/test-campus-catalog'
import { parsePanoramaKey } from '@/lib/panorama-keys'
import { uploadPanoramaAsset, type PanoramaUploadStage } from '@/lib/panorama-upload-client'

type AuthoritativeGraphResponse = {
  authoredDocument?: CampusDocument
}

type PanoramaCreateDispatcher = {
  execute: (command: {
    id: 'panorama.create'
    label: string
    payload: Record<string, unknown>
  }) => { success: boolean; error?: string }
}

function newPanoramaId(): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  return `pano_test_${random}`
}

function isMatchingScene(scene: Panorama, campusId: string): boolean {
  const key = parsePanoramaKey(scene.imageAssetId)
  return key?.campusId === campusId && key.panoramaId === scene.id
}

async function readAuthoritativeDocument(campusId: string): Promise<CampusDocument> {
  const response = await fetch(`/api/graph?campus_id=${encodeURIComponent(campusId)}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Server confirmation failed (HTTP ${response.status}).`)
  const body = await response.json() as AuthoritativeGraphResponse
  const document = body.authoredDocument
  if (!document || document.metadata?.campusId !== campusId || !Array.isArray(document.panoramas)) {
    throw new Error('The saved scene could not be confirmed from the server. Local recovery is unverified.')
  }
  return document
}

const stageLabels: Record<PanoramaUploadStage, string> = {
  validating: 'Checking image…',
  signing: 'Requesting secure upload…',
  uploading: 'Uploading to Development R2…',
  verifying: 'Verifying uploaded object…',
}

function subscribeToTestCampusOptIn(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

function getTestCampusOptIn() {
  try {
    return window.localStorage.getItem(TEST_CAMPUS_OPT_IN_KEY)
  } catch {
    return null
  }
}

export function TestCampusPanoramaAuthoring({ campusId }: { campusId: string }) {
  const editor = useEditor()
  const currentMapId = useGraphStore((state) => state.currentMapId)
  const authoredDocument = useGraphStore((state) => state.authoredDocument)
  const optedInCampusId = useSyncExternalStore(subscribeToTestCampusOptIn, getTestCampusOptIn, () => null)
  const [label, setLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<{ kind: 'status' | 'error'; text: string } | null>(null)

  const enabled = isTestCampusCatalogEnabled(campusId, {
    nodeEnv: process.env.NODE_ENV ?? '',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    optedInCampusId,
  })
  const scenes = useMemo(() => (authoredDocument?.panoramas ?? []).filter((scene) => isMatchingScene(scene, campusId)), [authoredDocument, campusId])

  if (!enabled || campusId !== TEST_CAMPUS_ID || currentMapId !== campusId) return null

  const handleSave = async () => {
    const store = useGraphStore.getState()
    const document = store.authoredDocument
    if (working) return
    if (store.currentMapId !== campusId || !document || document.metadata?.campusId !== campusId || editor.document.metadata?.campusId !== campusId) {
      setMessage({ kind: 'error', text: 'The disposable campus is not the active server-loaded document.' })
      return
    }
    if (!store.campusReady || store.syncStatus === 'conflict' || store.syncStatus === 'checking' || store.syncStatus === 'syncing') {
      setMessage({ kind: 'error', text: 'Wait for the current server load or conflict check to finish before authoring.' })
      return
    }
    if (!file || !label.trim()) {
      setMessage({ kind: 'error', text: 'Enter a scene name and choose an equirectangular image.' })
      return
    }

    setWorking(true)
    setMessage({ kind: 'status', text: 'Starting secure panorama upload…' })
    try {
      const panoramaId = newPanoramaId()
      const key = await uploadPanoramaAsset({
        campusId,
        panoramaId,
        file,
        onStage: (stage) => setMessage({ kind: 'status', text: stageLabels[stage] }),
      })
      const parsedKey = parsePanoramaKey(key)
      if (!parsedKey || parsedKey.campusId !== campusId || parsedKey.panoramaId !== panoramaId) {
        throw new Error('The upload service returned an asset for a different test scene.')
      }

      const dispatcher = editor.services.get('dispatcher') as PanoramaCreateDispatcher | undefined
      if (!dispatcher) throw new Error('The canonical Studio command dispatcher is unavailable.')
      const created = dispatcher.execute({
        id: 'panorama.create',
        label: 'Create Panorama',
        payload: {
          id: panoramaId,
          label: label.trim(),
          position: { lat: 0, lng: 0 },
          heading: 0,
          imageAssetId: key,
        },
      })
      if (!created.success) throw new Error(created.error ?? 'The Studio could not create the panorama scene.')

      // The editor command is the single document mutation path. EditorBridge
      // observes its document.changed event and synchronizes GraphStore before save.
      setMessage({ kind: 'status', text: 'Saving scene through the verified graph API…' })
      await store.save({ trigger: 'manual' })

      setMessage({ kind: 'status', text: 'Confirming the committed scene from the server…' })
      const serverDocument = await readAuthoritativeDocument(campusId)
      const confirmed = serverDocument.panoramas.find((scene) => scene.id === panoramaId && scene.imageAssetId === key)
      if (!confirmed) {
        throw new Error('The saved scene could not be confirmed from the server. Local recovery is unverified.')
      }
      store.setAuthoredDocument(serverDocument)
      setMessage({ kind: 'status', text: 'Scene and R2 asset verified on server.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Panorama scene save failed.' })
    } finally {
      setWorking(false)
    }
  }

  return (
    <aside
      aria-label="Test Panorama authoring"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 1200,
        width: 'min(380px, calc(100vw - 32px))',
        maxHeight: '48vh',
        overflowY: 'auto',
        padding: 16,
        border: '1px solid var(--navi-border)',
        borderRadius: 12,
        background: 'var(--navi-card)',
        color: 'var(--navi-text)',
        boxShadow: '0 8px 30px rgba(0,0,0,.25)',
      }}
    >
      <strong>Development-only Panorama test</strong>
      <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--navi-text-secondary)' }}>
        Disposable campus only. Uploads use the existing signed R2 flow; scenes use the normal graph save.
      </p>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        Scene name
        <input
          aria-label="Scene name"
          value={label}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
          disabled={working}
          style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 4 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
        Panorama image
        <input
          aria-label="Panorama image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={working}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        />
      </label>
      <button type="button" onClick={() => void handleSave()} disabled={working || !label.trim() || !file}>
        {working ? 'Saving…' : 'Upload and save scene'}
      </button>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} aria-live="polite" style={{ fontSize: 12 }}>
          {message.text}
        </p>
      )}
      {scenes.length > 0 && (
        <section aria-label="Server-loaded test scenes" style={{ marginTop: 12 }}>
          <strong>Scenes in the loaded campus document</strong>
          <ul>{scenes.map((scene) => <li key={scene.id}>{scene.label}</li>)}</ul>
          <TourViewer panoramas={toTourPanoramas(scenes)} />
        </section>
      )}
    </aside>
  )
}
