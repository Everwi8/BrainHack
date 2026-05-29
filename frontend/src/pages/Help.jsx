// Aiya — "I Need Help" category selection page (8-tile grid + SOS-995 button)
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Map", path: "/map" },
  { label: "Tasks", path: "/crisis" },
  { label: "Chat", path: "/chat" },
];

const helpOptions = [
  {
    id: "medical",
    icon: "🏥",
    iconBg: "#FCA5A5",
    title: "Medical Help",
    subtitle: "I'm hurt or someone near me is.",
  },
  {
    id: "shelter",
    icon: "🏠",
    iconBg: "#F9A8B4",
    title: "Shelter",
    subtitle: "I need a safe place to go",
  },
  {
    id: "elderly",
    icon: "👴",
    iconBg: "#86EFAC",
    title: "Elderly/Vulnerable",
    subtitle: "Someone here needs extra care",
  },
  {
    id: "water",
    icon: "🔥",
    iconBg: "#60A5FA",
    title: "Water rising",
    subtitle: "Flood water is getting worse",
  },
  {
    id: "fire",
    icon: "🔥",
    iconBg: "#FCA5A5",
    title: "Fire nearby",
    subtitle: "Heavy Smoke / Fire",
  },
  {
    id: "transport",
    icon: "🚗",
    iconBg: "#FCD9A8",
    title: "Stuck/Transport",
    subtitle: "Can't get out of this area",
  },
  {
    id: "supplies",
    icon: "📦",
    iconBg: "#D8B4FE",
    title: "Supplies Needed",
    subtitle: "Food, Water or Essentials",
  },
  {
    id: "info",
    icon: "💬",
    iconBg: "#FCD9A8",
    title: "Need info",
    subtitle: "",
  },
];

export default function Help() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif" }}>
      {/* Navbar */}
      <nav style={{
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        height: 64,
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>❤️</div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e", letterSpacing: -0.5 }}>BrainySG</span>
        </div>
        <div style={{ display: "flex", gap: 36 }}>
          {NAV_LINKS.map(({ label, path }) => (
            <button key={label} onClick={() => navigate(path)} style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
              fontSize: 15, fontWeight: 500,
              color: "#666",
              paddingBottom: 4,
              borderBottom: "2px solid transparent",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, cursor: "pointer",
            }}>🔔</div>
            <div style={{
              position: "absolute", top: 4, right: 4,
              width: 8, height: 8, borderRadius: "50%", background: "#EF4444",
            }} />
          </div>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "#e0d5c5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>👤</div>
        </div>
      </nav>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 120px" }}>
        {/* Brainy header bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "#FEF3C7",
          border: "2px solid #F59E0B",
          borderRadius: 20,
          padding: "16px 24px",
          marginBottom: 28,
        }}>
          {/* Mini Brainy */}
          <svg width="70" height="85" viewBox="0 0 180 220" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="90" y1="10" x2="90" y2="45" stroke="#888" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="90" cy="8" r="5" fill="#aaa"/>
            <rect x="30" y="40" width="120" height="90" rx="16" fill="#8B5E3C"/>
            <rect x="42" y="52" width="96" height="65" rx="10" fill="#D4A96A"/>
            <line x1="42" y1="65" x2="138" y2="65" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="75" x2="138" y2="75" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="85" x2="138" y2="85" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="95" x2="138" y2="95" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="105" x2="138" y2="105" stroke="#C49055" strokeWidth="1.5"/>
            <circle cx="72" cy="82" r="14" fill="#1a1a1a"/>
            <circle cx="108" cy="82" r="14" fill="#1a1a1a"/>
            <circle cx="76" cy="78" r="4" fill="#fff"/>
            <circle cx="112" cy="78" r="4" fill="#fff"/>
            <ellipse cx="90" cy="104" rx="8" ry="5" fill="#E87060"/>
            <circle cx="55" cy="122" r="7" fill="#6B4226"/>
            <circle cx="90" cy="122" r="7" fill="#6B4226"/>
            <circle cx="125" cy="122" r="7" fill="#6B4226"/>
            <line x1="90" y1="122" x2="97" y2="116" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
            <rect x="40" y="134" width="100" height="50" rx="14" fill="#F97316"/>
            <rect x="55" y="148" width="70" height="22" rx="6" fill="#EA6A10"/>
            <text x="90" y="163" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Nunito, sans-serif">Brainy</text>
            <rect x="8" y="138" width="30" height="16" rx="8" fill="#2563EB"/>
            <rect x="142" y="138" width="30" height="16" rx="8" fill="#2563EB"/>
            <rect x="55" y="184" width="28" height="22" rx="8" fill="#2563EB"/>
            <rect x="97" y="184" width="28" height="22" rx="8" fill="#2563EB"/>
            <rect x="52" y="200" width="34" height="14" rx="7" fill="#1a1a2e"/>
            <rect x="94" y="200" width="34" height="14" rx="7" fill="#1a1a2e"/>
          </svg>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a2e", lineHeight: 1.4 }}>
              I'm here, tell me what you need and I'll get help to you.
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#10B981", fontWeight: 700 }}>●</span>
            GPS active • Pasir Ris Dr 3
          </div>
        </div>

        {/* What do you need */}
        <div style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", marginBottom: 4 }}>What do you need ?</h2>
          <p style={{ fontSize: 13, color: "#666", margin: 0 }}>Tap one. You can add details after.</p>
        </div>

        {/* Grid of help options */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginTop: 16,
          marginBottom: 16,
        }}>
          {helpOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              style={{
                background: selected === opt.id ? "#EFF6FF" : "#fff",
                border: selected === opt.id ? "2.5px solid #3B82F6" : "2px solid #E5E7EB",
                borderRadius: 18,
                padding: "20px 16px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                textAlign: "center",
                fontFamily: "'Nunito', sans-serif",
                transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
                boxShadow: selected === opt.id ? "0 0 0 3px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
              }}
              onMouseEnter={e => { if (selected !== opt.id) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.1)"; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = selected === opt.id ? "0 0 0 3px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)"; }}
            >
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: opt.iconBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26,
              }}>
                {opt.icon}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e" }}>{opt.title}</div>
                {opt.subtitle && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{opt.subtitle}</div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Snap / Voice row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          {[
            {
              icon: "📷",
              iconBg: "#FEF3C7",
              title: "Snap a photo",
              subtitle: "Auto-tags location, Brainy will decipher the situation",
              action: () => navigate("/chat"),
            },
            {
              icon: "🎤",
              iconBg: "#FEF3C7",
              title: "Record a voice note",
              subtitle: "Speak if you can't type. Brainy will transcribe it",
              action: () => navigate("/chat"),
            },
          ].map(({ icon, iconBg, title, subtitle, action }) => (
            <button key={title} onClick={action} style={{
              background: "#fff",
              border: "2px solid #E5E7EB",
              borderRadius: 18,
              padding: "18px 20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontFamily: "'Nunito', sans-serif",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#F59E0B"; e.currentTarget.style.background = "#FFFBEB"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: iconBg, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, flexShrink: 0,
              }}>{icon}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e" }}>{title}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#fff",
        borderTop: "1px solid #E5E7EB",
        padding: "12px 24px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        zIndex: 200,
      }}>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Anything else? (Optional, you can skip this)"
          style={{
            flex: 1,
            border: "1.5px solid #E5E7EB",
            borderRadius: 30,
            padding: "12px 20px",
            fontFamily: "'Nunito', sans-serif",
            fontSize: 14,
            color: "#1a1a2e",
            outline: "none",
            background: "#F9FAFB",
          }}
        />
        <button onClick={() => navigate("/chat")} style={{
          background: "#1a1a2e",
          color: "#fff",
          border: "none",
          borderRadius: 30,
          padding: "12px 28px",
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer",
          whiteSpace: "nowrap",
          letterSpacing: 0.5,
          transition: "background 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#2d2d4e"}
          onMouseLeave={e => e.currentTarget.style.background = "#1a1a2e"}
        >
          SEND FOR HELP
        </button>
        <button style={{
          background: "#fff",
          color: "#EF4444",
          border: "2px solid #EF4444",
          borderRadius: 30,
          padding: "12px 20px",
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          whiteSpace: "nowrap",
          transition: "background 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#FEF2F2"}
          onMouseLeave={e => e.currentTarget.style.background = "#fff"}
        >
          <span>🔔</span> SOS - 995
        </button>
      </div>
    </div>
  );
}