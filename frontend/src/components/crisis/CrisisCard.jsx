// Aiya — crisis card for the home page list
import { useNavigate } from "react-router-dom";
import { Flame, Waves, Wind, MapPin, CheckCircle, Clock, Map } from "lucide-react";

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

export default function CrisisCard() {
  const navigate = useNavigate();

  return (
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
  );
}