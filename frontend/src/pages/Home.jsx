import { useState } from "react";
import { useNavigate } from "react-router-dom";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Map", path: "/map" },
  { label: "Tasks", path: "/crisis" },
  { label: "Chat", path: "/chat" },
];

const crises = [
  {
    id: 1,
    icon: "🔥",
    iconBg: "#FEE2E2",
    title: "Fire Incident",
    status: "Active",
    statusColor: "#EF4444",
    location: "Loyang Industrial Estate, Block 3 Loyang Way",
    distance: "1.9 km away",
    borderColor: "#EF4444",
  },
  {
    id: 2,
    icon: "🌊",
    iconBg: "#FEF3C7",
    title: "Flash Flood",
    status: "Warning",
    statusColor: "#F59E0B",
    location: "Pasir Ris Drive 3, near Block 512",
    distance: "400 m away",
    borderColor: "#F59E0B",
  },
  {
    id: 3,
    icon: "🌫️",
    iconBg: "#D1FAE5",
    title: "Haze Cleared",
    status: "Resolved",
    statusColor: "#10B981",
    location: "Islandwide",
    distance: "Updated 1h ago",
    borderColor: "#10B981",
    resolved: true,
  },
];

const quickTopics = [
  { icon: "🌊", label: "Floods", color: "#DBEAFE", iconColor: "#3B82F6" },
  { icon: "🏥", label: "Hospital Beds", color: "#DBEAFE", iconColor: "#3B82F6" },
  { icon: "🏠", label: "Shelters", color: "#DBEAFE", iconColor: "#3B82F6" },
  { icon: "🆘", label: "Help", color: "#FEE2E2", iconColor: "#EF4444" },
  { icon: "⚠️", label: "Find out more", color: "#FEF3C7", iconColor: "#F59E0B" },
];

export default function Home() {
  const navigate = useNavigate();
  const [alertVisible, setAlertVisible] = useState(true);

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
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>❤️</div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e", letterSpacing: -0.5 }}>BrainySG</span>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", gap: 36 }}>
          {NAV_LINKS.map(({ label, path }) => {
            const active = label === "Home";
            return (
              <button key={label} onClick={() => navigate(path)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Nunito', sans-serif",
                fontSize: 15, fontWeight: active ? 700 : 500,
                color: active ? "#1a1a2e" : "#666",
                paddingBottom: 4,
                borderBottom: active ? "2px solid #F59E0B" : "2px solid transparent",
              }}>{label}</button>
            );
          })}
        </div>

        {/* Right icons */}
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
            background: "#e0d5c5", overflow: "hidden", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>👤</div>
        </div>
      </nav>

      {/* Alert Banner */}
      {alertVisible && (
        <div style={{
          margin: "16px auto 0",
          maxWidth: 520,
          background: "#FEF3C7",
          border: "1px solid #F59E0B",
          borderRadius: 12,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Heavy Rain Warning</div>
            <div style={{ fontSize: 12, color: "#666" }}>Expected in North areas next 2 hours.</div>
          </div>
          <button onClick={() => setAlertVisible(false)} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999",
          }}>✕</button>
        </div>
      )}

      {/* Main content */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr 280px",
        gap: 24,
        maxWidth: 1200,
        margin: "24px auto",
        padding: "0 24px",
        alignItems: "start",
      }}>
        {/* LEFT: Crisis list */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: "#1a1a2e" }}>
            top 3 crises near you:
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {crises.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate("/crisis")}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: "14px 16px",
                  borderLeft: `4px solid ${c.borderColor}`,
                  cursor: "pointer",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: c.iconBg, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16,
                    }}>{c.icon}</div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.statusColor }}>
                    {c.status === "Resolved" ? "✓ " : "● "}{c.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8, paddingLeft: 42 }}>
                  📍 {c.location}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 42 }}>
                  <span style={{
                    background: "#F3F4F6", borderRadius: 20, padding: "3px 10px",
                    fontSize: 12, fontWeight: 600, color: "#444",
                  }}>{c.distance}</span>
                  {!c.resolved && (
                    <button onClick={(e) => { e.stopPropagation(); navigate("/map"); }} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#3B82F6", fontWeight: 700, fontSize: 13,
                      fontFamily: "'Nunito', sans-serif",
                    }}>View Map</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/timeline")} style={{
            marginTop: 16,
            background: "#fff",
            border: "1.5px solid #ddd",
            borderRadius: 24,
            padding: "10px 20px",
            fontFamily: "'Nunito', sans-serif",
            fontWeight: 700, fontSize: 14,
            cursor: "pointer",
            color: "#1a1a2e",
            transition: "background 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f0e8"}
            onMouseLeave={e => e.currentTarget.style.background = "#fff"}
          >
            View more / Timeline
          </button>
        </div>

        {/* CENTER: Brainy mascot */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right", width: "100%", fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>
            I am a: <span style={{ fontWeight: 800 }}>resident</span>
          </div>

          {/* Speech bubble */}
          <div style={{
            background: "#fff",
            borderRadius: 20,
            padding: "18px 28px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            textAlign: "center",
            fontSize: 15,
            fontWeight: 600,
            color: "#1a1a2e",
            lineHeight: 1.5,
            position: "relative",
            maxWidth: 320,
          }}>
            Good morning, John!<br />
            There are 2 situations today,<br />
            do you want a quick brief?
            <div style={{
              position: "absolute",
              bottom: -12,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderTop: "12px solid #fff",
            }} />
          </div>

          {/* Brainy robot mascot (SVG) */}
          <svg width="180" height="220" viewBox="0 0 180 220" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Antenna */}
            <line x1="90" y1="10" x2="90" y2="45" stroke="#888" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="90" cy="8" r="5" fill="#aaa"/>
            {/* Head - TV body */}
            <rect x="30" y="40" width="120" height="90" rx="16" fill="#8B5E3C"/>
            {/* Screen */}
            <rect x="42" y="52" width="96" height="65" rx="10" fill="#D4A96A"/>
            {/* Horizontal lines on screen */}
            <line x1="42" y1="65" x2="138" y2="65" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="75" x2="138" y2="75" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="85" x2="138" y2="85" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="95" x2="138" y2="95" stroke="#C49055" strokeWidth="1.5"/>
            <line x1="42" y1="105" x2="138" y2="105" stroke="#C49055" strokeWidth="1.5"/>
            {/* Eyes */}
            <circle cx="72" cy="82" r="14" fill="#1a1a1a"/>
            <circle cx="108" cy="82" r="14" fill="#1a1a1a"/>
            <circle cx="76" cy="78" r="4" fill="#fff"/>
            <circle cx="112" cy="78" r="4" fill="#fff"/>
            {/* Mouth */}
            <ellipse cx="90" cy="104" rx="8" ry="5" fill="#E87060"/>
            {/* Dials at bottom of head */}
            <circle cx="55" cy="122" r="7" fill="#6B4226"/>
            <circle cx="90" cy="122" r="7" fill="#6B4226"/>
            <circle cx="125" cy="122" r="7" fill="#6B4226"/>
            {/* Red needle indicator */}
            <line x1="90" y1="122" x2="97" y2="116" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
            {/* Body */}
            <rect x="40" y="134" width="100" height="50" rx="14" fill="#F97316"/>
            {/* Label on body */}
            <rect x="55" y="148" width="70" height="22" rx="6" fill="#EA6A10"/>
            <text x="90" y="163" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Nunito, sans-serif">Brainy</text>
            {/* Arms */}
            <rect x="8" y="138" width="30" height="16" rx="8" fill="#2563EB"/>
            <rect x="142" y="138" width="30" height="16" rx="8" fill="#2563EB"/>
            {/* Legs */}
            <rect x="55" y="184" width="28" height="22" rx="8" fill="#2563EB"/>
            <rect x="97" y="184" width="28" height="22" rx="8" fill="#2563EB"/>
            {/* Feet */}
            <rect x="52" y="200" width="34" height="14" rx="7" fill="#1a1a2e"/>
            <rect x="94" y="200" width="34" height="14" rx="7" fill="#1a1a2e"/>
          </svg>

          {/* View SG Map button */}
          <button onClick={() => navigate("/map")} style={{
            background: "#B8D4F0",
            border: "none",
            borderRadius: 30,
            padding: "14px 40px",
            fontFamily: "'Nunito', sans-serif",
            fontWeight: 800,
            fontSize: 16,
            cursor: "pointer",
            color: "#1a1a2e",
            display: "flex",
            alignItems: "center",
            gap: 10,
            transition: "background 0.15s, transform 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "#93C5FD"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#B8D4F0"; e.currentTarget.style.transform = ""; }}
          >
            <span>👥</span> View SG Map
          </button>
        </div>

        {/* RIGHT: Actions + Quick Topics */}
        <div style={{
          background: "#fff",
          borderRadius: 20,
          padding: "20px",
          boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: 1, marginBottom: 14 }}>ACTIONS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "📷", label: "Snap a photo", action: () => navigate("/chat") },
              { icon: "💬", label: "Chat with Brainy", action: () => navigate("/chat") },
              { icon: "🎤", label: "Record voice memos", action: () => navigate("/chat") },
            ].map(({ icon, label, action }) => (
              <button key={label} onClick={action} style={{
                background: "#fff",
                border: "1.5px solid #E5E7EB",
                borderRadius: 30,
                padding: "11px 16px",
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#1a1a2e",
                transition: "border-color 0.15s, background 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.background = "#EFF6FF"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
              >
                <span style={{ fontSize: 18 }}>{icon}</span> {label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: 1, margin: "20px 0 14px" }}>QUICK TOPICS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {quickTopics.map(({ icon, label, color }) => (
              <button key={label} style={{
                background: color,
                border: "none",
                borderRadius: 14,
                padding: "12px 8px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                fontFamily: "'Nunito', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#1a1a2e",
                transition: "transform 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
                onMouseLeave={e => e.currentTarget.style.transform = ""}
              >
                <span style={{ fontSize: 22 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}