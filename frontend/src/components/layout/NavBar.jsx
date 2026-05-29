// Aiya — global nav bar (Home / Map / Tasks / Feed / Chat tabs)
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, HeartPulse, UserCircle } from "lucide-react";

const NAV_LINKS = [
  { label: "Home",  path: "/home" },
  { label: "Map",   path: "/map" },
  { label: "Tasks", path: "/crisis" },
  { label: "Chat",  path: "/chat" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
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
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => navigate("/")}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "#F5E6C8", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <HeartPulse size={20} color="#92400E" />
        </div>
        <span style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e", letterSpacing: -0.5 }}>BrainySG</span>
      </div>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 36 }}>
        {NAV_LINKS.map(({ label, path }) => {
          const active = location.pathname === path;
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
        <div style={{ position: "relative", cursor: "pointer" }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell size={18} color="#92400E" />
          </div>
          <div style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: "50%",
          background: "#e0d5c5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <UserCircle size={28} color="#7a6a56" />
        </div>
      </div>
    </nav>
  );
}