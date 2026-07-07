import { useState } from "react";
import {
  QrCode,
  Plus,
  Search,
  Download,
  Printer,
  CheckCircle,
  AlertTriangle,
  MapPin,
  Clock,
  Edit3,
  Trash2,
  RefreshCw,
  Scan,
  Link,
  Copy,
  Eye,
  X,
} from "lucide-react";

interface QRCheckpoint {
  id: string;
  qrCode: string;
  nodeId: string;
  nodeName: string;
  building: string;
  floor: number;
  status: "active" | "inactive" | "pending";
  lastScan: string | null;
  scanCount: number;
  printed: boolean;
}

const QR_CHECKPOINTS: QRCheckpoint[] = [
  { id: "QR001", qrCode: "NAVI-ASU-N001-2025", nodeId: "N001", nodeName: "Admin Entrance", building: "Administration Building", floor: 1, status: "active", lastScan: "2025-05-17 14:32", scanCount: 89, printed: true },
  { id: "QR002", qrCode: "NAVI-ASU-N002-2025", nodeId: "N002", nodeName: "Library Entrance", building: "Learning Resource Center", floor: 1, status: "active", lastScan: "2025-05-17 13:15", scanCount: 145, printed: true },
  { id: "QR003", qrCode: "NAVI-ASU-N004-2025", nodeId: "N004", nodeName: "CAS Entrance", building: "College of Arts & Sciences", floor: 1, status: "active", lastScan: "2025-05-17 11:47", scanCount: 203, printed: true },
  { id: "QR004", qrCode: "NAVI-ASU-N005-2025", nodeId: "N005", nodeName: "COE Entrance", building: "College of Engineering", floor: 1, status: "active", lastScan: "2025-05-17 10:08", scanCount: 167, printed: true },
  { id: "QR005", qrCode: "NAVI-ASU-N007-2025", nodeId: "N007", nodeName: "Student Center Entrance", building: "Student Center", floor: 1, status: "active", lastScan: "2025-05-16 16:55", scanCount: 132, printed: true },
  { id: "QR006", qrCode: "NAVI-ASU-N011-2025", nodeId: "N011", nodeName: "Main Plaza", building: "Outdoor", floor: 0, status: "active", lastScan: "2025-05-17 14:58", scanCount: 318, printed: true },
  { id: "QR007", qrCode: "NAVI-ASU-N014-2025", nodeId: "N014", nodeName: "South Gate", building: "Outdoor", floor: 0, status: "pending", lastScan: null, scanCount: 0, printed: false },
  { id: "QR008", qrCode: "NAVI-ASU-N041-2025", nodeId: "N041", nodeName: "Admin Staircase G→1", building: "Administration Building", floor: 1, status: "inactive", lastScan: "2025-05-10 09:22", scanCount: 44, printed: true },
  { id: "QR009", qrCode: "NAVI-ASU-N025-2025", nodeId: "N025", nodeName: "Library Study Room", building: "Learning Resource Center", floor: 2, status: "active", lastScan: "2025-05-17 12:30", scanCount: 76, printed: false },
  { id: "QR010", qrCode: "NAVI-ASU-N060-2025", nodeId: "N060", nodeName: "CAS Staircase", building: "College of Arts & Sciences", floor: 1, status: "pending", lastScan: null, scanCount: 0, printed: false },
];

const STATUS_CONFIG = {
  active: { color: "#10B981", bg: "#DCFCE7", label: "Active" },
  inactive: { color: "#64748B", bg: "#F1F5F9", label: "Inactive" },
  pending: { color: "#F59E0B", bg: "#FEF9C3", label: "Pending" },
};

function QRCodeSVG({ value, size = 100 }: { value: string; size?: number }) {
  const cells = 25;
  const cellSize = size / cells;
  const pattern: boolean[][] = [];
  for (let r = 0; r < cells; r++) {
    pattern[r] = [];
    for (let c = 0; c < cells; c++) {
      if ((r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)) {
        const inOuter = (r === 0 || r === 6 || c === 0 || c === 6) || (r >= cells - 7 && (r === cells - 7 || r === cells - 1 || c === 0 || c === 6));
        const inInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4) || (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3) || (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4);
        pattern[r][c] = inOuter || inInner;
      } else {
        const hash = (r * 17 + c * 31 + value.charCodeAt(r % value.length)) % 3;
        pattern[r][c] = hash === 0;
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <rect width={size} height={size} fill="white" />
      {pattern.flatMap((row, r) =>
        row.map((cell, c) =>
          cell ? <rect key={`${r}-${c}`} x={c * cellSize} y={r * cellSize} width={cellSize} height={cellSize} fill="#0F172A" /> : null
        )
      )}
    </svg>
  );
}

export function QRManagement() {
  const [checkpoints] = useState<QRCheckpoint[]>(QR_CHECKPOINTS);
  const [selectedId, setSelectedId] = useState<string | null>("QR001");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const selected = checkpoints.find((qr) => qr.id === selectedId);

  const filtered = checkpoints.filter((qr) => {
    const matchSearch =
      qr.nodeId.toLowerCase().includes(search.toLowerCase()) ||
      qr.nodeName.toLowerCase().includes(search.toLowerCase()) ||
      qr.building.toLowerCase().includes(search.toLowerCase()) ||
      qr.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || qr.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: checkpoints.length,
    active: checkpoints.filter((q) => q.status === "active").length,
    pending: checkpoints.filter((q) => q.status === "pending").length,
    printed: checkpoints.filter((q) => q.printed).length,
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F1F5F9" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ color: "#0F172A", fontSize: 18, fontWeight: 700, margin: 0 }}>QR Checkpoint Management</h1>
          <p style={{ color: "#64748B", fontSize: 12, margin: "2px 0 0" }}>Generate, print, and manage QR codes for navigation checkpoints</p>
        </div>
        <div className="flex gap-2">
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 7, color: "#64748B", fontSize: 13, cursor: "pointer" }}>
            <Download size={14} /> Export All
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "linear-gradient(135deg, #1C6BEB, #0891B2)", border: "none", borderRadius: 7, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={14} /> Generate QR
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "10px 24px", display: "flex", gap: 24 }}>
        {[
          { label: "Total QR Codes", value: stats.total, color: "#1C6BEB" },
          { label: "Active", value: stats.active, color: "#10B981" },
          { label: "Pending Setup", value: stats.pending, color: "#F59E0B" },
          { label: "Printed", value: stats.printed, color: "#8B5CF6" },
          { label: "Total Scans Today", value: "842", color: "#06B6D4" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-3">
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.3 }}>{label}</div>
            <div style={{ width: 1, height: 28, background: "#E2E8F0", marginLeft: 8 }} />
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* QR list */}
        <div style={{ width: 340, background: "white", borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7, padding: "7px 12px" }}>
              <Search size={13} color="#94A3B8" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search QR codes..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#0F172A", flex: 1 }} />
            </div>
            <div className="flex gap-1">
              {["all", "active", "inactive", "pending"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  style={{
                    flex: 1,
                    padding: "4px",
                    borderRadius: 5,
                    border: filterStatus === s ? "1px solid #1C6BEB" : "1px solid #E2E8F0",
                    background: filterStatus === s ? "#EFF6FF" : "transparent",
                    color: filterStatus === s ? "#1C6BEB" : "#64748B",
                    fontSize: 10,
                    cursor: "pointer",
                    fontWeight: filterStatus === s ? 600 : 400,
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.map((qr) => {
              const statusConf = STATUS_CONFIG[qr.status];
              const isSelected = qr.id === selectedId;
              return (
                <div
                  key={qr.id}
                  onClick={() => setSelectedId(qr.id)}
                  style={{ padding: "12px 14px", borderBottom: "1px solid #F8FAFC", cursor: "pointer", background: isSelected ? "#EFF6FF" : "white", borderLeft: isSelected ? "3px solid #1C6BEB" : "3px solid transparent" }}
                >
                  <div className="flex items-start gap-3">
                    <div style={{ width: 40, height: 40, background: "#F8FAFC", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <QrCode size={20} color={statusConf.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{qr.id}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: statusConf.color, background: statusConf.bg, padding: "1px 6px", borderRadius: 8 }}>{statusConf.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{qr.nodeName}</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>{qr.building}</div>
                      <div className="flex gap-3 mt-1" style={{ fontSize: 10, color: "#94A3B8" }}>
                        <span><Scan size={9} style={{ display: "inline", marginRight: 2 }} />{qr.scanCount} scans</span>
                        {qr.printed && <span style={{ color: "#10B981" }}><CheckCircle size={9} style={{ display: "inline", marginRight: 2 }} />Printed</span>}
                        {!qr.printed && <span style={{ color: "#F59E0B" }}><AlertTriangle size={9} style={{ display: "inline", marginRight: 2 }} />Not printed</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* QR detail / preview */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {selected ? (
            <div style={{ maxWidth: 760 }}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 style={{ color: "#0F172A", fontSize: 16, fontWeight: 700, margin: 0 }}>{selected.id} — {selected.nodeName}</h2>
                  <div style={{ color: "#94A3B8", fontSize: 12 }}>{selected.building} · Floor {selected.floor} · Node {selected.nodeId}</div>
                </div>
                <div className="flex gap-2">
                  <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                    <RefreshCw size={12} /> Regenerate
                  </button>
                  <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                    <Printer size={12} /> Print
                  </button>
                  <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "#1C6BEB", border: "none", borderRadius: 6, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20 }}>
                {/* QR Preview card */}
                <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 12, padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: 260 }}>
                  {/* Printable QR */}
                  <div
                    style={{
                      background: "white",
                      border: "2px solid #E2E8F0",
                      borderRadius: 10,
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 20, height: 20, background: "linear-gradient(135deg, #1C6BEB, #06B6D4)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <QrCode size={11} color="white" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: "0.05em" }}>NAVI</span>
                    </div>
                    <QRCodeSVG value={selected.qrCode} size={140} />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{selected.nodeName}</div>
                      <div style={{ fontSize: 10, color: "#64748B" }}>{selected.building}</div>
                      <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: "monospace", marginTop: 4 }}>{selected.qrCode}</div>
                    </div>
                    <div style={{ fontSize: 9, color: "#CBD5E1", textAlign: "center" }}>Scan to navigate · ASU Ibajay Campus</div>
                  </div>

                  <div style={{ display: "flex", gap: 6, width: "100%" }}>
                    <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 5, color: "#64748B", fontSize: 11, cursor: "pointer" }}>
                      <Eye size={11} /> Preview
                    </button>
                    <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 5, color: "#64748B", fontSize: 11, cursor: "pointer" }}>
                      <Copy size={11} /> Copy URL
                    </button>
                  </div>
                </div>

                {/* Details + stats */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* QR info */}
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px" }}>
                    <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px" }}>Checkpoint Details</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[
                        { label: "QR Code ID", value: selected.id },
                        { label: "Node ID", value: selected.nodeId },
                        { label: "Building", value: selected.building },
                        { label: "Floor Level", value: selected.floor === 0 ? "Ground" : `Floor ${selected.floor}` },
                        { label: "Status", value: STATUS_CONFIG[selected.status].label },
                        { label: "Printed", value: selected.printed ? "Yes" : "No" },
                        { label: "Last Scan", value: selected.lastScan ?? "Never" },
                        { label: "Total Scans", value: String(selected.scanCount) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: "#F8FAFC", borderRadius: 6, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 4, fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* QR Code value */}
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px" }}>
                    <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>QR Code Value</h3>
                    <div style={{ background: "#0F172A", borderRadius: 7, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#06B6D4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>{selected.qrCode}</span>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#475569" }}>
                        <Copy size={13} />
                      </button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: "#94A3B8" }}>
                      Scan URL: <span style={{ color: "#1C6BEB" }}>https://navi.asu-ibajay.edu.ph/qr/{selected.qrCode}</span>
                    </div>
                  </div>

                  {/* Scan activity */}
                  <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px" }}>
                    <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Recent Scan Activity</h3>
                    {selected.scanCount > 0 ? (
                      <div>
                        {[
                          { time: "14:32", device: "Android · Chrome", action: "Routed to COE" },
                          { time: "13:15", device: "iOS · Safari", action: "Opened directory" },
                          { time: "12:08", device: "Android · Firefox", action: "Routed to Library" },
                          { time: "11:44", device: "iOS · Chrome", action: "Routed to Admin" },
                        ].map((scan, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < 3 ? "1px solid #F8FAFC" : "none" }}>
                            <Clock size={12} color="#94A3B8" style={{ marginTop: 2, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, color: "#0F172A" }}>{scan.action}</div>
                              <div style={{ fontSize: 10, color: "#94A3B8" }}>{scan.time} · {scan.device}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "20px", color: "#94A3B8", fontSize: 13 }}>
                        No scans recorded yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: "#94A3B8" }}>
              <QrCode size={40} opacity={0.3} />
              <p style={{ fontSize: 14 }}>Select a QR checkpoint to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
