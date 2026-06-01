// Perrin — inline crisis-summary card for chat. Shape matches a triage
// TriageFinding (type / severity / title / location / detail), so it can be fed
// straight from GET /api/triage later; for now it renders whatever the caller
// passes (mock data in the demo).
import { Flame, Waves, Wind, Bug, TrainFront, AlertTriangle, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Crisis type → icon, matching the home-page CrisisCard conventions.
const TYPE_ICON = {
  flood: Waves,
  fire: Flame,
  haze: Wind,
  dengue: Bug,
  transport: TrainFront,
  cascade: AlertTriangle,
};

// Triage severities → the app's status palette.
const SEVERITY = {
  critical: { label: "Critical", color: "#EF4444", bg: "#FEE2E2" },
  warning:  { label: "Warning",  color: "#F59E0B", bg: "#FEF3C7" },
  low:      { label: "Low",      color: "#10B981", bg: "#D1FAE5" },
};

export default function InlineCrisisCard({ type, severity, title, location, detail, onViewDetail }) {
  const navigate = useNavigate();
  const Icon = TYPE_ICON[type] ?? AlertTriangle;
  const sev = SEVERITY[severity] ?? SEVERITY.warning;

  return (
    <div style={{
      marginTop: 10,
      background: "#fff",
      border: "1px solid #E2E8F0",
      borderLeft: `4px solid ${sev.color}`,
      borderRadius: 12,
      padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: sev.bg,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Icon size={17} color={sev.color} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>{title}</span>
        </div>
        <span style={{
          background: sev.bg, color: sev.color, borderRadius: 20,
          padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0,
          textTransform: "uppercase", letterSpacing: 0.3,
        }}>
          {sev.label}
        </span>
      </div>

      {location && (
        <div style={{
          fontSize: 12, color: "#666", margin: "8px 0 0", paddingLeft: 42,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <MapPin size={12} color="#999" /> {location}
        </div>
      )}

      {detail && (
        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, marginTop: 8, paddingLeft: 42 }}>
          {detail}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          onClick={onViewDetail ?? (() => navigate("/map"))}
          style={{
            background: "none", border: "none", color: "#3B82F6",
            fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 13,
            cursor: "pointer", padding: "4px 6px", borderRadius: 6,
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#EFF6FF"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          View details
        </button>
      </div>
    </div>
  );
}
