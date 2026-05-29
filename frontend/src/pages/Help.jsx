// Aiya
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/NavBar";
import {
  Bell, MapPin, Camera, Mic, Building2, Home as HomeIcon,
  Users, Flame, Car, Package, Info, Send, AlertCircle
} from "lucide-react";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Map", path: "/map" },
  { label: "Tasks", path: "/crisis" },
  { label: "Chat", path: "/chat" },
];

const helpOptions = [
  { id: "medical",   Icon: Building2, iconBg: "#FCA5A5", iconColor: "#DC2626", title: "Medical Help",        subtitle: "I'm hurt or someone near me is." },
  { id: "shelter",   Icon: HomeIcon,  iconBg: "#FBCFE8", iconColor: "#DB2777", title: "Shelter",             subtitle: "I need a safe place to go" },
  { id: "elderly",   Icon: Users,     iconBg: "#86EFAC", iconColor: "#16A34A", title: "Elderly/Vulnerable",  subtitle: "Someone here needs extra care" },
  { id: "water",     Icon: Flame,     iconBg: "#BFDBFE", iconColor: "#2563EB", title: "Water rising",        subtitle: "Flood water is getting worse" },
  { id: "fire",      Icon: Flame,     iconBg: "#FCA5A5", iconColor: "#DC2626", title: "Fire nearby",         subtitle: "Heavy Smoke / Fire" },
  { id: "transport", Icon: Car,       iconBg: "#FCD9A8", iconColor: "#D97706", title: "Stuck/Transport",     subtitle: "Can't get out of this area" },
  { id: "supplies",  Icon: Package,   iconBg: "#D8B4FE", iconColor: "#7C3AED", title: "Supplies Needed",     subtitle: "Food, Water or Essentials" },
  { id: "info",      Icon: Info,      iconBg: "#FCD9A8", iconColor: "#D97706", title: "Need info",           subtitle: "" },
];

export default function Help() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      background: "#F5F0E8",
      fontFamily: "'Nunito', sans-serif",
      boxSizing: "border-box",
    }}>
      {/* Navbar */}
      <Navbar />
      
      <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", padding: "24px 32px 120px", boxSizing: "border-box" }}>
        {/* Brainy header bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          background: "#FEF3C7",
          border: "2px solid #F59E0B",
          borderRadius: 20,
          padding: "16px 24px",
          marginBottom: 28,
        }}>
          <img
            src="/brainy_normal.png"
            alt="Brainy"
            style={{ width: 72, height: "auto", objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: "#1a1a2e", lineHeight: 1.4 }}>
            I'm here, tell me what you need and I'll get help to you.
          </div>
          <div style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={13} color="#10B981" />
            <span style={{ color: "#10B981", fontWeight: 700 }}>GPS active</span> • Pasir Ris Dr 3
          </div>
        </div>

        {/* What do you need */}
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", marginBottom: 4 }}>What do you need ?</h2>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>Tap one. You can add details after.</p>

        {/* Grid of help options */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
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
              onMouseEnter={e => { if (selected !== opt.id) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.1)"; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = selected === opt.id ? "0 0 0 3px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)"; }}
            >
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: opt.iconBg,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <opt.Icon size={28} color={opt.iconColor} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e" }}>{opt.title}</div>
                {opt.subtitle && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{opt.subtitle}</div>}
              </div>
            </button>
          ))}
        </div>

        {/* Snap / Voice row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          {[
            { Icon: Camera, iconBg: "#FEF3C7", iconColor: "#D97706", title: "Snap a photo", subtitle: "Auto-tags location, Brainy will decipher the situation", action: () => navigate("/chat") },
            { Icon: Mic,    iconBg: "#FEF3C7", iconColor: "#D97706", title: "Record a voice note", subtitle: "Speak if you can't type. Brainy will transcribe it",   action: () => navigate("/chat") },
          ].map(({ Icon, iconBg, iconColor, title, subtitle, action }) => (
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
                background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Icon size={22} color={iconColor} />
              </div>
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
        bottom: 0, left: 0, right: 0,
        background: "#fff",
        borderTop: "1px solid #E5E7EB",
        padding: "12px 32px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        zIndex: 200,
        boxSizing: "border-box",
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
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Send size={16} /> SEND FOR HELP
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
        }}>
          <AlertCircle size={16} /> SOS - 995
        </button>
      </div>
    </div>
  );
}