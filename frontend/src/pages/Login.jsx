import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BrainyMascot from "../components/BrainyMascot";
import { HeartPulse, User, MessageCircle, ClipboardList, Home, Eye, EyeOff } from "lucide-react";

const roles = [
  { id: "resident",    label: "Resident",    Icon: User },
  { id: "volunteer",   label: "Volunteer",   Icon: MessageCircle },
  { id: "coordinator", label: "Coordinator", Icon: ClipboardList },
];

// ── SHARED LAYOUT WRAPPER ────────────────────────────────────
function Layout({ children, showBrainy, bubble }) {
return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }}>
    {/* Top bar */}
    <div style={{ background: "#fff", height: 64, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#F5E6C8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HeartPulse size={20} color="#92400E" />
        </div>
        <span style={{ fontWeight: 800, fontSize: 22, color: "#1a1a2e", letterSpacing: -0.5 }}>BrainySG</span>
        </div>
    </div>

    {/* Content + optional Brainy on right */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)", position: "relative", padding: "40px 24px", boxSizing: "border-box" }}>
        {children}

        {/* Brainy mascot bottom-right */}
        {showBrainy && (
        <div className="login-brainy">
            {bubble && (
            <div style={{ background: "#fff", borderRadius: 16, padding: "14px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.1)", fontSize: 14, fontWeight: 600, color: "#1a1a2e", textAlign: "center", maxWidth: 180, lineHeight: 1.5, position: "relative" }}>
                {bubble}
                <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "10px solid #fff" }} />
            </div>
            )}
            <BrainyMascot mood="happy" width={160} />
        </div>
        )}
    </div>
    </div>
);
}

export default function Login() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState("login"); // "login" | "role" | "success"
  const [tab, setTab] = useState("login");        // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  // ── SCREEN 1: LOGIN / REGISTER ───────────────────────────────
  if (screen === "login") {
    return (
      <Layout showBrainy bubble="Welcome to BrainySG! I'm Brainy, your crisis companion.">
        <div style={{ background: "#fff", borderRadius: 20, padding: "36px 40px", width: "100%", maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1.5px solid #E5E7EB", marginBottom: 28 }}>
            {["login", "register"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15,
                color: tab === t ? "#1a1a2e" : "#999",
                paddingBottom: 12,
                borderBottom: tab === t ? "2.5px solid #F59E0B" : "2.5px solid transparent",
                marginBottom: -1.5,
                textTransform: "capitalize",
              }}>
                {t === "login" ? "Log In" : "Register"}
              </button>
            ))}
          </div>

          {/* Email */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", display: "block", marginBottom: 6 }}>
              Email Address <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "11px 14px", fontFamily: "'Nunito', sans-serif", fontSize: 14, color: "#1a1a2e", outline: "none", background: "#FAFAFA" }}
              onFocus={e => e.target.style.borderColor = "#F59E0B"}
              onBlur={e => e.target.style.borderColor = "#E5E7EB"}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", display: "block", marginBottom: 6 }}>
              Password <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "11px 40px 11px 14px", fontFamily: "'Nunito', sans-serif", fontSize: 14, color: "#1a1a2e", outline: "none", background: "#FAFAFA" }}
                onFocus={e => e.target.style.borderColor = "#F59E0B"}
                onBlur={e => e.target.style.borderColor = "#E5E7EB"}
              />
              <button onClick={() => setShowPw(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#999", padding: 0 }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {tab === "login" && (
            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <button style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontSize: 12, fontWeight: 600, color: "#F59E0B" }}>
                Forgot password?
              </button>
            </div>
          )}
          {tab === "register" && <div style={{ marginBottom: 20 }} />}

          {/* Login button */}
          <button
            onClick={() => setScreen("role")}
            style={{ width: "100%", background: "#F59E0B", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 15, cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#D97706"}
            onMouseLeave={e => e.currentTarget.style.background = "#F59E0B"}
          >
            {tab === "login" ? "Log In" : "Create Account"}
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#999", whiteSpace: "nowrap" }}>OR CONTINUE WITH</span>
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
          </div>

          {/* SingPass */}
          <button style={{ width: "100%", background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "12px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 15, cursor: "pointer", color: "#EF4444", letterSpacing: 0.5, transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#FEF2F2"}
            onMouseLeave={e => e.currentTarget.style.background = "#fff"}
          >
            <span style={{ color: "#999" }}></span>singpass
          </button>
        </div>
      </Layout>
    );
  }

  // ── SCREEN 2: ROLE SELECTION ─────────────────────────────────
  if (screen === "role") {
    return (
      <Layout showBrainy bubble="Choose what kind of role you will have!">
        <div style={{ background: "#fff", borderRadius: 20, padding: "36px 40px", width: "100%", maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#999", letterSpacing: 1.5, marginBottom: 20 }}>SELECT YOUR ROLE</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {roles.map(({ id, label, Icon }) => {
              const isChosen = selectedRole === id;
              return (
                <button key={id} onClick={() => setSelectedRole(id)} style={{
                  background: isChosen ? "#FEF3C7" : "#fff",
                  border: isChosen ? "2px solid #F59E0B" : "2px solid #E5E7EB",
                  borderRadius: 30, padding: "14px 20px",
                  fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15,
                  cursor: "pointer", color: "#1a1a2e",
                  display: "flex", alignItems: "center", gap: 12,
                  transition: "all 0.15s",
                }}>
                  <Icon size={18} color={isChosen ? "#F59E0B" : "#666"} />
                  {label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => selectedRole && setScreen("success")}
            disabled={!selectedRole}
            style={{ marginTop: 28, width: "100%", background: selectedRole ? "#F59E0B" : "#D1D5DB", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 15, cursor: selectedRole ? "pointer" : "not-allowed", transition: "background 0.15s" }}
          >
            Continue
          </button>
        </div>
      </Layout>
    );
  }

  // ── SCREEN 3: SUCCESS ────────────────────────────────────────
  return (
    <Layout showBrainy={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        {/* Speech bubble */}
        <div style={{ background: "#fff", borderRadius: 30, padding: "16px 32px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 16, fontWeight: 700, color: "#1a1a2e", position: "relative" }}>
          Success! You are ready to go!
          <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "10px solid #fff" }} />
        </div>

        <img src="/brainy_normal.png" alt="Brainy" style={{ width: 200, height: "auto", objectFit: "contain" }} />

        <button onClick={() => navigate("/home")} style={{ background: "#B8D4F0", border: "none", borderRadius: 30, padding: "14px 40px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 16, cursor: "pointer", color: "#1a1a2e", display: "flex", alignItems: "center", gap: 10, transition: "background 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background = "#93C5FD"}
          onMouseLeave={e => e.currentTarget.style.background = "#B8D4F0"}
        >
          <Home size={18} /> Let's Go!
        </button>
      </div>
    </Layout>
  );
}