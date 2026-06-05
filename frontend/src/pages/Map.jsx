import { useState, useEffect } from "react";
import { BedDouble, House, TriangleAlert } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import MapView from "../components/map/MapView";
import BrainyMascot from "../components/BrainyMascot";
import { mockCrisis, mockHospitals, mockShelters } from "../lib/mockData";

// ─── Stat chip ────────────────────────────────────────────────────────────────
// A small pill displayed in the stats bar at the top of the page.
// It accepts an icon (lucide-react element), a label string, and optional colour overrides.
function StatChip({ icon, label, bg = "#E6F0EC", color = "#14532D" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      background: bg,
      border: `1px solid ${color}22`,
      borderRadius: 20,
      padding: "7px 16px",
      fontSize: 13,
      fontWeight: 700,
      color,
      whiteSpace: "nowrap",
    }}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

// ─── Filter checkbox ───────────────────────────────────────────────────────────
// One row in the "View:" panel. The coloured square next to the label matches
// the marker colour on the map so users can connect checkbox → pin visually.
function FilterRow({ color, label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12, userSelect: "none" }}>
      {/*
        The coloured square acts as a visual swatch. When unchecked we dim it
        so the user gets immediate feedback that the layer is hidden.
      */}
      <div style={{
        width: 18, height: 18, borderRadius: 4,
        background: checked ? color : "#ccc",
        border: `2px solid ${checked ? color : "#bbb"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, border-color 0.15s",
        flexShrink: 0,
      }}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {/* Hidden native checkbox keeps keyboard/accessibility support */}
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: "none" }} />
      <span style={{ fontSize: 14, color: "#333", fontFamily: "Nunito, sans-serif" }}>{label}</span>
    </label>
  );
}

// ─── Map page ─────────────────────────────────────────────────────────────────
export default function Map() {
  // Each of these useState calls creates a piece of React state.
  // React re-renders the component whenever you call the setter (e.g. setCrises).
  const [crisis,    setCrisis]    = useState([]);
  const [shelters,  setShelters]  = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [userPos,   setUserPos]   = useState(null); // null until geolocation resolves

  // Three booleans: one per marker layer. All default to visible (true).
  const [filters, setFilters] = useState({ crises: true, shelters: true, hospitals: true });

  // useEffect runs once after the component first appears on screen (the empty []
  // dependency array means "only run on mount, not on every re-render").
  // This is where we load data. In production replace the mock imports with
  // real fetch() calls to the backend.
  useEffect(() => {
    // Ask the browser for the user's GPS position.
    // The first callback runs on success; the second runs if permission is denied.
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      ()    => setUserPos([1.3521, 103.8198]), // fall back to Singapore centre
    );

    // ── MOCK: swap these three lines for real fetch() calls when backend is ready ──
    // Real version would look like:
    //   const res = await fetch("/api/crises");
    //   const data = await res.json();
    //   setCrisis(data);
    setCrisis(mockCrisis);
    setShelters(mockShelters);
    setHospitals(mockHospitals);
    setLoading(false);
  }, []);

  // Derived values computed from state — no extra useState needed.
  const activeCrisis = crisis.filter(c => c.status === "active").length;
  const totalBeds    = hospitals.reduce((sum, h) => sum + h.beds_available, 0);

  // Toggle one filter key without touching the others.
  // The spread ...f copies the existing object, then [key]: !f[key] flips just that key.
  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }));

  // Build the Brainy message dynamically based on live data
  const brainyMessage = activeCrisis > 0
    ? `${activeCrisis} active crisis${activeCrisis > 1 ? "es" : ""} on the map. Stay safe and check crisis details before heading out!`
    : "All clear! No active crises right now. Stay prepared.";

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif" }}>
      <Navbar />

      {/* ── Stats bar ── */}
      <div style={{
        display: "flex", gap: 10, padding: "14px 24px",
        flexWrap: "wrap", alignItems: "center",
      }}>
        <StatChip icon={<BedDouble  size={14} />} label={`Hospital beds: ${totalBeds}`}   bg="#EFF6FF" color="#1E40AF" />
        <StatChip icon={<House      size={14} />} label={`Shelters: ${shelters.length}`}  bg="#F0FDF4" color="#14532D" />
        <StatChip icon={<TriangleAlert size={14} />} label={`Active Crises: ${activeCrisis}`} bg="#FEF3C7" color="#92400E" />
      </div>

      {/* ── Body: map + sidebar ── */}
      <div className="map-body">

        {/* Map area — flex:1 makes it take all remaining horizontal space */}
        <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", minHeight: 580 }}>
          {/*
            We pass pre-filtered arrays into MapView.
            When filters.crises is false we pass [] (empty array), so MapView
            renders no crisis markers — it never needs to know about filter state.
            This keeps MapView "dumb" and Map.jsx in charge of data logic.
          */}
          <MapView
            crisis={filters.crisis       ? crisis    : []}
            shelters={filters.shelters   ? shelters  : []}
            hospitals={filters.hospitals ? hospitals : []}
            userPos={userPos}
            loading={loading}
          />
        </div>

        {/* ── Sidebar ── */}
        <div className="map-sidebar">

          {/* Filter card */}
          <div style={{
            background: "#fff",
            borderRadius: 16,
            padding: "16px 20px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a2e", marginBottom: 14 }}>View:</div>
            <FilterRow color="#2563EB" label="Hospital beds" checked={filters.hospitals} onChange={() => toggleFilter("hospitals")} />
            <FilterRow color="#16A34A" label="Shelter"       checked={filters.shelters}  onChange={() => toggleFilter("shelters")}  />
            <FilterRow color="#EF4444" label="Crisis"        checked={filters.crisis}    onChange={() => toggleFilter("crisis")}    />
          </div>

          {/* Brainy speech bubble + mascot */}
          <div className="map-brainy">
            {/* Speech bubble — the triangle at the bottom points down toward Brainy */}
            <div style={{
              background: "#fff",
              borderRadius: 14,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1a2e",
              lineHeight: 1.55,
              boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
              textAlign: "center",
              position: "relative",
            }}>
              {brainyMessage}
              {/* CSS triangle trick: a zero-width/height element with borders
                  creates a triangle. Here top+left+right borders form a downward point. */}
              <div style={{
                position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)",
                width: 0, height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "10px solid #fff",
              }} />
            </div>
            <BrainyMascot mood={activeCrisis > 0 ? "angry" : "happy"} width={140} />
          </div>
        </div>
      </div>
    </div>
  );
}
