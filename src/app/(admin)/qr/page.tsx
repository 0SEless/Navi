"use client"

import { useState, useMemo } from "react"
import { QrCode, Search, X, Camera, Check } from "lucide-react"
import { useGraphStore } from "@/store/graph-store"

export default function QRManagement() {
  const graph = useGraphStore((s) => s.graph)
  const [search, setSearch] = useState("")

  const qrNodes = useMemo(() => {
    return graph.nodes.filter((n) => n.hasQr).filter((n) =>
      !search || n.name.toLowerCase().includes(search.toLowerCase()) || n.id.toLowerCase().includes(search.toLowerCase())
    )
  }, [graph.nodes, search])

  const activeCount = qrNodes.length
  const totalNodes = graph.nodes.length

  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>QR Checkpoints</h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: "2px 0 0" }}>
            {activeCount} active QR codes · {totalNodes} total nodes
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#111827", border: "1px solid #1E3A5F", borderRadius: 6, padding: "0 10px" }}>
          <Search size={14} color="#475569" />
          <input
            placeholder="Search QR checkpoints by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", padding: "8px 8px", color: "#E2E8F0", fontSize: 12, outline: "none" }}
          />
          {search && <X size={14} color="#475569" style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1E293B" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>NODE</th>
              <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>NAME</th>
              <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>TYPE</th>
              <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>FLOOR</th>
              <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>BUILDING</th>
              <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {qrNodes.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 48, color: "#475569" }}>
                  <QrCode size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                  <p style={{ fontSize: 13 }}>No QR checkpoints found</p>
                </td>
              </tr>
            ) : qrNodes.map((node) => (
              <tr key={node.id} style={{ borderBottom: "1px solid #1E293B" }}>
                <td style={{ padding: "10px", color: "#60A5FA", fontSize: 12, fontWeight: 600 }}>{node.id}</td>
                <td style={{ padding: "10px", color: "#E2E8F0", fontSize: 12 }}>{node.name}</td>
                <td style={{ padding: "10px" }}>
                  <span style={{ background: "#1E293B", borderRadius: 3, padding: "2px 6px", fontSize: 10, color: "#94A3B8" }}>{node.type.replace("_", " ")}</span>
                </td>
                <td style={{ padding: "10px", color: "#94A3B8", fontSize: 11 }}>{node.floor === 0 ? "G" : node.floor}</td>
                <td style={{ padding: "10px", color: "#94A3B8", fontSize: 11 }}>{node.buildingId ?? "-"}</td>
                <td style={{ padding: "10px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(16,185,129,0.1)", color: "#10B981", borderRadius: 3, padding: "2px 6px", fontSize: 10, fontWeight: 500 }}>
                    <Check size={10} />
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
