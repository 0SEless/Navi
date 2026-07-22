import { useCallback } from 'react'

const INPUT_ID = 'fpu-input'

interface FloorPlanUploadProps {
  /** Current floor plan image URL (from floor.metadata.floorPlanData or planImageId) */
  imageUrl?: string | null
  /** Current floor plan state */
  state?: 'none' | 'calibrating' | 'active' | 'locked' | null
  /** Called when a new floor plan image is uploaded */
  onUpload: (dataUrl: string) => void
  /** Called to remove the floor plan */
  onRemove: () => void
  /** Whether the floor plan is locked (geometry depends on it) */
  locked?: boolean
}

const btnStyle: React.CSSProperties = {
  display: 'block',
  background: '#094771',
  border: 'none',
  color: '#fff',
  borderRadius: 4,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 11,
  width: '100%',
  textAlign: 'center',
}

const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 10,
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
  textDecoration: 'underline',
}

/**
 * Reusable floor plan upload component.
 *
 * Handles file selection → FileReader → data URL, thumbnail preview,
 * replace/remove actions, and lifecycle state display.
 *
 * Usage:
 * ```
 * <FloorPlanUpload
 *   imageUrl={floor.metadata?.floorPlanData as string}
 *   state={floor.floorPlanState}
 *   onUpload={(dataUrl) => handleUpdateMeta(floor.id, {
 *     planImageId: 'uploaded',
 *     floorPlanState: 'active',
 *     metadata: { ...floor.metadata, floorPlanData: dataUrl }
 *   })}
 *   onRemove={() => handleUpdateMeta(floor.id, {
 *     planImageId: null,
 *     floorPlanState: 'none',
 *     metadata: { ...floor.metadata, floorPlanData: null }
 *   })}
 * />
 * ```
 */
export function FloorPlanUpload({ imageUrl, state, onUpload, onRemove, locked }: FloorPlanUploadProps) {
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target?.result
      if (typeof url === 'string') {
        onUpload(url)
      }
    }
    reader.onerror = () => {
      console.error('FloorPlanUpload: failed to read file', reader.error)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [onUpload])

  const stateLabel = state ?? 'none'

  return (
    <div>
      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 4 }}>FLOOR PLAN</div>
      <input id={INPUT_ID} type="file" accept="image/*"
        onChange={handleFileChange} style={{ display: 'none' }} />

      {stateLabel === 'active' && imageUrl ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={imageUrl} alt="Floor plan"
            style={{ width: 48, height: 36, borderRadius: 4, objectFit: 'cover', border: '1px solid #334155' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: '#4ADE80' }}>✓ Uploaded</span>
            <label htmlFor={INPUT_ID} style={{ ...linkStyle, color: '#94A3B8' }}>
              Replace
            </label>
            {!locked && (
              <button onClick={onRemove} style={{ ...linkStyle, color: '#EF4444' }}>
                Remove
              </button>
            )}
          </div>
        </div>
      ) : stateLabel === 'calibrating' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 48, height: 36, borderRadius: 4, background: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 16, color: '#FACC15' }}>⚙</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: '#FACC15' }}>Calibrating</span>
            <label htmlFor={INPUT_ID} style={{ ...linkStyle, color: '#94A3B8' }}>
              Change Image
            </label>
            <button onClick={onRemove} style={{ ...linkStyle, color: '#EF4444' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : stateLabel === 'locked' ? (
        <div style={{ fontSize: 11, color: '#94A3B8', padding: '4px 0' }}>
          🔒 Locked (geometry depends on it)
        </div>
      ) : (
        <label htmlFor={INPUT_ID} style={btnStyle}>
          + Upload
        </label>
      )}
    </div>
  )
}
