'use client'

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import type { LatLng } from '@/types/nav-types'

type PendingType = 'building' | 'boundary' | 'route'
type DrawingTool = 'route' | 'building' | 'boundary'

interface PendingConfirm {
  type: PendingType
  points: LatLng[]
}

interface DragState {
  start: LatLng
  current: LatLng
}

export interface DrawingSessionValue {
  tracePoints: LatLng[]
  drawPoints: LatLng[]
  routeWidth: number
  roomDrag: DragState | null
  pendingConfirm: PendingConfirm | null
  addTracePoint: (pt: LatLng) => void
  setTracePoints: (pts: LatLng[]) => void
  undoLastPoint: () => void
  clearTracePoints: () => void
  addDrawPoint: (pt: LatLng) => void
  setDrawPoints: (pts: LatLng[]) => void
  undoLastDrawPoint: () => void
  clearDrawPoints: () => void
  setRoomDrag: (drag: DragState | null) => void
  requestConfirm: (type?: 'route' | 'building' | 'boundary') => void
  confirm: () => LatLng[]
  cancel: () => void
  setRouteWidth: (width: number) => void
}

const DrawingSessionContext = createContext<DrawingSessionValue | null>(null)

export function useDrawingSession(initialTool: DrawingTool = 'route'): DrawingSessionValue {
  const [tracePoints, setTracePoints] = useState<LatLng[]>([])
  const [drawPoints, setDrawPoints] = useState<LatLng[]>([])
  const [routeWidth, setRouteWidthState] = useState(8)
  const [roomDrag, setRoomDrag] = useState<DragState | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const addTracePoint = useCallback((pt: LatLng) => {
    setTracePoints(prev => [...prev, pt])
  }, [])

  const setTracePointsFn = useCallback((pts: LatLng[]) => {
    setTracePoints(pts)
  }, [])

  const undoLastPoint = useCallback(() => {
    setTracePoints(prev => prev.slice(0, -1))
  }, [])

  const clearTracePoints = useCallback(() => {
    setTracePoints([])
  }, [])

  const addDrawPoint = useCallback((pt: LatLng) => {
    setDrawPoints(prev => [...prev, pt])
  }, [])

  const setDrawPointsFn = useCallback((pts: LatLng[]) => {
    setDrawPoints(pts)
  }, [])

  const undoLastDrawPoint = useCallback(() => {
    setDrawPoints(prev => prev.slice(0, -1))
  }, [])

  const clearDrawPoints = useCallback(() => {
    setDrawPoints([])
  }, [])

  const requestConfirm = useCallback((type?: 'route' | 'building' | 'boundary') => {
    if (!type) {
      if (tracePoints.length >= 2) {
        setPendingConfirm({ type: 'route', points: [...tracePoints] })
      } else if (drawPoints.length >= 3) {
        setPendingConfirm({ type: 'building', points: [...drawPoints] })
      }
      return
    }
    if (type === 'route' && tracePoints.length >= 2) {
      setPendingConfirm({ type: 'route', points: [...tracePoints] })
    } else if ((type === 'building' || type === 'boundary') && drawPoints.length >= 3) {
      setPendingConfirm({ type, points: [...drawPoints] })
    }
  }, [tracePoints, drawPoints])

  const confirm = useCallback((): LatLng[] => {
    const points = pendingConfirm?.points ?? []
    setPendingConfirm(null)
    setTracePoints([])
    setDrawPoints([])
    return points
  }, [pendingConfirm])

  const cancel = useCallback(() => {
    setPendingConfirm(null)
    setTracePoints([])
    setDrawPoints([])
  }, [])

  const setRouteWidth = useCallback((width: number) => {
    setRouteWidthState(Math.max(2, Math.min(24, width)))
  }, [])

  return {
    tracePoints,
    drawPoints,
    routeWidth,
    roomDrag,
    pendingConfirm,
    addTracePoint,
    setTracePoints: setTracePointsFn,
    undoLastPoint,
    clearTracePoints,
    addDrawPoint,
    setDrawPoints: setDrawPointsFn,
    undoLastDrawPoint,
    clearDrawPoints,
    setRoomDrag,
    requestConfirm,
    confirm,
    cancel,
    setRouteWidth,
  }
}

export function DrawingSessionProvider({ children, value }: {
  children: ReactNode
  value: DrawingSessionValue
}) {
  return (
    <DrawingSessionContext.Provider value={value}>
      {children}
    </DrawingSessionContext.Provider>
  )
}

export function useDrawingSessionContext(): DrawingSessionValue {
  const ctx = useContext(DrawingSessionContext)
  if (!ctx) {
    throw new Error('useDrawingSessionContext must be used within DrawingSessionProvider')
  }
  return ctx
}
