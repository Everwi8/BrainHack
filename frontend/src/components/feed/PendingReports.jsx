// Feed containers for the report-approval workflow:
//   • ApprovalContainer  — coordinators: reports awaiting their approve/reject.
//   • MyPendingContainer — residents/volunteers: their own reports still pending.
// Both render at the top of the Feed (Timeline) and hide themselves when empty.
import { useEffect, useState } from "react";
import { MapPin, Check, X, Clock, Pencil } from "lucide-react";
import { api } from "../../lib/api";

const SEVERITY_COLORS = {
  critical: "#EF4444", high: "#F97316", medium: "#F59E0B", low: "#EAB308",
};

const CRISIS_TYPES = ["flood", "haze", "dengue", "mrt", "fire", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];

const FIELD = {
  width: "100%", boxSizing: "border-box", border: "1px solid #D7D2C7",
  borderRadius: 8, padding: "9px 11px", fontSize: 14, color: "#1f2937",
  background: "#fff", outline: "none", fontFamily: "'Nunito', sans-serif",
};

const FIELD_LABEL = {
  fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "#6B7280",
  marginBottom: 6, textAlign: "left",
};

function EditReportModal({ report, onClose, onSaved }) {
  const [title, setTitle] = useState(report.title || "");
  const [description, setDescription] = useState(report.description || "");
  const [type, setType] = useState(report.type || "other");
  const [severity, setSeverity] = useState(report.severity || "medium");
  const [locationName, setLocationName] = useState(report.location_name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.patch(`/api/crises/${report.id}`, {
        title, description, type, severity, location_name: locationName,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message || "Could not save changes.");
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, padding: "22px 24px",
          width: "100%", maxWidth: 460, boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
          maxHeight: "90vh", overflowY: "auto", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>Edit report</h2>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={FIELD_LABEL}>TITLE</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={FIELD} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={FIELD_LABEL}>DESCRIPTION</div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            style={{ ...FIELD, resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={FIELD_LABEL}>TYPE</div>
            <select value={type} onChange={(e) => setType(e.target.value)} style={FIELD}>
              {CRISIS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={FIELD_LABEL}>SEVERITY</div>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={FIELD}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={FIELD_LABEL}>LOCATION</div>
          <input value={locationName} onChange={(e) => setLocationName(e.target.value)} style={FIELD} />
        </div>

        {error && <div style={{ color: "#B91C1C", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose}
            style={{
              background: "none", border: "1px solid #D1D5DB", borderRadius: 8,
              padding: "9px 18px", fontWeight: 700, fontSize: 13, color: "#374151",
              cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{
              background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 20px", fontWeight: 700, fontSize: 13,
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
              fontFamily: "'Nunito', sans-serif",
            }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Container({ title, accent, bg, border, children }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 16,
      padding: "16px 18px", marginBottom: 16, textAlign: "left",
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, color: accent, marginBottom: 12, textAlign: "left" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ReportRow({ report, children }) {
  const color = SEVERITY_COLORS[report.severity] ?? "#F59E0B";
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 10,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}`,
      textAlign: "left",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{
          textTransform: "uppercase", fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
          color, background: `${color}1A`, padding: "2px 8px", borderRadius: 16,
        }}>
          {report.type} · {report.severity}
        </span>
        <span style={{ color: "#aaa", fontSize: 11, whiteSpace: "nowrap" }}>
          {report.created_at ? new Date(report.created_at).toLocaleString() : ""}
        </span>
      </div>
      <h3 style={{ margin: "6px 0 4px", fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>
        {report.title}
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: children ? 10 : 0 }}>
        <MapPin size={12} color="#aaa" />
        <span style={{ color: "#888", fontSize: 12 }}>
          {report.location_name || "Location not specified"}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Coordinator: approval queue ───────────────────────────────────────────────
export function ApprovalContainer() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get("/api/crises/pending")
      .then((d) => setPending(Array.isArray(d) ? d : []))
      .catch((err) => console.error("pending:", err))
      .finally(() => setLoading(false));
  }, []);

  const act = async (id, action) => {
    setBusyId(id);
    try {
      await api.post(`/api/crises/${id}/${action}`);
      setPending((p) => p.filter((r) => r.id !== id));
    } catch (err) {
      console.error(action, err);
    } finally {
      setBusyId(null);
    }
  };

  if (loading || pending.length === 0) return null;

  return (
    <Container title={`Reports awaiting your approval (${pending.length})`} accent="#92400E" bg="#FFFBEB" border="#FDE68A">
      {pending.map((r) => (
        <ReportRow key={r.id} report={r}>
          {r.description && (
            <p style={{ margin: "0 0 10px", color: "#555", fontSize: 13, lineHeight: 1.5 }}>
              {r.description}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => act(r.id, "approve")}
              disabled={busyId === r.id}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#16A34A", color: "#fff", border: "none", borderRadius: 8,
                padding: "7px 14px", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 12,
                cursor: busyId === r.id ? "default" : "pointer", opacity: busyId === r.id ? 0.6 : 1,
              }}
            >
              <Check size={13} /> Approve
            </button>
            <button
              onClick={() => act(r.id, "reject")}
              disabled={busyId === r.id}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "none", color: "#B91C1C", border: "1px solid #FCA5A5", borderRadius: 8,
                padding: "7px 14px", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 12,
                cursor: busyId === r.id ? "default" : "pointer", opacity: busyId === r.id ? 0.6 : 1,
              }}
            >
              <X size={13} /> Reject
            </button>
          </div>
        </ReportRow>
      ))}
    </Container>
  );
}

// ─── Resident / volunteer: my pending reports ──────────────────────────────────
export function MyPendingContainer() {
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.get("/api/crises/mine")
      .then((d) => setMine(Array.isArray(d) ? d.filter((r) => r.approval_status === "pending") : []))
      .catch((err) => console.error("mine:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || mine.length === 0) return null;

  return (
    <Container title={`Your pending reports (${mine.length})`} accent="#3730A3" bg="#EEF2FF" border="#C7D2FE">
      {mine.map((r) => (
        <ReportRow key={r.id} report={r}>
          {r.description && (
            <p style={{ margin: "0 0 10px", color: "#555", fontSize: 13, lineHeight: 1.5 }}>
              {r.description}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              color: "#6366F1", background: "#E0E7FF", borderRadius: 16,
              padding: "3px 10px", fontSize: 11, fontWeight: 700,
            }}>
              <Clock size={12} /> Awaiting coordinator review
            </span>
            <button
              onClick={() => setEditing(r)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "none", color: "#3730A3", border: "1px solid #C7D2FE", borderRadius: 8,
                padding: "6px 12px", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 12,
                cursor: "pointer",
              }}
            >
              <Pencil size={12} /> View / Edit
            </button>
          </div>
        </ReportRow>
      ))}

      {editing && (
        <EditReportModal
          report={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => setMine((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
        />
      )}
    </Container>
  );
}