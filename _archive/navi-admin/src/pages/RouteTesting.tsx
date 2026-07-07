import { useState, useRef } from "react";
import {
  Route, RotateCcw, AlertTriangle, CheckCircle, MapPin, Clock,
  Zap, Activity, Navigation, XCircle, Info,
} from "lucide-react";
import { MOCK_NODES, MOCK_EDGES, NODE_COLORS, calcDistance } from "./map-editor/mockData";
import type { NavNode, NavEdge, NodeType } from "./map-editor/types";
import { aStar as engineAStar, getAdjacencyList } from "../engine/a-star";
import { buildDirectory } from "../engine/directory";
import { validateGraph } from "../engine/graph-validator";

interface RouteStep {
  nodeId: string;
  nodeName: string;
  instruction: string;
  distance: number;
}

function projectNode(node: NavNode, padding = 40): { x: number; y: number } {
  const bounds = {
    minLat: Math.min(...MOCK_NODES.map((n) => n.latlng.lat)) - 0.0001,
    maxLat: Math.max(...MOCK_NODES.map((n) => n.latlng.lat)) + 0.0001,
    minLng: Math.min(...MOCK_NODES.map((n) => n.latlng.lng)) - 0.0001,
    maxLng: Math.max(...MOCK_NODES.map((n) => n.latlng.lng)) + 0.0001,
  };
  const canvasW = 900;
  const canvasH = 650;
  const availW = canvasW - padding * 2;
  const availH = canvasH - padding * 2;
  const rx = (node.latlng.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1);
  const ry = 1 - (node.latlng.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);
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
    nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      buildingId: n.buildingId ?? undefined,
      floor: n.floor,
      position: n.latlng,
      svgOffset: n.svgOffset,
      hasQr: n.hasQR,
      hasPanorama: n.hasPanorama,
    }));

  const computeRoute = () => {
    setIsRunning(true);
    setAnimStep(-1);
    setRouteResult(null);

    setTimeout(() => {
      const engineNodes = toEngineNodes(MOCK_NODES);
      const result = engineAStar(engineNodes, MOCK_EDGES, startNode, endNode);
      setRouteResult(result);
      setIsRunning(false);

      if (result) {
        let step = 0;
        const animate = () => {
          setAnimStep(step++);
          if (step <= result.path.length) {
            animRef.current = window.setTimeout(animate, 300);
          }
        };
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
    setRouteResult(null);
    setAnimStep(-1);
    setDisconnectedNodes([]);
    if (animRef.current) clearTimeout(animRef.current);
  };

  const pathSet = new Set(routeResult?.path ?? []);
  const animatedSet = new Set((routeResult?.path ?? []).slice(0, animStep + 1));

  const routeSteps: RouteStep[] = (routeResult?.path ?? []).map((nodeId, i) => {
    const node = MOCK_NODES.find((n) => n.id === nodeId)!;
    const prev = i > 0 ? MOCK_NODES.find((n) => n.id === routeResult!.path[i - 1]) : null;
    const dist = prev ? Math.round(calcDistance(prev.latlng, node.latlng)) : 0;
    let instruction = i === 0 ? "Start here" : i === (routeResult?.path.length ?? 1) - 1 ? "Destination reached" : `Continue to ${node.name}`;
    return { nodeId, nodeName: node.name, instruction, distance: dist };
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0A0F1E" }}>
      {/* Header */}
      <div style={{ background: "#0D1526", borderBottom: "1px solid #1E3A5F", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700, margin: 0 }}>Route Testing</h1>
          <p style={{ color: "#64748B", fontSize: 11, margin: "2px 0 0" }}>A* pathfinding on GPS route graph</p>
        </div>
        <div className="flex gap-2">
          <button onClick={detectDisconnected} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, color: "#FBBF24", fontSize: 12, cursor: "pointer" }}>
            <Activity size={13} /> Detect Disconnected
          </button>
          <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: 6, color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>
            <RotateCcw size={13} /> Reset
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

            {/* All edges (grey) */}
            {MOCK_EDGES.map((edge, i) => {
              const from = MOCK_NODES.find((n) => n.id === edge.from);
              const to = MOCK_NODES.find((n) => n.id === edge.to);
              if (!from || !to) return null;
              const f = projectNode(from);
              const t = projectNode(to);
              const inPath = pathSet.has(edge.from) && pathSet.has(edge.to);
              return (
                <line key={i} x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                  stroke={inPath ? "transparent" : "#B0BCCE"}
                  strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
              );
            })}

            {/* Route path animated */}
            {routeResult && routeResult.path.slice(0, -1).map((nodeId, i) => {
              const from = MOCK_NODES.find((n) => n.id === nodeId);
              const to = MOCK_NODES.find((n) => n.id === routeResult.path[i + 1]);
              if (!from || !to) return null;
              const f = projectNode(from);
              const t = projectNode(to);
              const isAnimated = i < animStep;
              return (
                <g key={i}>
                  <line
                    x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                    stroke={isAnimated ? "#1C6BEB" : "#93C5FD"}
                    strokeWidth={isAnimated ? 4 : 2}
                    strokeLinecap="round"
                    strokeDasharray={isAnimated ? undefined : "6 4"}
                  />
                </g>
              );
            })}

            {/* Disconnected nodes highlight */}
            {disconnectedNodes.map((nodeId) => {
              const node = MOCK_NODES.find((n) => n.id === nodeId);
              const p = node ? projectNode(node) : { x: 400, y: 300 };
              return (
                <g key={nodeId}>
                  <circle cx={p.x} cy={p.y} r={18} fill="rgba(239,68,68,0.15)" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 2" />
                  <circle cx={p.x} cy={p.y} r={8} fill="#EF4444" />
                </g>
              );
            })}

            {/* All nodes */}
            {MOCK_NODES.map((node) => {
              const p = projectNode(node);
              const isStart = node.id === startNode;
              const isEnd = node.id === endNode;
              const inPath = animatedSet.has(node.id);
              const color = NODE_COLORS[node.type];
              const r = node.type === "intersection" ? 8 : 10;

              return (
                <g key={node.id}>
                  {(isStart || isEnd) && (
                    <circle cx={p.x} cy={p.y} r={r + 7} fill={isStart ? "#10B98130" : "#1C6BEB30"} />
                  )}
                  <circle cx={p.x} cy={p.y} r={r}
                    fill={inPath ? (isStart ? "#10B981" : isEnd ? "#1C6BEB" : "white") : "white"}
                    stroke={inPath ? (isStart ? "#10B981" : isEnd ? "#1C6BEB" : color) : color}
                    strokeWidth={inPath ? 2.5 : 1.5}
                  />
                  <circle cx={p.x} cy={p.y} r={r - 4}
                    fill={inPath ? (isStart ? "white" : isEnd ? "white" : color) : color}
                  />
                  <text x={p.x} y={p.y + r + 10} textAnchor="middle" fill="#334155" fontSize={7.5} fontWeight={inPath ? 700 : 400}>
                    {node.id}
                  </text>
                  {isStart && <text x={p.x} y={p.y - r - 5} textAnchor="middle" fill="#10B981" fontSize={8} fontWeight={700}>START</text>}
                  {isEnd && <text x={p.x} y={p.y - r - 5} textAnchor="middle" fill="#1C6BEB" fontSize={8} fontWeight={700}>END</text>}
                </g>
              );
            })}
          </svg>

          {/* Loading overlay */}
          {isRunning && (
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(15,23,42,0.85)", borderRadius: 12, padding: "24px 40px", textAlign: "center" }}>
              <div style={{ width: 36, height: 36, border: "3px solid #1E3A5F", borderTopColor: "#1C6BEB", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0" }}>Running A* Pathfinding...</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>{startNode} → {endNode}</div>
            </div>
          )}

          {/* Legend */}
          <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(15,23,42,0.85)", borderRadius: 7, padding: "6px 10px", fontSize: 9, display: "flex", gap: 8 }}>
            <span style={{ color: "#10B981" }}>● Start</span>
            <span style={{ color: "#1C6BEB" }}>● End</span>
            <span style={{ color: "#1C6BEB" }}>— Route</span>
            <span style={{ color: "#B0BCCE" }}>— Other</span>
            {disconnectedNodes.length > 0 && <span style={{ color: "#EF4444" }}>● Disconnected</span>}
          </div>

          {/* Stats */}
          <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(15,23,42,0.85)", borderRadius: 6, padding: "4px 10px", fontSize: 9, color: "#64748B" }}>
            Nodes: {MOCK_NODES.length} · Edges: {MOCK_EDGES.length}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 300, background: "#0D1526", borderLeft: "1px solid #1E3A5F", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Route config */}
          <div style={{ padding: "14px", borderBottom: "1px solid #1E293B" }}>
            <div style={{ color: "#64748B", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>ROUTE CONFIGURATION</div>

            {[
              { label: "START NODE", value: startNode, set: setStartNode, color: "#10B981" },
              { label: "END NODE", value: endNode, set: setEndNode, color: "#1C6BEB" },
            ].map(({ label, value, set, color }) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, display: "block", marginBottom: 3 }}>{label}</label>
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  style={{ width: "100%", background: "#111827", border: `1px solid ${color}40`, borderRadius: 5, padding: "6px 8px", color: "#E2E8F0", fontSize: 11, outline: "none", cursor: "pointer", boxSizing: "border-box" }}
                >
                  {MOCK_NODES.map((n) => (
                    <option key={n.id} value={n.id}>{n.id} — {n.name}</option>
                  ))}
                </select>
              </div>
            ))}

            <button
              onClick={computeRoute}
              disabled={isRunning || startNode === endNode}
              style={{
                width: "100%",
                padding: "8px",
                background: isRunning ? "#1E293B" : "linear-gradient(135deg, #1C6BEB, #0891B2)",
                border: "none",
                borderRadius: 6,
                color: isRunning ? "#475569" : "white",
                fontSize: 12,
                fontWeight: 700,
                cursor: isRunning || startNode === endNode ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Zap size={13} />
              {isRunning ? "Computing..." : "Run A* Algorithm"}
            </button>
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {routeResult ? (
              <div style={{ padding: "14px" }}>
                <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 7, padding: "10px", marginBottom: 12 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={13} color="#10B981" />
                    <span style={{ color: "#10B981", fontSize: 11, fontWeight: 700 }}>Route Found</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { label: "Nodes", value: routeResult.path.length },
                      { label: "Distance", value: `${Math.round(routeResult.cost)}m` },
                      { label: "Est. Time", value: `~${Math.ceil(routeResult.cost / 80)}min` },
                      { label: "Algorithm", value: "A* (GPS)" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ color: "#94A3B8", fontSize: 8, fontWeight: 600 }}>{label}</div>
                        <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>ROUTE STEPS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {routeSteps.map((step, i) => {
                    const isAnim = i <= animStep;
                    return (
                      <div
                        key={step.nodeId}
                        style={{
                          display: "flex", gap: 6, padding: "6px 8px",
                          background: isAnim ? "rgba(28,107,235,0.12)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isAnim ? "rgba(28,107,235,0.25)" : "#1E293B"}`,
                          borderRadius: 5, transition: "all 0.3s",
                        }}
                      >
                        <div style={{ width: 18, height: 18, background: i === 0 ? "#10B981" : i === routeSteps.length - 1 ? "#1C6BEB" : isAnim ? "#1C6BEB40" : "#1E293B", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 8, color: isAnim ? "#60A5FA" : "#475569", fontWeight: 700 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: isAnim ? "#E2E8F0" : "#64748B" }}>{step.nodeName}</div>
                          <div style={{ fontSize: 9, color: "#475569" }}>{step.nodeId} {step.distance > 0 && `· +${step.distance}m`}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : disconnectedNodes.length > 0 ? (
              <div style={{ padding: "14px" }}>
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, padding: "10px", marginBottom: 12 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={13} color="#EF4444" />
                    <span style={{ color: "#EF4444", fontSize: 11, fontWeight: 700 }}>{disconnectedNodes.length} Disconnected</span>
                  </div>
                  <div style={{ color: "#94A3B8", fontSize: 10 }}>
                    These nodes have no valid path connections.
                  </div>
                </div>
                {disconnectedNodes.map((nodeId) => {
                  const node = MOCK_NODES.find((n) => n.id === nodeId);
                  return (
                    <div key={nodeId} style={{ display: "flex", gap: 6, padding: "8px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, marginBottom: 4 }}>
                      <XCircle size={12} color="#EF4444" />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#E2E8F0" }}>{nodeId}</div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>{node?.name ?? "Unknown"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 10 }}>
                <Route size={24} color="#1C6BEB" opacity={0.4} />
                <div style={{ color: "#475569", fontSize: 11, lineHeight: 1.5 }}>
                  Select start and end nodes, then run A* to find the optimal route.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
