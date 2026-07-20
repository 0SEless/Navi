'use client'

import { useState, useEffect, useRef } from 'react'
import { ExplorerPanel } from './ExplorerPanel'
import { PropertiesPanel, ProblemsPanel, useEditor, useSelection } from '@navi/editor'
import { StudioCanvas } from './StudioCanvas'
import { SaveStatus } from './SaveStatus'
import { BuildStatus } from './BuildStatus'
import { ToolDock } from './ToolDock'
import { ConfirmOverlay } from './ConfirmOverlay'

interface StudioWorkspaceProps {
  mapId: string
  center?: { lat: number; lng: number }
}

export function StudioWorkspace({ center }: StudioWorkspaceProps) {
  const { services } = useEditor()
  const publishStore = services.get('publishStore')
  const publishService = services.get('publish')
  const validationEngine = services.get('validationEngine')

  const selection = useSelection()
  const hasSelection = selection.lastSelected?.id != null

  const [showProblemsPanel, setShowProblemsPanel] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showBypassDialog, setShowBypassDialog] = useState(false)
  const [publishSnap, setPublishSnap] = useState(() => publishStore?.getSnapshot())

  const prevStateRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!publishStore) return
    const unsub = publishStore.subscribe(() => {
      const snap = publishStore.getSnapshot()
      setPublishSnap(snap)
    })
    return unsub
  }, [publishStore])

  useEffect(() => {
    if (!publishSnap) return
    if (publishSnap.publishState === 'success' && prevStateRef.current !== 'success') {
      setShowSuccessDialog(true)
    }
    if (publishSnap.publishState === 'error' && publishSnap.publishError === 'Validation failed') {
      setShowBypassDialog(true)
      setShowProblemsPanel(true)
    } else {
      setShowBypassDialog(false)
    }
    prevStateRef.current = publishSnap.publishState
  }, [publishSnap])

  // Automatically open ProblemsPanel if validation errors are detected by the engine
  useEffect(() => {
    if (!validationEngine) return
    const snap = validationEngine.getLastSnapshot()
    if (snap && snap.statistics.errors > 0) {
      setShowProblemsPanel(true)
    }

    const unsub = validationEngine.onValidationUpdated((newSnap) => {
      if (newSnap.statistics.errors > 0) {
        setShowProblemsPanel(true)
      }
    })
    return unsub
  }, [validationEngine])

  return (
    <div data-editor-ready="true" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', height: 32,
        background: 'var(--navi-card)', borderBottom: '1px solid var(--navi-border)',
        flexShrink: 0,
      }}>
        <span style={{ color: 'var(--navi-primary)', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em' }}>
          NAVI STUDIO
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <SaveStatus />
          <BuildStatus />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 220, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>
            Explorer
          </div>
          <ExplorerPanel />
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <StudioCanvas center={center} />
          <ConfirmOverlay />
        </div>
        {hasSelection && (
          <div style={{ width: 280, background: 'var(--navi-card)', borderLeft: '1px solid var(--navi-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <PropertiesPanel />
            </div>
            {showProblemsPanel && (
              <div style={{ height: '40%', borderTop: '1px solid var(--navi-border)', overflow: 'auto', background: '#1e1e1e' }}>
                <ProblemsPanel />
              </div>
            )}
          </div>
        )}
      </div>

      {showBypassDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: 'var(--navi-card)', border: '1px solid var(--navi-border)', padding: 24, borderRadius: 8, width: 360, color: 'var(--navi-text)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Validation Errors</h2>
            <p style={{ fontSize: 13, color: 'var(--navi-text-secondary)', marginBottom: 20 }}>
              The campus document has validation errors. Do you want to publish anyway?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowBypassDialog(false)
                  publishStore?.updatePublishState({ publishState: 'idle', publishError: null })
                }}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--navi-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--navi-text-secondary)', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowBypassDialog(false)
                  await publishService?.publish(true)
                }}
                style={{ padding: '8px 16px', background: 'var(--navi-primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Publish Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessDialog && publishSnap?.publishResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: 'var(--navi-card)', border: '1px solid var(--navi-border)', padding: 24, borderRadius: 8, width: 360, color: 'var(--navi-text)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Publish Successful</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--navi-text-secondary)' }}>
              <div>Revision: {publishSnap.publishResult.revision}</div>
              <div>Nodes: {publishSnap.publishResult.nodeCount}</div>
              <div>Edges: {publishSnap.publishResult.edgeCount}</div>
              <div>Compile time: {((publishSnap.publishResult.finishedAt - publishSnap.publishResult.startedAt) / 1000).toFixed(2)}s</div>
              <div>Artifacts: {publishSnap.publishResult.artifactCount}</div>
              <div>Location: demo-output/</div>
            </div>
            <button
              onClick={() => {
                setShowSuccessDialog(false)
                publishStore?.updatePublishState({ publishState: 'idle', publishResult: null })
              }}
              style={{ marginTop: 24, width: '100%', padding: '8px 16px', background: 'var(--navi-primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      <ToolDock />
    </div>
  )
}
