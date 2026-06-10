// Inline shelter recommendation card used inside chat replies.
import { House } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function InlineShelterCard({ name, distance, status, onViewMap }) {
  const navigate = useNavigate();

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
        background: "#DBEAFE",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <House size={18} color="#2563EB" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>{name}</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
          {distance} &bull; {status}
        </div>
      </div>
      <button
        // Default CTA opens the map page; callers can override with a custom
        // handler (for example, pre-filtering or centering on a marker).
        onClick={onViewMap ?? (() => navigate("/map"))}
        style={{
          background: "none", border: "none",
          color: "#3B82F6", fontFamily: "'Nunito', sans-serif",
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          padding: "4px 6px", borderRadius: 6,
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#EFF6FF"}
        onMouseLeave={e => e.currentTarget.style.background = "none"}
      >
        View Map
      </button>
    </div>
  );
}
