// Aiya — crisis card for the home page list.
//
// Presentational: the live crisis rows (GET /api/crises) and the resolved user
// position are fetched once in Home.jsx and passed down. Each row links to its
// real /crises/:id detail page (the same page the map markers open).
import { useNavigate } from "react-router-dom";
import { Flame, Waves, Wind, TrainFront, Bug, AlertTriangle, MapPin, CheckCircle, Clock, Map } from "lucide-react";

// Crisis type → icon. Mirrors the backend crisis_type enum
// (flood/haze/dengue/mrt/fire/other).
const TYPE_ICON = {
  fire: Flame,
  flood: Waves,
  haze: Wind,
  mrt: TrainFront,
  dengue: Bug,
  other: AlertTriangle,
};

// Status/severity → accent colour + a light tint for the icon bubble, plus the
// status pill label. Resolved always reads green regardless of severity.
function display(crisis) {
  if (crisis.status === "resolved") {
    return { accent: "#10B981", tint: "#D1FAE5", label: "Resolved", resolved: true };
  }
  switch (crisis.severity) {
    case "critical": return { accent: "#DC2626", tint: "#FEE2E2", label: "Critical" };
    case "high":     return { accent: "#EF4444", tint: "#FEE2E2", label: "Active" };
    case "medium":   return { accent: "#F59E0B", tint: "#FEF3C7", label: "Warning" };
    default:         return { accent: "#3B82F6", tint: "#DBEAFE", label: "Monitoring" };
  }
}

// timeAgo renders a coarse relative timestamp from an ISO string.
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50} m away`;
  return `${km.toFixed(1)} km away`;
}

// Builds the pill text under each row: distance when we have the user's
// position and the crisis is geolocated, otherwise a relative timestamp.
function pillFor(crisis, userPos) {
  if (crisis.status === "resolved") return `Updated ${timeAgo(crisis.updated_at)}`;
  if (userPos && (crisis.lat || crisis.lng)) {
    return formatDistance(haversineKm(userPos, [crisis.lat, crisis.lng]));
  }
  return timeAgo(crisis.updated_at || crisis.created_at);
}

export default function CrisisCard({ crises = [], userPos = null, loading = false }) {
  const navigate = useNavigate();

  // Nearest-first when we know where the user is; otherwise keep the API's
  // newest-first order. Then take the top three.
  const top = [...crises]
    .sort((a, b) => {
      if (!userPos) return 0;
      const da = (a.lat || a.lng) ? haversineKm(userPos, [a.lat, a.lng]) : Infinity;
      const db = (b.lat || b.lng) ? haversineKm(userPos, [b.lat, b.lng]) : Infinity;
      return da - db;
    })
    .slice(0, 3);

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a1a2e", textAlign: "left" }}>
        Top 3 crises near you:
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: 14, padding: "12px 4px" }}>Loading crises…</div>
      ) : top.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 16, padding: "20px 16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)", color: "#888", fontSize: 14, textAlign: "left",
        }}>
          No active crises near you right now.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {top.map((c) => {
            const d = display(c);
            const Icon = TYPE_ICON[c.type] ?? AlertTriangle;
            return (
              <div
                key={c.id}
                onClick={() => navigate(`/crises/${c.id}`)}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: "14px 16px",
                  borderLeft: `4px solid ${d.accent}`,
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
                      background: d.tint, display: "flex", alignItems: "center", justifyContent: "center",
                    }}><Icon size={18} color={d.accent} /></div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#313131" }}>{c.title}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: d.accent, display: "flex", alignItems: "center", gap: 4 }}>
                    {d.resolved
                      ? <><CheckCircle size={12} /> Resolved</>
                      : <><span style={{ width: 7, height: 7, borderRadius: "50%", background: d.accent, display: "inline-block" }} /> {d.label}</>
                    }
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8, paddingLeft: 42, display: "flex", alignItems: "center", gap: 4 }}>
                  <MapPin size={12} color="#999" /> {c.location_name || "Singapore"}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 42 }}>
                  <span style={{
                    background: "#F3F4F6", borderRadius: 20, padding: "3px 10px",
                    fontSize: 12, fontWeight: 600, color: "#444",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {d.resolved ? <Clock size={11} /> : null}
                    {pillFor(c, userPos)}
                  </span>
                  {!d.resolved && (
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
            );
          })}
        </div>
      )}

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
  );
}
