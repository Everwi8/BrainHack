import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, HeartPulse, UserCircle, Menu, X, LogOut } from "lucide-react";
import { useAuth } from "../../lib/auth";

const NAV_LINKS = [
  { label: "Home",  path: "/home" },
  { label: "Map",   path: "/map" },
  { label: "Tasks", path: "/crisis" },
  { label: "Volunteer", path: "/volunteers" },
  { label: "Feed",  path: "/timeline" },
  { label: "Chat",  path: "/chat" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNav = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const firstName = user?.name?.split(" ")[0] ?? "Guest";

  return (
    <>
      <nav className="navbar">
        {/* Logo */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => handleNav("/")}
        >
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "#F5E6C8", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HeartPulse size={20} color="#92400E" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "#1a1a2e", letterSpacing: -0.5 }}>BrainySG</span>
        </div>

        {/* Desktop nav links */}
        <div className="navbar-links">
          {NAV_LINKS.map(({ label, path }) => {
            const active = location.pathname === path;
            return (
              <button key={label} onClick={() => handleNav(path)} style={{
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

        {/* Right icons + hamburger */}
        <div className="navbar-right">
          <div style={{ position: "relative", cursor: "pointer" }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={18} color="#92400E" />
            </div>
            <div style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "#e0d5c5", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <UserCircle size={28} color="#7a6a56" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }} className="navbar-username">
              {firstName}
            </span>
            <button
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 6,
                borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <LogOut size={18} color="#6B7280" />
            </button>
          </div>

          {/* Hamburger — hidden on desktop via CSS */}
          <button
            className="navbar-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      <div className={`navbar-mobile-menu${menuOpen ? " open" : ""}`}>
        {NAV_LINKS.map(({ label, path }) => (
          <button
            key={label}
            onClick={() => handleNav(path)}
            className={location.pathname === path ? "active" : ""}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
