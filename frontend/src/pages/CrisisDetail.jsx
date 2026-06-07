// Jerald — Crisis Detail view.
// Reads :id from the URL and fetches that crisis from the backend (GET /api/crises/:id).
//
// Sections: Header · Brainy's Brief · Live sensor cards · Area mini-map · Task panel · "I want to help"

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import {
  ArrowLeft, MapPin, Clock, Droplets, Waves, TrainFront, BedDouble,
  TrendingUp, TrendingDown, Minus, ShieldCheck, ExternalLink, Users, ListTodo,
  MessageCircle, MessagesSquare, ChevronRight,
} from "lucide-react";
import Navbar from "../components/layout/NavBar";
import BrainyMascot from "../components/BrainyMascot";
import BrainyDrawer from "../components/crisis/BrainyDrawer";

// Placeholder "nearby helpers" for the mini-map until James's live volunteer
// locations (GET /api/volunteers) are wired up — that endpoint is still a stub.
// Each entry is a small lat/lng offset applied around the crisis epicentre.
const NEARBY_HELPERS = [
  { id: "h1", name: "Aisha",    dLat:  0.0016, dLng:  0.0013, skill: "Medical" },
  { id: "h2", name: "Wei Ming", dLat: -0.0012, dLng:  0.0019, skill: "Has car" },
  { id: "h3", name: "CERT T4",  dLat:  0.0009, dLng: -0.0016, skill: "CERT" },
];

// ─── Design tokens (match the rest of the app) ─────────────────────────────────
const CREAM   = "#F5F0E8";
const INK     = "#1a1a2e";
const CARD     = "#fff";
const CARD_SH  = "0 2px 12px rgba(0,0,0,0.07)";
const RADIUS   = 16;

// Severity → colour + label. Mirrors CrisisMarker.jsx so the dot colour the user
// clicked on the map matches the badge they see here.
const SEVERITY = {
  critical: { color: "#EF4444", bg: "#FEE2E2", label: "Critical" },
  warning:  { color: "#F97316", bg: "#FFEDD5", label: "Warning"  },
  low:      { color: "#EAB308", bg: "#FEF9C3", label: "Low"      },
};

// Status badge colours used inside sensor cards (OK / WARN / ALERT / WATCH).
const STATUS_STYLE = {
  OK:    { color: "#15803D", bg: "#DCFCE7" },
  WARN:  { color: "#B45309", bg: "#FEF3C7" },
  ALERT: { color: "#B91C1C", bg: "#FEE2E2" },
  WATCH: { color: "#1D4ED8", bg: "#DBEAFE" },
};

// Task status → colour + label.
const TASK_STATUS = {
  urgent:      { color: "#B91C1C", bg: "#FEE2E2", label: "Urgent"      },
  open:        { color: "#1D4ED8", bg: "#DBEAFE", label: "Open"        },
  in_progress: { color: "#B45309", bg: "#FEF3C7", label: "In Progress" },
  done:        { color: "#15803D", bg: "#DCFCE7", label: "Done"        },
};

// ─── Small helpers ──────────────────────────────────────────────────────────────

// "Updated X min ago" — converts an ISO timestamp into a friendly relative string.
function timeAgo(iso) {
  if (!iso) return "just now";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1)   return "just now";
  if (min < 60)  return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24)   return `${hr} hr ago`;
  return `${Math.round(hr / 24)} day(s) ago`;
}

// A reusable white panel — every section sits inside one of these.
function Panel({ children, style = {} }) {
  return (
    <div style={{ background: CARD, borderRadius: RADIUS, boxShadow: CARD_SH, padding: 20, ...style }}>
      {children}
    </div>
  );
}

// Coloured pill badge used for severity, trend, agency tags, etc.
function Badge({ children, color, bg, style = {} }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: bg, color,
      fontSize: 12, fontWeight: 800,
      padding: "4px 10px", borderRadius: 999,
      letterSpacing: 0.2, ...style,
    }}>
      {children}
    </span>
  );
}

// ─── Sensor card ─────────────────────────────────────────────────────────────────
// One of the four live-data cards. `value` is the displayed reading, `status` is
// one of OK/WARN/ALERT/WATCH, and `pct` (0–100) optionally fills a progress bar.
function SensorCard({ icon, label, value, status, pct }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.OK;
  return (
    <div style={{
      flex: "1 1 150px", minWidth: 150,
      background: CARD, borderRadius: 14, boxShadow: CARD_SH,
      padding: 16, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#555", fontSize: 12, fontWeight: 700 }}>
          {icon}{label}
        </div>
        <Badge color={s.color} bg={s.bg}>{status}</Badge>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: INK }}>{value}</div>
      {/* Progress bar — only shown when a percentage is provided */}
      {pct != null && (
        <div style={{ height: 6, borderRadius: 999, background: "#EEE", overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`, height: "100%",
            background: s.color, borderRadius: 999,
            transition: "width 300ms ease",
          }} />
        </div>
      )}
    </div>
  );
}

// ─── Task card ───────────────────────────────────────────────────────────────────
// When `onClick` is provided (open / urgent tasks) the card becomes a button that
// signs the user up to help with that specific task. Done / in-progress tasks are
// passed no handler, so they render as plain, non-interactive cards.
function TaskCard({ task, onClick }) {
  const t = TASK_STATUS[task.status] ?? TASK_STATUS.open;
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: "#FBFAF7", border: "1px solid #ECE6DA", borderRadius: 12,
        padding: "12px 14px", display: "flex", flexDirection: "column", gap: 5,
        cursor: clickable ? "pointer" : "default",
        transition: "border-color 150ms, box-shadow 150ms, background 150ms",
      }}
      onMouseEnter={clickable ? (e) => {
        e.currentTarget.style.borderColor = "#EF4444";
        e.currentTarget.style.boxShadow = "0 2px 10px rgba(239,68,68,0.14)";
        e.currentTarget.style.background = "#fff";
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        e.currentTarget.style.borderColor = "#ECE6DA";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.background = "#FBFAF7";
      } : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: INK }}>{task.title}</span>
        <Badge color={t.color} bg={t.bg}>{t.label}</Badge>
      </div>
      <span style={{ fontSize: 12.5, color: "#6B6B6B" }}>{task.note}</span>
      {clickable && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 2,
          fontSize: 12, fontWeight: 800, color: "#EF4444", marginTop: 2,
        }}>
          Help with this <ChevronRight size={13} />
        </span>
      )}
    </div>
  );
}

// ─── Sensor status logic (thresholds from JeraldSession.md) ───────────────────────
function rainStatus(mm)   { if (mm == null)  return null; return mm  > 60 ? "ALERT" : mm  > 40 ? "WARN" : "OK"; }
function drainStatus(pct) { if (pct == null) return null; return pct > 80 ? "ALERT" : pct > 60 ? "WARN" : "OK"; }

// Trend → icon + colour. Reads the free-text trend string for keywords.
function trendVisual(trend = "") {
  const t = trend.toLowerCase();
  if (t.includes("wors") || t.includes("+")) return { icon: <TrendingUp size={13} />,   color: "#B91C1C", bg: "#FEE2E2" };
  if (t.includes("improv") || t.includes("-")) return { icon: <TrendingDown size={13} />, color: "#15803D", bg: "#DCFCE7" };
  return { icon: <Minus size={13} />, color: "#475569", bg: "#E2E8F0" };
}

// ─── Page ────────────────────────────────────────────────────────────────────────
export default function CrisisDetail() {
  const { id } = useParams();          // reads :id from /crises/:id
  const navigate = useNavigate();

  const [crisis, setCrisis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState("all"); // all | open | in_progress | done
  const [chatOpen, setChatOpen] = useState(false);      // Brainy drawer visibility

  // A task is "claimable" (clickable to help) when it still needs volunteers.
  const isClaimable = (t) => t.status === "open" || t.status === "urgent";

  // Fetch the crisis whenever the id in the URL changes.
  useEffect(() => {
    let cancelled = false; // guards against setting state after unmount

    async function load() {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
      try {
        const res = await fetch(`${apiUrl}/api/crises/${id}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setCrisis(data);
      } catch {
        // Backend unreachable or crisis not found — render the not-found state.
        if (!cancelled) setCrisis(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; }; // cleanup runs if id changes / component unmounts
  }, [id]);

  // ── Loading & not-found states ──
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Nunito', sans-serif" }}>
        <Navbar />
        <div style={{ padding: 40, textAlign: "center", color: "#666", fontWeight: 700 }}>Loading crisis…</div>
      </div>
    );
  }

  if (!crisis) {
    return (
      <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Nunito', sans-serif" }}>
        <Navbar />
        <div style={{ maxWidth: 600, margin: "40px auto", textAlign: "center" }}>
          <BrainyMascot mood="surprised" width={120} />
          <h2 style={{ color: INK, marginTop: 12 }}>Crisis not found</h2>
          <p style={{ color: "#666" }}>We couldn't find a crisis with id “{id}”.</p>
          <Link to="/map" style={{ color: "#16A34A", fontWeight: 800 }}>← Back to Map</Link>
        </div>
      </div>
    );
  }

  // ── Derived values ──
  const sev = SEVERITY[crisis.severity] ?? SEVERITY.warning;
  const trend = trendVisual(crisis.trend);
  const sensors = crisis.sensors ?? {};
  const tasks = crisis.tasks ?? [];

  const openCount = tasks.filter((t) => t.status === "open" || t.status === "urgent").length;
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === "all") return true;
    if (taskFilter === "open") return t.status === "open" || t.status === "urgent";
    return t.status === taskFilter;
  });

  // Helper count parsed from the summary ("12 volunteers active") — demo heuristic.
  const helperMatch = (crisis.summary ?? "").match(/(\d+)\s+volunteers?/i);
  const helperCount = helperMatch ? helperMatch[1] : "—";

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Nunito', sans-serif", color: INK }}>
      <Navbar />

      <div className="crisis-page-inner">

        {/* ── Back link ── */}
        <Link to="/map" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          color: "#16A34A", fontWeight: 800, fontSize: 14, textDecoration: "none", width: "fit-content",
        }}>
          <ArrowLeft size={16} /> Back to Map
        </Link>

        {/* ── 1. Header (full width) ── */}
        <Panel>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {/* Severity dot */}
              <div style={{
                width: 46, height: 46, borderRadius: 14, background: sev.bg,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: sev.color, display: "block" }} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{crisis.title}</h1>
                <div style={{ display: "flex", gap: 14, marginTop: 6, color: "#666", fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={13} /> {crisis.address}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={13} /> Updated {timeAgo(crisis.updated_at)}</span>
                </div>
              </div>
            </div>
            <Badge color={sev.color} bg={sev.bg} style={{ fontSize: 13, padding: "6px 14px" }}>{sev.label}</Badge>
          </div>
        </Panel>

        {/* ── Two-column body: content on the left, sticky map + CTA on the right ── */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* ════ LEFT column: Brainy, sensors, tasks ════ */}
          {/* flex "1 1 540px" = grow to fill, but wrap below the sidebar under ~540px.
              minWidth: 0 lets the column shrink so long text wraps instead of overflowing. */}
          <div style={{ flex: "1 1 540px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* ── 2. Brainy's Brief ── */}
            <Panel style={{ background: "#FFFDF8", border: "1px solid #F0E8D8" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <BrainyMascot mood={crisis.severity === "critical" ? "angry" : "normal"} width={72} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900, fontSize: 15 }}>Brainy's Brief</span>
                    <Badge color="#15803D" bg="#DCFCE7"><ShieldCheck size={12} /> High confidence</Badge>
                    <Badge color={trend.color} bg={trend.bg}>{trend.icon} {crisis.trend}</Badge>
                  </div>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "#333" }}>{crisis.summary}</p>
                  {/* Agency source tags */}
                  <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                    {["NEA", "PUB", "LTA", "MOH"].map((a) => (
                      <span key={a} style={{
                        fontSize: 11, fontWeight: 800, color: "#475569",
                        background: "#EEF2F7", border: "1px solid #DDE3EA",
                        padding: "3px 9px", borderRadius: 6,
                      }}>{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            {/* ── 3. Live data sources ── */}
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 900, margin: "0 0 10px 2px" }}>Live data sources</h2>
              {/* CSS grid auto-fits as many 150px+ cards per row as fit, so the four
                  cards form a clean 4-across / 2x2 grid depending on column width. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <SensorCard
                  icon={<Droplets size={14} />} label="NEA Rain"
                  value={sensors.nea_rain_mm != null ? `${sensors.nea_rain_mm} mm` : "No data"}
                  status={rainStatus(sensors.nea_rain_mm) ?? "OK"}
                  pct={sensors.nea_rain_mm != null ? sensors.nea_rain_mm : null}
                />
                <SensorCard
                  icon={<Waves size={14} />} label="PUB Drain"
                  value={sensors.pub_drain_pct != null ? `${sensors.pub_drain_pct}%` : "No data"}
                  status={drainStatus(sensors.pub_drain_pct) ?? "OK"}
                  pct={sensors.pub_drain_pct != null ? sensors.pub_drain_pct : null}
                />
                <SensorCard
                  icon={<TrainFront size={14} />} label="LTA Transit"
                  value={sensors.lta_eta_min != null ? `${sensors.lta_eta_min} min ETA` : "Normal"}
                  status={sensors.lta_eta_min != null ? "WATCH" : "OK"}
                />
                <SensorCard
                  icon={<BedDouble size={14} />} label="MOH Beds"
                  value={sensors.moh_beds_avail != null ? `${sensors.moh_beds_avail} free` : "—"}
                  status="OK"
                />
              </div>
            </div>

            {/* ── 5. Task panel ── */}
            <Panel>
              {/* Stats row */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#F0FDF4", color: "#14532D", padding: "7px 14px", borderRadius: 12, fontWeight: 800, fontSize: 13 }}>
                  <Users size={15} /> {helperCount} helpers
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#FEF3C7", color: "#92400E", padding: "7px 14px", borderRadius: 12, fontWeight: 800, fontSize: 13 }}>
                  <ListTodo size={15} /> {openCount} open tasks
                </div>
              </div>

              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {[
                  { key: "all", label: "All" },
                  { key: "open", label: "Open" },
                  { key: "in_progress", label: "In Progress" },
                  { key: "done", label: "Done" },
                ].map((tab) => {
                  const active = taskFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setTaskFilter(tab.key)}
                      style={{
                        cursor: "pointer", border: "none", borderRadius: 999,
                        padding: "7px 14px", fontSize: 13, fontWeight: 800,
                        fontFamily: "inherit",
                        background: active ? INK : "#F0EDE5",
                        color: active ? "#fff" : "#555",
                        transition: "background 150ms, color 150ms",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Task list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredTasks.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 13.5, fontWeight: 600, textAlign: "center", padding: "16px 0" }}>
                    No tasks in this category.
                  </p>
                ) : (
                  filteredTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      // Only open / urgent tasks are clickable — they route to the
                      // volunteer signup with this crisis + task pre-selected.
                      onClick={isClaimable(t)
                        ? () => navigate(`/volunteers?crisis_id=${crisis.id}&task_id=${t.id}`)
                        : undefined}
                    />
                  ))
                )}
              </div>
            </Panel>
          </div>

          {/* ════ RIGHT sidebar: mini-map + CTA (sticky so it follows on scroll) ════ */}
          <div style={{ flex: "1 1 320px", minWidth: 300, display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 16 }}>

            {/* ── 4. Area mini-map ── */}
            <Panel style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ position: "relative" }}>
                <MapContainer
                  center={[crisis.lat, crisis.lng]}
                  zoom={15}
                  style={{ height: 320, width: "100%" }}
                  zoomControl={false}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
                    attribution='&copy; OneMap'
                    minZoom={11} maxZoom={19}
                  />
                  {/* Crisis epicentre */}
                  <CircleMarker
                    center={[crisis.lat, crisis.lng]}
                    radius={11}
                    pathOptions={{ color: "#fff", weight: 3, fillColor: sev.color, fillOpacity: 1 }}
                  />
                  {/* Nearby helpers (placeholder — swap for James's live volunteer locations).
                      Each helper sits at a small offset from the crisis epicentre. */}
                  {NEARBY_HELPERS.map((h) => (
                    <CircleMarker
                      key={h.id}
                      center={[crisis.lat + h.dLat, crisis.lng + h.dLng]}
                      radius={7}
                      pathOptions={{ color: "#fff", weight: 2, fillColor: "#16A34A", fillOpacity: 1 }}
                    >
                      <Tooltip direction="top" offset={[0, -8]}>
                        <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 12, fontWeight: 700 }}>
                          {h.name}
                        </span>
                        <br />
                        <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 11, color: "#555" }}>
                          {h.skill} · en route
                        </span>
                      </Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>

                {/* Helper count caption (top-left overlay) */}
                <div style={{
                  position: "absolute", top: 10, left: 10, zIndex: 500,
                  background: "#fff", color: "#14532D", fontWeight: 800, fontSize: 12,
                  padding: "6px 11px", borderRadius: 8,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#16A34A", display: "block" }} />
                  {NEARBY_HELPERS.length} helpers nearby
                </div>

                <Link to="/map" style={{
                  position: "absolute", bottom: 10, right: 10, zIndex: 500,
                  background: "#fff", color: INK, fontWeight: 800, fontSize: 12,
                  padding: "7px 12px", borderRadius: 8, textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)", display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  Open full map <ExternalLink size={12} />
                </Link>
              </div>
            </Panel>

            {/* ── 6. I want to help ── */}
            <button
              onClick={() => navigate(`/volunteers?crisis_id=${crisis.id}`)}
              style={{
                cursor: "pointer", border: "none", borderRadius: 14,
                background: "#EF4444", color: "#fff",
                fontSize: 17, fontWeight: 900, fontFamily: "inherit",
                padding: "16px 24px", letterSpacing: 0.4,
                boxShadow: "0 4px 16px rgba(239,68,68,0.35)",
                transition: "background 150ms, transform 100ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#DC2626")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#EF4444")}
            >
              I WANT TO HELP
            </button>

            {/* Secondary actions: Talk to Brainy (opens drawer) + Group Chat (James's page) */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setChatOpen(true)}
                style={{
                  flex: 1, cursor: "pointer", borderRadius: 12,
                  border: "2px solid #16A34A", background: "#fff", color: "#16A34A",
                  fontSize: 14, fontWeight: 800, fontFamily: "inherit",
                  padding: "12px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F0FDF4")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <MessageCircle size={16} /> Talk to Brainy
              </button>
              <button
                onClick={() => navigate(`/volunteers?crisis_id=${crisis.id}`)}
                style={{
                  flex: 1, cursor: "pointer", borderRadius: 12,
                  border: "2px solid #2563EB", background: "#fff", color: "#2563EB",
                  fontSize: 14, fontWeight: 800, fontFamily: "inherit",
                  padding: "12px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#EFF6FF")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <MessagesSquare size={16} /> Group Chat
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-in Brainy chat drawer (sits above everything via fixed positioning) */}
      <BrainyDrawer open={chatOpen} onClose={() => setChatOpen(false)} crisis={crisis} />
    </div>
  );
}
