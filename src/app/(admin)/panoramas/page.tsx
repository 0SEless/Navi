"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import { Camera, Search, X, Upload } from "lucide-react"
import { useGraphStore } from "@/store/graph-store"

export default function PanoramaManagement() {
  const graph = useGraphStore((s) => s.graph)
  const updateNode = useGraphStore((s) => s.updateNode)
  const [search, setSearch] = useState("")
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const panoramaNodes = useMemo(() => {
    return graph.nodes.filter((n) => n.hasPanorama).filter((n) =>
      !search || n.name.toLowerCase().includes(search.toLowerCase()) || n.id.toLowerCase().includes(search.toLowerCase())
    )
  }, [graph.nodes, search])

  const unlinkedCount = graph.nodes.filter((n) => !n.hasPanorama).length

  const handleUpload = useCallback((nodeId: string, file: File) => {
    setUploadingId(nodeId)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const node = graph.getNode(nodeId)
      if (node) {
        updateNode(nodeId, { metadata: { ...node.metadata, panoramaUrl: dataUrl } })
      }
      setUploadingId(null)
    }
    reader.readAsDataURL(file)
  }, [updateNode])

  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>Panorama Management</h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: "2px 0 0" }}>
            {panoramaNodes.length} linked · {unlinkedCount} unlinked nodes
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 6, padding: "0 10px" }}>
          <Search size={14} color="#475569" />
          <input
            placeholder="Search panoramas by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", padding: "8px 8px", color: "#E2E8F0", fontSize: 12, outline: "none" }}
          />
          {search && <X size={14} color="#475569" style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, alignContent: "start" }}>
        {panoramaNodes.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 48, color: "#475569" }}>
            <Camera size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No panoramas found</p>
          </div>
        ) : panoramaNodes.map((node) => {
          const panoramaUrl = node.metadata?.panoramaUrl as string | undefined;
          return (
          <div key={node.id} style={{ background: "#0D1526", border: "1px solid #1E293B", borderRadius: 8, padding: 12 }}>
            {panoramaUrl && (
              <div style={{ marginBottom: 8, borderRadius: 6, overflow: "hidden", height: 100, background: "#111827" }}>
                <img src={panoramaUrl} alt={node.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 8 }}>
              <Camera size={14} color="#8B5CF6" />
              <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 600, marginLeft: 4 }}>{node.name}</span>
              <span style={{ color: "#475569", fontSize: 10, marginLeft: "auto" }}>{node.id}</span>
            </div>
            <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
              <span style={{ background: "#1E293B", borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#94A3B8" }}>{node.type.replace("_", " ")}</span>
              <span style={{ background: "#1E293B", borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#94A3B8" }}>Floor {node.floor}</span>
              {node.buildingId && <span style={{ background: "#1E293B", borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#94A3B8" }}>{node.buildingId}</span>}
            </div>
            <div style={{ color: "#475569", fontSize: 10, marginBottom: 8 }}>
              {node.position.lat.toFixed(5)}, {node.position.lng.toFixed(5)}
            </div>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "5px", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 5, cursor: "pointer", fontSize: 10, color: "#A78BFA" }}>
              <Upload size={11} />
              {uploadingId === node.id ? "Uploading..." : panoramaUrl ? "Replace panorama" : "Upload panorama"}
              <input
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(node.id, file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          );
        })}
      </div>
    </div>
  )
}
