import { useState } from "react";
import {
  MapPin,
  Building2,
  QrCode,
  Camera,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  Wifi,
  Database,
  RefreshCw,
  Map,
  Route,
  Layers,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { ScreenName } from "../../types/screens";

const nodeActivityData = [
  { time: "08:00", scans: 12, routes: 8 },
  { time: "09:00", scans: 34, routes: 22 },
  { time: "10:00", scans: 51, routes: 38 },
  { time: "11:00", scans: 43, routes: 31 },
  { time: "12:00", scans: 68, routes: 47 },
  { time: "13:00", scans: 55, routes: 40 },
  { time: "14:00", scans: 72, routes: 55 },
  { time: "15:00", scans: 49, routes: 36 },
  { time: "16:00", scans: 38, routes: 28 },
  { time: "17:00", scans: 22, routes: 15 },
];

const buildingUsageData = [
  { name: "Admin", nodes: 12, scans: 89 },
  { name: "LRC", nodes: 8, scans: 145 },
  { name: "CAS", nodes: 15, scans: 203 },
  { name: "COE", nodes: 11, scans: 167 },
  { name: "SCI", nodes: 9, scans: 98 },
  { name: "GYM", nodes: 5, scans: 54 },
  { name: "SC", nodes: 7, scans: 132 },
];

const nodeTypeData = [
  { name: "Entrance", value: 28, color: "#1C6BEB" },
  { name: "Intersection", value: 19, color: "#06B6D4" },
  { name: "Staircase", value: 14, color: "#10B981" },
  { name: "Room", value: 22, color: "#F59E0B" },
  { name: "Elevator", value: 6, color: "#8B5CF6" },
  { name: "Outdoor", value: 11, color: "#64748B" },
];

const recentActivity = [
  { type: "node", action: "Node N047 added", location: "COE Building, Floor 2", time: "2 min ago", status: "success" },
  { type: "qr", action: "QR checkpoint scanned", location: "Main Plaza (N011)", time: "5 min ago", status: "info" },
  { type: "panorama", action: "Panorama uploaded", location: "Library Entrance (N002)", time: "12 min ago", status: "success" },
  { type: "route", action: "Route validation failed", location: "N031 → N045 (disconnected)", time: "18 min ago", status: "error" },
  { type: "node", action: "Node N023 updated", location: "Admin Building, Floor 1", time: "24 min ago", status: "success" },
  { type: "building", action: "Building metadata edited", location: "Science Laboratory", time: "31 min ago", status: "info" },
  { type: "dataset", action: "Dataset exported", location: "Full GeoJSON backup", time: "1 hr ago", status: "success" },
];

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  trend?: string;
  trendUp?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, color, trend, trendUp }: StatCardProps) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #E2E8F0",
        borderRadius: 10,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
          borderRadius: "10px 10px 0 0",
        }}
      />
      <div className="flex items-start justify-between">
        <div
          style={{
            width: 40,
            height: 40,
            background: `${color}18`,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={18} color={color} />
        </div>
        {trend && (
          <div
            style={{
              fontSize: 11,
              color: trendUp ? "#10B981" : "#EF4444",
              background: trendUp ? "#DCFCE7" : "#FEE2E2",
              padding: "2px 8px",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontWeight: 600,
            }}
          >
            <TrendingUp size={10} />
            {trend}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 13, color: "#64748B", marginTop: 4, fontWeight: 500 }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

const activityIcon = (type: string) => {
  switch (type) {
    case "node": return MapPin;
    case "qr": return QrCode;
    case "panorama": return Camera;
    case "route": return Route;
    case "building": return Building2;
    case "dataset": return Database;
    default: return Activity;
  }
};

const activityColor = (status: string) => {
  switch (status) {
    case "success": return "#10B981";
    case "error": return "#EF4444";
    case "info": return "#1C6BEB";
    default: return "#64748B";
  }
};

interface DashboardProps {
  onNavigate: (screen: ScreenName) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#F1F5F9",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Page header */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #E2E8F0",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ color: "#0F172A", fontSize: 18, fontWeight: 700, margin: 0 }}>
            System Dashboard
          </h1>
          <p style={{ color: "#64748B", fontSize: 12, margin: "2px 0 0" }}>
            NAVI · Aklan State University – Ibajay Campus · Last updated: just now
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" style={{ color: "#10B981", fontSize: 12, background: "#DCFCE7", padding: "5px 10px", borderRadius: 6 }}>
            <CheckCircle size={12} />
            All Systems Operational
          </div>
          <button
            onClick={doRefresh}
            style={{
              background: "#F1F5F9",
              border: "1px solid #E2E8F0",
              borderRadius: 6,
              padding: "6px 12px",
              color: "#64748B",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <StatCard
            icon={MapPin}
            label="Navigation Nodes"
            value="100"
            sub="15 floors · 8 buildings"
            color="#1C6BEB"
            trend="+8 this week"
            trendUp
          />
          <StatCard
            icon={Building2}
            label="Campus Buildings"
            value="8"
            sub="23 total floors mapped"
            color="#8B5CF6"
            trend="+1 new"
            trendUp
          />
          <StatCard
            icon={QrCode}
            label="QR Checkpoints"
            value="47"
            sub="39 active · 8 pending"
            color="#06B6D4"
            trend="+5 this week"
            trendUp
          />
          <StatCard
            icon={Camera}
            label="Panoramas"
            value="34"
            sub="28 linked to nodes"
            color="#F59E0B"
            trend="3 unlinked"
            trendUp={false}
          />
        </div>

        {/* Main content row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 320px", gap: 16 }}>
          {/* Activity chart */}
          <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px 20px" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: 0 }}>Navigation Activity</h3>
                <p style={{ color: "#94A3B8", fontSize: 11, margin: "2px 0 0" }}>QR scans & route requests today</p>
              </div>
              <div className="flex gap-3" style={{ fontSize: 11 }}>
                <span style={{ color: "#1C6BEB" }}>● QR Scans</span>
                <span style={{ color: "#06B6D4" }}>● Route Requests</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={nodeActivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0F172A", border: "none", borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: "#94A3B8" }}
                  itemStyle={{ color: "#E2E8F0" }}
                />
                <Line type="monotone" dataKey="scans" stroke="#1C6BEB" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="routes" stroke="#06B6D4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Building usage */}
          <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px 20px" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: 0 }}>Building Usage</h3>
                <p style={{ color: "#94A3B8", fontSize: 11, margin: "2px 0 0" }}>Nodes & scans per building</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={buildingUsageData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0F172A", border: "none", borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: "#94A3B8" }}
                  itemStyle={{ color: "#E2E8F0" }}
                />
                <Bar dataKey="scans" fill="#1C6BEB" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Node type distribution */}
          <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Node Types</h3>
            <p style={{ color: "#94A3B8", fontSize: 11, margin: "0 0 12px" }}>Distribution by category</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <PieChart width={140} height={140}>
                <Pie data={nodeTypeData} cx={70} cy={70} innerRadius={42} outerRadius={65} dataKey="value">
                  {nodeTypeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {nodeTypeData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                    <span style={{ fontSize: 11, color: "#64748B" }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#0F172A" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
          {/* Recent activity */}
          <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "18px 20px" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: 0 }}>Recent Activity</h3>
              <button style={{ background: "none", border: "none", color: "#1C6BEB", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {recentActivity.map((item, i) => {
                const Icon = activityIcon(item.type);
                const color = activityColor(item.status);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: i < recentActivity.length - 1 ? "1px solid #F1F5F9" : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        background: `${color}15`,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={13} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500 }}>{item.action}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{item.location}</div>
                    </div>
                    <div className="flex items-center gap-1" style={{ color: "#94A3B8", fontSize: 11, flexShrink: 0 }}>
                      <Clock size={10} />
                      {item.time}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* System health */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Dataset health */}
            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "16px 18px" }}>
              <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 14px" }}>Dataset Health</h3>
              {[
                { label: "Graph Connectivity", value: 94, color: "#10B981" },
                { label: "QR Coverage", value: 78, color: "#1C6BEB" },
                { label: "Panorama Linkage", value: 62, color: "#F59E0B" },
                { label: "Floor Coverage", value: 85, color: "#06B6D4" },
              ].map((item) => (
                <div key={item.label} style={{ marginBottom: 10 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#64748B" }}>{item.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{item.value}%</span>
                  </div>
                  <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${item.value}%`,
                        background: item.color,
                        borderRadius: 3,
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "16px 18px" }}>
              <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Quick Actions</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Open Map Editor", icon: Map, screen: "map-editor" as ScreenName, color: "#1C6BEB" },
                  { label: "Add QR Checkpoint", icon: QrCode, screen: "qr" as ScreenName, color: "#06B6D4" },
                  { label: "Test Route", icon: Route, screen: "routes" as ScreenName, color: "#10B981" },
                  { label: "Export Dataset", icon: Database, screen: "dataset" as ScreenName, color: "#F59E0B" },
                ].map(({ label, icon: Icon, screen, color }) => (
                  <button
                    key={label}
                    onClick={() => onNavigate(screen)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      borderRadius: 6,
                      cursor: "pointer",
                      color: "#0F172A",
                      fontSize: 12,
                      fontWeight: 500,
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        background: `${color}18`,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={12} color={color} />
                    </div>
                    {label}
                    <ArrowRight size={12} style={{ marginLeft: "auto", color: "#94A3B8" }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Alerts */}
            <div
              style={{
                background: "rgba(239,68,68,0.05)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                gap: 10,
              }}
            >
              <AlertTriangle size={15} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#EF4444", marginBottom: 4 }}>
                  1 Disconnected Node
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                  Node N031 has no valid path connections. Check Route Testing.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
