import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, MapPin, Camera, MessageCircle, Mic,
  Waves, BedDouble, Home as HomeIcon, LifeBuoy,
  AlertTriangle, CheckCircle, Map, Clock,
  HeartPulse, Flame, Wind, UserCircle
} from "lucide-react";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Map", path: "/map" },
  { label: "Tasks", path: "/crisis" },
  { label: "Chat", path: "/chat" },
];

const crises = [
  {
    id: 1,
    Icon: () => <Flame size={18} color="#EF4444" />,
    iconBg: "#FEE2E2",
    title: "Fire Incident", 
    status: "Active",
    statusColor: "#EF4444",
    location: "Loyang Industrial Estate, Loyang Way",
    distance: "1.9 km away",
    borderColor: "#EF4444",
    resolved: false,
  },
  {
    id: 2,
    Icon: () => <Waves size={18} color="#F59E0B" />,
    iconBg: "#FEF3C7",
    title: "Flash Flood",
    status: "Warning",
    statusColor: "#F59E0B",
    location: "Pasir Ris Drive 3, near Block 512",
    distance: "400 m away",
    borderColor: "#F59E0B",
    resolved: false,
  },
  {
    id: 3,
    Icon: () => <Wind size={18} color="#10B981" />,
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
  { Icon: Waves, label: "Floods", bg: "#DBEAFE", color: "#3B82F6" },
  { Icon: BedDouble, label: "Hospital Beds", bg: "#dbfee3", color: "#2ba552" },
  { Icon: HomeIcon, label: "Shelters", bg: "#fef3db", color: "#efa42c" },
  { Icon: AlertTriangle, label: "Find Out More", bg: "#FEF3C7", color: "#F59E0B" },
  { Icon: LifeBuoy, label: "Help", bg: "#FEE2E2", color: "#EF4444" },
];

export default function Home() {
  const navigate = useNavigate();
  const [alertVisible, setAlertVisible] = useState(true);

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      background: "#F5F0E8",
      fontFamily: "'Nunito', sans-serif",
      boxSizing: "border-box",
    }}>
      {/* Navbar */}
      <nav style={{
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        height: 64,
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        width: "100%",
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "#F5E6C8", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HeartPulse size={20} color="#92400E" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e", letterSpacing: -0.5 }}>BrainySG</span>
        </div>

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

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", cursor: "pointer" }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={18} color="#92400E" />
            </div>
            <div style={{
              position: "absolute", top: 6, right: 6,
              width: 8, height: 8, borderRadius: "50%", background: "#EF4444",
            }} />
          </div>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "#e0d5c5", overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <UserCircle size={28} color="#7a6a56" />
          </div>
        </div>
      </nav>

      {/* Alert Banner */}
      {alertVisible && (
        <div style={{
          margin: "16px auto 0",
          maxWidth: 560,
          background: "#FEF3C7",
          border: "1px solid #F59E0B",
          borderRadius: 12,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <AlertTriangle size={20} color="#F59E0B" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 , color: "#313131" , textAlign: "left", paddingLeft: 10}}>Heavy Rain Warning</div>
            <div style={{ fontSize: 12, color: "#666", textAlign: "left" , paddingLeft: 10 }}>Expected in North areas next 2 hours.</div>
          </div>
          <button onClick={() => setAlertVisible(false)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#999", lineHeight: 1,
          }}>✕</button>
        </div>
      )}

      {/* Main 3-col grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr 290px",
        gap: 24,
        width: "100%",
        maxWidth: 1280,
        margin: "24px auto",
        padding: "0 32px",
        boxSizing: "border-box",
      }}>
        {/* LEFT: Crisis list */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a1a2e", textAlign: "left" }}>
            Top 3 crises near you:
          </div>
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
                    }}><c.Icon /></div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#313131" }}>{c.title}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.statusColor, display: "flex", alignItems: "center", gap: 4 }}>
                    {c.resolved
                      ? <><CheckCircle size={12} /> Resolved</>
                      : <><span style={{ width: 7, height: 7, borderRadius: "50%", background: c.statusColor, display: "inline-block" }} /> {c.status}</>
                    }
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8, paddingLeft: 42, display: "flex", alignItems: "center", gap: 4 }}>
                  <MapPin size={12} color="#999" /> {c.location}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 42 }}>
                  <span style={{
                    background: "#F3F4F6", borderRadius: 20, padding: "3px 10px",
                    fontSize: 12, fontWeight: 600, color: "#444",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {c.resolved ? <Clock size={11} /> : null}
                    {c.distance}
                  </span>
                  {!c.resolved && (
                    <button onClick={(e) => { e.stopPropagation(); navigate("/map"); }} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#3B82F6", fontWeight: 700, fontSize: 13,
                      fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <Map size={13} /> View Map
                    </button>
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
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Clock size={14} /> View more / Timeline
          </button>
        </div>

        {/* CENTER: Brainy mascot */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 50 }}>

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
            lineHeight: 1.6,
            position: "relative",
            maxWidth: 320,
          }}>
            Good morning, John!<br />
            There are 2 situations today,<br />
            do you want a quick brief?
            <div style={{
              position: "absolute", bottom: -12, left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderTop: "12px solid #fff",
            }} />
          </div>

          {/* Brainy PNG mascot */}
          <img
            src="/brainy_normal.png"
            alt="Brainy mascot"
            style={{ width: 180, height: "auto", objectFit: "contain" }}
          />

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
            <Map size={18} /> View SG Map
          </button>
        </div>

        {/* RIGHT: Actions + Quick Topics */}
        <div style={{ alignSelf: "start" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", textAlign: "right", marginBottom: 10 }}>
            I am a: <span style={{ fontWeight: 800 }}>resident</span>
          </div>
          <div style={{
            background: "#fff",
            borderRadius: 20,
            padding: "20px",
            boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
          }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#999", letterSpacing: 1, marginBottom: 14 }}>ACTIONS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { Icon: Camera, label: "Snap a photo", action: () => navigate("/chat") },
              { Icon: MessageCircle, label: "Chat with Brainy", action: () => navigate("/chat") },
              { Icon: Mic, label: "Record voice memos", action: () => navigate("/chat") },
            ].map(({ Icon, label, action }) => (
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
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#999", letterSpacing: 1, margin: "20px 0 14px" }}>QUICK TOPICS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {quickTopics.map(({ Icon, label, bg, color }) => (
              <button key={label} style={{
                background: bg,
                border: "none",
                borderRadius: 14,
                padding: "12px 6px",
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
                <Icon size={22} color={color} />
                {label}
              </button>
            ))}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}