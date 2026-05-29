// Aiya
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/NavBar";
import CrisisCard from "../components/crisis/CrisisCard";
import BrainyPanel from "../components/crisis/BrainyPanel";
import { AlertTriangle, Map } from "lucide-react";

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

      <Navbar />

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
            <div style={{ fontWeight: 700, fontSize: 14, color: "#313131", textAlign: "left", paddingLeft: 10 }}>Heavy Rain Warning</div>
            <div style={{ fontSize: 12, color: "#666", textAlign: "left", paddingLeft: 10 }}>Expected in North areas next 2 hours.</div>
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

        {/* LEFT */}
        <CrisisCard />

        {/* CENTER: Brainy mascot */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 50 }}>
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

          <img
            src="/brainy_normal.png"
            alt="Brainy mascot"
            style={{ width: 180, height: "auto", objectFit: "contain" }}
          />

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

        {/* RIGHT */}
        <BrainyPanel />

      </div>
    </div>
  );
}