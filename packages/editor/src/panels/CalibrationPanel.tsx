import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditor } from '../context'
import {
  calibrationTool,
  createEmptyState,
  addControlPoint,
  removeLastControlPoint,
  computeCalibration,
} from './calibration-tool'
import type { CalibrationState } from './calibration-tool'

export function CalibrationPanel() {
  const { document, services } = useEditor()
  const dispatcher = services.get<any>('dispatcher')
  const viewport = services.get<any>('viewport')
  const eventBus = services.get<any>('eventBus')
  const toolRegistry = services.get<any>('toolRegistry')

  const buildingId = viewport.activeBuildingId as string | null
  const floorId = viewport.activeFloorId as string | null

  const [state, setState] = useState<CalibrationState | null>(null)
  const [isActive, setIsActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const building = buildingId ? document.buildings.find((b: any) => b.id === buildingId) : null
  const floor = building && floorId ? building.floors.find((f: any) => f.id === floorId) : null

  useEffect(() => {
    if (!eventBus) return
    const onActivated = (e: any) => {
      if (e.floorId) {
        setState(createEmptyState(e.floorId, e.buildingId))
        setIsActive(true)
      }
    }
    const onDeactivated = () => { setIsActive(false) }
    const onAddPoint = (e: any) => {
      setState(prev => prev ? addControlPoint(prev, e.world, e.pixel) : prev)
    }
    const onRemoveLast = () => {
      setState(prev => prev ? removeLastControlPoint(prev) : prev)
    }
    const onCompute = () => {
      setState(prev => {
        if (!prev || prev.controlPoints.length < 2) return prev
        const building = document.buildings.find((b: any) => b.id === prev.buildingId)
        if (!building) return prev
        const centroid = buildingFootprintCentroid(building.footprint.points)
        return computeCalibration(prev, centroid)
      })
    }
    const onCancel = () => {
      setState(null)
      setIsActive(false)
      toolRegistry?.activate('select')
    }

    eventBus.on('calibration.activated', onActivated)
    eventBus.on('calibration.deactivated', onDeactivated)
    eventBus.on('calibration.addPoint', onAddPoint)
    eventBus.on('calibration.removeLastPoint', onRemoveLast)
    eventBus.on('calibration.compute', onCompute)
    eventBus.on('calibration.cancel', onCancel)

    return () => {
      eventBus.off('calibration.activated', onActivated)
      eventBus.off('calibration.deactivated', onDeactivated)
      eventBus.off('calibration.addPoint', onAddPoint)
      eventBus.off('calibration.removeLastPoint', onRemoveLast)
      eventBus.off('calibration.compute', onCompute)
      eventBus.off('calibration.cancel', onCancel)
    }
  }, [eventBus, document.buildings, toolRegistry])

  const handleStartCalibration = useCallback(() => {
    if (!floorId || !buildingId) return
    toolRegistry?.activate('calibrate')
  }, [floorId, buildingId, toolRegistry])

  const handleCancel = useCallback(() => {
    setState(null)
    setIsActive(false)
    toolRegistry?.activate('select')
  }, [toolRegistry])

  const handleSave = useCallback(() => {
    if (!state?.result || !floor) return
    const metaKey = '_calibration'
    floor.metadata[metaKey] = state.result
    setState(null)
    setIsActive(false)
    toolRegistry?.activate('select')
  }, [state, floor, toolRegistry])

  const handleClear = useCallback(() => {
    if (!floor) return
    delete floor.metadata._calibration
    setState(null)
    setIsActive(false)
    toolRegistry?.activate('select')
  }, [floor, toolRegistry])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        setState(prev => prev ? {
          ...prev,
          imageUrl: url,
          imageWidth: img.width,
          imageHeight: img.height,
        } : prev)
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }, [])

  if (!building || !floor) return null

  const savedCalibration = floor.metadata?._calibration

  return (
    <div style={{ padding: 8, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
        Calibration — {floor.label}
      </div>

      {isActive && state ? (
        <div>
          <div style={{ marginBottom: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: '#094771', border: 'none', color: '#fff', borderRadius: 3, padding: '4px 8px', cursor: 'pointer', fontSize: 12, width: '100%', marginBottom: 4 }}
            >
              {state.imageUrl ? 'Change Image' : 'Upload Floor Plan'}
            </button>
            {state.imageUrl && (
              <div style={{ fontSize: 11, color: '#888' }}>
                Image: {state.imageWidth}×{state.imageHeight}px
              </div>
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ color: '#aaa', marginBottom: 4 }}>
              Control Points ({state.controlPoints.length})
            </div>
            {state.controlPoints.length === 0 && (
              <div style={{ color: '#666', fontStyle: 'italic', fontSize: 12 }}>
                Click on the map to add control points
              </div>
            )}
            {state.controlPoints.map((cp, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, fontSize: 11, color: '#ccc', padding: '2px 0' }}>
                <span style={{ color: '#888', minWidth: 16 }}>#{i + 1}</span>
                <span>world: {cp.world.lat.toFixed(5)},{cp.world.lng.toFixed(5)}</span>
              </div>
            ))}
          </div>

          {state.result && (
            <div style={{ background: '#1a1a2e', borderRadius: 3, padding: 6, marginBottom: 8, fontSize: 12 }}>
              <div style={{ color: '#4ADE80', fontWeight: 600, marginBottom: 4 }}>Calibration Result</div>
              <div style={{ color: '#ccc' }}>Scale: {state.result.scale.toFixed(6)} m/px</div>
              <div style={{ color: '#ccc' }}>Rotation: {state.result.rotation.toFixed(2)}°</div>
              <div style={{ color: '#ccc' }}>Confidence: {(state.result.confidence * 100).toFixed(0)}%</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button
              onClick={() => {
                if (state.controlPoints.length >= 2) {
                  const bld = document.buildings.find((b: any) => b.id === state.buildingId)
                  if (bld) {
                    const centroid = buildingFootprintCentroid(bld.footprint.points)
                    setState(computeCalibration(state, centroid))
                  }
                }
              }}
              disabled={state.controlPoints.length < 2}
              style={{ flex: 1, background: state.controlPoints.length >= 2 ? '#2563EB' : '#333', border: 'none', color: '#fff', borderRadius: 3, padding: '4px 8px', cursor: state.controlPoints.length >= 2 ? 'pointer' : 'default', fontSize: 12 }}
            >Compute</button>
            <button
              onClick={handleSave}
              disabled={!state.result}
              style={{ flex: 1, background: state.result ? '#16A34A' : '#333', border: 'none', color: '#fff', borderRadius: 3, padding: '4px 8px', cursor: state.result ? 'pointer' : 'default', fontSize: 12 }}
            >Save</button>
          </div>
          <button
            onClick={handleCancel}
            style={{ width: '100%', background: '#DC2626', border: 'none', color: '#fff', borderRadius: 3, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
          >Cancel</button>
        </div>
      ) : savedCalibration ? (
        <div>
          <div style={{ background: '#1a1a2e', borderRadius: 3, padding: 6, marginBottom: 8, fontSize: 12 }}>
            <div style={{ color: '#4ADE80', fontWeight: 600, marginBottom: 4 }}>Calibrated</div>
            <div style={{ color: '#ccc' }}>Scale: {savedCalibration.scale.toFixed(6)} m/px</div>
            <div style={{ color: '#ccc' }}>Confidence: {(savedCalibration.confidence * 100).toFixed(0)}%</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handleStartCalibration}
              style={{ flex: 1, background: '#094771', border: 'none', color: '#fff', borderRadius: 3, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
            >Recalibrate</button>
            <button
              onClick={handleClear}
              style={{ flex: 1, background: '#DC2626', border: 'none', color: '#fff', borderRadius: 3, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
            >Clear</button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleStartCalibration}
          style={{ width: '100%', background: '#094771', border: 'none', color: '#fff', borderRadius: 3, padding: '6px 8px', cursor: 'pointer', fontSize: 12 }}
        >Start Calibration</button>
      )}
    </div>
  )
}

function buildingFootprintCentroid(points: { lat: number; lng: number }[]): { lat: number; lng: number } {
  let lat = 0, lng = 0, n = points.length
  for (const p of points) { lat += p.lat; lng += p.lng }
  return { lat: lat / n, lng: lng / n }
}
