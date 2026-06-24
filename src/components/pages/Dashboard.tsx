import { useState } from "react";
import {
  MapPin, Building2, QrCode, Camera, Activity, TrendingUp, AlertTriangle,
  CheckCircle, Clock, ArrowRight, RefreshCw, Route, Database,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type { ScreenName } from "@/types/screens";

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
  { name: "Entrance", value: 28, color: "var(--navi-primary)" },
  { name: "Intersection", value: 19, color: "#06B6D4" },
  { name: "Staircase", value: 14, color: "#059669" },
  { name: "Room", value: 22, color: "#D97706" },
  { name: "Elevator", value: 6, color: "#7C3AED" },
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
    <div style={{ background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, background: `${color}12`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={16} color={color} />
        </div>
        {trend && (
          <div style={{ marginLeft: "auto", fontSize: 11, color: trendUp ? "var(--navi-success)" : "var(--navi-error)", background: trendUp ? "#ECFDF5" : "#FEF2F2", padding: "2px 7px", borderRadius: 10, display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
            <TrendingUp size={10} />
            {trend}
          </div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--navi-text)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--navi-text-secondary)", marginTop: 4, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--navi-text-secondary)", marginTop: 1, opacity: 0.7 }}>{sub}</div>}
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
    case "success": return "var(--navi-success)";
    case "error": return "var(--navi-error)";
    case "info": return "var(--navi-primary)";
    default: return "var(--navi-text-secondary)";
  }
};

interface DashboardProps {
  onNavigate: (screen: ScreenName) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1200); };

  return (
    <div style={{ height: "100%", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Page header */}
      <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--navi-text)", margin: 0 }}>Dashboard</h1>
          <p style={{ color: "var(--navi-text-secondary)", fontSize: 12, margin: "2px 0 0" }}>NAVI · ASU Ibajay Campus</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--navi-success)", fontSize: 11, background: "#ECFDF5", padding: "4px 10px", borderRadius: 6 }}>
            <CheckCircle size={11} />
            All Systems Operational
          </div>
          <button onClick={doRefresh} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 6, color: "var(--navi-text-secondary)", fontSize: 11, cursor: "pointer" }}>
            <RefreshCw size={11} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatCard icon={MapPin} label="Navigation Nodes" value="100" sub="15 floors · 8 buildings" color="var(--navi-primary)" trend="+8" trendUp />
          <StatCard icon={Building2} label="Campus Buildings" value="8" sub="23 total floors mapped" color="#7C3AED" trend="+1" trendUp />
          <StatCard icon={QrCode} label="QR Checkpoints" value="47" sub="39 active · 8 pending" color="#06B6D4" trend="+5" trendUp />
          <StatCard icon={Camera} label="Panoramas" value="34" sub="28 linked to nodes" color="#D97706" trend="3 unlinked" trendUp={false} />
        </div>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 300px", gap: 12 }}>
          {/* Activity chart */}
          <div style={{ background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--navi-text)", margin: 0 }}>Navigation Activity</h3>
                <p style={{ color: "var(--navi-text-secondary)", fontSize: 11, margin: "2px 0 0" }}>QR scans & route requests today</p>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
                <span style={{ color: "var(--navi-primary)" }}>● QR Scans</span>
                <span style={{ color: "#06B6D4" }}>● Route Requests</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={nodeActivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--navi-content)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--navi-text-secondary)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--navi-text-secondary)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--navi-sidebar)", border: "none", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--navi-text-sidebar)" }} itemStyle={{ color: "var(--navi-text-sidebar-active)" }} />
                <Line type="monotone" dataKey="scans" stroke="var(--navi-primary)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="routes" stroke="#06B6D4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Building usage */}
          <div style={{ background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--navi-text)", margin: 0 }}>Building Usage</h3>
              <p style={{ color: "var(--navi-text-secondary)", fontSize: 11, margin: "2px 0 0" }}>Nodes & scans per building</p>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={buildingUsageData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--navi-content)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--navi-text-secondary)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--navi-text-secondary)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--navi-sidebar)", border: "none", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--navi-text-sidebar)" }} itemStyle={{ color: "var(--navi-text-sidebar-active)" }} />
                <Bar dataKey="scans" fill="var(--navi-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Node type distribution */}
          <div style={{ background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 10, padding: "16px 18px" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--navi-text)", margin: "0 0 2px" }}>Node Types</h3>
            <p style={{ color: "var(--navi-text-secondary)", fontSize: 11, margin: "0 0 10px" }}>Distribution by category</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <PieChart width={130} height={130}>
                <Pie data={nodeTypeData} cx={65} cy={65} innerRadius={38} outerRadius={60} dataKey="value">
                  {nodeTypeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
              {nodeTypeData.map((item) => (
                <div key={item.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: item.color }} />
                    <span style={{ fontSize: 11, color: "var(--navi-text-secondary)" }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navi-text)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
          {/* Recent activity */}
          <div style={{ background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--navi-text)", margin: 0 }}>Recent Activity</h3>
              <button style={{ background: "none", border: "none", color: "var(--navi-primary)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                View all <ArrowRight size={11} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {recentActivity.map((item, i) => {
                const Icon = activityIcon(item.type);
                const color = activityColor(item.status);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < recentActivity.length - 1 ? "1px solid var(--navi-content)" : "none" }}>
                    <div style={{ width: 28, height: 28, background: `${color}12`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={12} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--navi-text)", fontWeight: 500 }}>{item.action}</div>
                      <div style={{ fontSize: 11, color: "var(--navi-text-secondary)" }}>{item.location}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--navi-text-secondary)", fontSize: 10, flexShrink: 0 }}>
                      <Clock size={9} />
                      {item.time}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Dataset health */}
            <div style={{ background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 10, padding: "14px 16px" }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--navi-text)", margin: "0 0 12px" }}>Dataset Health</h3>
              {[
                { label: "Graph Connectivity", value: 94, color: "var(--navi-success)" },
                { label: "QR Coverage", value: 78, color: "var(--navi-primary)" },
                { label: "Panorama Linkage", value: 62, color: "#D97706" },
                { label: "Floor Coverage", value: 85, color: "#06B6D4" },
              ].map((item) => (
                <div key={item.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "var(--navi-text-secondary)" }}>{item.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navi-text)" }}>{item.value}%</span>
                  </div>
                  <div style={{ height: 4, background: "var(--navi-content)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${item.value}%`, background: item.color, borderRadius: 2, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ background: "var(--navi-card)", border: "1px solid var(--navi-border)", borderRadius: 10, padding: "14px 16px" }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--navi-text)", margin: "0 0 10px" }}>Quick Actions</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { label: "Add QR Checkpoint", icon: QrCode, screen: "qr" as ScreenName, color: "#06B6D4" },
                  { label: "Test Route", icon: Route, screen: "routes" as ScreenName, color: "var(--navi-success)" },
                  { label: "Export Dataset", icon: Database, screen: "dataset" as ScreenName, color: "#D97706" },
                ].map(({ label, icon: Icon, screen, color }) => (
                  <button key={label} onClick={() => onNavigate(screen)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--navi-content)", border: "1px solid transparent", borderRadius: 6, cursor: "pointer", color: "var(--navi-text)", fontSize: 12 }}>
                    <div style={{ width: 22, height: 22, background: `${color}12`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={11} color={color} />
                    </div>
                    <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
                    <ArrowRight size={10} color="var(--navi-text-secondary)" />
                  </button>
                ))}
              </div>
            </div>

            {/* Alert */}
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8 }}>
              <AlertTriangle size={13} color="var(--navi-error)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--navi-error)", marginBottom: 2 }}>1 Disconnected Node</div>
                <div style={{ fontSize: 11, color: "var(--navi-text-secondary)" }}>Node N031 has no valid path connections.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
