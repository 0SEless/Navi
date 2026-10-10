import { useCallback, useState, useMemo } from 'react'
import type { Panorama } from '@navi/core'
import { useEditor, useEditingEngine } from '../../context'
import { tokens, Field, inputStyle, ActionButton, SectionHeader } from './field'
import { useStudioStore } from '@/store/studio-store'
import { HotspotProperties } from './hotspot-props'
import { HotspotPlacementTool } from '../HotspotPlacementTool'
import { validatePanoramaHotspots } from '@navi/core'
import { uploadPanoramaAsset, type PanoramaUploadStage } from '@/lib/panorama-upload-client'

interface Props { panorama: Panorama }

export function PanoramaProperties({ panorama }: Props) {
  const { services, document } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get('dispatcher')!
  const positionEditTarget = useStudioStore((s) => s.positionEditTarget)
  const setPositionEditTarget = useStudioStore((s) => s.setPositionEditTarget)
  const isAdjusting = positionEditTarget?.type === 'panorama' && positionEditTarget?.id === panorama.id
  const [selectedHotspotIndex, setSelectedHotspotIndex] = useState<number | null>(null)
  const [placementTool, setPlacementTool] = useState<{ isOpen: boolean; type: 'navigation' | 'information' }>({ isOpen: false, type: 'navigation' })
  const [uploadStage, setUploadStage] = useState<PanoramaUploadStage | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadVerified, setUploadVerified] = useState(false)

  // Validate hotspots
  const allPanoramaIds = useMemo(() => 
    (document.panoramas || []).map(p => p.id),
    [document.panoramas]
  )
  const hotspotIssues = useMemo(() =>
    validatePanoramaHotspots(panorama, allPanoramaIds),
    [panorama, allPanoramaIds]
  )
  const errors = hotspotIssues.filter(i => i.severity === 'error')
  const warnings = hotspotIssues.filter(i => i.severity === 'warning')

  const update = useCallback((changes: Record<string, unknown>) => {
    for (const [property, value] of Object.entries(changes)) {
      editEngine.begin({ kind: 'assign', entityId: panorama.id, property, value })
      editEngine.doCommit()
    }
    dispatcher.execute({ id: 'entity.update', label: 'Edit Panorama', payload: { entityId: panorama.id, changes } })
  }, [editEngine, dispatcher, panorama.id])

  const handleImageUpload = useCallback(async (file: File) => {
    const campusId = document.metadata.campusId
    setUploadError(null)
    setUploadVerified(false)
    try {
      const imageAssetId = await uploadPanoramaAsset({
        campusId,
        panoramaId: panorama.id,
        file,
        onStage: setUploadStage,
      })
      // Keep the stable scene identity and mutate only its canonical R2 key
      // after the server has verified both the object and asset registry row.
      update({ imageAssetId })
      setUploadVerified(true)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Panorama upload failed.')
    } finally {
      setUploadStage(null)
    }
  }, [document.metadata.campusId, panorama.id, update])

  const updateHotspot = useCallback((index: number, changes: Record<string, unknown>) => {
    dispatcher.execute({
      id: 'hotspot.update',
      label: 'Update hotspot',
      payload: {
        panoramaId: panorama.id,
        hotspotIndex: index,
        changes,
      },
    })
  }, [dispatcher, panorama.id])

  const deleteHotspot = useCallback((index: number) => {
    dispatcher.execute({
      id: 'hotspot.delete',
      label: 'Delete hotspot',
      payload: {
        panoramaId: panorama.id,
        hotspotIndex: index,
      },
    })
    setSelectedHotspotIndex(null)
  }, [dispatcher, panorama.id])

  // If a hotspot is selected, show its properties
  if (selectedHotspotIndex !== null && selectedHotspotIndex < panorama.hotspots.length) {
    const hotspot = panorama.hotspots[selectedHotspotIndex]
    return (
      <div>
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #eee' }}>
          <button
            onClick={() => setSelectedHotspotIndex(null)}
            style={{ fontSize: 12, color: '#666', cursor: 'pointer', background: 'none', border: 'none' }}
          >← Back to Panorama</button>
        </div>
        <HotspotProperties
          panorama={panorama}
          hotspotIndex={selectedHotspotIndex}
          hotspot={hotspot}
          onUpdate={(changes) => updateHotspot(selectedHotspotIndex, changes)}
          onDelete={() => deleteHotspot(selectedHotspotIndex)}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '6px 12px 14px', fontSize: tokens.fontSize.md, fontFamily: 'system-ui, sans-serif' }}>
      <SectionHeader>Details</SectionHeader>
      <Field label="Label">
        <input value={panorama.label} onChange={e => update({ label: e.target.value })} style={inputStyle} />
      </Field>
      <Field label="Heading (°)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="range" min={0} max={360} step={1}
            value={panorama.heading}
            onChange={e => update({ heading: parseFloat(e.target.value) })}
            style={{ width: 120, accentColor: tokens.accent }} />
          <span style={{ color: tokens.textMuted, fontSize: tokens.fontSize.sm }}>{panorama.heading}°</span>
        </div>
      </Field>
      <Field label="Image Asset">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={panorama.imageAssetId || 'No verified image uploaded'} readOnly style={inputStyle} aria-label="Verified panorama asset key" />
          <label style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '6px 8px', borderRadius: 4, background: uploadStage ? '#e5e7eb' : tokens.accent,
            color: uploadStage ? '#6b7280' : '#fff', cursor: uploadStage ? 'wait' : 'pointer',
            fontSize: 12, opacity: uploadStage ? 0.75 : 1,
          }}>
            {uploadStage ? 'Uploading panorama…' : panorama.imageAssetId ? 'Replace panorama image' : 'Upload panorama image'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadStage !== null}
              aria-label="Upload panorama image"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImageUpload(file)
                event.target.value = ''
              }}
            />
          </label>
          {uploadStage && (
            <span role="status" aria-live="polite" style={{ color: tokens.textMuted, fontSize: 11 }}>
              {uploadStage === 'validating' && 'Checking image format and dimensions…'}
              {uploadStage === 'signing' && 'Requesting a secure upload…'}
              {uploadStage === 'uploading' && 'Uploading image to development storage…'}
              {uploadStage === 'verifying' && 'Verifying stored image…'}
            </span>
          )}
          {uploadVerified && (
            <span role="status" aria-live="polite" style={{ color: '#15803d', fontSize: 11 }}>
              Image uploaded and verified. Editor sync is pending.
            </span>
          )}
          {uploadError && (
            <span role="alert" style={{ color: '#b91c1c', fontSize: 11 }}>{uploadError}</span>
          )}
        </div>
      </Field>

      <SectionHeader>Hotspots ({panorama.hotspots.length})</SectionHeader>
      {(errors.length > 0 || warnings.length > 0) && (
        <div style={{ marginBottom: 8 }}>
          {errors.map((error, i) => (
            <div key={`error-${i}`} style={{ padding: '4px 8px', background: '#fee2e2', borderRadius: 4, marginBottom: 4, fontSize: 11, color: '#991b1b' }}>
              ⚠ {error.message}
            </div>
          ))}
          {warnings.map((warning, i) => (
            <div key={`warning-${i}`} style={{ padding: '4px 8px', background: '#fef3c7', borderRadius: 4, marginBottom: 4, fontSize: 11, color: '#92400e' }}>
              ⚡ {warning.message}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <ActionButton onClick={() => setPlacementTool({ isOpen: true, type: 'navigation' })}>+ Navigation</ActionButton>
        <ActionButton onClick={() => setPlacementTool({ isOpen: true, type: 'information' })}>+ Information</ActionButton>
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {panorama.hotspots.map((hotspot, index) => (
          <div
            key={index}
            onClick={() => setSelectedHotspotIndex(index)}
            style={{
              padding: '6px 8px',
              marginBottom: 4,
              background: '#f5f5f5',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            <span style={{ marginRight: 4 }}>{hotspot.hotspotType === 'information' ? 'ℹ️' : '→'}</span>
            {hotspot.label || `Hotspot ${index + 1}`}
            {hotspot.position && (
              <span style={{ color: '#999', marginLeft: 4 }}>({hotspot.position.yaw}°, {hotspot.position.pitch}°)</span>
            )}
          </div>
        ))}
        {panorama.hotspots.length === 0 && (
          <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 8 }}>
            No hotspots yet. Add one above.
          </div>
        )}
      </div>

      <SectionHeader>Position</SectionHeader>
      {!isAdjusting ? (
        <ActionButton onClick={() => setPositionEditTarget({ type: 'panorama', id: panorama.id })}>
          Adjust on Map
        </ActionButton>
      ) : (
        <div style={{
          background: '#1A1A3A', border: `1px solid #3A3A6A`,
          borderRadius: tokens.radius.md, padding: 10,
        }}>
          <div style={{ color: tokens.textSecondary, fontSize: tokens.fontSize.base, marginBottom: 10 }}>
            Drag the panorama marker on the map to adjust its position.
          </div>
          <ActionButton variant="success" style={{ textAlign: 'center' }}
            onClick={() => setPositionEditTarget(null)}>
            ✓ Done
          </ActionButton>
        </div>
      )}

      {/* Hotspot Placement Tool */}
      <HotspotPlacementTool
        isOpen={placementTool.isOpen}
        onClose={() => setPlacementTool({ isOpen: false, type: 'navigation' })}
        panoramaId={panorama.id}
        hotspotType={placementTool.type}
      />
    </div>
  )
}
