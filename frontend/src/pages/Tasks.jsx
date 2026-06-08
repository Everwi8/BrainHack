// Tasks — volunteer task board. Lists tasks from GET /api/tasks with a status
// filter; each card links through to the crisis it belongs to (/crises/:id).
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ListTodo, ArrowRight, Clock, Users } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import BrainyMascot from "../components/BrainyMascot";
import { api } from "../lib/api";

// ─── Design tokens (match the rest of the app) ─────────────────────────────────
const CREAM  = "#F5F0E8";
const INK    = "#1a1a2e";
const CARD    = "#fff";
const CARD_SH = "0 2px 12px rgba(0,0,0,0.07)";
const RADIUS  = 16;

// Status → colour + label. Covers the backend's lifecycle values (pending →
// assigned → in_progress → resolved) plus the triage-derived ones (open,
// urgent, done). Unknown values fall back to a neutral grey badge.
const TASK_STATUS = {
  urgent:      { color: "#B91C1C", bg: "#FEE2E2", label: "Urgent"      },
  pending:     { color: "#1D4ED8", bg: "#DBEAFE", label: "Pending"     },
  open:        { color: "#1D4ED8", bg: "#DBEAFE", label: "Open"        },
  assigned:    { color: "#7C3AED", bg: "#EDE9FE", label: "Assigned"    },
  in_progress: { color: "#B45309", bg: "#FEF3C7", label: "In Progress" },
  resolved:    { color: "#15803D", bg: "#DCFCE7", label: "Resolved"    },
  done:        { color: "#15803D", bg: "#DCFCE7", label: "Done"        },
};
const statusStyle = (s) => TASK_STATUS[s] ?? { color: "#6B7280", bg: "#F3F4F6", label: s || "—" };

// Priority → colour + label (mirrors the AI task-card scheme on CrisisDetail).
const TASK_PRIORITY = {
  high:   { color: "#B91C1C", bg: "#FEE2E2", label: "High"   },
  medium: { color: "#C2410C", bg: "#FFEDD5", label: "Medium" },
  low:    { color: "#166534", bg: "#DCFCE7", label: "Low"    },
};

// Filter buckets group the raw statuses into the three the user cares about.
const FILTERS = [
  { key: "all",         label: "All" },
  { key: "open",        label: "Open",        match: ["pending", "open", "urgent", "assigned"] },
  { key: "in_progress", label: "In Progress", match: ["in_progress"] },
  { key: "done",        label: "Done",        match: ["resolved", "done"] },
];

// "Updated X min ago" — converts an ISO timestamp into a friendly relative string.
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  // Reject NaN and the Go zero-time sentinel ("0001-01-01T00:00:00Z" → large
  // negative epoch), which would otherwise render as "739774d ago".
  if (!Number.isFinite(then) || then <= 0) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.get("/api/tasks");
        if (!cancelled) setTasks(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const active = FILTERS.find((f) => f.key === filter);
  const visible = filter === "all"
    ? tasks
    : tasks.filter((t) => active?.match?.includes(t.status));

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Nunito', sans-serif" }}>
      <Navbar />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <ListTodo size={28} color="#92400E" />
          <h1 style={{ color: INK, fontSize: 28, fontWeight: 800, margin: 0 }}>Tasks</h1>
        </div>
        <p style={{ color: "#666", marginTop: 0, marginBottom: 20 }}>
          Volunteer tasks generated from active crises.
        </p>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {FILTERS.map(({ key, label }) => {
            const on = filter === key;
            return (
              <button key={key} onClick={() => setFilter(key)} style={{
                border: "none", cursor: "pointer", borderRadius: 999,
                padding: "6px 16px", fontFamily: "'Nunito', sans-serif",
                fontSize: 14, fontWeight: 700,
                background: on ? "#92400E" : CARD,
                color: on ? "#fff" : "#666",
                boxShadow: on ? "none" : CARD_SH,
              }}>{label}</button>
            );
          })}
        </div>

        {/* States */}
        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "#666", fontWeight: 700 }}>Loading tasks…</div>
        )}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <BrainyMascot mood="surprised" width={110} />
            <p style={{ color: "#666", marginTop: 12 }}>Couldn't load tasks right now. Please try again.</p>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <BrainyMascot mood="happy" width={110} />
            <p style={{ color: "#666", marginTop: 12 }}>No tasks here — all clear for now.</p>
          </div>
        )}

        {/* Task list */}
        {!loading && !error && visible.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visible.map((t) => {
              const st = statusStyle(t.status);
              const pr = TASK_PRIORITY[t.priority];
              return (
                <div key={t.id} style={{
                  background: CARD, borderRadius: RADIUS, boxShadow: CARD_SH, padding: "16px 18px",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <h3 style={{ color: INK, fontSize: 17, fontWeight: 800, margin: 0 }}>{t.title}</h3>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {pr && (
                        <span style={{
                          color: pr.color, background: pr.bg,
                          borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 800,
                        }}>{pr.label}</span>
                      )}
                      <span style={{
                        color: st.color, background: st.bg,
                        borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 800,
                      }}>{st.label}</span>
                    </div>
                  </div>

                  {t.description && (
                    <p style={{ color: "#555", margin: "8px 0 0", lineHeight: 1.45 }}>{t.description}</p>
                  )}

                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginTop: 12, flexWrap: "wrap", gap: 8,
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 14, color: "#999", fontSize: 13, flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Clock size={13} /> {timeAgo(t.created_at) || "—"}
                      </span>
                      {t.volunteers_needed > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#16A34A", fontWeight: 700 }}>
                          <Users size={13} /> {t.volunteers_needed} needed
                        </span>
                      )}
                    </span>
                    {t.crisis_id && (
                      <Link to={`/crises/${t.crisis_id}`} style={{
                        display: "flex", alignItems: "center", gap: 4,
                        color: "#16A34A", fontWeight: 800, fontSize: 14, textDecoration: "none",
                      }}>
                        View crisis <ArrowRight size={15} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
