import { useState } from "react";
import {
  Layers,
  Upload,
  Plus,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Link,
  Unlink,
  Building2,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  FileImage,
  Trash2,
  Move,
  Save,
} from "lucide-react";

interface FloorLayer {
  id: string;
  buildingId: string;
  buildingName: string;
  floorLevel: number;
  label: string;
  hasFloorPlan: boolean;
  planFile: string | null;
  nodeCount: number;
  visible: boolean;
  staircaseConnectors: string[];
  elevatorConnectors: string[];
}

const FLOORS: FloorLayer[] = [
  { id: "fl-admin-g", buildingId: "admin", buildingName: "Administration Building", floorLevel: 0, label: "Ground Floor", hasFloorPlan: true, planFile: "admin_g.jpg", nodeCount: 4, visible: true, staircaseConnectors: ["N041"], elevatorConnectors: ["N042"] },
  { id: "fl-admin-1", buildingId: "admin", buildingName: "Administration Building", floorLevel: 1, label: "1st Floor", hasFloorPlan: true, planFile: "admin_1.jpg", nodeCount: 5, visible: true, staircaseConnectors: ["N041", "N043"], elevatorConnectors: ["N042"] },
  { id: "fl-admin-2", buildingId: "admin", buildingName: "Administration Building", floorLevel: 2, label: "2nd Floor", hasFloorPlan: false, planFile: null, nodeCount: 3, visible: true, staircaseConnectors: ["N043"], elevatorConnectors: ["N042"] },
  { id: "fl-lib-g", buildingId: "lib", buildingName: "Learning Resource Center", floorLevel: 0, label: "Ground Floor", hasFloorPlan: true, planFile: "lib_g.jpg", nodeCount: 5, visible: true, staircaseConnectors: ["N055"], elevatorConnectors: [] },
  { id: "fl-lib-1", buildingId: "lib", buildingName: "Learning Resource Center", floorLevel: 1, label: "1st Floor", hasFloorPlan: false, planFile: null, nodeCount: 3, visible: true, staircaseConnectors: ["N055"], elevatorConnectors: [] },
  { id: "fl-cas-g", buildingId: "cas", buildingName: "College of Arts & Sciences", floorLevel: 0, label: "Ground Floor", hasFloorPlan: true, planFile: "cas_g.jpg", nodeCount: 6, visible: true, staircaseConnectors: ["N060", "N061"], elevatorConnectors: [] },
  { id: "fl-cas-1", buildingId: "cas", buildingName: "College of Arts & Sciences", floorLevel: 1, label: "1st Floor", hasFloorPlan: true, planFile: "cas_1.jpg", nodeCount: 5, visible: true, staircaseConnectors: ["N060", "N062"], elevatorConnectors: [] },
  { id: "fl-cas-2", buildingId: "cas", buildingName: "College of Arts & Sciences", floorLevel: 2, label: "2nd Floor", hasFloorPlan: false, planFile: null, nodeCount: 4, visible: false, staircaseConnectors: ["N062"], elevatorConnectors: [] },
  { id: "fl-coe-g", buildingId: "coe", buildingName: "College of Engineering", floorLevel: 0, label: "Ground Floor", hasFloorPlan: true, planFile: "coe_g.jpg", nodeCount: 5, visible: true, staircaseConnectors: ["N070"], elevatorConnectors: [] },
  { id: "fl-coe-1", buildingId: "coe", buildingName: "College of Engineering", floorLevel: 1, label: "1st Floor", hasFloorPlan: false, planFile: null, nodeCount: 3, visible: true, staircaseConnectors: ["N070"], elevatorConnectors: [] },
  { id: "fl-coe-2", buildingId: "coe", buildingName: "College of Engineering", floorLevel: 2, label: "2nd Floor", hasFloorPlan: false, planFile: null, nodeCount: 3, visible: true, staircaseConnectors: [], elevatorConnectors: [] },
];

const BUILDING_COLORS: Record<string, string> = {
  admin: "#3B82F6",
  lib: "#8B5CF6",
  sci: "#10B981",
  cas: "#F59E0B",
  coe: "#EF4444",
  gym: "#06B6D4",
  sc: "#F97316",
  chapel: "#EC4899",
};

const BUILDING_GROUPS = ["admin", "lib", "cas", "coe"];

export function FloorManagement() {
  const [floors, setFloors] = useState<FloorLayer[]>(FLOORS);
  const [selectedFloor, setSelectedFloor] = useState<string | null>("fl-admin-g");
  const [activeBuilding, setActiveBuilding] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const selected = floors.find((f) => f.id === selectedFloor);

  const toggleVisible = (id: string) => {
    setFloors((prev) => prev.map((f) => f.id === id ? { ...f, visible: !f.visible } : f));
  };

  const floorsForBuilding = (buildingId: string) =>
    floors
      .filter((f) => f.buildingId === buildingId)
      .sort((a, b) => a.floorLevel - b.floorLevel);

  const groupedBuildings = BUILDING_GROUPS.map((bid) => ({
    id: bid,
    name: floors.find((f) => f.buildingId === bid)?.buildingName ?? bid,
    color: BUILDING_COLORS[bid],
    floors: floorsForBuilding(bid),
  }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F1F5F9" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ color: "#0F172A", fontSize: 18, fontWeight: 700, margin: 0 }}>Floor Layer Management</h1>
          <p style={{ color: "#64748B", fontSize: 12, margin: "2px 0 0" }}>Configure floor plans, staircase connections, and vertical navigation</p>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "linear-gradient(135deg, #1C6BEB, #0891B2)", border: "none", borderRadius: 7, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} />
          Add Floor Layer
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Floor tree */}
        <div style={{ width: 300, background: "white", borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #F1F5F9" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, letterSpacing: "0.08em" }}>BUILDING / FLOOR TREE</span>
          </div>

          {groupedBuildings.map((building) => {
            const isOpen = activeBuilding === building.id || activeBuilding === null;
            return (
              <div key={building.id}>
                <div
                  onClick={() => setActiveBuilding(activeBuilding === building.id ? null : building.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    cursor: "pointer",
                    background: "#FAFAFA",
                    borderBottom: "1px solid #F1F5F9",
                  }}
                >
                  <Building2 size={14} color={building.color} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", flex: 1 }}>{building.name}</span>
                  <span style={{ fontSize: 10, color: "#94A3B8" }}>{building.floors.length} floors</span>
                  <ChevronRight size={12} color="#CBD5E1" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "0.15s" }} />
                </div>

                {isOpen &&
                  building.floors.map((floor) => {
                    const isSelected = selectedFloor === floor.id;
                    return (
                      <div
                        key={floor.id}
                        onClick={() => setSelectedFloor(floor.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "9px 12px 9px 28px",
                          cursor: "pointer",
                          background: isSelected ? "#EFF6FF" : "white",
                          borderLeft: isSelected ? `3px solid ${building.color}` : "3px solid transparent",
                          borderBottom: "1px solid #F8FAFC",
                        }}
                      >
                        <div style={{ width: 22, height: 22, background: isSelected ? building.color : `${building.color}20`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: isSelected ? "white" : building.color }}>
                          {floor.floorLevel === 0 ? "G" : floor.floorLevel}
                        </div>
                        <span style={{ flex: 1, fontSize: 12, color: "#0F172A" }}>{floor.label}</span>
                        <div className="flex items-center gap-1">
                          {floor.hasFloorPlan ? (
                            <CheckCircle size={11} color="#10B981" />
                          ) : (
                            <AlertTriangle size={11} color="#F59E0B" />
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleVisible(floor.id); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: floor.visible ? "#94A3B8" : "#CBD5E1" }}
                          >
                            {floor.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>

        {/* Floor detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {selected ? (
            <div style={{ maxWidth: 760 }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 style={{ color: "#0F172A", fontSize: 16, fontWeight: 700, margin: 0 }}>
                    {selected.buildingName} — {selected.label}
                  </h2>
                  <div style={{ color: "#94A3B8", fontSize: 12 }}>Floor level {selected.floorLevel} · {selected.nodeCount} nav nodes</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleVisible(selected.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                    {selected.visible ? <><Eye size={12} /> Visible</> : <><EyeOff size={12} /> Hidden</>}
                  </button>
                  <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#1C6BEB", border: "none", borderRadius: 6, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <Save size={12} /> Save Layer
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
                {/* Floor plan upload */}
                <div>
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px", marginBottom: 14 }}>
                    <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
                      <FileImage size={14} color="#1C6BEB" /> Floor Plan Image
                    </h3>

                    {selected.hasFloorPlan ? (
                      <div>
                        {/* Floor plan placeholder */}
                        <div
                          style={{
                            background: "linear-gradient(135deg, #EFF6FF 0%, #F0F9FF 100%)",
                            border: "1px solid #BFDBFE",
                            borderRadius: 8,
                            height: 260,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          {/* Simulated floor plan */}
                          <svg width="100%" height="100%" viewBox="0 0 400 260" style={{ position: "absolute", inset: 0 }}>
                            {/* Rooms */}
                            {[
                              [20, 20, 120, 80, "Room 101"],
                              [155, 20, 110, 80, "Office A"],
                              [280, 20, 100, 80, "Conference"],
                              [20, 140, 80, 100, "Stairs"],
                              [115, 140, 150, 100, "Main Hall"],
                              [280, 140, 100, 100, "Room 102"],
                            ].map(([x, y, w, h, label], i) => (
                              <g key={i}>
                                <rect x={x} y={y} width={w} height={h} rx={3} fill="white" stroke="#93C5FD" strokeWidth={1.5} />
                                <text x={Number(x) + Number(w) / 2} y={Number(y) + Number(h) / 2} textAnchor="middle" dominantBaseline="middle" fill="#64748B" fontSize={9}>{label}</text>
                              </g>
                            ))}
                            {/* Corridor */}
                            <rect x={105} y={20} width={40} height={220} fill="#F1F5F9" stroke="#CBD5E1" strokeWidth={0.5} />
                            {/* Nodes overlay */}
                            {[[125, 60], [185, 60], [320, 60], [60, 190], [185, 190], [325, 190]].map(([cx, cy], i) => (
                              <circle key={i} cx={cx} cy={cy} r={7} fill="#1C6BEB" opacity={0.8} />
                            ))}
                          </svg>
                          <div style={{ position: "absolute", bottom: 8, right: 8, background: "white", border: "1px solid #E2E8F0", borderRadius: 5, padding: "3px 8px", fontSize: 10, color: "#94A3B8" }}>
                            {selected.planFile} · 1:100 scale
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                            <Upload size={12} /> Replace
                          </button>
                          <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 12px", background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#EF4444", fontSize: 12, cursor: "pointer" }}>
                            <Trash2 size={12} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
                        style={{
                          border: `2px dashed ${dragOver ? "#1C6BEB" : "#CBD5E1"}`,
                          borderRadius: 8,
                          padding: "48px 24px",
                          textAlign: "center",
                          background: dragOver ? "#EFF6FF" : "#FAFAFA",
                          transition: "all 0.15s",
                          cursor: "pointer",
                        }}
                      >
                        <Upload size={32} color="#94A3B8" style={{ marginBottom: 12 }} />
                        <div style={{ fontSize: 14, color: "#64748B", marginBottom: 6 }}>Drop floor plan image here</div>
                        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>PNG, JPG, or SVG · Max 20MB</div>
                        <button style={{ padding: "8px 20px", background: "#1C6BEB", border: "none", borderRadius: 6, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          Browse Files
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Staircase connectors */}
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px" }}>
                    <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
                      <Move size={14} color="#10B981" /> Staircase & Elevator Connectors
                    </h3>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, marginBottom: 8 }}>STAIRCASE NODES</div>
                      {selected.staircaseConnectors.length > 0 ? (
                        selected.staircaseConnectors.map((nodeId) => (
                          <div key={nodeId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, marginBottom: 5 }}>
                            <ArrowUp size={13} color="#10B981" />
                            <ArrowDown size={13} color="#10B981" />
                            <span style={{ flex: 1, fontSize: 12, color: "#0F172A", fontWeight: 500 }}>{nodeId}</span>
                            <span style={{ fontSize: 10, color: "#10B981" }}>Staircase connector</span>
                            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
                              <Unlink size={11} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: 12, color: "#94A3B8", padding: "8px", textAlign: "center" }}>No staircase connectors</div>
                      )}
                      <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", background: "#F0FDF4", border: "1px dashed #10B981", borderRadius: 6, color: "#10B981", fontSize: 11, cursor: "pointer", marginTop: 6 }}>
                        <Link size={11} /> Link staircase node
                      </button>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, marginBottom: 8 }}>ELEVATOR NODES</div>
                      {selected.elevatorConnectors.length > 0 ? (
                        selected.elevatorConnectors.map((nodeId) => (
                          <div key={nodeId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, marginBottom: 5 }}>
                            <Layers size={13} color="#1C6BEB" />
                            <span style={{ flex: 1, fontSize: 12, color: "#0F172A", fontWeight: 500 }}>{nodeId}</span>
                            <span style={{ fontSize: 10, color: "#1C6BEB" }}>Elevator connector</span>
                            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
                              <Unlink size={11} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: 12, color: "#94A3B8", padding: "8px", textAlign: "center" }}>No elevator connectors</div>
                      )}
                      <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", background: "#EFF6FF", border: "1px dashed #1C6BEB", borderRadius: 6, color: "#1C6BEB", fontSize: 11, cursor: "pointer", marginTop: 6 }}>
                        <Link size={11} /> Link elevator node
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Layer info */}
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "16px" }}>
                    <h3 style={{ color: "#0F172A", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>Layer Info</h3>
                    {[
                      { label: "Building", value: selected.buildingName },
                      { label: "Floor Level", value: selected.floorLevel === 0 ? "Ground Floor" : `Floor ${selected.floorLevel}` },
                      { label: "Node Count", value: selected.nodeCount },
                      { label: "Floor Plan", value: selected.hasFloorPlan ? "Uploaded" : "Missing" },
                      { label: "Visibility", value: selected.visible ? "Visible" : "Hidden" },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F8FAFC" }}>
                        <span style={{ fontSize: 12, color: "#94A3B8" }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>{String(value)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Floor switcher visualization */}
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "16px" }}>
                    <h3 style={{ color: "#0F172A", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>Floor Stack</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {floorsForBuilding(selected.buildingId)
                        .sort((a, b) => b.floorLevel - a.floorLevel)
                        .map((floor) => (
                          <div
                            key={floor.id}
                            onClick={() => setSelectedFloor(floor.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              background: floor.id === selected.id ? "#EFF6FF" : "#F8FAFC",
                              border: `1px solid ${floor.id === selected.id ? "#93C5FD" : "#F1F5F9"}`,
                              borderRadius: 6,
                              cursor: "pointer",
                              transition: "0.15s",
                            }}
                          >
                            <div style={{ width: 24, height: 24, background: floor.id === selected.id ? "#1C6BEB" : "#E2E8F0", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: floor.id === selected.id ? "white" : "#64748B" }}>
                              {floor.floorLevel === 0 ? "G" : floor.floorLevel}
                            </div>
                            <span style={{ fontSize: 12, flex: 1, color: "#0F172A" }}>{floor.label}</span>
                            <div className="flex gap-1">
                              {floor.hasFloorPlan ? <CheckCircle size={11} color="#10B981" /> : <AlertTriangle size={11} color="#F59E0B" />}
                              {floor.visible ? <Eye size={11} color="#94A3B8" /> : <EyeOff size={11} color="#CBD5E1" />}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: "#94A3B8" }}>
              <Layers size={40} opacity={0.3} />
              <p style={{ fontSize: 14 }}>Select a floor layer to configure</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
