// Mock data for Jerald's map while Sanjey's backend endpoints aren't ready.
// Each array is shaped exactly like the real API response will be.
// When real APIs go live: delete the arrays you no longer need and point to lib/api.js instead.

export const mockCrisis = [
  {
    id: "crisis-1",
    type: "flood",
    title: "Flash Flood — Pasir Ris Dr 3",
    severity: "critical",
    status: "active",
    lat: 1.3731,
    lng: 103.9497,
    address: "Pasir Ris Dr 3",
    updated_at: "2026-05-31T10:00:00Z",
    summary:
      "Heavy rainfall pooling near Blk 512. Drain at 78% and rising. Canal 4 overflow risk within ~25 min. 12 volunteers active — prioritise 2 elderly residents flagged at Blk 512.",
    trend: "+30% worsening over next hour",
    sensors: {
      nea_rain_mm: 72,
      pub_drain_pct: 78,
      lta_eta_min: 25,
      moh_beds_avail: 87,
    },
    tasks: [
      { id: "t1", title: "Check on Mr. Tan", note: "Blk 512 #04-21 · Nurse preferred", status: "urgent" },
      { id: "t2", title: "Sandbags at carpark", note: "CC car park · 2 of 4 helpers", status: "in_progress" },
      { id: "t3", title: "Direct traffic at junction", note: "PR Dr 3 × PR St 51 · CERT only", status: "open" },
      { id: "t4", title: "Reroute pedestrians, gate 3", note: "Posted by RC Lim · needs 2", status: "open" },
      { id: "t5", title: "Confirm shelter capacity", note: "Pasir Ris CC · 312 / 400", status: "done" },
    ],
  },
  {
    id: "crisis-2",
    type: "fire",
    title: "Grass Fire — Jurong West St 42",
    severity: "warning",
    status: "active",
    lat: 1.3400,
    lng: 103.707,
    address: "Jurong West St 42",
    updated_at: "2026-05-31T09:30:00Z",
    summary: "Grass fire reported near Jurong West park connector. SCDF on scene. No civilian casualties reported.",
    trend: "stable",
    sensors: {},
    tasks: [
      { id: "t6", title: "Cordon off park connector", note: "500m radius · RC volunteers", status: "in_progress" },
      { id: "t7", title: "Check elderly at Block 439", note: "Jurong West Ave 1", status: "open" },
    ],
  },
  {
    id: "crisis-3",
    type: "haze",
    title: "Haze Advisory — North Region",
    severity: "warning",
    status: "active",
    lat: 1.436,
    lng: 103.786,
    address: "Woodlands / Yishun",
    updated_at: "2026-05-31T08:00:00Z",
    summary: "PSI reading at 104. Outdoor activity not recommended for sensitive groups. Schools switching to indoor recess.",
    trend: "improving",
    sensors: { nea_psi: 104 },
    tasks: [],
  },
  {
    id: "crisis-4",
    type: "flood",
    title: "Flood Warning — Bukit Timah Rd",
    severity: "warning",
    status: "active",
    lat: 1.3270,
    lng: 103.814,
    address: "Bukit Timah Rd near Sixth Ave",
    updated_at: "2026-05-31T09:45:00Z",
    summary: "Localised flooding on Bukit Timah Rd. Traffic diversions in place. Water level at 40%, watch status.",
    trend: "stable",
    sensors: { pub_drain_pct: 40, nea_rain_mm: 38 },
    tasks: [
      { id: "t8", title: "Traffic diversion — Sixth Ave", note: "LTA · Police support requested", status: "in_progress" },
    ],
  },
  {
    id: "crisis-5",
    type: "transport",
    title: "MRT Disruption — East-West Line",
    severity: "low",
    status: "active",
    lat: 1.2841,
    lng: 103.8455,
    address: "Tanjong Pagar MRT to Bugis MRT",
    updated_at: "2026-05-31T10:15:00Z",
    summary: "Signalling fault between Tanjong Pagar and Bugis. Free shuttle bus service activated. Est. 40 min delay.",
    trend: "stable",
    sensors: {},
    tasks: [],
  },
];

export const mockHospitals = [
  { id: "hosp-1", name: "Changi General Hospital",            lat: 1.3403, lng: 103.9496, beds_available: 87 },
  { id: "hosp-2", name: "Tan Tock Seng Hospital",             lat: 1.3218, lng: 103.8458, beds_available: 54 },
  { id: "hosp-3", name: "Singapore General Hospital",         lat: 1.2796, lng: 103.8358, beds_available: 120 },
  { id: "hosp-4", name: "KK Women's and Children's Hospital", lat: 1.3098, lng: 103.8455, beds_available: 31 },
  { id: "hosp-5", name: "National University Hospital",       lat: 1.2939, lng: 103.7839, beds_available: 66 },
  { id: "hosp-6", name: "Ng Teng Fong General Hospital",      lat: 1.3336, lng: 103.7436, beds_available: 43 },
  { id: "hosp-7", name: "Sengkang General Hospital",          lat: 1.393,  lng: 103.8956, beds_available: 29 },
  { id: "hosp-8", name: "Khoo Teck Puat Hospital",            lat: 1.424,  lng: 103.8381, beds_available: 71 },
];

// Mock "nearby helpers" for the Crisis Detail mini-map.
// These are small lat/lng OFFSETS (deltas) applied around whatever crisis is
// being viewed, so the same set renders sensibly around any crisis location.
// Swap for James's real volunteer-location API (live tracking) when available.
export const mockHelpers = [
  { id: "h1", name: "Aisha",     dLat:  0.0016, dLng:  0.0013, skill: "Medical" },
  { id: "h2", name: "Wei Ming",  dLat: -0.0012, dLng:  0.0019, skill: "Has car" },
  { id: "h3", name: "CERT T4",   dLat:  0.0009, dLng: -0.0016, skill: "CERT" },
];

// Used by MapView directly (shelters come from backend in production; mock here for UI work)
export const mockShelters = [
  { id: "shelter-1",  name: "Pasir Ris CC",   lat: 1.3731, lng: 103.9497, capacity: 400, current_occupancy: 312 },
  { id: "shelter-2",  name: "Tampines CC",    lat: 1.3536, lng: 103.9436, capacity: 350, current_occupancy: 180 },
  { id: "shelter-3",  name: "Bedok CC",       lat: 1.3236, lng: 103.927,  capacity: 300, current_occupancy: 95  },
  { id: "shelter-4",  name: "Ang Mo Kio CC",  lat: 1.3696, lng: 103.849,  capacity: 450, current_occupancy: 210 },
  { id: "shelter-5",  name: "Bishan CC",      lat: 1.3501, lng: 103.848,  capacity: 380, current_occupancy: 140 },
  { id: "shelter-6",  name: "Jurong East CC", lat: 1.3329, lng: 103.7436, capacity: 320, current_occupancy: 88  },
  { id: "shelter-7",  name: "Woodlands CC",   lat: 1.4363, lng: 103.7861, capacity: 410, current_occupancy: 300 },
  { id: "shelter-8",  name: "Yishun CC",      lat: 1.4257, lng: 103.8353, capacity: 360, current_occupancy: 175 },
  { id: "shelter-9",  name: "Sengkang CC",    lat: 1.3916, lng: 103.8956, capacity: 290, current_occupancy: 60  },
  { id: "shelter-10", name: "Clementi CC",    lat: 1.3153, lng: 103.765,  capacity: 330, current_occupancy: 120 },
];
