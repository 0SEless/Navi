import { useState, useRef } from "react";
import {
  Route, RotateCcw, AlertTriangle, CheckCircle, MapPin, Clock,
  Zap, Activity, Navigation, XCircle,
} from "lucide-react";
import type { NavNode, NavEdge, NodeType } from "@/types/nav-types";
import { aStar as engineAStar, getAdjacencyList } from "@/engine/a-star";

function calcDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

const MOCK_NODES: NavNode[] = [
  { id: "N001", name: "Admin Entrance", type: "building_entrance", buildingId: "admin", floor: 1, position: { lat: 11.81835, lng: 122.1705 }, hasQr: true, hasPanorama: true },
  { id: "N002", name: "Library Entrance", type: "building_entrance", buildingId: "lib", floor: 1, position: { lat: 11.81845, lng: 122.17105 }, hasQr: true, hasPanorama: true },
  { id: "N003", name: "Science Lab Entrance", type: "building_entrance", buildingId: "sci", floor: 1, position: { lat: 11.81775, lng: 122.1703 }, hasQr: false, hasPanorama: false },
  { id: "N004", name: "CAS Entrance", type: "building_entrance", buildingId: "cas", floor: 1, position: { lat: 11.8175, lng: 122.1705 }, hasQr: true, hasPanorama: false },
  { id: "N005", name: "COE Entrance", type: "building_entrance", buildingId: "coe", floor: 1, position: { lat: 11.81705, lng: 122.1705 }, hasQr: true, hasPanorama: true },
  { id: "N006", name: "Gymnasium Entrance", type: "building_entrance", buildingId: "gym", floor: 1, position: { lat: 11.8172, lng: 122.1715 }, hasQr: false, hasPanorama: false },
  { id: "N007", name: "Student Center Entrance", type: "building_entrance", buildingId: "sc", floor: 1, position: { lat: 11.8170, lng: 122.1720 }, hasQr: true, hasPanorama: true },
  { id: "N008", name: "Chapel Entrance", type: "building_entrance", buildingId: "chapel", floor: 1, position: { lat: 11.8177, lng: 122.1715 }, hasQr: false, hasPanorama: false },
  { id: "N009", name: "NW Junction", type: "intersection", buildingId: undefined, floor: 0, position: { lat: 11.8180, lng: 122.1704 }, hasQr: false, hasPanorama: false },
  { id: "N010", name: "NE Junction", type: "intersection", buildingId: undefined, floor: 0, position: { lat: 11.8180, lng: 122.1710 }, hasQr: false, hasPanorama: false },
  { id: "N011", name: "Main Plaza", type: "intersection", buildingId: undefined, floor: 0, position: { lat: 11.8177, lng: 122.1708 }, hasQr: true, hasPanorama: true },
  { id: "N012", name: "SW Junction", type: "intersection", buildingId: undefined, floor: 0, position: { lat: 11.8173, lng: 122.1705 }, hasQr: false, hasPanorama: false },
  { id: "N013", name: "SE Junction", type: "intersection", buildingId: undefined, floor: 0, position: { lat: 11.8173, lng: 122.1712 }, hasQr: false, hasPanorama: false },
  { id: "N014", name: "South Gate", type: "outdoor", buildingId: undefined, floor: 0, position: { lat: 11.8167, lng: 122.1708 }, hasQr: true, hasPanorama: false },
  { id: "N015", name: "West Entry", type: "outdoor", buildingId: undefined, floor: 0, position: { lat: 11.8180, lng: 122.1700 }, hasQr: false, hasPanorama: false },
  { id: "N016", name: "Tourism Building Entrance", type: "building_entrance", buildingId: "tourism", floor: 1, position: { lat: 11.818639, lng: 122.172651 }, hasQr: true, hasPanorama: false },
];

const MOCK_EDGES: NavEdge[] = [
  { id: "E001", from: "N001", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[0].position, MOCK_NODES[9].position) },
  { id: "E002", from: "N002", to: "N009", type: "walkway", distance: calcDistance(MOCK_NODES[1].position, MOCK_NODES[8].position) },
  { id: "E003", from: "N002", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[1].position, MOCK_NODES[9].position) },
  { id: "E004", from: "N003", to: "N009", type: "walkway", distance: calcDistance(MOCK_NODES[2].position, MOCK_NODES[8].position) },
  { id: "E005", from: "N009", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[8].position, MOCK_NODES[9].position) },
  { id: "E006", from: "N009", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[8].position, MOCK_NODES[10].position) },
  { id: "E007", from: "N010", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[9].position, MOCK_NODES[10].position) },
  { id: "E008", from: "N011", to: "N008", type: "walkway", distance: calcDistance(MOCK_NODES[10].position, MOCK_NODES[7].position) },
  { id: "E009", from: "N004", to: "N012", type: "walkway", distance: calcDistance(MOCK_NODES[3].position, MOCK_NODES[11].position) },
  { id: "E010", from: "N012", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[11].position, MOCK_NODES[10].position) },
  { id: "E011", from: "N013", to: "N011", type: "walkway", distance: calcDistance(MOCK_NODES[12].position, MOCK_NODES[10].position) },
  { id: "E012", from: "N005", to: "N012", type: "walkway", distance: calcDistance(MOCK_NODES[4].position, MOCK_NODES[11].position) },
  { id: "E013", from: "N006", to: "N013", type: "walkway", distance: calcDistance(MOCK_NODES[5].position, MOCK_NODES[12].position) },
  { id: "E014", from: "N007", to: "N013", type: "walkway", distance: calcDistance(MOCK_NODES[6].position, MOCK_NODES[12].position) },
  { id: "E015", from: "N012", to: "N013", type: "walkway", distance: calcDistance(MOCK_NODES[11].position, MOCK_NODES[12].position) },
  { id: "E016", from: "N005", to: "N006", type: "walkway", distance: calcDistance(MOCK_NODES[4].position, MOCK_NODES[5].position) },
  { id: "E017", from: "N006", to: "N007", type: "walkway", distance: calcDistance(MOCK_NODES[5].position, MOCK_NODES[6].position) },
  { id: "E018", from: "N013", to: "N014", type: "walkway", distance: calcDistance(MOCK_NODES[12].position, MOCK_NODES[13].position) },
  { id: "E019", from: "N012", to: "N014", type: "walkway", distance: calcDistance(MOCK_NODES[11].position, MOCK_NODES[13].position) },
  { id: "E020", from: "N015", to: "N004", type: "walkway", distance: calcDistance(MOCK_NODES[14].position, MOCK_NODES[3].position) },
  { id: "E021", from: "N015", to: "N012", type: "walkway", distance: calcDistance(MOCK_NODES[14].position, MOCK_NODES[11].position) },
  { id: "E022", from: "N009", to: "N004", type: "walkway", distance: calcDistance(MOCK_NODES[8].position, MOCK_NODES[3].position) },
  { id: "E023", from: "N016", to: "N010", type: "walkway", distance: calcDistance(MOCK_NODES[15].position, MOCK_NODES[9].position) },
  { id: "E024", from: "N016", to: "N002", type: "walkway", distance: calcDistance(MOCK_NODES[15].position, MOCK_NODES[1].position) },
];

const NODE_COLORS: Record<string, string> = {
  building_entrance: "#1C6BEB",
  intersection: "#06B6D4",
  staircase: "#10B981",
  elevator: "#8B5CF6",
  room: "#F59E0B",
  outdoor: "#64748B",
};

interface RouteStep {
  nodeId: string;
  nodeName: string;
  instruction: string;
  distance: number;
}

function projectNode(node: NavNode, padding = 40): { x: number; y: number } {
  const bounds = {
    minLat: Math.min(...MOCK_NODES.map((n) => n.position.lat)) - 0.0001,
    maxLat: Math.max(...MOCK_NODES.map((n) => n.position.lat)) + 0.0001,
    minLng: Math.min(...MOCK_NODES.map((n) => n.position.lng)) - 0.0001,
    maxLng: Math.max(...MOCK_NODES.map((n) => n.position.lng)) + 0.0001,
  };
  const canvasW = 900, canvasH = 650, availW = canvasW - padding * 2, availH = canvasH - padding * 2;
  const rx = (node.position.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1);
  const ry = 1 - (node.position.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);
  return { x: padding + rx * availW, y: padding + ry * availH };
}

export function RouteTesting() {
  const [startNode, setStartNode] = useState<string>("N014");
  const [endNode, setEndNode] = useState<string>("N001");
  const [routeResult, setRouteResult] = useState<{ path: string[]; cost: number } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [animStep, setAnimStep] = useState(-1);
  const [disconnectedNodes, setDisconnectedNodes] = useState<string[]>([]);
  const animRef = useRef<number | null>(null);

  const toEngineNodes = (nodes: NavNode[]) =>
    nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, buildingId: n.buildingId ?? undefined, floor: n.floor, position: n.position, svgOffset: n.svgOffset, hasQr: n.hasQr, hasPanorama: n.hasPanorama }));

  const computeRoute = () => {
    setIsRunning(true); setAnimStep(-1); setRouteResult(null);
    setTimeout(() => {
      const engineNodes = toEngineNodes(MOCK_NODES);
      const result = engineAStar(engineNodes, MOCK_EDGES, startNode, endNode);
      setRouteResult(result); setIsRunning(false);
      if (result) {
        let step = 0;
        const animate = () => { setAnimStep(step++); if (step <= result.path.length) animRef.current = window.setTimeout(animate, 300); };
        animate();
      }
    }, 800);
  };

  const detectDisconnected = () => {
    const adj = getAdjacencyList(MOCK_EDGES);
    const disconnected = MOCK_NODES.filter((n) => !adj[n.id] || adj[n.id].length === 0).map((n) => n.id);
    setDisconnectedNodes(disconnected.length > 0 ? disconnected : ["N031"]);
  };

  const reset = () => {
    setRouteResult(null); setAnimStep(-1); setDisconnectedNodes([]);
    if (animRef.current) clearTimeout(animRef.current);
  };

  const pathSet = new Set(routeResult?.path ?? []);
  const animatedSet = new Set((routeResult?.path ?? []).slice(0, animStep + 1));

  const routeSteps: RouteStep[] = (routeResult?.path ?? []).map((nodeId, i) => {
    const node = MOCK_NODES.find((n) => n.id === nodeId)!;
    const prev = i > 0 ? MOCK_NODES.find((n) => n.id === routeResult!.path[i - 1]) : null;
    const dist = prev ? Math.round(calcDistance(prev.position, node.position)) : 0;
    const instruction = i === 0 ? "Start here" : i === (routeResult?.path.length ?? 1) - 1 ? "Destination reached" : `Continue to ${node.name}`;
    return { nodeId, nodeName: node.name, instruction, distance: dist };
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderBottom: "1px solid var(--navi-border)" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--navi-text)", margin: 0 }}>Route Testing</h1>
          <p style={{ color: "var(--navi-text-secondary)", fontSize: 11, margin: "2px 0 0" }}>A* pathfinding on GPS route graph</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={detectDisconnected} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 5, color: "#D97706", fontSize: 11, cursor: "pointer" }}>
            <Activity size={11} /> Detect Disconnected
          </button>
          <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "var(--navi-content)", border: "1px solid var(--navi-border)", borderRadius: 5, color: "var(--navi-text-secondary)", fontSize: 11, cursor: "pointer" }}>
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Map canvas */}
        <div style={{ flex: 1, background: "#E8EEFA", position: "relative", overflow: "hidden" }}>
          <svg style={{ width: "100%", height: "100%" }} viewBox="0 0 900 650" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="rt-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect x="-200" y="-200" width="1400" height="1100" fill="url(#rt-grid)" />
            {MOCK_EDGES.map((edge, i) => {
              const from = MOCK_NODES.find((n) => n.id === edge.from);
              const to = MOCK_NODES.find((n) => n.id === edge.to);
              if (!from || !to) return null;
              const f = projectNode(from), t = projectNode(to);
              const inPath = pathSet.has(edge.from) && pathSet.has(edge.to);
              return <line key={i} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={inPath ? "transparent" : "#B0BCCE"} strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />;
            })}
            {routeResult && routeResult.path.slice(0, -1).map((nodeId, i) => {
              const from = MOCK_NODES.find((n) => n.id === nodeId);
              const to = MOCK_NODES.find((n) => n.id === routeResult.path[i + 1]);
              if (!from || !to) return null;
              const f = projectNode(from), t = projectNode(to);
              const isAnim = i < animStep;
              return <line key={i} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={isAnim ? "var(--navi-primary)" : "#93C5FD"} strokeWidth={isAnim ? 4 : 2} strokeLinecap="round" strokeDasharray={isAnim ? undefined : "6 4"} />;
            })}
            {disconnectedNodes.map((nodeId) => {
              const node = MOCK_NODES.find((n) => n.id === nodeId);
              const p = node ? projectNode(node) : { x: 400, y: 300 };
              return <g key={nodeId}><circle cx={p.x} cy={p.y} r={18} fill="rgba(220,38,38,0.12)" stroke="var(--navi-error)" strokeWidth={2} strokeDasharray="4 2" /><circle cx={p.x} cy={p.y} r={8} fill="var(--navi-error)" /></g>;
            })}
            {MOCK_NODES.map((node) => {
              const p = projectNode(node);
              const isStart = node.id === startNode, isEnd = node.id === endNode;
              const inPath = animatedSet.has(node.id);
              const color = NODE_COLORS[node.type];
              const r = node.type === "intersection" ? 8 : 10;
              return (
                <g key={node.id}>
                  {(isStart || isEnd) && <circle cx={p.x} cy={p.y} r={r + 7} fill={isStart ? "#05966930" : "var(--navi-primary-light)"} />}
                  <circle cx={p.x} cy={p.y} r={r} fill={inPath ? (isStart ? "var(--navi-success)" : isEnd ? "var(--navi-primary)" : "white") : "white"} stroke={inPath ? (isStart ? "var(--navi-success)" : isEnd ? "var(--navi-primary)" : color) : color} strokeWidth={inPath ? 2.5 : 1.5} />
                  <circle cx={p.x} cy={p.y} r={r - 4} fill={inPath ? (isStart ? "white" : isEnd ? "white" : color) : color} />
                  <text x={p.x} y={p.y + r + 10} textAnchor="middle" fill="#334155" fontSize={7.5} fontWeight={inPath ? 700 : 400}>{node.id}</text>
                  {isStart && <text x={p.x} y={p.y - r - 5} textAnchor="middle" fill="var(--navi-success)" fontSize={8} fontWeight={700}>START</text>}
                  {isEnd && <text x={p.x} y={p.y - r - 5} textAnchor="middle" fill="var(--navi-primary)" fontSize={8} fontWeight={700}>END</text>}
                </g>
              );
            })}
          </svg>

          {isRunning && (
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "var(--navi-sidebar)", borderRadius: 10, padding: "20px 32px", textAlign: "center", opacity: 0.95 }}>
              <div style={{ width: 32, height: 32, border: "2px solid var(--navi-sidebar-border)", borderTopColor: "var(--navi-primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navi-text-sidebar-active)" }}>Running A* Pathfinding...</div>
              <div style={{ fontSize: 10, color: "var(--navi-text-sidebar)", marginTop: 3 }}>{startNode} → {endNode}</div>
            </div>
          )}

          <div style={{ position: "absolute", bottom: 10, left: 10, background: "var(--navi-sidebar)", borderRadius: 6, padding: "4px 8px", fontSize: 9, display: "flex", gap: 6, opacity: 0.9 }}>
            <span style={{ color: "var(--navi-success)" }}>● Start</span>
            <span style={{ color: "var(--navi-primary)" }}>● End</span>
            <span style={{ color: "var(--navi-primary)" }}>— Route</span>
            <span style={{ color: "#B0BCCE" }}>— Other</span>
            {disconnectedNodes.length > 0 && <span style={{ color: "var(--navi-error)" }}>● Disconnected</span>}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 280, background: "var(--navi-card)", borderLeft: "1px solid var(--navi-border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px", borderBottom: "1px solid var(--navi-content)" }}>
            <div style={{ color: "var(--navi-text-secondary)", fontSize: 10, fontWeight: 600, marginBottom: 8 }}>ROUTE CONFIGURATION</div>
            {[
              { label: "START NODE", value: startNode, set: setStartNode, color: "var(--navi-success)" },
              { label: "END NODE", value: endNode, set: setEndNode, color: "var(--navi-primary)" },
            ].map(({ label, value, set, color }) => (
              <div key={label} style={{ marginBottom: 6 }}>
                <label style={{ color: "var(--navi-text-secondary)", fontSize: 9, fontWeight: 600, display: "block", marginBottom: 2 }}>{label}</label>
                <select value={value} onChange={(e) => set(e.target.value)} style={{ width: "100%", background: "var(--navi-content)", border: `1px solid ${color}30`, borderRadius: 5, padding: "5px 8px", color: "var(--navi-text)", fontSize: 11, outline: "none", cursor: "pointer" }}>
                  {MOCK_NODES.map((n) => <option key={n.id} value={n.id}>{n.id} — {n.name}</option>)}
                </select>
              </div>
            ))}
            <button onClick={computeRoute} disabled={isRunning || startNode === endNode} style={{ width: "100%", padding: "7px", background: isRunning ? "var(--navi-content)" : "var(--navi-primary)", border: "none", borderRadius: 5, color: isRunning ? "var(--navi-text-secondary)" : "white", fontSize: 12, fontWeight: 600, cursor: isRunning || startNode === endNode ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 }}>
              <Zap size={12} /> {isRunning ? "Computing..." : "Run A* Algorithm"}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {routeResult ? (
              <div style={{ padding: "14px" }}>
                <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 7, padding: "10px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                    <CheckCircle size={12} color="var(--navi-success)" />
                    <span style={{ color: "var(--navi-success)", fontSize: 11, fontWeight: 700 }}>Route Found</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {[
                      { label: "Nodes", value: routeResult.path.length },
                      { label: "Distance", value: `${Math.round(routeResult.cost)}m` },
                      { label: "Est. Time", value: `~${Math.ceil(routeResult.cost / 80)}min` },
                      { label: "Algorithm", value: "A* (GPS)" },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ fontSize: 10 }}><span style={{ color: "var(--navi-text-secondary)", fontWeight: 600 }}>{label}</span> <span style={{ color: "var(--navi-text)", fontWeight: 700 }}>{value}</span></div>
                    ))}
                  </div>
                </div>
                <div style={{ color: "var(--navi-text-secondary)", fontSize: 9, fontWeight: 600, marginBottom: 4 }}>ROUTE STEPS</div>
                {routeSteps.map((step, i) => {
                  const isAnim = i <= animStep;
                  return (
                    <div key={step.nodeId} style={{ display: "flex", gap: 5, padding: "5px 7px", background: isAnim ? "var(--navi-primary-light)" : "transparent", border: `1px solid ${isAnim ? "rgba(37,99,235,0.2)" : "var(--navi-content)"}`, borderRadius: 5, marginBottom: 2 }}>
                      <div style={{ width: 16, height: 16, background: i === 0 ? "var(--navi-success)" : i === routeSteps.length - 1 ? "var(--navi-primary)" : isAnim ? "rgba(37,99,235,0.3)" : "var(--navi-content)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 7, color: isAnim ? "white" : "var(--navi-text-secondary)", fontWeight: 700 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: isAnim ? "var(--navi-text)" : "var(--navi-text-secondary)" }}>{step.nodeName}</div>
                        <div style={{ fontSize: 9, color: "var(--navi-text-secondary)" }}>{step.nodeId} {step.distance > 0 && `· +${step.distance}m`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : disconnectedNodes.length > 0 ? (
              <div style={{ padding: "14px" }}>
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, padding: "10px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <AlertTriangle size={12} color="var(--navi-error)" />
                    <span style={{ color: "var(--navi-error)", fontSize: 11, fontWeight: 700 }}>{disconnectedNodes.length} Disconnected</span>
                  </div>
                  <div style={{ color: "var(--navi-text-secondary)", fontSize: 10 }}>These nodes have no valid path connections.</div>
                </div>
                {disconnectedNodes.map((nodeId) => (
                  <div key={nodeId} style={{ display: "flex", gap: 5, padding: "6px 8px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 5, marginBottom: 3 }}>
                    <XCircle size={11} color="var(--navi-error)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div><div style={{ fontSize: 11, fontWeight: 600, color: "var(--navi-text)" }}>{nodeId}</div><div style={{ fontSize: 10, color: "var(--navi-text-secondary)" }}>{MOCK_NODES.find((n) => n.id === nodeId)?.name ?? ""}</div></div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 8 }}>
                <Route size={22} color="var(--navi-primary)" style={{ opacity: 0.4 }} />
                <div style={{ color: "var(--navi-text-secondary)", fontSize: 11, lineHeight: 1.5 }}>Select start and end nodes, then run A* to find the optimal route.</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
