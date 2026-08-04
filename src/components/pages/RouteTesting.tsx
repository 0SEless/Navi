import { useState, useRef, useEffect, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import {
  Route, RotateCcw, AlertTriangle, CheckCircle,
  Zap, Activity, XCircle,
} from 'lucide-react'
import type { NavNode, NavEdge } from '@/types/nav-types'
import { aStar as engineAStar, getAdjacencyList } from '@/engine/a-star'
import { useCompiledGraphStore } from '@/store/compiled-graph-store'
import { RouteOverlay } from './RouteOverlay'
import { BASE_STYLES, DEFAULT_BASE_STYLE } from '@/components/studio/rendering/styles'

export interface GraphHealth {
  total: number
  connected: number
  disconnected: number
  isolated: number
  components: number
  deadEnds: number
  avgDegree: number
  maxDegree: number
  nodeTypes: Record<string, number>
  warnings: Array<{ nodeIds: string[]; message: string }>
}

export function computeGraphHealth(nodes: NavNode[], edges: NavEdge[]): GraphHealth {
  const adj: Record<string, string[]> = {}
  for (const n of nodes) adj[n.id] = []
  for (const e of edges) {
    adj[e.from]?.push(e.to)
    adj[e.to]?.push(e.from)
  }

  const degree = new Map<string, number>()
  const nodeTypes: Record<string, number> = {}
  for (const n of nodes) {
    degree.set(n.id, adj[n.id]?.length ?? 0)
    nodeTypes[n.type] = (nodeTypes[n.type] ?? 0) + 1
  }

  const visited = new Set<string>()
  let components = 0
  function bfs(startId: string) {
    const queue = [startId]
    visited.add(startId)
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const neighbor of (adj[cur] ?? [])) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor) }
      }
    }
  }
  for (const n of nodes) {
    if (!visited.has(n.id)) { components++; bfs(n.id) }
  }

  const isolated = nodes.filter(n => (degree.get(n.id) ?? 0) === 0).length
  const disconnected = nodes.filter(n => !visited.has(n.id)).length
  const deadEnds = nodes.filter(n => (degree.get(n.id) ?? 0) === 1).length
  const degrees = nodes.map(n => degree.get(n.id) ?? 0)
  const avgDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0
  const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0

  const warnings: Array<{ nodeIds: string[]; message: string }> = []
  if (deadEnds > 0) warnings.push({ nodeIds: nodes.filter(n => (degree.get(n.id) ?? 0) === 1).map(n => n.id), message: `${deadEnds} dead-end node${deadEnds > 1 ? 's' : ''} (degree 1)` })
  if (isolated > 0) warnings.push({ nodeIds: nodes.filter(n => (degree.get(n.id) ?? 0) === 0).map(n => n.id), message: `${isolated} isolated node${isolated > 1 ? 's' : ''} (no edges)` })

  return { total: nodes.length, connected: nodes.length - disconnected, disconnected, isolated, components, deadEnds, avgDegree, maxDegree, nodeTypes, warnings }
}

const MOCK_NODES: NavNode[] = [
  { id: 'N001', label: 'Admin Entrance', name: 'Admin Entrance', type: 'building_entrance', buildingId: 'admin', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.81835, lng: 122.1705 }, hasQr: true, hasPanorama: true },
  { id: 'N002', label: 'Library Entrance', name: 'Library Entrance', type: 'building_entrance', buildingId: 'lib', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.81845, lng: 122.17105 }, hasQr: true, hasPanorama: true },
  { id: 'N003', label: 'Science Lab Entrance', name: 'Science Lab Entrance', type: 'building_entrance', buildingId: 'sci', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.81775, lng: 122.1703 }, hasQr: false, hasPanorama: false },
  { id: 'N004', label: 'CAS Entrance', name: 'CAS Entrance', type: 'building_entrance', buildingId: 'cas', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.8175, lng: 122.1705 }, hasQr: true, hasPanorama: false },
  { id: 'N005', label: 'COE Entrance', name: 'COE Entrance', type: 'building_entrance', buildingId: 'coe', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.81705, lng: 122.1705 }, hasQr: true, hasPanorama: true },
  { id: 'N006', label: 'Gymnasium Entrance', name: 'Gymnasium Entrance', type: 'building_entrance', buildingId: 'gym', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.8172, lng: 122.1715 }, hasQr: false, hasPanorama: false },
  { id: 'N007', label: 'Student Center Entrance', name: 'Student Center Entrance', type: 'building_entrance', buildingId: 'sc', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.8170, lng: 122.1720 }, hasQr: true, hasPanorama: true },
  { id: 'N008', label: 'Chapel Entrance', name: 'Chapel Entrance', type: 'building_entrance', buildingId: 'chapel', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.8177, lng: 122.1715 }, hasQr: false, hasPanorama: false },
  { id: 'N009', label: 'NW Junction', name: 'NW Junction', type: 'intersection', buildingId: '', campusId: 'asu-ibajay', floor: 0, position: { lat: 11.8180, lng: 122.1704 }, hasQr: false, hasPanorama: false },
  { id: 'N010', label: 'NE Junction', name: 'NE Junction', type: 'intersection', buildingId: '', campusId: 'asu-ibajay', floor: 0, position: { lat: 11.8180, lng: 122.1710 }, hasQr: false, hasPanorama: false },
  { id: 'N011', label: 'Main Plaza', name: 'Main Plaza', type: 'intersection', buildingId: '', campusId: 'asu-ibajay', floor: 0, position: { lat: 11.8177, lng: 122.1708 }, hasQr: true, hasPanorama: true },
  { id: 'N012', label: 'SW Junction', name: 'SW Junction', type: 'intersection', buildingId: '', campusId: 'asu-ibajay', floor: 0, position: { lat: 11.8173, lng: 122.1705 }, hasQr: false, hasPanorama: false },
  { id: 'N013', label: 'SE Junction', name: 'SE Junction', type: 'intersection', buildingId: '', campusId: 'asu-ibajay', floor: 0, position: { lat: 11.8173, lng: 122.1712 }, hasQr: false, hasPanorama: false },
  { id: 'N014', label: 'South Gate', name: 'South Gate', type: 'outdoor', buildingId: '', campusId: 'asu-ibajay', floor: 0, position: { lat: 11.8167, lng: 122.1708 }, hasQr: true, hasPanorama: false },
  { id: 'N015', label: 'West Entry', name: 'West Entry', type: 'outdoor', buildingId: '', campusId: 'asu-ibajay', floor: 0, position: { lat: 11.8180, lng: 122.1700 }, hasQr: false, hasPanorama: false },
  { id: 'N016', label: 'Tourism Building Entrance', name: 'Tourism Building Entrance', type: 'building_entrance', buildingId: 'tourism', campusId: 'asu-ibajay', floor: 1, position: { lat: 11.818639, lng: 122.172651 }, hasQr: true, hasPanorama: false },
]

function calcDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const aVal = sinDLat * sinDLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))
}

const MOCK_EDGES: NavEdge[] = [
  { id: 'E001', from: 'N001', to: 'N010', type: 'walkway', distance: calcDistance(MOCK_NODES[0].position, MOCK_NODES[9].position) },
  { id: 'E002', from: 'N002', to: 'N009', type: 'walkway', distance: calcDistance(MOCK_NODES[1].position, MOCK_NODES[8].position) },
  { id: 'E003', from: 'N002', to: 'N010', type: 'walkway', distance: calcDistance(MOCK_NODES[1].position, MOCK_NODES[9].position) },
  { id: 'E004', from: 'N003', to: 'N009', type: 'walkway', distance: calcDistance(MOCK_NODES[2].position, MOCK_NODES[8].position) },
  { id: 'E005', from: 'N009', to: 'N010', type: 'walkway', distance: calcDistance(MOCK_NODES[8].position, MOCK_NODES[9].position) },
  { id: 'E006', from: 'N009', to: 'N011', type: 'walkway', distance: calcDistance(MOCK_NODES[8].position, MOCK_NODES[10].position) },
  { id: 'E007', from: 'N010', to: 'N011', type: 'walkway', distance: calcDistance(MOCK_NODES[9].position, MOCK_NODES[10].position) },
  { id: 'E008', from: 'N011', to: 'N008', type: 'walkway', distance: calcDistance(MOCK_NODES[10].position, MOCK_NODES[7].position) },
  { id: 'E009', from: 'N004', to: 'N012', type: 'walkway', distance: calcDistance(MOCK_NODES[3].position, MOCK_NODES[11].position) },
  { id: 'E010', from: 'N012', to: 'N011', type: 'walkway', distance: calcDistance(MOCK_NODES[11].position, MOCK_NODES[10].position) },
  { id: 'E011', from: 'N013', to: 'N011', type: 'walkway', distance: calcDistance(MOCK_NODES[12].position, MOCK_NODES[10].position) },
  { id: 'E012', from: 'N005', to: 'N012', type: 'walkway', distance: calcDistance(MOCK_NODES[4].position, MOCK_NODES[11].position) },
  { id: 'E013', from: 'N006', to: 'N013', type: 'walkway', distance: calcDistance(MOCK_NODES[5].position, MOCK_NODES[12].position) },
  { id: 'E014', from: 'N007', to: 'N013', type: 'walkway', distance: calcDistance(MOCK_NODES[6].position, MOCK_NODES[12].position) },
  { id: 'E015', from: 'N012', to: 'N013', type: 'walkway', distance: calcDistance(MOCK_NODES[11].position, MOCK_NODES[12].position) },
  { id: 'E016', from: 'N005', to: 'N006', type: 'walkway', distance: calcDistance(MOCK_NODES[4].position, MOCK_NODES[5].position) },
  { id: 'E017', from: 'N006', to: 'N007', type: 'walkway', distance: calcDistance(MOCK_NODES[5].position, MOCK_NODES[6].position) },
  { id: 'E018', from: 'N013', to: 'N014', type: 'walkway', distance: calcDistance(MOCK_NODES[12].position, MOCK_NODES[13].position) },
  { id: 'E019', from: 'N012', to: 'N014', type: 'walkway', distance: calcDistance(MOCK_NODES[11].position, MOCK_NODES[13].position) },
  { id: 'E020', from: 'N015', to: 'N004', type: 'walkway', distance: calcDistance(MOCK_NODES[14].position, MOCK_NODES[3].position) },
  { id: 'E021', from: 'N015', to: 'N012', type: 'walkway', distance: calcDistance(MOCK_NODES[14].position, MOCK_NODES[11].position) },
  { id: 'E022', from: 'N009', to: 'N004', type: 'walkway', distance: calcDistance(MOCK_NODES[8].position, MOCK_NODES[3].position) },
  { id: 'E023', from: 'N016', to: 'N010', type: 'walkway', distance: calcDistance(MOCK_NODES[15].position, MOCK_NODES[9].position) },
  { id: 'E024', from: 'N016', to: 'N002', type: 'walkway', distance: calcDistance(MOCK_NODES[15].position, MOCK_NODES[1].position) },
]

interface RouteStep {
  nodeId: string
  nodeName: string
  instruction: string
  distance: number
}

export function NavigationInspector() {
  const { nodes: compiledNodes, edges: compiledEdges, hasRealData, loadFromStorage, result } = useCompiledGraphStore()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => { loadFromStorage() }, [loadFromStorage])

  const activeNodes = hasRealData && compiledNodes.length > 0 ? compiledNodes : MOCK_NODES
  const activeEdges = hasRealData && compiledEdges.length > 0 ? compiledEdges : MOCK_EDGES
  const usingMock = !hasRealData || compiledNodes.length === 0

  const graphHealth = activeNodes.length > 0 ? computeGraphHealth(activeNodes, activeEdges) : null
  const isHealthy = graphHealth && graphHealth.disconnected === 0 && graphHealth.isolated === 0

  const [startNode, setStartNode] = useState<string>('N014')
  const [endNode, setEndNode] = useState<string>('N001')
  const [routeResult, setRouteResult] = useState<{ path: string[]; cost: number } | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [animStep, setAnimStep] = useState(-1)
  const [disconnectedNodes, setDisconnectedNodes] = useState<string[]>([])
  const animRef = useRef<number | null>(null)
  const [activeTab, setActiveTab] = useState<'route' | 'diagnostics'>('route')
  const [showGraph, setShowGraph] = useState(true)
  const [showRoute, setShowRoute] = useState(true)
  const [showSnapIndicators, setShowSnapIndicators] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [showNodeIds, setShowNodeIds] = useState(false)

  // ── Initialize MapLibre map ──
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASE_STYLES[DEFAULT_BASE_STYLE].style,
      center: [122.171, 11.8177],
      zoom: 16,
      pitch: 0,
    })

    // Suppress tile fetch errors (e.g., zoom beyond OSM tile coverage)
    map.on('error', (e) => {
      if (e.error?.status === 0 || `${e.error}`.includes('Failed to fetch') || `${e.error}`.includes('CORS')) return
      console.error(e.error)
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Fit bounds to nodes when data changes ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || activeNodes.length === 0) return

    const bounds = new maplibregl.LngLatBounds()
    activeNodes.forEach(n => bounds.extend([n.position.lng, n.position.lat]))
    map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 0 })
  }, [activeNodes])

  const computeRoute = useCallback(() => {
    setIsRunning(true)
    setAnimStep(-1)
    setRouteResult(null)
    setTimeout(() => {
      const result = engineAStar(activeNodes, activeEdges, startNode, endNode)
      setRouteResult(result)
      setIsRunning(false)
      if (result) {
        let step = 0
        const animate = () => {
          setAnimStep(step++)
          if (step <= result.path.length) animRef.current = window.setTimeout(animate, 300)
        }
        animate()
      }
    }, 400)
  }, [activeNodes, activeEdges, startNode, endNode])

  const detectDisconnected = useCallback(() => {
    const adj = getAdjacencyList(activeEdges)
    const disconnected = activeNodes.filter(n => !adj[n.id] || adj[n.id].length === 0).map(n => n.id)
    setDisconnectedNodes(disconnected.length > 0 ? disconnected : [])
  }, [activeNodes, activeEdges])

  const reset = useCallback(() => {
    setRouteResult(null)
    setAnimStep(-1)
    setDisconnectedNodes([])
    if (animRef.current) clearTimeout(animRef.current)
  }, [])

  const routeSteps: RouteStep[] = (routeResult?.path ?? []).map((nodeId, i) => {
    const node = activeNodes.find(n => n.id === nodeId)!
    const prev = i > 0 ? activeNodes.find(n => n.id === routeResult!.path[i - 1]) : null
    const dist = prev ? Math.round(calcDistance(prev.position, node.position)) : 0
    const instruction = i === 0 ? 'Start here' : i === (routeResult?.path.length ?? 1) - 1 ? 'Destination reached' : `Continue to ${node.label}`
    return { nodeId, nodeName: node.label, instruction, distance: dist }
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid var(--navi-border)' }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navi-text)', margin: 0 }}>Route Testing</h1>
          <p style={{ color: 'var(--navi-text-secondary)', fontSize: 11, margin: '2px 0 0' }}>A* pathfinding on the campus map</p>
        </div>
        {usingMock && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '4px 8px', fontSize: 10, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={11} />
            Demo data — publish a campus to test real routes
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={detectDisconnected} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, color: '#D97706', fontSize: 11, cursor: 'pointer' }}>
            <Activity size={11} /> Detect Disconnected
          </button>
          <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 5, color: 'var(--navi-text-secondary)', fontSize: 11, cursor: 'pointer' }}>
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>

      {graphHealth && (
        <div style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, background: isHealthy ? '#ECFDF5' : '#FFFBEB', borderBottom: `1px solid ${isHealthy ? '#A7F3D0' : '#FDE68A'}` }}>
          <span style={{ fontSize: 14 }}>{isHealthy ? '🟢' : '⚠'}</span>
          <span style={{ fontWeight: 600, color: isHealthy ? '#059669' : '#D97706' }}>{isHealthy ? 'Healthy' : `${graphHealth.disconnected} unreachable`}</span>
          <span style={{ color: 'var(--navi-text-secondary)' }}>—</span>
          <span style={{ color: 'var(--navi-text-secondary)' }}>{graphHealth.total} nodes, {activeEdges.length} edges, {graphHealth.components} component{graphHealth.components !== 1 ? 's' : ''}</span>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Map canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          {/* Visualization toggles */}
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'var(--navi-sidebar)', borderRadius: 6, padding: '8px 10px', fontSize: 10, display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.95 }}>
            <div style={{ color: 'var(--navi-text-sidebar)', fontWeight: 600, marginBottom: 2, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visualization</div>
            {[
              { label: 'Navigation Graph', checked: showGraph, set: setShowGraph },
              { label: 'Show Route', checked: showRoute, set: setShowRoute },
              { label: 'Snap Indicators', checked: showSnapIndicators, set: setShowSnapIndicators },
              { label: 'Labels', checked: showLabels, set: setShowLabels },
              { label: 'Node IDs', checked: showNodeIds, set: setShowNodeIds },
            ].map(({ label, checked, set }) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: 'var(--navi-text-sidebar)' }}>
                <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} style={{ width: 12, height: 12 }} />
                {label}
              </label>
            ))}
          </div>
          {mapRef.current && (
            <RouteOverlay
              map={mapRef.current}
              nodes={activeNodes}
              edges={activeEdges}
              path={showRoute ? (routeResult?.path ?? null) : null}
              animStep={animStep}
              showGraph={showGraph}
              showLabels={showLabels}
              showNodeIds={showNodeIds}
            />
          )}
          {isRunning && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--navi-sidebar)', borderRadius: 10, padding: '20px 32px', textAlign: 'center', opacity: 0.95, zIndex: 10 }}>
              <div style={{ width: 32, height: 32, border: '2px solid var(--navi-sidebar-border)', borderTopColor: 'var(--navi-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navi-text-sidebar-active)' }}>Running A* Pathfinding...</div>
              <div style={{ fontSize: 10, color: 'var(--navi-text-sidebar)', marginTop: 3 }}>{startNode} → {endNode}</div>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'var(--navi-sidebar)', borderRadius: 6, padding: '4px 8px', fontSize: 9, display: 'flex', gap: 6, opacity: 0.9, zIndex: 10 }}>
            <span style={{ color: '#059669' }}>● Start</span>
            <span style={{ color: '#3B82F6' }}>● End</span>
            <span style={{ color: '#3B82F6' }}>— Route</span>
            <span style={{ color: '#94A3B8' }}>● Nodes</span>
            {disconnectedNodes.length > 0 && <span style={{ color: 'var(--navi-error)' }}>● Disconnected</span>}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 280, background: 'var(--navi-card)', borderLeft: '1px solid var(--navi-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--navi-border)' }}>
            {([
              { key: 'route', label: 'Route' },
              { key: 'diagnostics', label: 'Diagnostics' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, padding: '8px 0', background: 'transparent', border: 'none', borderBottom: activeTab === tab.key ? '2px solid var(--navi-primary)' : '2px solid transparent',
                  color: activeTab === tab.key ? 'var(--navi-primary)' : 'var(--navi-text-secondary)', fontSize: 11, fontWeight: activeTab === tab.key ? 700 : 500, cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'route' && (
            <>
              <div style={{ padding: '14px', borderBottom: '1px solid var(--navi-content)' }}>
                <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginBottom: 8 }}>ROUTE CONFIGURATION</div>
                {[
                  { label: 'START NODE', value: startNode, set: setStartNode, color: '#059669' },
                  { label: 'END NODE', value: endNode, set: setEndNode, color: '#3B82F6' },
                ].map(({ label, value, set, color }) => (
                  <div key={label} style={{ marginBottom: 6 }}>
                    <label style={{ color: 'var(--navi-text-secondary)', fontSize: 9, fontWeight: 600, display: 'block', marginBottom: 2 }}>{label}</label>
                    <select value={value} onChange={(e) => set(e.target.value)} style={{ width: '100%', background: 'var(--navi-content)', border: `1px solid ${color}30`, borderRadius: 5, padding: '5px 8px', color: 'var(--navi-text)', fontSize: 11, outline: 'none', cursor: 'pointer' }}>
                      {activeNodes.map((n) => <option key={n.id} value={n.id}>{n.id} — {n.name}</option>)}
                    </select>
                  </div>
                ))}
                <button onClick={computeRoute} disabled={isRunning || startNode === endNode} style={{ width: '100%', padding: '7px', background: isRunning ? 'var(--navi-content)' : 'var(--navi-primary)', border: 'none', borderRadius: 5, color: isRunning ? 'var(--navi-text-secondary)' : 'white', fontSize: 12, fontWeight: 600, cursor: isRunning || startNode === endNode ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 }}>
                  <Zap size={12} /> {isRunning ? 'Computing...' : 'Run A* Algorithm'}
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {routeResult ? (
                  <div style={{ padding: '14px' }}>
                    <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 7, padding: '10px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        <CheckCircle size={12} color='#059669' />
                        <span style={{ color: '#059669', fontSize: 11, fontWeight: 700 }}>Route Found</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {[
                          { label: 'Nodes', value: routeResult.path.length },
                          { label: 'Distance', value: `${Math.round(routeResult.cost)}m` },
                          { label: 'Est. Time', value: `~${Math.ceil(routeResult.cost / 80)}min` },
                          { label: 'Algorithm', value: 'A* (GPS)' },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ fontSize: 10 }}><span style={{ color: 'var(--navi-text-secondary)', fontWeight: 600 }}>{label}</span> <span style={{ color: 'var(--navi-text)', fontWeight: 700 }}>{value}</span></div>
                        ))}
                      </div>
                    </div>
                    <div style={{ color: 'var(--navi-text-secondary)', fontSize: 9, fontWeight: 600, marginBottom: 4 }}>ROUTE STEPS</div>
                    {routeSteps.map((step, i) => {
                      const isAnim = i <= animStep
                      return (
                        <div key={step.nodeId} style={{ display: 'flex', gap: 5, padding: '5px 7px', background: isAnim ? 'var(--navi-primary-light)' : 'transparent', border: `1px solid ${isAnim ? 'rgba(37,99,235,0.2)' : 'var(--navi-content)'}`, borderRadius: 5, marginBottom: 2 }}>
                          <div style={{ width: 16, height: 16, background: i === 0 ? '#059669' : i === routeSteps.length - 1 ? 'var(--navi-primary)' : isAnim ? 'rgba(37,99,235,0.3)' : 'var(--navi-content)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 7, color: isAnim ? 'white' : 'var(--navi-text-secondary)', fontWeight: 700 }}>{i + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: isAnim ? 'var(--navi-text)' : 'var(--navi-text-secondary)' }}>{step.nodeName}</div>
                            <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)' }}>{step.nodeId} {step.distance > 0 && `· +${step.distance}m`}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : disconnectedNodes.length > 0 ? (
                  <div style={{ padding: '14px' }}>
                    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '10px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <AlertTriangle size={12} color='var(--navi-error)' />
                        <span style={{ color: 'var(--navi-error)', fontSize: 11, fontWeight: 700 }}>{disconnectedNodes.length} Disconnected</span>
                      </div>
                      <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10 }}>These nodes have no valid path connections.</div>
                    </div>
                    {disconnectedNodes.map((nodeId) => (
                      <div key={nodeId} style={{ display: 'flex', gap: 5, padding: '6px 8px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, marginBottom: 3 }}>
                        <XCircle size={11} color='var(--navi-error)' style={{ flexShrink: 0, marginTop: 1 }} />
                        <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text)' }}>{nodeId}</div><div style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>{activeNodes.find((n) => n.id === nodeId)?.name ?? ''}</div></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 8 }}>
                    <Route size={22} color='var(--navi-primary)' style={{ opacity: 0.4 }} />
                    <div style={{ color: 'var(--navi-text-secondary)', fontSize: 11, lineHeight: 1.5 }}>Select start and end nodes, then run A* to find the optimal route on the campus map.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'diagnostics' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              {/* PUBLISHED SNAPSHOT */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>PUBLISHED SNAPSHOT</div>
                <div style={{ background: 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 6, padding: '8px 10px' }}>
                  {[
                    { label: 'Version', value: (result as any)?.metadata?.version ?? (result as any)?.version ?? '—' },
                    { label: 'Timestamp', value: (result as any)?.createdAt ?? '—' },
                    { label: 'Campus', value: (result as any)?.campusId ?? '—' },
                    { label: 'Nodes', value: activeNodes.length },
                    { label: 'Edges', value: activeEdges.length },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--navi-border)' }}>
                      <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: 10, color: 'var(--navi-text)', fontWeight: 700 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* GRAPH HEALTH */}
              {graphHealth && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>GRAPH HEALTH</div>
                  <div style={{ background: isHealthy ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${isHealthy ? '#A7F3D0' : '#FDE68A'}`, borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{isHealthy ? '🟢' : '⚠'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isHealthy ? '#059669' : '#D97706' }}>
                        {isHealthy ? 'Healthy' : `${graphHealth.disconnected} unreachable node${graphHealth.disconnected !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                      {graphHealth.connected}/{graphHealth.total} connected · {graphHealth.components} component{graphHealth.components !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              )}

              {/* STATISTICS */}
              {graphHealth && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>STATISTICS</div>
                  <div style={{ background: 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 6, padding: '8px 10px' }}>
                    {[
                      { label: 'Components', value: graphHealth.components },
                      { label: 'Dead Ends', value: graphHealth.deadEnds },
                      { label: 'Isolated Nodes', value: graphHealth.isolated },
                      { label: 'Avg Degree', value: graphHealth.avgDegree.toFixed(1) },
                      { label: 'Max Degree', value: graphHealth.maxDegree },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--navi-border)' }}>
                        <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)', fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 10, color: 'var(--navi-text)', fontWeight: 700 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NODE TYPES */}
              {graphHealth && Object.keys(graphHealth.nodeTypes).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>NODE TYPES</div>
                  <div style={{ background: 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 6, padding: '8px 10px' }}>
                    {Object.entries(graphHealth.nodeTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--navi-border)' }}>
                        <span style={{ fontSize: 10, color: 'var(--navi-text-secondary)', fontWeight: 600 }}>{type}</span>
                        <span style={{ fontSize: 10, color: 'var(--navi-text)', fontWeight: 700 }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* WARNINGS */}
              {graphHealth && graphHealth.warnings.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>WARNINGS</div>
                  {graphHealth.warnings.map((warning, i) => (
                    <div key={i} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 10px', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <AlertTriangle size={11} color='#D97706' />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706' }}>{warning.message}</span>
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--navi-text-secondary)', lineHeight: 1.5 }}>
                        {warning.nodeIds.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!result && (
                <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, textAlign: 'center', padding: 20 }}>
                  No published graph data. Publish a campus from the Studio to see diagnostics.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export const RouteTesting = NavigationInspector
