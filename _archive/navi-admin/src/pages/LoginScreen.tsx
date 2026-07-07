import { useState } from "react";
import { Route, Eye, EyeOff, Shield, Wifi, Lock, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@navi.app");
  const [password, setPassword] = useState("password");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    const success = await login(email, password, rememberMe);
    setLoading(false);
    if (success) {
      onLogin();
    } else {
      setError("Invalid email or password");
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#080E1C",
        display: "flex",
        overflow: "hidden",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Left panel – branding */}
      <div
        style={{
          width: "55%",
          background: "linear-gradient(145deg, #050A18 0%, #0A1628 50%, #071320 100%)",
          borderRight: "1px solid #1E3A5F",
          display: "flex",
          flexDirection: "column",
          padding: "48px 56px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid background */}
        <svg
          style={{ position: "absolute", inset: 0, opacity: 0.06 }}
          width="100%"
          height="100%"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1C6BEB" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Campus map visualization */}
        <svg
          style={{
            position: "absolute",
            bottom: 0,
            right: -40,
            opacity: 0.12,
            width: 600,
            height: 480,
          }}
          viewBox="0 0 600 480"
        >
          {/* Buildings */}
          {[
            [420, 40, 140, 80],
            [220, 40, 130, 75],
            [60, 40, 110, 75],
            [60, 160, 140, 90],
            [60, 310, 140, 90],
            [240, 310, 130, 90],
            [420, 310, 140, 90],
          ].map(([x, y, w, h], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={4}
              fill="none"
              stroke="#1C6BEB"
              strokeWidth="1.5"
            />
          ))}
          {/* Walkways */}
          <line x1="300" y1="115" x2="300" y2="420" stroke="#06B6D4" strokeWidth="6" strokeLinecap="round" />
          <line x1="60" y1="245" x2="560" y2="245" stroke="#06B6D4" strokeWidth="6" strokeLinecap="round" />
          <line x1="60" y1="400" x2="560" y2="400" stroke="#06B6D4" strokeWidth="6" strokeLinecap="round" />
          {/* Nodes */}
          {[
            [300, 115], [300, 245], [300, 310], [300, 400],
            [150, 245], [450, 245], [490, 115], [325, 115],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={8} fill="#1C6BEB" opacity={0.8} />
          ))}
          {/* Connections */}
          {[
            [300, 115, 300, 245],
            [300, 245, 300, 310],
            [300, 310, 300, 400],
            [150, 245, 300, 245],
            [300, 245, 450, 245],
          ].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1C6BEB" strokeWidth="1" strokeDasharray="4 3" opacity={0.5} />
          ))}
        </svg>

        {/* Glow effects */}
        <div
          style={{
            position: "absolute",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(28,107,235,0.12) 0%, transparent 70%)",
            top: "10%",
            right: "-10%",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)",
            bottom: "15%",
            left: "20%",
            pointerEvents: "none",
          }}
        />

        {/* Logo + title */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="flex items-center gap-3 mb-8">
            <div
              style={{
                width: 44,
                height: 44,
                background: "linear-gradient(135deg, #1C6BEB 0%, #06B6D4 100%)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 24px rgba(28,107,235,0.4)",
              }}
            >
              <Route size={22} color="white" />
            </div>
            <div>
              <div style={{ color: "#F8FAFC", fontSize: 22, fontWeight: 800, letterSpacing: "0.1em" }}>
                NAVI
              </div>
              <div style={{ color: "#475569", fontSize: 11, letterSpacing: "0.15em" }}>
                WAYFINDING SYSTEM
              </div>
            </div>
          </div>

          <h1 style={{ color: "#F8FAFC", fontSize: 38, fontWeight: 700, lineHeight: 1.15, marginBottom: 16 }}>
            Virtual Campus<br />
            <span
              style={{
                background: "linear-gradient(90deg, #1C6BEB, #06B6D4)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Navigation Admin
            </span>
          </h1>
          <p style={{ color: "#64748B", fontSize: 14, lineHeight: 1.7, maxWidth: 380 }}>
            Manage navigation nodes, floor plans, QR checkpoints, and panoramic
            waypoints for Aklan State University – Ibajay Campus.
          </p>
        </div>

        {/* Feature badges */}
        <div style={{ position: "relative", zIndex: 1, marginTop: "auto", display: "flex", gap: 12 }}>
          {[
            { icon: Route, label: "A* Pathfinding" },
            { icon: Shield, label: "Secure Access" },
            { icon: Wifi, label: "Live Sync" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              style={{
                background: "rgba(30,58,95,0.4)",
                border: "1px solid #1E3A5F",
                borderRadius: 8,
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#94A3B8",
                fontSize: 12,
              }}
            >
              <Icon size={13} color="#1C6BEB" />
              {label}
            </div>
          ))}
        </div>

        {/* ASU branding */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            marginTop: 16,
            color: "#334155",
            fontSize: 11,
            letterSpacing: "0.05em",
          }}
        >
          AKLAN STATE UNIVERSITY – IBAJAY CAMPUS © 2025
        </div>
      </div>

      {/* Right panel – login form */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
          background: "#080E1C",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ color: "#F8FAFC", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              Administrator Login
            </h2>
            <p style={{ color: "#64748B", fontSize: 13, lineHeight: 1.6 }}>
              Sign in to access the NAVI admin console. Authorized personnel only.
            </p>
          </div>

          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Email */}
            <div>
              <label style={{ color: "#94A3B8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: "0.04em" }}>
                EMAIL ADDRESS
              </label>
              <div
                style={{
                  position: "relative",
                  background: "#111827",
                  border: "1px solid #1E3A5F",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <User size={15} style={{ position: "absolute", left: 12, color: "#475569" }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#E2E8F0",
                    fontSize: 13,
                    padding: "11px 12px 11px 38px",
                    width: "100%",
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ color: "#94A3B8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: "0.04em" }}>
                PASSWORD
              </label>
              <div
                style={{
                  position: "relative",
                  background: "#111827",
                  border: "1px solid #1E3A5F",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Lock size={15} style={{ position: "absolute", left: 12, color: "#475569" }} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#E2E8F0",
                    fontSize: 13,
                    padding: "11px 38px 11px 38px",
                    width: "100%",
                  }}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 12,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#475569",
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                <div
                  onClick={() => setRememberMe(!rememberMe)}
                  style={{
                    width: 16,
                    height: 16,
                    background: rememberMe ? "#1C6BEB" : "#1E293B",
                    border: `1px solid ${rememberMe ? "#1C6BEB" : "#334155"}`,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {rememberMe && (
                    <svg width="10" height="8" viewBox="0 0 10 8">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <span style={{ color: "#94A3B8", fontSize: 12 }}>Remember this device</span>
              </label>
              <button style={{ background: "none", border: "none", color: "#1C6BEB", fontSize: 12, cursor: "pointer" }}>
                Forgot password?
              </button>
            </div>

            {error && (
              <div style={{ color: "#EF4444", fontSize: 12, textAlign: "center", padding: "8px 0" }}>
                {error}
              </div>
            )}

            {/* Login button */}
            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                background: loading
                  ? "#1E293B"
                  : "linear-gradient(135deg, #1C6BEB 0%, #0891B2 100%)",
                border: "none",
                borderRadius: 8,
                padding: "13px",
                color: loading ? "#64748B" : "white",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                letterSpacing: "0.03em",
                boxShadow: loading ? "none" : "0 4px 24px rgba(28,107,235,0.35)",
                transition: "all 0.2s",
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      border: "2px solid #334155",
                      borderTopColor: "#1C6BEB",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  Authenticating...
                </>
              ) : (
                <>
                  <Shield size={15} />
                  Sign In to Admin Console
                </>
              )}
            </button>
          </div>

          {/* Security note */}
          <div
            style={{
              marginTop: 28,
              padding: "12px 16px",
              background: "rgba(28,107,235,0.08)",
              border: "1px solid rgba(28,107,235,0.2)",
              borderRadius: 8,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Shield size={14} color="#1C6BEB" style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ color: "#64748B", fontSize: 11, lineHeight: 1.6, margin: 0 }}>
              This system is restricted to authorized ASU personnel. All access attempts are
              logged and monitored. Unauthorized access is strictly prohibited.
            </p>
          </div>

          <div style={{ marginTop: 20, textAlign: "center", color: "#334155", fontSize: 11 }}>
            NAVI v2.4.1 · ASU Ibajay Campus · Build 2025.05
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
