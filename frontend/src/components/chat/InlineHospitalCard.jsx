// Perrin — inline hospital card for chat (name + bed availability).
// Mirrors InlineShelterCard's layout. Bed data is "last reported" (MOH data is
// annual/static); `beds` / `total` are optional and render a fraction + bar.
import { Cross } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function InlineHospitalCard({ name, distance, beds, total, onViewMap }) {
  const navigate = useNavigate();
  const hasBeds = typeof beds === "number" && typeof total === "number" && total > 0;
  const pct = hasBeds ? Math.max(0, Math.min(100, Math.round((beds / total) * 100))) : null;
  // Green when plenty free, amber when tight, red when nearly full.
  const barColor = pct == null ? "#10B981" : pct >= 40 ? "#10B981" : pct >= 15 ? "#F59E0B" : "#EF4444";

  return (
    <div style={{
      marginTop: 10,
      background: "#F8FAFC",
      border: "1px solid #E2E8F0",
      borderRadius: 12,
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: "#FEE2E2",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Cross size={18} color="#EF4444" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>{name}</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
          {distance}
          {hasBeds && <> &bull; {beds} of {total} beds free</>}
        </div>
        {hasBeds && (
          <div style={{
            marginTop: 6, height: 5, borderRadius: 3, background: "#E5E7EB", overflow: "hidden",
          }}>
            <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
          </div>
        )}
      </div>
      <button
        onClick={onViewMap ?? (() => navigate("/map"))}
        style={{
          background: "none", border: "none",
          color: "#3B82F6", fontFamily: "'Nunito', sans-serif",
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          padding: "4px 6px", borderRadius: 6, flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#EFF6FF"}
        onMouseLeave={e => e.currentTarget.style.background = "none"}
      >
        View Map
      </button>
    </div>
  );
}
