// Floating panel shown when a crisis circle on the map is clicked. It loads the
// per-crisis triage (GET /api/crises/:id/triage) — the cross-agency findings for
// that crisis, followed by the volunteer task cards generated from them.
import { X, Users, AlertTriangle, Layers } from "lucide-react";

// Triage finding severities → badge styling.
const SEV = {
  critical: { bg: "#FEE2E2", color: "#B91C1C", label: "Critical" },
  warning:  { bg: "#FFEDD5", color: "#C2410C", label: "Warning" },
  low:      { bg: "#FEF9C3", color: "#854D0E", label: "Low" },
};

// Task priority → badge styling.
const PRIORITY = {
  high:   { bg: "#FEE2E2", color: "#B91C1C" },
  medium: { bg: "#FFEDD5", color: "#C2410C" },
  low:    { bg: "#DCFCE7", color: "#166534" },
};

function SeverityBadge({ severity }) {
  const s = SEV[severity] ?? SEV.warning;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
      padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

export default function CrisisTriagePanel({ crisis, data, loading, error, onClose }) {
  const findings = data?.findings ?? [];
  const tasks = data?.tasks ?? [];

  return (
    <div style={{
      position: "absolute", top: 16, left: 16, zIndex: 600,
      width: 360, maxWidth: "calc(100% - 32px)",
      maxHeight: "calc(100% - 32px)", overflowY: "auto",
      background: "#fff", borderRadius: 16,
      boxShadow: "0 6px 28px rgba(0,0,0,0.22)",
      fontFamily: "Nunito, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "16px 18px 12px", borderBottom: "1px solid #F0EBE2",
        position: "sticky", top: 0, background: "#fff", borderRadius: "16px 16px 0 0",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#92400E", textTransform: "uppercase", marginBottom: 3 }}>
            Triage
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e", lineHeight: 1.3 }}>
            {crisis?.title ?? "Crisis"}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{
          background: "none", border: "none", cursor: "pointer", color: "#999", padding: 4, lineHeight: 1,
        }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: "14px 18px 18px" }}>
        {loading && (
          <div style={{ color: "#666", fontSize: 14, fontWeight: 600, padding: "12px 0" }}>
            Running triage…
          </div>
        )}

        {!loading && error && (
          <div style={{ color: "#B91C1C", fontSize: 13, fontWeight: 600, padding: "12px 0" }}>
            {error}
          </div>
        )}

        {!loading && !error && findings.length === 0 && (
          <div style={{ color: "#666", fontSize: 13, fontWeight: 600, padding: "12px 0", lineHeight: 1.5 }}>
            No active triage findings for this crisis right now. The situation may
            have eased, or this crisis isn't currently tied to a live signal.
          </div>
        )}

        {/* Findings */}
        {!loading && !error && findings.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#1a1a2e", marginBottom: 10 }}>
              <AlertTriangle size={14} color="#92400E" /> Situation assessment
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {findings.map((f, i) => (
                <div key={i} style={{
                  background: f.cascade ? "#FFFBEB" : "#FAFAF7",
                  border: `1px solid ${f.cascade ? "#FCD34D" : "#EFEAE1"}`,
                  borderRadius: 12, padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <SeverityBadge severity={f.severity} />
                    {f.cascade && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, color: "#B45309" }}>
                        <Layers size={11} /> CASCADE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e", marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 12.5, color: "#555", lineHeight: 1.5 }}>{f.detail}</div>
                  {f.sources?.length > 0 && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A8F7D", marginTop: 6, letterSpacing: 0.3 }}>
                      {f.sources.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Tasks */}
        {!loading && !error && tasks.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#1a1a2e", marginBottom: 10 }}>
              <Users size={14} color="#92400E" /> Suggested volunteer tasks
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tasks.map((t, i) => {
                const p = PRIORITY[t.priority] ?? PRIORITY.medium;
                return (
                  <div key={i} style={{
                    background: "#fff", border: "1px solid #EFEAE1", borderRadius: 12,
                    padding: "10px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#1a1a2e", lineHeight: 1.3 }}>{t.title}</span>
                      <span style={{
                        background: p.bg, color: p.color,
                        fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                        textTransform: "uppercase", whiteSpace: "nowrap",
                      }}>{t.priority}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5, marginBottom: 6 }}>{t.description}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#16A34A" }}>
                      <Users size={12} /> {t.volunteers_needed} volunteer{t.volunteers_needed === 1 ? "" : "s"} needed
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
