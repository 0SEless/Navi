import { useState, useCallback, useRef, useEffect } from "react";
import {
  MousePointer2, Plus, GitBranch, Trash2, ZoomIn, ZoomOut,
  Move, Building2, MapPin, Route, Upload, Info, Camera, QrCode, X,
} from "lucide-react";
import { RealMapView } from "./map-editor/RealMapView";
import { AutoSvgView } from "./map-editor/AutoSvgView";
import {
  MOCK_BUILDINGS, MOCK_NODES, MOCK_EDGES,
  CAMPUS_CENTER, NODE_COLORS, generateId, calcDistance,
} from "./map-editor/mockData";
import type {
  Tool, MapView, CampusBuilding, LatLng, BuildingBoxMode,
} from "./map-editor/types";
import type { NavNode, NavEdge, NodeType, EdgeType } from "../types/nav-types";
import { useGraphStore } from "../store/graph-store";
import { useUiStore } from "../store/ui-store";
import type { EditorMode } from "../store/ui-store";

export function MapEditor() {
  const graph = useGraphStore((s) => s.graph);
  const addNode = useGraphStore((s) => s.addNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const addBuilding = useGraphStore((s) => s.addBuilding);
  const addComponent = useGraphStore((s) => s.addComponent);
  const removeNode = useGraphStore((s) => s.removeNode);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const setNodes = useGraphStore((s) => s.setNodes);
  const setEdges = useGraphStore((s) => s.setEdges);
  const setBuildings = useGraphStore((s) => s.setBuildings);
  const load = useGraphStore((s) => s.load);

  // Initialise with mock data or localStorage
  useEffect(() => {
    const saved = localStorage.getItem("navi-graph");
    if (saved) {
      load();
    } else if (graph.nodes.length === 0) {
      setBuildings(MOCK_BUILDINGS as unknown as import("../types/nav-types").Building[]);
      setNodes(MOCK_NODES);
      setEdges(MOCK_EDGES);
    }
  }, []);

  const tool = useUiStore((s) => s.tool);
  const selectedNode = useUiStore((s) => s.selectedNode);
  const selectedEdge = useUiStore((s) => s.selectedEdge);
  const activeFloor = useUiStore((s) => s.activeFloor);
  const view = useUiStore((s) => s.view);
  const zoom = useUiStore((s) => s.zoom);
  const boxMode = useUiStore((s) => s.boxMode);
  const editorMode = useUiStore((s) => s.editorMode);
  const componentType = useUiStore((s) => s.componentType);
  const setTool = useUiStore((s) => s.setTool);
  const setSelectedNode = useUiStore((s) => s.setSelectedNode);
  const setSelectedEdge = useUiStore((s) => s.setSelectedEdge);
  const setActiveFloor = useUiStore((s) => s.setActiveFloor);
  const setView = useUiStore((s) => s.setView);
  const setZoom = useUiStore((s) => s.setZoom);
  const setBoxMode = useUiStore((s) => s.setBoxMode);
  const setEditorMode = useUiStore((s) => s.setEditorMode);
  const setComponentType = useUiStore((s) => s.setComponentType);

  const [pendingBuilding, setPendingBuilding] = useState<{
    outline: LatLng[];
    name: string;
    code: string;
    floors: number;
    color: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodes = graph.nodes;
  const edges = graph.edges;
  const buildings: CampusBuilding[] = graph.buildings as unknown as CampusBuilding[];

  const selectedNodeData = selectedNode ? graph.getNode(selectedNode) : null;
  const selectedEdgeData = selectedEdge ? graph.getEdge(selectedEdge) : null;
  const edgeStartNode = selectedEdgeData
    ? graph.getNode(selectedEdgeData.from)
    : null;
  const edgeEndNode = selectedEdgeData
    ? graph.getNode(selectedEdgeData.to)
    : null;

  const setToolAndReset = useCallback((t: Tool) => {
    setTool(t);
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [setTool, setSelectedNode, setSelectedEdge]);

  const handleAddNode = useCallback((node: NavNode) => {
    addNode(node);
    setSelectedNode(node.id);
    setTool("select");
  }, [addNode, setSelectedNode, setTool]);

  const handleAddEdge = useCallback((edge: NavEdge) => {
    addEdge(edge);
    setSelectedEdge(edge.id);
    setTool("select");
  }, [addEdge, setSelectedEdge, setTool]);

  const handleBuildingDrawn = useCallback((outline: LatLng[]) => {
    const center = {
      lat: outline.reduce((s, v) => s + v.lat, 0) / outline.length,
      lng: outline.reduce((s, v) => s + v.lng, 0) / outline.length,
    };
    setPendingBuilding({
      outline,
      name: `Building ${buildings.length + 1}`,
      code: `BLD${buildings.length + 1}`,
      floors: 1,
      color: "#64748B",
      center,
    });
  }, [buildings.length]);

  const confirmBuilding = useCallback(() => {
    if (!pendingBuilding) return;
    const id = generateId("B", buildings.map((b) => b.id));
    addBuilding({ ...pendingBuilding, id, description: pendingBuilding.name } as unknown as import("../types/nav-types").Building);
    setPendingBuilding(null);
    setTool("select");
  }, [pendingBuilding, buildings, addBuilding, setTool]);

  const cancelBuilding = useCallback(() => {
    setPendingBuilding(null);
  }, []);

  const handleUpdateNode = useCallback(
    (field: string, value: unknown) => {
      if (selectedNode) {
        graph.updateNode(selectedNode, { [field]: value });
      }
    },
    [selectedNode, graph]
  );

  const handleDeleteNode = useCallback((id: string) => {
    removeNode(id);
    if (selectedNode === id) setSelectedNode(null);
  }, [removeNode, selectedNode, setSelectedNode]);

  const handleDeleteEdge = useCallback((id: string) => {
    removeEdge(id);
    if (selectedEdge === id) setSelectedEdge(null);
  }, [removeEdge, selectedEdge, setSelectedEdge]);

  const handleUpdateNodePosition = useCallback(
    (id: string, x: number, y: number) => {
      graph.updateNode(id, { svgOffset: { x, y } });
    },
    [graph]
  );

  const handlePlaceComponent = useCallback((type: string, position: LatLng, dimensions?: { width: number; height: number }) => {
    const buildingId = graph.getNearestNode(position, 30)?.buildingId ?? graph.buildings[0]?.id ?? "";
    const compId = `comp-${Date.now()}`;
    const component: import("../types/nav-types").Component = {
      id: compId,
      type: type as import("../types/nav-types").ComponentType,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${graph.components.length + 1}`,
      buildingId,
      floor: activeFloor,
      position,
      dimensions,
    };
    addComponent(component);
  }, [graph, activeFloor, addComponent]);

  const parseGPX = useCallback(
    (content: string) => {
      const parser = new DOMParser();
      const xml = parser.parseFromString(content, "text/xml");
      const trkpts = xml.querySelectorAll("trkpt");
      if (trkpts.length === 0) return;

      const waypoints: LatLng[] = [];
      trkpts.forEach((pt) => {
        const lat = parseFloat(pt.getAttribute("lat") || "0");
        const lon = parseFloat(pt.getAttribute("lon") || "0");
        if (lat && lon) waypoints.push({ lat, lng: lon });
      });

      if (waypoints.length < 2) return;

      const newNodes: NavNode[] = [];
      const newEdges: NavEdge[] = [];

      const sampleRate = Math.max(1, Math.floor(waypoints.length / 20));
      const sampled: LatLng[] = [];
      for (let i = 0; i < waypoints.length; i += sampleRate) {
        sampled.push(waypoints[i]);
      }
      if (sampled[sampled.length - 1] !== waypoints[waypoints.length - 1]) {
        sampled.push(waypoints[waypoints.length - 1]);
      }

      let prevId: string | null = null;
      for (const pt of sampled) {
        const nearNode = graph.getNearestNode(pt, 5);
        if (nearNode) {
          if (prevId && nearNode.id !== prevId) {
            const dist = calcDistance(
              graph.getNode(prevId)!.position,
              nearNode.position
            );
            addEdge({
              id: generateId("E", edges.map((e) => e.id)),
              from: prevId,
              to: nearNode.id,
              type: "walkway" as EdgeType,
              distance: dist,
            });
          }
          prevId = nearNode.id;
          continue;
        }
        const nid = generateId("N", nodes.map((n) => n.id));
        const node: NavNode = {
          id: nid,
          name: `Waypoint ${newNodes.length + 1}`,
          type: "intersection" as NodeType,
          buildingId: null,
          floor: 1,
          position: pt,
          hasQr: false,
          hasPanorama: false,
        };
        newNodes.push(node);
        if (prevId) {
          const dist = calcDistance(
            graph.getNode(prevId)?.position ?? pt,
            pt
          );
          addEdge({
            id: generateId("E", edges.map((e) => e.id)),
            from: prevId,
            to: nid,
            type: "walkway" as EdgeType,
            distance: dist,
          });
        }
        prevId = nid;
      }

      if (newNodes.length > 0) {
        for (const n of newNodes) addNode(n);
      }
    },
    [graph, nodes, edges, addNode, addEdge]
  );

  const handleGPXUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        parseGPX(text);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [parseGPX]
  );

  const TOOL_CONFIG = [
    { t: "select" as Tool, icon: MousePointer2, label: "Select" },
    { t: "add_node" as Tool, icon: Plus, label: "Add Node" },
    { t: "add_edge" as Tool, icon: GitBranch, label: "Add Edge" },
    { t: "building_box" as Tool, icon: Building2, label: "Building Box" },
    { t: "pan" as Tool, icon: Move, label: "Pan" },
    { t: "delete" as Tool, icon: Trash2, label: "Delete" },
  ];

  const COMPONENT_TYPES = [
    { type: "room" as const, label: "Room", icon: MapPin, color: "#F59E0B" },
    { type: "stair" as const, label: "Stair", icon: MapPin, color: "#10B981" },
    { type: "elevator" as const, label: "Elevator", icon: MapPin, color: "#8B5CF6" },
    { type: "hallway" as const, label: "Hallway", icon: MapPin, color: "#06B6D4" },
    { type: "entrance" as const, label: "Entrance", icon: MapPin, color: "#1C6BEB" },
    { type: "restroom" as const, label: "Restroom", icon: MapPin, color: "#EC4899" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0A0F1E" }}>
      {/* Toolbar */}
      <div
        style={{
          background: "#0D1526",
          borderBottom: "1px solid #1E3A5F",
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Editor mode toggle */}
        <div style={{ display: "flex", gap: 2, background: "#080E1C", borderRadius: 6, padding: 2, marginRight: 8 }}>
          {(["basic", "component"] as EditorMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setEditorMode(m);
                if (m === "basic") setComponentType(null);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: editorMode === m ? "#1C6BEB" : "transparent",
                color: editorMode === m ? "white" : "#64748B",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {m === "basic" ? "🔧 Basic" : "🧩 Component"}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: "#1E3A5F", margin: "0 4px" }} />

        {/* Basic mode tools */}
        {editorMode === "basic" && (
          <>
            {TOOL_CONFIG.map(({ t, icon: Icon, label }) => (
              <button
                key={t}
                title={label}
                onClick={() => setToolAndReset(t)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  borderRadius: 5,
                  border: `1px solid ${tool === t ? "#1C6BEB" : "#1E293B"}`,
                  background: tool === t ? "rgba(28,107,235,0.15)" : "transparent",
                  color: tool === t ? "#60A5FA" : "#94A3B8",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: tool === t ? 600 : 400,
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}

            {tool === "building_box" && (
              <>
                <div style={{ width: 1, height: 22, background: "#1E3A5F", margin: "0 4px" }} />
                <span style={{ color: "#64748B", fontSize: 10, fontWeight: 600 }}>MODE:</span>
                {(["rectangle", "polygon"] as BuildingBoxMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setBoxMode(m)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 4,
                      border: `1px solid ${boxMode === m ? "#F59E0B" : "#1E293B"}`,
                      background: boxMode === m ? "rgba(245,158,11,0.15)" : "transparent",
                      color: boxMode === m ? "#FBBF24" : "#64748B",
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    {m === "rectangle" ? "▭ Rectangle" : "⬡ Polygon"}
                  </button>
                ))}
              </>
            )}
          </>
        )}

        {/* Component mode tools */}
        {editorMode === "component" && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {COMPONENT_TYPES.map(({ type, label, icon: Icon, color }) => (
              <button
                key={type}
                title={label}
                onClick={() => {
                  setComponentType(componentType === type ? null : type);
                  setToolAndReset("select");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: 5,
                  border: `1px solid ${componentType === type ? color : "#1E293B"}`,
                  background: componentType === type ? `${color}25` : "transparent",
                  color: componentType === type ? color : "#94A3B8",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: componentType === type ? 600 : 400,
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
            {componentType && (
              <span style={{ color: "#F59E0B", fontSize: 10, marginLeft: 8 }}>
                Click on map to place {componentType}
              </span>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* View toggle */}
        <div style={{ display: "flex", gap: 2, background: "#080E1C", borderRadius: 6, padding: 2, marginRight: 8 }}>
          {(["real", "auto_svg", "classic_svg"] as MapView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: view === v ? "#1C6BEB" : "transparent",
                color: view === v ? "white" : "#64748B",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {v === "real" ? "🗺 Real Map" : v === "auto_svg" ? "📐 Auto SVG" : "📄 Classic"}
            </button>
          ))}
        </div>

        {editorMode === "basic" && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import GPX file"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 5,
                border: "1px solid #8B5CF6",
                background: "rgba(139,92,246,0.1)",
                color: "#A78BFA",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <Upload size={13} />
              Import GPX
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx"
              onChange={handleGPXUpload}
              style={{ display: "none" }}
            />
          </>
        )}

        <div style={{ width: 1, height: 22, background: "#1E3A5F", margin: "0 4px" }} />

        {/* Floor selector */}
        <span style={{ color: "#64748B", fontSize: 10, fontWeight: 600 }}>FLOOR:</span>
        {[0, 1, 2, 3].map((f) => (
          <button
            key={f}
            onClick={() => setActiveFloor(f)}
            style={{
              width: 26,
              height: 24,
              borderRadius: 4,
              border: `1px solid ${activeFloor === f ? "#1C6BEB" : "#1E293B"}`,
              background: activeFloor === f ? "#1C6BEB" : "transparent",
              color: activeFloor === f ? "white" : "#64748B",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {f === 0 ? "G" : f}
          </button>
        ))}

        {/* Zoom */}
        <div style={{ marginLeft: 8, display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => setZoom(zoom - 0.15)} title="Zoom Out" style={{ padding: "3px 6px", border: "1px solid #1E293B", borderRadius: 4, background: "transparent", color: "#64748B", cursor: "pointer" }}>
            <ZoomOut size={12} />
          </button>
          <span style={{ padding: "3px 8px", background: "#080E1C", borderRadius: 4, fontSize: 10, color: "#64748B", minWidth: 40, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(zoom + 0.15)} title="Zoom In" style={{ padding: "3px 6px", border: "1px solid #1E293B", borderRadius: 4, background: "transparent", color: "#64748B", cursor: "pointer" }}>
            <ZoomIn size={12} />
          </button>
        </div>
      </div>

      {/* Main workspace */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Map / SVG view */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {view === "real" && (
            <RealMapView
              center={CAMPUS_CENTER}
              buildings={buildings}
              nodes={nodes}
              edges={edges}
              tool={tool}
              boxMode={boxMode}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              componentType={editorMode === "component" ? componentType : null}
              onAddNode={handleAddNode}
              onAddEdge={handleAddEdge}
              onBuildingDrawn={handleBuildingDrawn}
              onSelectNode={setSelectedNode}
              onSelectEdge={setSelectedEdge}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
              onPlaceComponent={handlePlaceComponent}
            />
          )}
          {view === "auto_svg" && (
            <AutoSvgView
              buildings={buildings}
              nodes={nodes}
              edges={edges}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onSelectNode={setSelectedNode}
              onSelectEdge={setSelectedEdge}
              onUpdateNodePosition={handleUpdateNodePosition}
            />
          )}
          {view === "classic_svg" && <ClassicSvgReference />}
        </div>

        {/* Right Properties Panel */}
        <div
          style={{
            width: 280,
            background: "#0D1526",
            borderLeft: "1px solid #1E3A5F",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #1E293B", display: "flex", alignItems: "center", gap: 8 }}>
            <Info size={13} color="#06B6D4" />
            <span style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600 }}>
              {selectedNodeData ? "Node Properties" : selectedEdgeData ? "Edge Properties" : "Properties"}
            </span>
          </div>

          {selectedNodeData ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
              {/* Header */}
              <div style={{ background: "rgba(28,107,235,0.12)", border: "1px solid rgba(28,107,235,0.25)", borderRadius: 8, padding: "12px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
                  <div style={{ width: 22, height: 22, background: NODE_COLORS[selectedNodeData.type], borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MapPin size={10} color="white" />
                  </div>
                  <span style={{ color: "#60A5FA", fontSize: 13, fontWeight: 700, marginLeft: 6 }}>{selectedNodeData.id}</span>
                </div>
                <div style={{ color: "#94A3B8", fontSize: 11 }}>{selectedNodeData.name}</div>
                {selectedNodeData.componentId && (
                  <div style={{ marginTop: 6, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 4, padding: "4px 8px", fontSize: 10, color: "#FBBF24" }}>
                    Part of: {selectedNodeData.componentId}
                  </div>
                )}
              </div>

              {/* Name */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>NAME</label>
                <input
                  value={selectedNodeData.name}
                  onChange={(e) => handleUpdateNode("name", e.target.value)}
                  style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 5, padding: "6px 8px", color: "#E2E8F0", fontSize: 11, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Type */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>TYPE</label>
                <select
                  value={selectedNodeData.type}
                  onChange={(e) => handleUpdateNode("type", e.target.value)}
                  style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 5, padding: "6px 8px", color: "#E2E8F0", fontSize: 11, outline: "none", cursor: "pointer" }}
                >
                  {(["building_entrance", "intersection", "staircase", "elevator", "room", "outdoor"] as NodeType[]).map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>

              {/* Floor */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>FLOOR</label>
                <div style={{ display: "flex", gap: 2 }}>
                  {[0, 1, 2, 3].map((f) => (
                    <button
                      key={f}
                      onClick={() => handleUpdateNode("floor", f)}
                      style={{ flex: 1, padding: "5px", borderRadius: 4, border: `1px solid ${selectedNodeData.floor === f ? "#1C6BEB" : "#1E3A5F"}`, background: selectedNodeData.floor === f ? "#1C6BEB" : "#111827", color: selectedNodeData.floor === f ? "white" : "#64748B", fontSize: 10, cursor: "pointer", fontWeight: 600 }}
                    >
                      {f === 0 ? "G" : f}
                    </button>
                  ))}
                </div>
              </div>

              {/* GPS Coordinates */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>GPS COORDINATES</label>
                <div style={{ display: "flex", gap: 2 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: "#475569", fontSize: 9, display: "block", marginBottom: 2 }}>Lat</span>
                    <input
                      type="number"
                      step="0.00001"
                      value={selectedNodeData.position.lat}
                      onChange={(e) => handleUpdateNode("position", { ...selectedNodeData.position, lat: parseFloat(e.target.value) || 0 })}
                      style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 5, padding: "5px 6px", color: "#E2E8F0", fontSize: 10, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: "#475569", fontSize: 9, display: "block", marginBottom: 2 }}>Lng</span>
                    <input
                      type="number"
                      step="0.00001"
                      value={selectedNodeData.position.lng}
                      onChange={(e) => handleUpdateNode("position", { ...selectedNodeData.position, lng: parseFloat(e.target.value) || 0 })}
                      style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 5, padding: "5px 6px", color: "#E2E8F0", fontSize: 10, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>ASSIGNMENTS</label>
                {[
                  { label: "QR Checkpoint", icon: QrCode, field: "hasQr", value: selectedNodeData.hasQr, color: "#F59E0B" },
                  { label: "Panorama", icon: Camera, field: "hasPanorama", value: selectedNodeData.hasPanorama, color: "#8B5CF6" },
                ].map(({ label, icon: Icon, field, value, color }) => (
                  <div
                    key={label}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 5, marginBottom: 4, cursor: "pointer" }}
                    onClick={() => handleUpdateNode(field, !value)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Icon size={12} color={value ? color : "#475569"} />
                      <span style={{ fontSize: 11, color: value ? "#E2E8F0" : "#64748B", marginLeft: 4 }}>{label}</span>
                    </div>
                    <div style={{ width: 30, height: 16, background: value ? color : "#1E293B", borderRadius: 8, position: "relative", transition: "background 0.2s" }}>
                      <div style={{ position: "absolute", top: 1, left: value ? 15 : 1, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Connections */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>CONNECTIONS ({edges.filter((e) => e.from === selectedNode || e.to === selectedNode).length})</label>
                {edges.filter((e) => e.from === selectedNode || e.to === selectedNode).map((edge) => {
                  const otherId = edge.from === selectedNode ? edge.to : edge.from;
                  const other = graph.getNode(otherId);
                  return (
                    <div key={edge.id} style={{ padding: "4px 6px", background: "#0A0F1E", border: "1px solid #1E293B", borderRadius: 3, marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#94A3B8", fontSize: 10 }}>{otherId} · {other?.name ?? "Unknown"}</span>
                      <span style={{ color: "#475569", fontSize: 9 }}>{edge.type} · {Math.round(edge.distance)}m</span>
                    </div>
                  );
                })}
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDeleteNode(selectedNode)}
                style={{ width: "100%", padding: "7px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#EF4444", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
              >
                <Trash2 size={11} />
                Delete Node
              </button>
            </div>
          ) : selectedEdgeData ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
              <div style={{ background: "rgba(28,107,235,0.12)", border: "1px solid rgba(28,107,235,0.25)", borderRadius: 8, padding: "12px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
                  <Route size={11} color="#60A5FA" />
                  <span style={{ color: "#60A5FA", fontSize: 13, fontWeight: 700, marginLeft: 4 }}>{selectedEdgeData.id}</span>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>FROM</label>
                <div style={{ padding: "5px 8px", background: "#111827", borderRadius: 5, color: "#94A3B8", fontSize: 11 }}>{selectedEdgeData.from} · {edgeStartNode?.name ?? ""}</div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>TO</label>
                <div style={{ padding: "5px 8px", background: "#111827", borderRadius: 5, color: "#94A3B8", fontSize: 11 }}>{selectedEdgeData.to} · {edgeEndNode?.name ?? ""}</div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>TYPE</label>
                <select
                  value={selectedEdgeData.type}
                  onChange={(e) => {
                    const newType = e.target.value as EdgeType;
                    graph.updateEdge(selectedEdge, { type: newType });
                  }}
                  style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 5, padding: "6px 8px", color: "#E2E8F0", fontSize: 11, outline: "none", cursor: "pointer" }}
                >
                  {(["walkway", "stairs", "corridor", "elevator", "ramp", "wall"] as EdgeType[]).map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: "#475569", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>DISTANCE</label>
                <div style={{ padding: "5px 8px", background: "#111827", borderRadius: 5, color: "#E2E8F0", fontSize: 12, fontWeight: 600 }}>{Math.round(selectedEdgeData.distance)}m</div>
              </div>
              <button
                onClick={() => handleDeleteEdge(selectedEdge)}
                style={{ width: "100%", padding: "7px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#EF4444", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
              >
                <Trash2 size={11} />
                Delete Edge
              </button>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, background: "rgba(28,107,235,0.08)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <MousePointer2 size={20} color="#1C6BEB" opacity={0.5} />
              </div>
              <p style={{ color: "#475569", fontSize: 11, lineHeight: 1.5 }}>Select a node or edge on the map to edit its properties.</p>
            </div>
          )}

          {/* Stats */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid #1E293B", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {[
              { label: "Buildings", value: buildings.length },
              { label: "Nodes", value: nodes.length },
              { label: "Edges", value: edges.length },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#111827", borderRadius: 4, padding: "5px 6px", textAlign: "center" }}>
                <div style={{ color: "#60A5FA", fontSize: 13, fontWeight: 700 }}>{value}</div>
                <div style={{ color: "#475569", fontSize: 9 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Building creation modal */}
      {pendingBuilding && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#0D1526", border: "1px solid #1E3A5F", borderRadius: 12, padding: 24, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <Building2 size={18} color="#1C6BEB" />
              <span style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>New Building</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "#475569", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>BUILDING NAME</label>
              <input
                value={pendingBuilding.name}
                onChange={(e) => setPendingBuilding((p) => p ? { ...p, name: e.target.value } : null)}
                style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 6, padding: "8px 10px", color: "#E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: "#475569", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>CODE</label>
                <input
                  value={pendingBuilding.code}
                  onChange={(e) => setPendingBuilding((p) => p ? { ...p, code: e.target.value.toUpperCase() } : null)}
                  style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 6, padding: "8px 10px", color: "#E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ width: 80 }}>
                <label style={{ color: "#475569", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>FLOORS</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={pendingBuilding.floors}
                  onChange={(e) => setPendingBuilding((p) => p ? { ...p, floors: Math.max(1, parseInt(e.target.value) || 1) } : null)}
                  style={{ width: "100%", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 6, padding: "8px 10px", color: "#E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ width: 60 }}>
                <label style={{ color: "#475569", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>COLOR</label>
                <input
                  type="color"
                  value={pendingBuilding.color}
                  onChange={(e) => setPendingBuilding((p) => p ? { ...p, color: e.target.value } : null)}
                  style={{ width: "100%", height: 34, background: "transparent", border: "1px solid #1E3A5F", borderRadius: 6, padding: 2, cursor: "pointer" }}
                />
              </div>
            </div>

            {/* Color presets */}
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#F97316", "#EC4899", "#64748B"].map((c) => (
                <div
                  key={c}
                  onClick={() => setPendingBuilding((p) => p ? { ...p, color: c } : null)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: c,
                    cursor: "pointer",
                    border: pendingBuilding.color === c ? "2px solid white" : "2px solid transparent",
                    boxShadow: pendingBuilding.color === c ? `0 0 0 1px ${c}` : "none",
                  }}
                />
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={confirmBuilding}
                style={{ flex: 1, padding: "9px", background: "linear-gradient(135deg, #1C6BEB, #0891B2)", border: "none", borderRadius: 7, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Add Building
              </button>
              <button
                onClick={cancelBuilding}
                style={{ padding: "9px 16px", background: "#1E293B", border: "1px solid #334155", borderRadius: 7, color: "#94A3B8", fontSize: 12, cursor: "pointer" }}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Classic SVG reference (read-only Figma schematic) */
function ClassicSvgReference() {
  const buildings = [
    { x: 650, y: 55, w: 165, h: 95, code: "ADMIN", color: "#3B82F6", name: "Administration Building" },
    { x: 405, y: 55, w: 150, h: 85, code: "LRC", color: "#8B5CF6", name: "Learning Resource Center" },
    { x: 95, y: 55, w: 145, h: 85, code: "SCI", color: "#10B981", name: "Science Laboratory" },
    { x: 95, y: 255, w: 160, h: 100, code: "CAS", color: "#F59E0B", name: "College of Arts & Sciences" },
    { x: 95, y: 455, w: 160, h: 100, code: "COE", color: "#EF4444", name: "College of Engineering" },
    { x: 385, y: 455, w: 155, h: 100, code: "GYM", color: "#06B6D4", name: "Gymnasium" },
    { x: 655, y: 455, w: 155, h: 100, code: "SC", color: "#F97316", name: "Student Center" },
    { x: 405, y: 255, w: 110, h: 85, code: "CHP", color: "#EC4899", name: "Chapel" },
  ];

  return (
    <div style={{ width: "100%", height: "100%", background: "#E8EEFA", overflow: "hidden", position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 900 650" preserveAspectRatio="xMidYMid meet">
        <rect x="-200" y="-200" width="1400" height="1100" fill="url(#grid2)" opacity={0.3} />
        <defs>
          <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="0.5" />
          </pattern>
        </defs>
        {buildings.map((b) => (
          <g key={b.code}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={`${b.color}18`} stroke={b.color} strokeWidth={1.5} />
            <rect x={b.x} y={b.y} width={b.w} height={13} rx="3 3 0 0" fill={b.color} opacity={0.7} />
            <text x={b.x + b.w / 2} y={b.y + 9} textAnchor="middle" fill="white" fontSize={7} fontWeight={700}>{b.code}</text>
          </g>
        ))}
        <text x="450" y="640" textAnchor="middle" fill="#94A3B8" fontSize={9} fontStyle="italic">Classic Figma schematic · Read-only reference</text>
      </svg>
    </div>
  );
}
