import { useState } from "react";
import {
  Camera,
  Plus,
  Upload,
  Link,
  Eye,
  Edit3,
  Trash2,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Search,
  ChevronRight,
  X,
  RotateCcw,
  ZoomIn,
  Move,
  Crosshair,
} from "lucide-react";

interface Hotspot {
  id: string;
  label: string;
  pitch: number;
  yaw: number;
  type: "info" | "link" | "node";
  targetId?: string;
}

interface Panorama {
  id: string;
  name: string;
  filename: string;
  nodeId: string | null;
  nodeName: string | null;
  building: string;
  floor: number;
  hotspots: Hotspot[];
  status: "linked" | "unlinked" | "processing";
  uploadDate: string;
  fileSizeMB: number;
}

const PANORAMAS: Panorama[] = [
  { id: "pano-001", name: "Admin Main Entrance", filename: "admin_entrance_pano.jpg", nodeId: "N001", nodeName: "Admin Entrance", building: "Administration Building", floor: 1, hotspots: [{ id: "hs-1", label: "Registration Office", pitch: 5, yaw: 45, type: "info" }, { id: "hs-2", label: "To Library", pitch: 0, yaw: 180, type: "link", targetId: "pano-002" }], status: "linked", uploadDate: "2025-05-10", fileSizeMB: 12.4 },
  { id: "pano-002", name: "Library Front Entrance", filename: "library_entrance_pano.jpg", nodeId: "N002", nodeName: "Library Entrance", building: "Learning Resource Center", floor: 1, hotspots: [{ id: "hs-3", label: "Reading Area →", pitch: -5, yaw: 90, type: "node", targetId: "N025" }], status: "linked", uploadDate: "2025-05-09", fileSizeMB: 15.2 },
  { id: "pano-003", name: "COE Main Corridor", filename: "coe_corridor_pano.jpg", nodeId: "N005", nodeName: "COE Entrance", building: "College of Engineering", floor: 1, hotspots: [], status: "linked", uploadDate: "2025-05-08", fileSizeMB: 11.8 },
  { id: "pano-004", name: "Main Plaza", filename: "main_plaza_pano.jpg", nodeId: "N011", nodeName: "Main Plaza", building: "Outdoor", floor: 0, hotspots: [{ id: "hs-4", label: "Admin Building →", pitch: 0, yaw: 30, type: "link", targetId: "pano-001" }, { id: "hs-5", label: "Library →", pitch: 0, yaw: 150, type: "link", targetId: "pano-002" }, { id: "hs-6", label: "COE →", pitch: 0, yaw: 270, type: "link", targetId: "pano-003" }], status: "linked", uploadDate: "2025-05-07", fileSizeMB: 18.6 },
  { id: "pano-005", name: "Student Center Lobby", filename: "sc_lobby_pano.jpg", nodeId: "N007", nodeName: "Student Center Entrance", building: "Student Center", floor: 1, hotspots: [], status: "linked", uploadDate: "2025-05-06", fileSizeMB: 10.3 },
  { id: "pano-006", name: "Science Lab Hallway", filename: "sci_hallway_pano.jpg", nodeId: null, nodeName: null, building: "Science Laboratory", floor: 1, hotspots: [], status: "unlinked", uploadDate: "2025-05-05", fileSizeMB: 9.7 },
  { id: "pano-007", name: "CAS Ground Floor", filename: "cas_gf_pano.jpg", nodeId: null, nodeName: null, building: "College of Arts & Sciences", floor: 1, hotspots: [], status: "processing", uploadDate: "2025-05-04", fileSizeMB: 14.1 },
];

const STATUS_CONFIG = {
  linked: { color: "#10B981", bg: "#DCFCE7", label: "Linked" },
  unlinked: { color: "#F59E0B", bg: "#FEF9C3", label: "Unlinked" },
  processing: { color: "#1C6BEB", bg: "#DBEAFE", label: "Processing" },
};

const HOTSPOT_COLORS = { info: "#06B6D4", link: "#1C6BEB", node: "#10B981" };

export function PanoramaManagement() {
  const [panoramas] = useState<Panorama[]>(PANORAMAS);
  const [selectedId, setSelectedId] = useState<string | null>("pano-001");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "hotspots" | "link">("preview");
  const [dragOver, setDragOver] = useState(false);

  const selected = panoramas.find((p) => p.id === selectedId);

  const filtered = panoramas.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.building.toLowerCase().includes(search.toLowerCase())
  );

  const unlinked = panoramas.filter((p) => p.status === "unlinked").length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F1F5F9" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ color: "#0F172A", fontSize: 18, fontWeight: 700, margin: 0 }}>Panorama Management</h1>
          <p style={{ color: "#64748B", fontSize: 12, margin: "2px 0 0" }}>Upload, configure hotspots, and link 360° panoramas to navigation nodes</p>
        </div>
        <div className="flex gap-2">
          {unlinked > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#FEF9C3", border: "1px solid #FDE68A", borderRadius: 7, color: "#92400E", fontSize: 12 }}>
              <AlertTriangle size={13} /> {unlinked} unlinked panoramas
            </div>
          )}
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "linear-gradient(135deg, #1C6BEB, #0891B2)", border: "none", borderRadius: 7, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Upload size={14} /> Upload Panorama
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Panorama list */}
        <div style={{ width: 300, background: "white", borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7, padding: "7px 12px" }}>
              <Search size={13} color="#94A3B8" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search panoramas..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#0F172A", flex: 1 }} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Upload area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
              style={{ margin: "10px", border: `2px dashed ${dragOver ? "#1C6BEB" : "#CBD5E1"}`, borderRadius: 8, padding: "16px", textAlign: "center", background: dragOver ? "#EFF6FF" : "#FAFAFA", cursor: "pointer" }}
            >
              <Upload size={20} color="#94A3B8" style={{ margin: "0 auto 6px" }} />
              <div style={{ fontSize: 11, color: "#94A3B8" }}>Drop 360° images here or click to browse</div>
            </div>

            {filtered.map((p) => {
              const statusConf = STATUS_CONFIG[p.status];
              const isSelected = p.id === selectedId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  style={{ padding: "12px 14px", borderBottom: "1px solid #F8FAFC", cursor: "pointer", background: isSelected ? "#EFF6FF" : "white", borderLeft: isSelected ? "3px solid #1C6BEB" : "3px solid transparent" }}
                >
                  {/* Thumbnail placeholder */}
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 52,
                        height: 36,
                        background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #1C6BEB 100%)",
                        borderRadius: 5,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      <Camera size={16} color="rgba(255,255,255,0.5)" />
                      <div style={{ position: "absolute", bottom: 2, right: 2, fontSize: 7, color: "rgba(255,255,255,0.6)", background: "rgba(0,0,0,0.4)", borderRadius: 2, padding: "1px 3px" }}>360°</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>{p.building} · Floor {p.floor}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span style={{ fontSize: 10, fontWeight: 600, color: statusConf.color, background: statusConf.bg, padding: "1px 5px", borderRadius: 8 }}>{statusConf.label}</span>
                        {p.nodeId && <span style={{ fontSize: 10, color: "#94A3B8" }}>{p.nodeId}</span>}
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>{p.hotspots.length} hotspots</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panorama editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selected ? (
            <>
              {/* Tab bar */}
              <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "0 20px", display: "flex", gap: 0 }}>
                {([["preview", "360° Preview"], ["hotspots", `Hotspot Editor (${selected.hotspots.length})`], ["link", "Node Linkage"]] as [string, string][]).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as typeof activeTab)}
                    style={{
                      padding: "12px 16px",
                      background: "none",
                      border: "none",
                      borderBottom: activeTab === tab ? "2px solid #1C6BEB" : "2px solid transparent",
                      color: activeTab === tab ? "#1C6BEB" : "#64748B",
                      fontSize: 13,
                      fontWeight: activeTab === tab ? 600 : 400,
                      cursor: "pointer",
                      marginBottom: -1,
                    }}
                  >
                    {label}
                  </button>
                ))}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>{selected.filename} · {selected.fileSizeMB}MB</span>
                  <button style={{ padding: "5px 10px", background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 5, color: "#EF4444", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                {activeTab === "preview" && (
                  <div>
                    {/* Simulated 360 viewer */}
                    <div
                      style={{
                        width: "100%",
                        height: 360,
                        background: "linear-gradient(180deg, #0F172A 0%, #1E293B 30%, #1C3A6E 60%, #1A2744 80%, #0F172A 100%)",
                        borderRadius: 12,
                        position: "relative",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "grab",
                        marginBottom: 16,
                      }}
                    >
                      {/* Simulated ground */}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "35%", background: "linear-gradient(180deg, transparent, #0D1F0D)", borderRadius: "0 0 12px 12px" }} />

                      {/* Campus scene elements */}
                      {[
                        { left: "10%", bottom: "35%", width: 80, height: 120, color: "#1E3A5F", label: "Admin" },
                        { left: "35%", bottom: "35%", width: 70, height: 90, color: "#2D1B69", label: "Library" },
                        { left: "65%", bottom: "35%", width: 90, height: 100, color: "#1E3A2F", label: "CAS" },
                        { right: "8%", bottom: "35%", width: 65, height: 80, color: "#3D1A1A", label: "COE" },
                      ].map((b, i) => (
                        <div key={i} style={{ position: "absolute", left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height, background: b.color, borderRadius: 4, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4 }}>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>{b.label}</span>
                        </div>
                      ))}

                      {/* Trees */}
                      {[20, 50, 80].map((left) => (
                        <div key={left} style={{ position: "absolute", bottom: "33%", left: `${left}%`, width: 12, height: 30, display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 20, height: 20, background: "#1A3D1A", borderRadius: "50% 50% 0 0", marginBottom: -4 }} />
                          <div style={{ width: 4, height: 12, background: "#5C3A1E" }} />
                        </div>
                      ))}

                      {/* Hotspot overlays */}
                      {selected.hotspots.map((hs, i) => (
                        <div
                          key={hs.id}
                          style={{
                            position: "absolute",
                            left: `${20 + i * 25}%`,
                            top: `${40 - i * 8}%`,
                            background: `${HOTSPOT_COLORS[hs.type]}CC`,
                            border: "2px solid white",
                            borderRadius: "50%",
                            width: 30,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                          }}
                          title={hs.label}
                        >
                          <ChevronRight size={14} color="white" />
                          <div style={{ position: "absolute", top: -24, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "white", padding: "2px 6px", borderRadius: 4, fontSize: 9, whiteSpace: "nowrap" }}>
                            {hs.label}
                          </div>
                        </div>
                      ))}

                      {/* Controls overlay */}
                      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
                        {[RotateCcw, ZoomIn, Move].map((Icon, i) => (
                          <button key={i} style={{ width: 32, height: 32, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white" }}>
                            <Icon size={14} />
                          </button>
                        ))}
                      </div>

                      <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.6)", padding: "4px 10px", borderRadius: 5, fontSize: 10 }}>
                        360° Preview · Drag to rotate
                      </div>

                      <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.6)", padding: "4px 10px", borderRadius: 5, fontSize: 10 }}>
                        {selected.name}
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                      {[
                        { label: "Hotspots", value: selected.hotspots.length, color: "#1C6BEB" },
                        { label: "Node Link", value: selected.nodeId ?? "None", color: selected.nodeId ? "#10B981" : "#F59E0B" },
                        { label: "File Size", value: `${selected.fileSizeMB}MB`, color: "#64748B" },
                        { label: "Uploaded", value: selected.uploadDate, color: "#64748B" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "hotspots" && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 style={{ color: "#0F172A", fontSize: 15, fontWeight: 600, margin: 0 }}>Hotspot Configuration</h3>
                      <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "#1C6BEB", border: "none", borderRadius: 7, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <Plus size={13} /> Add Hotspot
                      </button>
                    </div>

                    {/* Hotspot editor canvas */}
                    <div style={{ background: "#0F172A", borderRadius: 10, padding: "16px", marginBottom: 16, height: 220, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ color: "#475569", fontSize: 12, textAlign: "center" }}>
                        <Crosshair size={24} color="#334155" style={{ margin: "0 auto 8px" }} />
                        Click on the panorama to place hotspots
                      </div>
                      {selected.hotspots.map((hs, i) => (
                        <div
                          key={hs.id}
                          style={{
                            position: "absolute",
                            left: `${15 + i * 22}%`,
                            top: `${30 + (i % 2) * 20}%`,
                            background: HOTSPOT_COLORS[hs.type],
                            borderRadius: "50%",
                            width: 28,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "2px solid white",
                            cursor: "pointer",
                          }}
                        >
                          <ChevronRight size={12} color="white" />
                        </div>
                      ))}
                    </div>

                    {/* Hotspot list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {selected.hotspots.map((hs) => (
                        <div key={hs.id} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "12px 16px" }}>
                          <div className="flex items-center gap-3">
                            <div style={{ width: 28, height: 28, background: `${HOTSPOT_COLORS[hs.type]}20`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <div style={{ width: 10, height: 10, background: HOTSPOT_COLORS[hs.type], borderRadius: "50%" }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{hs.label}</div>
                              <div style={{ fontSize: 11, color: "#94A3B8" }}>
                                Type: {hs.type} · Pitch: {hs.pitch}° · Yaw: {hs.yaw}°
                                {hs.targetId && ` · Target: ${hs.targetId}`}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button style={{ background: "none", border: "1px solid #E2E8F0", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "#64748B" }}><Edit3 size={11} /></button>
                              <button style={{ background: "none", border: "1px solid #FECACA", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "#EF4444" }}><X size={11} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {selected.hotspots.length === 0 && (
                        <div style={{ textAlign: "center", padding: "40px", color: "#94A3B8", fontSize: 13 }}>
                          No hotspots configured. Add hotspots using the editor above.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "link" && (
                  <div style={{ maxWidth: 560 }}>
                    <h3 style={{ color: "#0F172A", fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Node Linkage Configuration</h3>

                    <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 8 }}>LINKED NODE</label>
                        {selected.nodeId ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8 }}>
                            <CheckCircle size={16} color="#10B981" />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{selected.nodeId} — {selected.nodeName}</div>
                              <div style={{ fontSize: 11, color: "#10B981" }}>Panorama is linked to this navigation node</div>
                            </div>
                            <button style={{ marginLeft: "auto", background: "none", border: "1px solid #FECACA", borderRadius: 5, padding: "4px 10px", color: "#EF4444", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                              <X size={10} /> Unlink
                            </button>
                          </div>
                        ) : (
                          <div style={{ padding: "16px", background: "#FEF9C3", border: "1px solid #FDE68A", borderRadius: 8, display: "flex", gap: 10 }}>
                            <AlertTriangle size={15} color="#F59E0B" />
                            <span style={{ fontSize: 13, color: "#92400E" }}>This panorama is not linked to any navigation node.</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: 12, color: "#64748B", fontWeight: 600, display: "block", marginBottom: 8 }}>ASSIGN TO NODE</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            placeholder="Search node ID or name..."
                            style={{ flex: 1, border: "1px solid #E2E8F0", borderRadius: 7, padding: "9px 12px", fontSize: 13, outline: "none", color: "#0F172A" }}
                          />
                          <button style={{ padding: "9px 16px", background: "#1C6BEB", border: "none", borderRadius: 7, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                            <Link size={13} /> Link
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "20px" }}>
                      <h4 style={{ color: "#0F172A", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>Nodes without Panoramas</h4>
                      {["N003 — Science Lab Entrance", "N004 — CAS Entrance", "N006 — Gymnasium Entrance", "N008 — Chapel Entrance", "N009 — NW Junction", "N012 — SW Junction"].map((node) => (
                        <div key={node} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #F8FAFC", cursor: "pointer" }}>
                          <MapPin size={12} color="#94A3B8" />
                          <span style={{ flex: 1, fontSize: 12, color: "#64748B" }}>{node}</span>
                          <button style={{ background: "none", border: "1px solid #E2E8F0", borderRadius: 5, padding: "3px 8px", color: "#1C6BEB", fontSize: 11, cursor: "pointer" }}>
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#94A3B8" }}>
              <Camera size={40} opacity={0.3} />
              <p style={{ fontSize: 14 }}>Select a panorama to preview and configure</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
