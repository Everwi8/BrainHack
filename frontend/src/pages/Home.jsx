// Aiya
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/NavBar";
import CrisisCard from "../components/crisis/CrisisCard";
import BrainyPanel from "../components/crisis/BrainyPanel";
import { AlertTriangle, Map } from "lucide-react";
import BrainyMascot from "../components/BrainyMascot";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// situationLine phrases the Brainy bubble from the real active-crisis count.
function situationLine(n) {
  if (n === 0) return "There are no active situations right now.";
  return `There ${n === 1 ? "is" : "are"} ${n} situation${n === 1 ? "" : "s"} today,`;
}

export default function Home() {
  const navigate = useNavigate();
  const [alertDismissed, setAlertDismissed] = useState(false);
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  // Live crises (GET /api/crises = active + approved) plus the user's resolved
  // position, both used to populate the "Top 3 near you" list and the count in
  // Brainy's greeting. Geolocation mirrors the Map page (fall back to SG centre).
  const [crises, setCrises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        ()    => setUserPos([1.3521, 103.8198]), // fall back to Singapore centre
      );
    } else {
      // Deferred so the state update lands async, not synchronously in the
      // effect body (react-hooks/set-state-in-effect).
      Promise.resolve().then(() => setUserPos([1.3521, 103.8198]));
    }
    api.get("/api/crises")
      .then((d) => setCrises(Array.isArray(d) ? d : []))
      .catch((err) => { console.error("load crises:", err); setCrises([]); })
      .finally(() => setLoading(false));
  }, []);

  // Alert banner is driven by the most severe active crisis (critical/high),
  // not a hardcoded warning. Hidden when there's nothing urgent or dismissed.
  const urgent = crises.find((c) => c.severity === "critical" || c.severity === "high");
  const alertVisible = !alertDismissed && !!urgent;

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
            <div style={{ fontWeight: 700, fontSize: 14, color: "#313131", textAlign: "left", paddingLeft: 10 }}>{urgent?.title}</div>
            <div style={{ fontSize: 12, color: "#666", textAlign: "left", paddingLeft: 10 }}>{urgent?.location_name || "Singapore"}</div>
          </div>
          <button onClick={() => setAlertDismissed(true)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#999", lineHeight: 1,
          }}>✕</button>
        </div>
      )}

      {/* Main 3-col grid */}
      <div className="home-grid">

        {/* LEFT */}
        <CrisisCard crises={crises} userPos={userPos} loading={loading} />

        {/* CENTER: Brainy mascot */}
        <div className="home-grid-center" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 50 }}>
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
            {greeting()}, {firstName}!<br />
            {situationLine(crises.length)}<br />
            {crises.length > 0 ? "do you want a quick brief?" : "I'll let you know if anything comes up."}
            <div style={{
              position: "absolute", bottom: -12, left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderTop: "12px solid #fff",
            }} />
          </div>

          <BrainyMascot mood="normal" width={180} />
          
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