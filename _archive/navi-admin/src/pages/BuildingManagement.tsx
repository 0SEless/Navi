import { useState } from "react";
import {
  Building2,
  Plus,
  Search,
  Edit3,
  Trash2,
  Save,
  X,
  MapPin,
  Layers,
  DoorOpen,
  CheckCircle,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

interface Building {
  id: string;
  name: string;
  code: string;
  floors: number;
  nodeCount: number;
  qrCount: number;
  status: "active" | "draft" | "maintenance";
  entrances: string[];
  description: string;
  color: string;
}

const BUILDINGS: Building[] = [
  { id: "admin", name: "Administration Building", code: "ADMIN", floors: 3, nodeCount: 12, qrCount: 8, status: "active", entrances: ["Main Entrance", "Side Gate"], description: "Main administrative offices and registrar.", color: "#3B82F6" },
  { id: "lib", name: "Learning Resource Center", code: "LRC", floors: 2, nodeCount: 8, qrCount: 6, status: "active", entrances: ["Main Entrance", "Back Exit"], description: "Library, computer labs, and study rooms.", color: "#8B5CF6" },
  { id: "sci", name: "Science Laboratory", code: "SCI", floors: 2, nodeCount: 9, qrCount: 5, status: "active", entrances: ["Main Entrance"], description: "Physics, Chemistry, and Biology laboratories.", color: "#10B981" },
  { id: "cas", name: "College of Arts & Sciences", code: "CAS", floors: 3, nodeCount: 15, qrCount: 10, status: "active", entrances: ["Main Entrance", "Emergency Exit", "North Side"], description: "Arts, Humanities, and Sciences departments.", color: "#F59E0B" },
  { id: "coe", name: "College of Engineering", code: "COE", floors: 3, nodeCount: 11, qrCount: 7, status: "active", entrances: ["Main Entrance", "Workshop Door"], description: "Engineering departments and fabrication labs.", color: "#EF4444" },
  { id: "gym", name: "Gymnasium", code: "GYM", floors: 1, nodeCount: 5, qrCount: 3, status: "active", entrances: ["Main Gate", "East Door", "West Door"], description: "Multi-purpose sports hall and events venue.", color: "#06B6D4" },
  { id: "sc", name: "Student Center", code: "SC", floors: 2, nodeCount: 7, qrCount: 4, status: "maintenance", entrances: ["Main Entrance"], description: "Canteen, student lounge, and organizations office.", color: "#F97316" },
  { id: "chapel", name: "Chapel", code: "CHP", floors: 1, nodeCount: 4, qrCount: 2, status: "active", entrances: ["Front Entrance"], description: "University chapel for prayer and ceremonies.", color: "#EC4899" },
];

const STATUS_CONFIG = {
  active: { color: "#10B981", bg: "#DCFCE7", label: "Active" },
  draft: { color: "#F59E0B", bg: "#FEF9C3", label: "Draft" },
  maintenance: { color: "#EF4444", bg: "#FEE2E2", label: "Maintenance" },
};

export function BuildingManagement() {
  const [buildings, setBuildings] = useState<Building[]>(BUILDINGS);
  const [selectedId, setSelectedId] = useState<string | null>("admin");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Building | null>(null);
  const [newEntrance, setNewEntrance] = useState("");

  const filtered = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase())
  );

  const selected = buildings.find((b) => b.id === selectedId) ?? null;

  const startEdit = () => {
    if (selected) {
      setEditData({ ...selected });
      setEditing(true);
    }
  };

  const saveEdit = () => {
    if (editData) {
      setBuildings((prev) => prev.map((b) => (b.id === editData.id ? editData : b)));
      setEditing(false);
      setEditData(null);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditData(null);
  };

  const addEntrance = () => {
    if (editData && newEntrance.trim()) {
      setEditData({ ...editData, entrances: [...editData.entrances, newEntrance.trim()] });
      setNewEntrance("");
    }
  };

  const removeEntrance = (idx: number) => {
    if (editData) {
      setEditData({ ...editData, entrances: editData.entrances.filter((_, i) => i !== idx) });
    }
  };

  const current = editing ? editData : selected;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F1F5F9" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ color: "#0F172A", fontSize: 18, fontWeight: 700, margin: 0 }}>Building Management</h1>
          <p style={{ color: "#64748B", fontSize: 12, margin: "2px 0 0" }}>Configure campus buildings, entrances, and metadata</p>
        </div>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: "linear-gradient(135deg, #1C6BEB, #0891B2)",
            border: "none",
            borderRadius: 7,
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={14} />
          Add Building
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Building list */}
        <div style={{ width: 320, background: "white", borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7, padding: "7px 12px" }}>
              <Search size={13} color="#94A3B8" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search buildings..."
                style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#0F172A", flex: 1 }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.map((b) => {
              const statusConf = STATUS_CONFIG[b.status];
              const isSelected = b.id === selectedId;
              return (
                <div
                  key={b.id}
                  onClick={() => { setSelectedId(b.id); setEditing(false); setEditData(null); }}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #F1F5F9",
                    cursor: "pointer",
                    background: isSelected ? "#EFF6FF" : "white",
                    borderLeft: isSelected ? "3px solid #1C6BEB" : "3px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div style={{ width: 32, height: 32, background: `${b.color}20`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Building2 size={15} color={b.color} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>{b.code} · {b.floors} floors</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: statusConf.color, background: statusConf.bg, padding: "2px 6px", borderRadius: 10, flexShrink: 0 }}>
                      {statusConf.label}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2" style={{ fontSize: 10, color: "#94A3B8" }}>
                    <span><MapPin size={9} style={{ display: "inline", marginRight: 3 }} />{b.nodeCount} nodes</span>
                    <span>QR: {b.qrCount}</span>
                    <span>{b.entrances.length} entrances</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Building detail / edit */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {current ? (
            <div style={{ maxWidth: 720 }}>
              {/* Detail header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div style={{ width: 44, height: 44, background: `${current.color}20`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Building2 size={22} color={current.color} />
                  </div>
                  <div>
                    {editing ? (
                      <input
                        value={editData?.name ?? ""}
                        onChange={(e) => setEditData((d) => d ? { ...d, name: e.target.value } : d)}
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#0F172A",
                          border: "1px solid #93C5FD",
                          borderRadius: 5,
                          padding: "3px 8px",
                          outline: "none",
                          background: "#EFF6FF",
                        }}
                      />
                    ) : (
                      <h2 style={{ color: "#0F172A", fontSize: 18, fontWeight: 700, margin: 0 }}>{current.name}</h2>
                    )}
                    <div style={{ color: "#94A3B8", fontSize: 12 }}>Building ID: {current.id} · Code: {current.code}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button onClick={cancelEdit} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 7, color: "#64748B", fontSize: 13, cursor: "pointer" }}>
                        <X size={13} /> Cancel
                      </button>
                      <button onClick={saveEdit} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "#1C6BEB", border: "none", borderRadius: 7, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        <Save size={13} /> Save Changes
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={startEdit} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 7, color: "#64748B", fontSize: 13, cursor: "pointer" }}>
                        <Edit3 size={13} /> Edit
                      </button>
                      <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 7, color: "#EF4444", fontSize: 13, cursor: "pointer" }}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Info card */}
                <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px" }}>
                  <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
                    <Building2 size={14} color="#1C6BEB" /> Building Info
                  </h3>

                  {[
                    { label: "Building Code", field: "code" as keyof Building },
                    { label: "Number of Floors", field: "floors" as keyof Building, type: "number" },
                  ].map(({ label, field, type }) => (
                    <div key={label} style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: 4 }}>{label}</label>
                      {editing ? (
                        <input
                          type={type ?? "text"}
                          value={String(editData?.[field] ?? "")}
                          onChange={(e) => setEditData((d) => d ? { ...d, [field]: type === "number" ? Number(e.target.value) : e.target.value } : d)}
                          style={{ width: "100%", border: "1px solid #93C5FD", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#0F172A", outline: "none", background: "#EFF6FF", boxSizing: "border-box" }}
                        />
                      ) : (
                        <div style={{ fontSize: 13, color: "#0F172A", padding: "7px 10px", background: "#F8FAFC", borderRadius: 6, border: "1px solid #F1F5F9" }}>{String(current[field])}</div>
                      )}
                    </div>
                  ))}

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: 4 }}>Description</label>
                    {editing ? (
                      <textarea
                        value={editData?.description ?? ""}
                        onChange={(e) => setEditData((d) => d ? { ...d, description: e.target.value } : d)}
                        rows={3}
                        style={{ width: "100%", border: "1px solid #93C5FD", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#0F172A", outline: "none", background: "#EFF6FF", resize: "vertical", boxSizing: "border-box" }}
                      />
                    ) : (
                      <div style={{ fontSize: 13, color: "#64748B", padding: "7px 10px", background: "#F8FAFC", borderRadius: 6, border: "1px solid #F1F5F9", lineHeight: 1.5 }}>{current.description}</div>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: 4 }}>Status</label>
                    {editing ? (
                      <select
                        value={editData?.status ?? "active"}
                        onChange={(e) => setEditData((d) => d ? { ...d, status: e.target.value as Building["status"] } : d)}
                        style={{ width: "100%", border: "1px solid #93C5FD", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#0F172A", outline: "none", background: "#EFF6FF", boxSizing: "border-box" }}
                      >
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    ) : (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: STATUS_CONFIG[current.status].bg, color: STATUS_CONFIG[current.status].color, borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                        <CheckCircle size={11} />
                        {STATUS_CONFIG[current.status].label}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats card */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px" }}>
                    <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
                      <Layers size={14} color="#8B5CF6" /> Navigation Data
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[
                        { label: "Nav Nodes", value: current.nodeCount, color: "#1C6BEB" },
                        { label: "QR Tags", value: current.qrCount, color: "#F59E0B" },
                        { label: "Floors", value: current.floors, color: "#8B5CF6" },
                        { label: "Entrances", value: current.entrances.length, color: "#10B981" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: "#F8FAFC", borderRadius: 7, padding: "12px", textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Entrances card */}
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px", flex: 1 }}>
                    <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <DoorOpen size={14} color="#10B981" /> Entrances
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(editing ? editData?.entrances : current.entrances)?.map((entrance, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#F8FAFC", borderRadius: 6, border: "1px solid #F1F5F9" }}>
                          <DoorOpen size={12} color="#10B981" />
                          <span style={{ flex: 1, fontSize: 12, color: "#0F172A" }}>{entrance}</span>
                          {editing && (
                            <button onClick={() => removeEntrance(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 0 }}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      {editing && (
                        <div className="flex gap-2">
                          <input
                            value={newEntrance}
                            onChange={(e) => setNewEntrance(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addEntrance()}
                            placeholder="Add entrance name..."
                            style={{ flex: 1, border: "1px solid #93C5FD", borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", background: "#EFF6FF" }}
                          />
                          <button onClick={addEntrance} style={{ padding: "6px 10px", background: "#1C6BEB", border: "none", borderRadius: 6, color: "white", cursor: "pointer" }}>
                            <Plus size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floor table */}
              <div style={{ marginTop: 16, background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px" }}>
                <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers size={14} color="#1C6BEB" /> Floor Overview
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {Array.from({ length: current.floors }, (_, i) => i + 1).map((floor) => (
                    <div key={floor} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 7 }}>
                      <div style={{ width: 28, height: 28, background: "#1C6BEB20", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#1C6BEB" }}>
                        {floor}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>Floor {floor}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{Math.floor(current.nodeCount / current.floors)} nodes mapped</div>
                      </div>
                      <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#94A3B8" }}>
                        <span style={{ color: "#10B981" }}>● Mapped</span>
                        <ChevronRight size={13} color="#CBD5E1" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: "#94A3B8" }}>
              <Building2 size={40} opacity={0.3} />
              <p style={{ fontSize: 14 }}>Select a building to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
