import { useState } from "react";
import {
  Database,
  Download,
  Upload,
  FileJson,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  Shield,
  Archive,
  Play,
  Trash2,
  Plus,
  Copy,
  ChevronDown,
  ChevronRight,
  Server,
  HardDrive,
  Activity,
  FileText,
} from "lucide-react";

interface Backup {
  id: string;
  name: string;
  type: "auto" | "manual";
  size: string;
  nodes: number;
  edges: number;
  created: string;
  status: "complete" | "in_progress";
}

const BACKUPS: Backup[] = [
  { id: "bk-001", name: "Full Dataset Backup", type: "manual", size: "284 KB", nodes: 100, edges: 148, created: "2025-05-17 08:00", status: "complete" },
  { id: "bk-002", name: "Auto Backup", type: "auto", size: "281 KB", nodes: 98, edges: 145, created: "2025-05-16 23:00", status: "complete" },
  { id: "bk-003", name: "Pre-migration Backup", type: "manual", size: "268 KB", nodes: 92, edges: 138, created: "2025-05-15 14:22", status: "complete" },
  { id: "bk-004", name: "Auto Backup", type: "auto", size: "261 KB", nodes: 89, edges: 135, created: "2025-05-15 23:00", status: "complete" },
  { id: "bk-005", name: "Auto Backup", type: "auto", size: "249 KB", nodes: 84, edges: 128, created: "2025-05-14 23:00", status: "complete" },
];

interface ValidationResult {
  category: string;
  status: "pass" | "warn" | "fail";
  message: string;
  count?: number;
}

const VALIDATION_RESULTS: ValidationResult[] = [
  { category: "Graph Connectivity", status: "warn", message: "1 node (N031) is disconnected from the main graph", count: 1 },
  { category: "Node Schema", status: "pass", message: "All 100 nodes have valid required fields" },
  { category: "Edge References", status: "pass", message: "All 148 edges reference valid node IDs" },
  { category: "QR Assignments", status: "warn", message: "8 nodes are missing QR checkpoint assignments", count: 8 },
  { category: "Panorama Links", status: "warn", message: "3 panoramas are unlinked to navigation nodes", count: 3 },
  { category: "Floor Coverage", status: "pass", message: "All configured floors have at least 1 navigation node" },
  { category: "Duplicate IDs", status: "pass", message: "No duplicate node or edge IDs found" },
  { category: "Coordinate Bounds", status: "pass", message: "All node coordinates are within canvas bounds" },
  { category: "Building References", status: "pass", message: "All building IDs in nodes reference valid buildings" },
  { category: "Staircase Connectors", status: "fail", message: "COE Floor 2 has no staircase connector to Floor 1" },
];

const SAMPLE_JSON = `{
  "version": "2.4.1",
  "campus": "ASU Ibajay",
  "exported": "2025-05-17T08:00:00Z",
  "nodes": [
    {
      "id": "N001",
      "name": "Admin Entrance",
      "type": "building_entrance",
      "buildingId": "admin",
      "floor": 1,
      "x": 733,
      "y": 155,
      "hasQR": true,
      "qrCode": "NAVI-ASU-N001-2025",
      "hasPanorama": true,
      "panoramaId": "pano-001"
    }
  ],
  "edges": [
    {
      "id": "E001",
      "from": "N001",
      "to": "N010",
      "type": "walkway",
      "weight": 140
    }
  ],
  "buildings": [...],
  "floors": [...]
}`;

export function DatasetManagement() {
  const [backups] = useState<Backup[]>(BACKUPS);
  const [activeTab, setActiveTab] = useState<"export" | "import" | "validate" | "backups">("export");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<"json" | "geojson" | "csv">("json");
  const [expandedJson, setExpandedJson] = useState(false);
  const [importDrag, setImportDrag] = useState(false);

  const runValidation = () => {
    setValidating(true);
    setValidated(false);
    setTimeout(() => {
      setValidating(false);
      setValidated(true);
    }, 2000);
  };

  const passCount = VALIDATION_RESULTS.filter((r) => r.status === "pass").length;
  const warnCount = VALIDATION_RESULTS.filter((r) => r.status === "warn").length;
  const failCount = VALIDATION_RESULTS.filter((r) => r.status === "fail").length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F1F5F9" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ color: "#0F172A", fontSize: 18, fontWeight: 700, margin: 0 }}>Dataset Management</h1>
          <p style={{ color: "#64748B", fontSize: 12, margin: "2px 0 0" }}>Import, export, validate, and backup the navigation dataset</p>
        </div>
        <div className="flex gap-2">
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, color: "#64748B" }}>
            <Server size={12} color="#10B981" /> 100 nodes · 148 edges · 284 KB
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "linear-gradient(135deg, #1C6BEB, #0891B2)", border: "none", borderRadius: 7, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Archive size={14} /> Create Backup
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "0 24px", display: "flex", gap: 0 }}>
        {([
          ["export", "Export Dataset", Download],
          ["import", "Import Dataset", Upload],
          ["validate", "Validate", CheckCircle],
          ["backups", "Backups", Archive],
        ] as [typeof activeTab, string, React.ElementType][]).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
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
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {/* EXPORT TAB */}
        {activeTab === "export" && (
          <div style={{ maxWidth: 800 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              {/* Format selector */}
              <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "20px" }}>
                <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Export Format</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { key: "json", label: "Navigation JSON", desc: "Full dataset including nodes, edges, buildings, floors", icon: FileJson, color: "#F59E0B" },
                    { key: "geojson", label: "GeoJSON", desc: "Geographic format for GIS tools and map viewers", icon: FileText, color: "#10B981" },
                    { key: "csv", label: "CSV Export", desc: "Spreadsheet-compatible node and edge tables", icon: FileText, color: "#1C6BEB" },
                  ].map(({ key, label, desc, icon: Icon, color }) => (
                    <div
                      key={key}
                      onClick={() => setSelectedFormat(key as typeof selectedFormat)}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 8,
                        border: selectedFormat === key ? `1px solid ${color}` : "1px solid #E2E8F0",
                        background: selectedFormat === key ? `${color}08` : "#FAFAFA",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ width: 34, height: 34, background: `${color}15`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={16} color={color} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{desc}</div>
                      </div>
                      {selectedFormat === key && <CheckCircle size={16} color={color} style={{ marginLeft: "auto", alignSelf: "center" }} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Export options */}
              <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "20px" }}>
                <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Include in Export</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Navigation Nodes (100)", checked: true },
                    { label: "Path Edges (148)", checked: true },
                    { label: "Building Metadata (8)", checked: true },
                    { label: "Floor Layers (23)", checked: true },
                    { label: "QR Checkpoint Data (47)", checked: true },
                    { label: "Panorama Metadata (34)", checked: false },
                    { label: "Schema Version Info", checked: true },
                  ].map(({ label, checked }, i) => (
                    <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <div style={{ width: 16, height: 16, background: checked ? "#1C6BEB" : "#F1F5F9", border: `1px solid ${checked ? "#1C6BEB" : "#CBD5E1"}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {checked && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                      </div>
                      <span style={{ fontSize: 13, color: "#0F172A" }}>{label}</span>
                    </label>
                  ))}
                </div>

                <button style={{ width: "100%", marginTop: 20, padding: "10px", background: "linear-gradient(135deg, #1C6BEB, #0891B2)", border: "none", borderRadius: 8, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <Download size={14} /> Export as {selectedFormat.toUpperCase()}
                </button>
              </div>
            </div>

            {/* JSON Preview */}
            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
              <div
                style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                onClick={() => setExpandedJson(!expandedJson)}
              >
                <div className="flex items-center gap-2">
                  <FileJson size={14} color="#F59E0B" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>JSON Preview</span>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>navi_dataset_2025-05-17.json</span>
                </div>
                <div className="flex gap-2">
                  <button style={{ background: "none", border: "1px solid #E2E8F0", borderRadius: 5, padding: "3px 8px", color: "#64748B", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                    <Copy size={10} /> Copy
                  </button>
                  {expandedJson ? <ChevronDown size={14} color="#94A3B8" /> : <ChevronRight size={14} color="#94A3B8" />}
                </div>
              </div>
              {expandedJson && (
                <pre style={{ background: "#0F172A", color: "#94A3B8", padding: "18px", fontSize: 11, lineHeight: 1.7, overflowX: "auto", margin: 0, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                  {SAMPLE_JSON.split("\n").map((line, i) => {
                    const coloredLine = line
                      .replace(/"([^"]+)":/g, '<span style="color:#60A5FA">"$1"</span>:')
                      .replace(/: "([^"]+)"/g, ': <span style="color:#34D399">"$1"</span>')
                      .replace(/: (\d+)/g, ': <span style="color:#FB923C">$1</span>')
                      .replace(/: (true|false)/g, ': <span style="color:#A78BFA">$1</span>');
                    return <div key={i} dangerouslySetInnerHTML={{ __html: coloredLine }} />;
                  })}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* IMPORT TAB */}
        {activeTab === "import" && (
          <div style={{ maxWidth: 700 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setImportDrag(true); }}
              onDragLeave={() => setImportDrag(false)}
              onDrop={(e) => { e.preventDefault(); setImportDrag(false); }}
              style={{
                border: `2px dashed ${importDrag ? "#1C6BEB" : "#CBD5E1"}`,
                borderRadius: 12,
                padding: "60px 40px",
                textAlign: "center",
                background: importDrag ? "#EFF6FF" : "white",
                cursor: "pointer",
                marginBottom: 20,
                transition: "all 0.2s",
              }}
            >
              <Upload size={36} color={importDrag ? "#1C6BEB" : "#94A3B8"} style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", marginBottom: 8 }}>Drop dataset file here</div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>Supports JSON, GeoJSON, and CSV formats</div>
              <button style={{ padding: "9px 24px", background: "#1C6BEB", border: "none", borderRadius: 7, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Browse Files</button>
            </div>

            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "20px" }}>
              <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px" }}>Import Options</h3>
              {[
                { label: "Validate before importing", desc: "Run schema validation before applying changes", checked: true },
                { label: "Create backup before import", desc: "Automatically backup current dataset first", checked: true },
                { label: "Merge with existing data", desc: "Add imported nodes/edges to existing dataset (don't replace)", checked: false },
                { label: "Override node positions", desc: "Update x,y coordinates of existing nodes", checked: true },
              ].map(({ label, desc, checked }, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < 3 ? "1px solid #F8FAFC" : "none" }}>
                  <div style={{ width: 18, height: 18, background: checked ? "#1C6BEB" : "#F1F5F9", border: `1px solid ${checked ? "#1C6BEB" : "#CBD5E1"}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, cursor: "pointer" }}>
                    {checked && <svg width="11" height="9" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VALIDATE TAB */}
        {activeTab === "validate" && (
          <div style={{ maxWidth: 760 }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ color: "#0F172A", fontSize: 16, fontWeight: 700, margin: 0 }}>Dataset Validation</h2>
              <button
                onClick={runValidation}
                disabled={validating}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 18px",
                  background: validating ? "#F1F5F9" : "linear-gradient(135deg, #1C6BEB, #0891B2)",
                  border: "none",
                  borderRadius: 7,
                  color: validating ? "#64748B" : "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: validating ? "default" : "pointer",
                }}
              >
                {validating ? <RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
                {validating ? "Validating..." : "Run Validation"}
              </button>
            </div>

            {validated && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Passed", value: passCount, color: "#10B981", bg: "#DCFCE7", icon: CheckCircle },
                  { label: "Warnings", value: warnCount, color: "#F59E0B", bg: "#FEF9C3", icon: AlertTriangle },
                  { label: "Failures", value: failCount, color: "#EF4444", bg: "#FEE2E2", icon: XCircle },
                ].map(({ label, value, color, bg, icon: Icon }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${color}40`, borderRadius: 10, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                    <Icon size={24} color={color} />
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                      <div style={{ fontSize: 12, color, opacity: 0.8 }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
              {!validated && !validating && (
                <div style={{ padding: "48px", textAlign: "center", color: "#94A3B8" }}>
                  <Activity size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                  <div style={{ fontSize: 14 }}>Click "Run Validation" to analyze dataset integrity</div>
                </div>
              )}
              {validating && (
                <div style={{ padding: "48px", textAlign: "center" }}>
                  <div style={{ width: 36, height: 36, border: "3px solid #E2E8F0", borderTopColor: "#1C6BEB", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
                  <div style={{ fontSize: 14, color: "#64748B" }}>Analyzing navigation graph...</div>
                </div>
              )}
              {validated && VALIDATION_RESULTS.map((result, i) => {
                const config = {
                  pass: { color: "#10B981", bg: "#F0FDF4", icon: CheckCircle },
                  warn: { color: "#F59E0B", bg: "#FFFBEB", icon: AlertTriangle },
                  fail: { color: "#EF4444", bg: "#FEF2F2", icon: XCircle },
                }[result.status];
                const Icon = config.icon;
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "12px 18px", borderBottom: i < VALIDATION_RESULTS.length - 1 ? "1px solid #F8FAFC" : "none", background: result.status !== "pass" ? config.bg : "white" }}>
                    <Icon size={16} color={config.color} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{result.category}</div>
                      <div style={{ fontSize: 12, color: "#64748B" }}>{result.message}</div>
                    </div>
                    {result.count !== undefined && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: config.color, flexShrink: 0 }}>{result.count}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BACKUPS TAB */}
        {activeTab === "backups" && (
          <div style={{ maxWidth: 800 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Total Backups", value: backups.length, icon: HardDrive, color: "#1C6BEB" },
                { label: "Total Size", value: "1.34 MB", icon: Database, color: "#8B5CF6" },
                { label: "Last Backup", value: "Today 08:00", icon: Clock, color: "#10B981" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 38, height: 38, background: `${color}15`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={18} color={color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{value}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Auto-backup config */}
            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px", marginBottom: 16 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={15} color="#1C6BEB" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Automatic Backup Schedule</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#10B981" }}>Enabled</span>
                  <div style={{ width: 36, height: 20, background: "#10B981", borderRadius: 10, position: "relative" }}>
                    <div style={{ position: "absolute", right: 2, top: 2, width: 16, height: 16, background: "white", borderRadius: "50%" }} />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { label: "Frequency", value: "Daily at 23:00" },
                  { label: "Retention", value: "30 days" },
                  { label: "Location", value: "Server local" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#F8FAFC", borderRadius: 7, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Backup list */}
            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Backup History</span>
                <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#1C6BEB", border: "none", borderRadius: 6, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={12} /> Create Backup
                </button>
              </div>
              {backups.map((bk, i) => (
                <div key={bk.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < backups.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                  <div style={{ width: 36, height: 36, background: bk.type === "manual" ? "#DBEAFE" : "#F1F5F9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Archive size={16} color={bk.type === "manual" ? "#1C6BEB" : "#94A3B8"} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{bk.name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      <Clock size={9} style={{ display: "inline", marginRight: 3 }} />
                      {bk.created} · {bk.size} · {bk.nodes} nodes · {bk.edges} edges
                    </div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: bk.type === "manual" ? "#1C6BEB" : "#64748B", background: bk.type === "manual" ? "#DBEAFE" : "#F1F5F9", padding: "2px 7px", borderRadius: 8 }}>
                    {bk.type === "manual" ? "Manual" : "Auto"}
                  </div>
                  <div className="flex gap-2">
                    <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 5, color: "#64748B", fontSize: 11, cursor: "pointer" }}>
                      <Download size={11} /> Download
                    </button>
                    <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 5, color: "#10B981", fontSize: 11, cursor: "pointer" }}>
                      <RefreshCw size={11} /> Restore
                    </button>
                    <button style={{ padding: "5px 8px", background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 5, color: "#EF4444", fontSize: 11, cursor: "pointer" }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
