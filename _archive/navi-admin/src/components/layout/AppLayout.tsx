import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  LayoutDashboard,
  Map,
  Building2,
  Layers,
  Camera,
  QrCode,
  Route,
  Database,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Settings,
  User,
  LogOut,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { ScreenName } from "../../types/screens";
import { useAuth } from "../../hooks/useAuth";

interface NavItem {
  id: ScreenName;
  label: string;
  icon: React.ElementType;
  badge?: number;
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { id: "map-editor", label: "Map Editor", icon: Map, group: "Navigation" },
  { id: "buildings", label: "Buildings", icon: Building2, group: "Navigation" },
  { id: "floors", label: "Floor Layers", icon: Layers, group: "Navigation" },
  { id: "panoramas", label: "Panoramas", icon: Camera, badge: 3, group: "Media" },
  { id: "qr", label: "QR Checkpoints", icon: QrCode, group: "Media" },
  { id: "routes", label: "Route Testing", icon: Route, group: "Tools" },
  { id: "dataset", label: "Dataset Mgmt", icon: Database, group: "Tools" },
];

interface AppLayoutProps {
  currentScreen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  children: React.ReactNode;
}

export function AppLayout({ currentScreen, onNavigate, children }: AppLayoutProps) {
  const { logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const groups = ["Overview", "Navigation", "Media", "Tools"];

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ width: "100vw", height: "100vh", background: "#F1F5F9" }}
    >
      {/* Top Header */}
      <header
        style={{
          background: "#0A0F1E",
          borderBottom: "1px solid #1E3A5F",
          height: 52,
          flexShrink: 0,
        }}
        className="flex items-center px-4 gap-4"
      >
        {/* Brand */}
        <div className="flex items-center gap-3" style={{ minWidth: sidebarCollapsed ? 52 : 220 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, #1C6BEB 0%, #06B6D4 100%)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Route size={18} color="white" />
          </div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ color: "#F8FAFC", fontSize: 15, fontWeight: 700, lineHeight: 1.1, letterSpacing: "0.05em" }}>
                NAVI
              </div>
              <div style={{ color: "#64748B", fontSize: 10, letterSpacing: "0.08em" }}>
                ADMIN CONSOLE
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 flex-1 max-w-sm"
          style={{
            background: "#111827",
            border: "1px solid #1E3A5F",
            borderRadius: 6,
            padding: "6px 12px",
          }}
        >
          <Search size={14} color="#64748B" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes, buildings, QR codes..."
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#94A3B8",
              fontSize: 13,
              width: "100%",
            }}
          />
          <span style={{ color: "#334155", fontSize: 11, background: "#1E293B", padding: "1px 6px", borderRadius: 4 }}>
            ⌘K
          </span>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5" style={{ color: "#10B981", fontSize: 12 }}>
            <Wifi size={13} />
            <span>System Online</span>
          </div>
          <div
            style={{
              width: 1,
              height: 20,
              background: "#1E293B",
            }}
          />
          <div className="flex items-center gap-1" style={{ color: "#F59E0B", fontSize: 12 }}>
            <Activity size={13} />
            <span>ASU Ibajay</span>
          </div>
          <div style={{ width: 1, height: 20, background: "#1E293B" }} />
          <button
            style={{
              position: "relative",
              background: "#111827",
              border: "1px solid #1E293B",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
              color: "#94A3B8",
            }}
          >
            <Bell size={15} />
            <span
              style={{
                position: "absolute",
                top: -3,
                right: -3,
                background: "#EF4444",
                borderRadius: "50%",
                width: 14,
                height: 14,
                fontSize: 9,
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}
            >
              2
            </span>
          </button>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 30,
                height: 30,
                background: "linear-gradient(135deg, #1C6BEB, #06B6D4)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <User size={14} color="white" />
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ color: "#F8FAFC", fontSize: 12, fontWeight: 600 }}>Admin User</div>
              <div style={{ color: "#64748B", fontSize: 10 }}>System Administrator</div>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          style={{
            width: sidebarCollapsed ? 56 : 220,
            background: "#0D1526",
            borderRight: "1px solid #1E3A5F",
            flexShrink: 0,
            transition: "width 0.2s ease",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Collapse toggle */}
          <div
            style={{
              display: "flex",
              justifyContent: sidebarCollapsed ? "center" : "flex-end",
              padding: "8px 8px 4px",
            }}
          >
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: "#1E293B",
                border: "1px solid #334155",
                borderRadius: 4,
                padding: 4,
                cursor: "pointer",
                color: "#64748B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            </button>
          </div>

          {/* Nav groups */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "4px 8px" }}>
            {groups.map((group) => {
              const items = NAV_ITEMS.filter((i) => i.group === group);
              return (
                <div key={group} style={{ marginBottom: 16 }}>
                  {!sidebarCollapsed && (
                    <div
                      style={{
                        color: "#475569",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        padding: "4px 8px",
                        marginBottom: 2,
                      }}
                    >
                      {group.toUpperCase()}
                    </div>
                  )}
                  {sidebarCollapsed && (
                    <div style={{ borderTop: "1px solid #1E293B", margin: "4px 0" }} />
                  )}
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentScreen === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        title={sidebarCollapsed ? item.label : undefined}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: sidebarCollapsed ? "8px" : "7px 10px",
                          borderRadius: 6,
                          border: "none",
                          cursor: "pointer",
                          background: isActive
                            ? "linear-gradient(135deg, rgba(28,107,235,0.25) 0%, rgba(6,182,212,0.1) 100%)"
                            : "transparent",
                          color: isActive ? "#60A5FA" : "#94A3B8",
                          justifyContent: sidebarCollapsed ? "center" : "flex-start",
                          marginBottom: 2,
                          position: "relative",
                          boxShadow: isActive ? "inset 0 0 0 1px rgba(28,107,235,0.3)" : "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {isActive && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: "20%",
                              height: "60%",
                              width: 3,
                              background: "linear-gradient(180deg, #1C6BEB, #06B6D4)",
                              borderRadius: "0 2px 2px 0",
                            }}
                          />
                        )}
                        <Icon size={15} />
                        {!sidebarCollapsed && (
                          <>
                            <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, flex: 1, textAlign: "left" }}>
                              {item.label}
                            </span>
                            {item.badge && (
                              <span
                                style={{
                                  background: "#1C6BEB",
                                  color: "white",
                                  borderRadius: 10,
                                  fontSize: 10,
                                  padding: "1px 6px",
                                  fontWeight: 700,
                                }}
                              >
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Bottom actions */}
          <div style={{ padding: "8px", borderTop: "1px solid #1E293B" }}>
            <button
              onClick={logout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: sidebarCollapsed ? "8px" : "7px 10px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: "transparent",
                color: "#EF4444",
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
              }}
            >
              <LogOut size={14} />
              {!sidebarCollapsed && <span style={{ fontSize: 13 }}>Sign Out</span>}
            </button>
            <button
              onClick={logout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: sidebarCollapsed ? "8px" : "7px 10px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: "transparent",
                color: "#EF4444",
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
              }}
            >
              <LogOut size={14} />
              {!sidebarCollapsed && <span style={{ fontSize: 13 }}>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
      </div>
    </div>
  );
}
