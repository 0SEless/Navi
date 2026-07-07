import { useMemo } from "react";
import type { CampusBuilding, NavNode, NavEdge } from "./types";
import { NODE_COLORS } from "./mockData";

interface AutoSvgViewProps {
  buildings: CampusBuilding[];
  nodes: NavNode[];
  edges: NavEdge[];
  selectedNode: string | null;
  selectedEdge: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onUpdateNodePosition: (id: string, x: number, y: number) => void;
}

interface Point {
  x: number;
  y: number;
}

function projectToCanvas(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  padding = 40
): Point {
  const canvasW = 900;
  const canvasH = 650;
  const availW = canvasW - padding * 2;
  const availH = canvasH - padding * 2;
  const ratioX = (lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1);
  const ratioY = 1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);
  return {
    x: padding + ratioX * availW,
    y: padding + ratioY * availH,
  };
}

export function AutoSvgView({
  buildings,
  nodes,
  edges,
  selectedNode,
  selectedEdge,
  onSelectNode,
  onSelectEdge,
  onUpdateNodePosition,
}: AutoSvgViewProps) {
  const bounds = useMemo(() => {
    const all = buildings.flatMap((b) => b.outline);
    if (all.length === 0) return { minLat: 11.8165, maxLat: 11.8187, minLng: 122.1698, maxLng: 122.1723 };
    return {
      minLat: Math.min(...all.map((p) => p.lat)) - 0.00015,
      maxLat: Math.max(...all.map((p) => p.lat)) + 0.00015,
      minLng: Math.min(...all.map((p) => p.lng)) - 0.00015,
      maxLng: Math.max(...all.map((p) => p.lng)) + 0.00015,
    };
  }, [buildings]);

  const toCanvas = (lat: number, lng: number) =>
    projectToCanvas(lat, lng, bounds);

  const nodePos = (n: NavNode): Point => {
    if (n.svgOffset) return n.svgOffset;
    return toCanvas(n.latlng.lat, n.latlng.lng);
  };

  return (
    <div style={{ width: "100%", height: "100%", background: "#E8EEFA", overflow: "hidden", position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 900 650" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="svg-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x="-200" y="-200" width="1400" height="1100" fill="url(#svg-grid)" />

        {/* Buildings */}
        {buildings.map((b) => {
          const pts = b.outline.map((v) => {
            const p = toCanvas(v.lat, v.lng);
            return `${p.x},${p.y}`;
          }).join(" ");
          const center = toCanvas(b.center.lat, b.center.lng);
          return (
            <g key={b.id}>
              <polygon points={pts} fill={`${b.color}18`} stroke={b.color} strokeWidth={1.5} rx={4} />
              <rect x={center.x - 30} y={center.y - 7} width={60} height={14} rx={3} fill={b.color} opacity={0.8} />
              <text x={center.x} y={center.y + 4} textAnchor="middle" fill="white" fontSize={8} fontWeight={700}>
                {b.code}
              </text>
              <text x={center.x} y={center.y + 18} textAnchor="middle" fill={b.color} fontSize={9} fontWeight={500} opacity={0.8}>
                {b.name}
              </text>
            </g>
          );
        })}

        {/* Edges */}
        {edges.map((edge) => {
          const from = nodes.find((n) => n.id === edge.from);
          const to = nodes.find((n) => n.id === edge.to);
          if (!from || !to) return null;
          const f = nodePos(from);
          const t = nodePos(to);
          const isSelected = selectedEdge === edge.id;
          return (
            <line
              key={edge.id}
              x1={f.x} y1={f.y} x2={t.x} y2={t.y}
              stroke={isSelected ? "#1C6BEB" : edge.type === "stairs" ? "#10B981" : edge.type === "corridor" ? "#8B5CF6" : "#94A3B8"}
              strokeWidth={isSelected ? 3 : 2}
              strokeDasharray={edge.type === "stairs" ? "5 3" : undefined}
              strokeLinecap="round"
              style={{ cursor: "pointer" }}
              onClick={() => onSelectEdge(edge.id)}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const p = nodePos(node);
          const color = NODE_COLORS[node.type] || "#64748B";
          const r = node.type === "intersection" ? 8 : 10;
          const isSelected = selectedNode === node.id;
          return (
            <g
              key={node.id}
              style={{ cursor: "grab" }}
              onMouseDown={() => onSelectNode(node.id)}
            >
              {isSelected && (
                <circle cx={p.x} cy={p.y} r={r + 6} fill="rgba(28,107,235,0.15)" stroke="#1C6BEB" strokeWidth={1} />
              )}
              <circle cx={p.x} cy={p.y} r={r} fill={isSelected ? "#1C6BEB" : "white"} stroke={color} strokeWidth={2} />
              <circle cx={p.x} cy={p.y} r={r - 4} fill={isSelected ? "white" : color} pointerEvents="none" />
              {node.hasQR && <circle cx={p.x + r - 1} cy={p.y - r + 1} r={3} fill="#F59E0B" stroke="white" strokeWidth={1} />}
              <text x={p.x} y={p.y + r + 10} textAnchor="middle" fill="#334155" fontSize={7.5} fontWeight={isSelected ? 700 : 400}>
                {node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
