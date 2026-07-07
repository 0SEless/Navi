import { useRef, useEffect, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { CampusBuilding, NavNode, NavEdge, Tool, LatLng, BuildingBoxMode } from "./types";
import { NODE_COLORS, calcDistance, generateId } from "./mockData";

const OSM_STYLE: maplibregl.Style = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const SRC = {
  BUILDINGS: "me-buildings",
  NODES: "me-nodes",
  EDGES: "me-edges",
  DRAWING: "me-drawing",
};

const LYR = {
  BUILDINGS: "me-buildings-fill",
  BUILDINGS_OUTLINE: "me-buildings-outline",
  EDGES: "me-edges",
  NODES: "me-nodes",
  NODES_INNER: "me-nodes-inner",
  NODES_LABEL: "me-nodes-label",
  DRAWING_FILL: "me-drawing-fill",
  DRAWING_OUTLINE: "me-drawing-outline",
  DRAWING_LINE: "me-drawing-line",
  DRAWING_POINTS: "me-drawing-points",
};

function buildBuildingGeo(buildings: CampusBuilding): GeoJSON.Feature {
  return {
    type: "Feature",
    id: buildings.id,
    properties: {
      id: buildings.id,
      name: buildings.name,
      code: buildings.code,
      color: buildings.color,
      floors: buildings.floors,
      center: buildings.center,
    },
    geometry: {
      type: "Polygon",
      coordinates: [buildings.outline.map((p) => [p.lng, p.lat])],
    },
  };
}

function buildNodeGeo(nodes: NavNode[], selectedId: string | null): GeoJSON.Feature {
  return {
    type: "Feature",
    id: nodes.id,
    properties: {
      id: nodes.id,
      name: nodes.name,
      type: nodes.type,
      color: NODE_COLORS[nodes.type],
      selected: nodes.id === selectedId,
      hasQr: nodes.hasQr ?? false,
      hasPanorama: nodes.hasPanorama ?? false,
      r: nodes.type === "intersection" ? 9 : 11,
    },
    geometry: { type: "Point", coordinates: [nodes.position.lng, nodes.position.lat] },
  };
}

function buildEdgeGeo(edges: NavEdge[], selectedId: string | null, nodes: NavNode[]): GeoJSON.Feature | null {
  const from = nodes.find((n) => n.id === edges.from);
  const to = nodes.find((n) => n.id === edges.to);
  if (!from || !to) return null;
  return {
    type: "Feature",
    id: edges.id,
    properties: {
      id: edges.id,
      from: edges.from,
      to: edges.to,
      type: edges.type,
      distance: edges.distance,
      selected: edges.id === selectedId,
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [from.position.lng, from.position.lat],
        [to.position.lng, to.position.lat],
      ],
    },
  };
}

function addSourcesAndLayers(map: maplibregl.Map) {
  const srcs: { id: string; data: GeoJSON.FeatureCollection }[] = [
    { id: SRC.BUILDINGS, data: { type: "FeatureCollection", features: [] } },
    { id: SRC.NODES, data: { type: "FeatureCollection", features: [] } },
    { id: SRC.EDGES, data: { type: "FeatureCollection", features: [] } },
    { id: SRC.DRAWING, data: { type: "FeatureCollection", features: [] } },
  ];
  for (const s of srcs) {
    map.addSource(s.id, { type: "geojson", data: s.data });
  }
  map.addLayer({
    id: LYR.BUILDINGS,
    type: "fill",
    source: SRC.BUILDINGS,
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: LYR.BUILDINGS_OUTLINE,
    type: "line",
    source: SRC.BUILDINGS,
    paint: { "line-color": ["get", "color"], "line-width": 2 },
  });
  map.addLayer({
    id: LYR.EDGES,
    type: "line",
    source: SRC.EDGES,
    paint: {
      "line-color": ["case", ["get", "selected"], "#1C6BEB", "#94A3B8"],
      "line-width": ["case", ["get", "selected"], 3, 2],
      "line-opacity": 0.7,
    },
  });
  map.addLayer({
    id: LYR.NODES,
    type: "circle",
    source: SRC.NODES,
    paint: {
      "circle-color": ["case", ["get", "selected"], "#1C6BEB", "white"],
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": ["case", ["get", "selected"], 2.5, 2],
      "circle-radius": ["get", "r"],
    },
  });
  map.addLayer({
    id: LYR.NODES_INNER,
    type: "circle",
    source: SRC.NODES,
    paint: {
      "circle-color": ["case", ["get", "selected"], "white", ["get", "color"]],
      "circle-radius": ["-", ["get", "r"], 4],
    },
  });
  map.addLayer({
    id: LYR.NODES_LABEL,
    type: "symbol",
    source: SRC.NODES,
    layout: {
      "text-field": ["get", "id"],
      "text-size": 9,
      "text-offset": [0, 1.8],
      "text-anchor": "top",
    },
    paint: {
      "text-color": "#cbd5e1",
      "text-halo-color": "rgba(10,15,30,0.8)",
      "text-halo-width": 2,
    },
  });
  map.addLayer({
    id: LYR.DRAWING_FILL,
    type: "fill",
    source: SRC.DRAWING,
    paint: { "fill-color": "#1C6BEB", "fill-opacity": 0.1 },
  });
  map.addLayer({
    id: LYR.DRAWING_OUTLINE,
    type: "line",
    source: SRC.DRAWING,
    paint: { "line-color": "#1C6BEB", "line-width": 2, "line-dasharray": [6, 3] },
  });
  map.addLayer({
    id: LYR.DRAWING_LINE,
    type: "line",
    source: SRC.DRAWING,
    paint: { "line-color": "#F59E0B", "line-width": 2, "line-dasharray": [6, 3] },
  });
  map.addLayer({
    id: LYR.DRAWING_POINTS,
    type: "circle",
    source: SRC.DRAWING,
    paint: { "circle-color": "#1C6BEB", "circle-radius": 4, "circle-stroke-color": "white", "circle-stroke-width": 1.5 },
  });
}

function setData(map: maplibregl.Map, srcId: string, data: GeoJSON.FeatureCollection) {
  try { (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData(data); } catch { /* source not ready */ }
}

interface RealMapViewProps {
  center: { lat: number; lng: number };
  buildings: CampusBuilding[];
  nodes: NavNode[];
  edges: NavEdge[];
  tool: Tool;
  boxMode: BuildingBoxMode;
  selectedNode: string | null;
  selectedEdge: string | null;
  componentType: string | null;
  onAddNode: (node: NavNode) => void;
  onAddEdge: (edge: NavEdge) => void;
  onBuildingDrawn: (outline: LatLng[]) => void;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onPlaceComponent: (type: string, position: LatLng, dimensions?: { width: number; height: number }) => void;
}

export function RealMapView({
  center, buildings, nodes, edges, tool, boxMode,
  selectedNode, selectedEdge, componentType,
  onAddNode, onAddEdge, onBuildingDrawn,
  onSelectNode, onSelectEdge, onDeleteNode, onDeleteEdge,
  onPlaceComponent,
}: RealMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const handlersSetupRef = useRef(false);

  const [rectDraw, setRectDraw] = useState<{ start: LatLng; current: LatLng } | null>(null);
  const [polyVertices, setPolyVertices] = useState<LatLng[]>([]);
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [cursorLL, setCursorLL] = useState<LatLng | null>(null);
  const [compDrag, setCompDrag] = useState<{ start: LatLng; current: LatLng } | null>(null);

  const isBuildingPoly = tool === "building_box" && boxMode === "polygon";
  const isBuildingRect = tool === "building_box" && boxMode === "rectangle";
  const showEdgePreview = tool === "add_edge" && edgeStart;
  const isCompDragType = componentType && (componentType === "room" || componentType === "restroom" || componentType === "hallway");
  const isCompClickType = componentType && (componentType === "stair" || componentType === "elevator" || componentType === "entrance");

  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const boxModeRef = useRef(boxMode);
  boxModeRef.current = boxMode;
  const edgeStartRef = useRef(edgeStart);
  edgeStartRef.current = edgeStart;
  const polyVerticesRef = useRef(polyVertices);
  polyVerticesRef.current = polyVertices;
  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const selectedEdgeRef = useRef(selectedEdge);
  selectedEdgeRef.current = selectedEdge;
  const componentTypeRef = useRef(componentType);
  componentTypeRef.current = componentType;

  const syncAllData = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    setData(m, SRC.BUILDINGS, {
      type: "FeatureCollection",
      features: buildingsRef.current.map((v) => buildBuildingGeo(v)),
    });
    setData(m, SRC.NODES, {
      type: "FeatureCollection",
      features: nodesRef.current.map((v) => buildNodeGeo(v, selectedNodeRef.current)),
    });
    setData(m, SRC.EDGES, {
      type: "FeatureCollection",
      features: edgesRef.current.map((v) => buildEdgeGeo(v, selectedEdgeRef.current, nodesRef.current)).filter(Boolean) as GeoJSON.Feature[],
    });
  }, []);

  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: OSM_STYLE,
      center: [center.lng, center.lat],
      zoom: 17,
      attributionControl: true,
    });
    map.on("load", () => {
      addSourcesAndLayers(map);
      readyRef.current = true;
      syncAllData();
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, []);

  useEffect(() => {
    if (readyRef.current) syncAllData();
  }, [buildings, nodes, edges, selectedNode, selectedEdge]);

  const cbsRef = useRef({ onAddNode, onAddEdge, onBuildingDrawn, onSelectNode, onSelectEdge, onDeleteNode, onDeleteEdge, onPlaceComponent });
  cbsRef.current = { onAddNode, onAddEdge, onBuildingDrawn, onSelectNode, onSelectEdge, onDeleteNode, onDeleteEdge, onPlaceComponent };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || handlersSetupRef.current) return;
    handlersSetupRef.current = true;

    const cbs = cbsRef.current;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const curTool = toolRef.current;
      const curCompType = componentTypeRef.current;
      const features = map.queryRenderedFeatures(e.point);
      const hitNode = features.find((f) => f.layer.id === LYR.NODES && f.properties);
      const hitEdge = features.find((f) => f.layer.id === LYR.EDGES && f.properties);

      // Component mode — single-click placement (stair, elevator, entrance)
      if (curCompType && (curCompType === "stair" || curCompType === "elevator" || curCompType === "entrance")) {
        cbs.onPlaceComponent(curCompType, { lat: e.lngLat.lat, lng: e.lngLat.lng });
        return;
      }

      if (curTool === "select") {
        if (hitNode) { cbs.onSelectNode(hitNode.properties!.id); cbs.onSelectEdge(null); }
        else if (hitEdge) { cbs.onSelectEdge(hitEdge.properties!.id); cbs.onSelectNode(null); }
        else { cbs.onSelectNode(null); cbs.onSelectEdge(null); }
        return;
      }
      if (curTool === "delete") {
        if (hitNode) cbs.onDeleteNode(hitNode.properties!.id);
        else if (hitEdge) cbs.onDeleteEdge(hitEdge.properties!.id);
        return;
      }
      if (curTool === "add_edge" && hitNode) {
        const nodeId = hitNode.properties!.id;
        const es = edgeStartRef.current;
        if (!es) {
          setEdgeStart(nodeId);
        } else if (es !== nodeId) {
          const from = nodesRef.current.find((n) => n.id === es);
          const to = nodesRef.current.find((n) => n.id === nodeId);
          const exists = edgesRef.current.some(
            (ed) => (ed.from === es && ed.to === nodeId) || (ed.from === nodeId && ed.to === es)
          );
          if (!exists && from && to) {
            cbs.onAddEdge({
              id: generateId("E", edgesRef.current.map((ed) => ed.id)),
              from: es,
              to: nodeId,
              type: "walkway",
              distance: calcDistance(from.position, to.position),
            });
          }
          setEdgeStart(null);
        }
        return;
      }
      if (curTool === "add_node") {
        const pos = e.lngLat;
        const nearBuilding = buildingsRef.current.find((b) => {
          const dx = b.center.lat - pos.lat;
          const dy = b.center.lng - pos.lng;
          return Math.sqrt(dx * dx + dy * dy) < 0.0001;
        });
        cbs.onAddNode({
          id: generateId("N", nodesRef.current.map((n) => n.id)),
          name: `Node ${nodesRef.current.length + 1}`,
          type: nearBuilding ? "building_entrance" : "intersection",
          buildingId: nearBuilding?.id ?? null,
          floor: 1,
          position: { lat: pos.lat, lng: pos.lng },
          hasQr: false,
          hasPanorama: false,
        });
        return;
      }
      if (curTool === "building_box" && boxModeRef.current === "polygon") {
        setPolyVertices((prev) => [...prev, { lat: e.lngLat.lat, lng: e.lngLat.lng }]);
        return;
      }
    };

    const handleDblClick = (e: maplibregl.MapMouseEvent) => {
      if (toolRef.current === "building_box" && boxModeRef.current === "polygon" && polyVerticesRef.current.length >= 3) {
        e.originalEvent.preventDefault();
        cbs.onBuildingDrawn(polyVerticesRef.current);
        setPolyVertices([]);
      }
    };

    let rectStart: LatLng | null = null;
    let compDragStart: LatLng | null = null;

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      const curCompType = componentTypeRef.current;
      if (curCompType === "room" || curCompType === "restroom" || curCompType === "hallway") {
        compDragStart = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        setCompDrag({ start: compDragStart, current: compDragStart });
        return;
      }
      if (toolRef.current === "building_box" && boxModeRef.current === "rectangle") {
        rectStart = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        setRectDraw({ start: rectStart, current: rectStart });
      }
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      setCursorLL({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      if (compDragStart) {
        setCompDrag({ start: compDragStart, current: { lat: e.lngLat.lat, lng: e.lngLat.lng } });
        return;
      }
      if (rectStart && toolRef.current === "building_box" && boxModeRef.current === "rectangle") {
        const cur = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        setRectDraw({ start: rectStart, current: cur });
      }
    };

    const handleMouseUp = (e: maplibregl.MapMouseEvent) => {
      const curCompType = componentTypeRef.current;
      if (compDragStart && curCompType) {
        const start = compDragStart;
        const end = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        if (curCompType === "room" || curCompType === "restroom") {
          const w = calcDistance(start, { lat: start.lat, lng: end.lng });
          const h = calcDistance(start, { lat: end.lat, lng: start.lng });
          const center = { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 };
          cbs.onPlaceComponent(curCompType, center, { width: Math.max(w, 1), height: Math.max(h, 1) });
        } else if (curCompType === "hallway") {
          const length = calcDistance(start, end);
          const center = { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 };
          cbs.onPlaceComponent(curCompType, center, { width: Math.max(length, 1), height: 2 });
        }
        compDragStart = null;
        setCompDrag(null);
        return;
      }
      if (rectStart && toolRef.current === "building_box" && boxModeRef.current === "rectangle") {
        const c = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        cbs.onBuildingDrawn([
          rectStart,
          { lat: rectStart.lat, lng: c.lng },
          c,
          { lat: c.lat, lng: rectStart.lng },
        ]);
        rectStart = null;
        setRectDraw(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPolyVertices([]);
        setRectDraw(null);
        rectStart = null;
        setEdgeStart(null);
        setCompDrag(null);
        compDragStart = null;
      }
    };

    const handleMoveEnd = () => syncAllData();

    map.on("click", handleClick);
    map.on("dblclick", handleDblClick);
    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    map.on("moveend", handleMoveEnd);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      map.off("click", handleClick);
      map.off("dblclick", handleDblClick);
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      map.off("moveend", handleMoveEnd);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    const editingTools: Tool[] = ["add_node", "building_box", "add_edge", "delete"];
    const isEditing = editingTools.includes(tool);
    const hasCompType = componentType !== null;
    if (isEditing || hasCompType) { map.dragPan.disable(); } else { map.dragPan.enable(); }
    if (tool === "add_node" || tool === "building_box" || hasCompType) canvas.style.cursor = "crosshair";
    else if (tool === "delete") canvas.style.cursor = "not-allowed";
    else if (tool === "add_edge") canvas.style.cursor = "pointer";
    else canvas.style.cursor = "";
  }, [tool, componentType]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const drawFeatures: GeoJSON.Feature[] = [];

    if (polyVertices.length > 0 && isBuildingPoly) {
      const coords = polyVertices.map((v) => [v.lng, v.lat]);
      if (cursorLL && polyVertices.length > 0) {
        coords.push([cursorLL.lng, cursorLL.lat]);
      }
      coords.push(coords[0]);
      drawFeatures.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coords] },
        properties: {},
      });
      polyVertices.forEach((v) => {
        drawFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [v.lng, v.lat] },
          properties: {},
        });
      });
    }

    if (rectDraw && isBuildingRect) {
      const s = rectDraw.start;
      const c = rectDraw.current;
      drawFeatures.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [s.lng, s.lat], [c.lng, s.lat], [c.lng, c.lat], [s.lng, c.lat], [s.lng, s.lat],
          ]],
        },
        properties: {},
      });
    }

    if (showEdgePreview && cursorLL && edgeStart) {
      const sn = nodes.find((n) => n.id === edgeStart);
      if (sn) {
        drawFeatures.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[sn.position.lng, sn.position.lat], [cursorLL.lng, cursorLL.lat]],
          },
          properties: {},
        });
      }
    }

    // Component drag preview
    if (compDrag && componentType) {
      const s = compDrag.start;
      const c = compDrag.current;
      if (componentType === "room" || componentType === "restroom") {
        drawFeatures.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[
              [s.lng, s.lat], [c.lng, s.lat], [c.lng, c.lat], [s.lng, c.lat], [s.lng, s.lat],
            ]],
          },
          properties: {},
        });
      } else if (componentType === "hallway") {
        drawFeatures.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[s.lng, s.lat], [c.lng, c.lat]],
          },
          properties: {},
        });
      }
    }

    if (drawFeatures.length > 0) {
      setData(m, SRC.DRAWING, { type: "FeatureCollection", features: drawFeatures });
    } else {
      setData(m, SRC.DRAWING, { type: "FeatureCollection", features: [] });
    }
  }, [polyVertices, isBuildingPoly, rectDraw, isBuildingRect, showEdgePreview, edgeStart, cursorLL, nodes, compDrag, componentType]);



  const hintColor = "#1E293B";
  const hintText = "#94A3B8";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {/* Hints */}
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none" }}>
        {componentType === "room" || componentType === "restroom" ? (
          <div style={{ background: "#F59E0B", padding: "5px 12px", borderRadius: 5, fontSize: 11, color: "white" }}>
            Click & drag to draw {componentType} rectangle
          </div>
        ) : componentType === "hallway" ? (
          <div style={{ background: "#06B6D4", padding: "5px 12px", borderRadius: 5, fontSize: 11, color: "white" }}>
            Click & drag to set hallway length
          </div>
        ) : componentType === "stair" || componentType === "elevator" || componentType === "entrance" ? (
          <div style={{ background: "#10B981", padding: "5px 12px", borderRadius: 5, fontSize: 11, color: "white" }}>
            Click on map to place {componentType}
          </div>
        ) : null}
        {tool === "add_node" && (
          <div style={{ background: hintColor, padding: "5px 12px", borderRadius: 5, fontSize: 11, color: hintText }}>
            Click on map to place a node
          </div>
        )}
        {isBuildingRect && !rectDraw && (
          <div style={{ background: hintColor, padding: "5px 12px", borderRadius: 5, fontSize: 11, color: hintText }}>
            Click & drag to draw building rectangle
          </div>
        )}
        {isBuildingPoly && polyVertices.length === 0 && (
          <div style={{ background: hintColor, padding: "5px 12px", borderRadius: 5, fontSize: 11, color: hintText }}>
            Click corners to draw building polygon
          </div>
        )}
        {isBuildingPoly && polyVertices.length > 0 && (
          <div style={{ background: "#F59E0B", padding: "5px 12px", borderRadius: 5, fontSize: 11, color: "white" }}>
            {polyVertices.length} vertices · Double-click to finish
          </div>
        )}
        {showEdgePreview && (
          <div style={{ background: "#1C6BEB", padding: "5px 12px", borderRadius: 5, fontSize: 11, color: "white" }}>
            Click another node to connect · Esc to cancel
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 12, left: 12,
        background: "rgba(15,23,42,0.85)", borderRadius: 7, padding: "5px 10px",
        fontSize: 9, display: "flex", gap: 8, flexWrap: "wrap",
      }}>
        {Object.entries(NODE_COLORS).map(([type, c]) => (
          <span key={type} style={{ color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block" }} />
            {type.replace("_", " ")}
          </span>
        ))}
        <span style={{ color: "#94A3B8" }}>|</span>
        <span style={{ color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", display: "inline-block" }} /> QR
        </span>
        <span style={{ color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8B5CF6", display: "inline-block" }} /> Pano
        </span>
      </div>

      {/* Stats */}
      <div style={{
        position: "absolute", bottom: 12, right: 12,
        background: "rgba(15,23,42,0.85)", borderRadius: 5, padding: "4px 10px",
        fontSize: 9, color: "#64748B", fontFamily: "monospace",
      }}>
        Buildings: {buildings.length} · Nodes: {nodes.length} · Edges: {edges.length}
      </div>
    </div>
  );
}
