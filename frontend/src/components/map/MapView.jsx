import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { LocateFixed } from "lucide-react";
import CrisisMarker from "./CrisisMarker";

// User-location marker colour — a distinct violet so it doesn't blend into the
// hospital (blue) or shelter (green) markers. Shared by the pin and the legend.
const YOU_COLOR = "#7C3AED";

// Leaflet's default PNG marker icons have a broken path in Vite/webpack builds
// because the bundler moves asset files. This block patches Leaflet to use
// the CDN copy of those images so the default icon works as a fallback.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// MapResizer fixes the blank/grey map on mobile. Leaflet measures and caches the
// container size when the map initialises, but on small screens the map area is
// laid out (the .map-body flex column, fonts, the stats bar) *after* the map has
// already mounted — so Leaflet keeps a stale size and never paints the tiles.
// A ResizeObserver tells Leaflet to re-measure once the layout settles and on
// every subsequent resize; orientationchange covers phone rotation.
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => map.invalidateSize();
    // Two deferred calls: 400ms catches the initial layout settle on mobile
    // (fonts + stats bar paint after mount); 1200ms is a belt-and-suspenders
    // pass for slow devices where CSS layout may still be in progress.
    const t1 = setTimeout(invalidate, 400);
    const t2 = setTimeout(invalidate, 1200);
    const ro = new ResizeObserver(invalidate);
    ro.observe(map.getContainer());
    window.addEventListener("orientationchange", invalidate);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("orientationchange", invalidate);
    };
  }, [map]);
  return null;
}

// RecenterOnUser pans/zooms to the user's resolved position the first time it
// arrives, so the "Your location" pin is guaranteed to be in view (otherwise it
// can sit off-screen and look like no pin appeared at all). Fires once.
// The flyTo is delayed past MapResizer's invalidateSize (400ms) so Leaflet has
// a valid container size before the animation math runs — calling flyTo on a
// zero-size container produces NaN coordinates and crashes the render tree.
// `disabled` suppresses it when a deep-linked crisis is the flight target instead.
function RecenterOnUser({ pos, disabled = false }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (disabled) {
      done.current = true; // a focused crisis owns the camera — never user-recenter
      return;
    }
    if (pos && !done.current) {
      done.current = true;
      const t = setTimeout(() => {
        try {
          const { x, y } = map.getSize();
          if (x > 0 && y > 0) map.flyTo(pos, 14, { duration: 1 });
        } catch (_) {}
      }, 500);
      return () => clearTimeout(t);
    }
  }, [pos, map, disabled]);
  return null;
}

// FocusCrisis flies to a deep-linked crisis (/map?crisis=<id>) once it appears
// in the loaded list, zooming in far enough to break it out of any cluster.
// Same 500ms delay rationale as RecenterOnUser.
function FocusCrisis({ crisis }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!crisis || done.current) return;
    done.current = true;
    const t = setTimeout(() => {
      try {
        const { x, y } = map.getSize();
        if (x > 0 && y > 0) map.flyTo([crisis.lat, crisis.lng], 16, { duration: 1 });
      } catch (_) {}
    }, 500);
    return () => clearTimeout(t);
  }, [crisis, map]);
  return null;
}

// A small helper that renders one row of the map legend
function LegendRow({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
      <div style={{
        width: 10, height: 10, borderRadius: "50%",
        background: color,
        border: "2px solid #fff",
        boxShadow: "0 0 4px rgba(0,0,0,0.2)",
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: "#444", fontFamily: "Nunito, sans-serif" }}>{label}</span>
    </div>
  );
}

// MapView receives pre-filtered arrays from Map.jsx.
// When the user unchecks "Shelters", Map.jsx passes an empty [] here,
// so MapView doesn't need to know about filter state at all — clean separation.
export default function MapView({ crisis = [], shelters = [], hospitals = [], userPos, loading, onCrisisSelect, focusCrisis = null }) {
  // Ref to the Leaflet map instance so the "Find me" overlay button (which lives
  // outside the MapContainer's React tree) can pan the map.
  const mapRef = useRef(null);
  // Ref to the user-location CircleMarker so "Find me" can pop its tooltip.
  const youMarkerRef = useRef(null);

  // Recenter on the user. Uses the resolved position when we have it, otherwise
  // asks Leaflet to actively locate via the browser. We also pop the "You are
  // here" label on the violet dot so, after recentering, the user can tell their
  // own marker apart from the crisis / shelter / hospital pins instead of mixing
  // it up. The label auto-hides after a moment so it doesn't linger.
  const findMe = () => {
    const map = mapRef.current;
    if (!map) return;
    if (userPos) map.flyTo(userPos, 16, { duration: 1 });
    else map.locate({ setView: true, maxZoom: 16 });

    const marker = youMarkerRef.current;
    if (marker) {
      marker.openTooltip();
      setTimeout(() => { try { marker.closeTooltip(); } catch (_) {} }, 3500);
    }
  };

  return (
    // Outer wrapper is position:relative so the legend overlay and
    // loading spinner can sit on top of the map using position:absolute.
    <div style={{ position: "relative", height: "100%" }}>

      {/* Loading overlay — visible while mock data is being "fetched" */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(245,240,232,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, borderRadius: 16,
        }}>
          <span style={{ fontFamily: "Nunito, sans-serif", fontWeight: 700, color: "#666", fontSize: 15 }}>
            Loading map data…
          </span>
        </div>
      )}

      {/*
        MapContainer is react-leaflet's root component. It:
        - Creates the Leaflet map instance
        - Sets the initial centre (Singapore's geographic centre) and zoom level
        - Must have a defined height — Leaflet won't render in a zero-height div
      */}
      <MapContainer
        ref={mapRef}
        center={[1.3521, 103.8198]}
        zoom={12}
        style={{ height: "100%", width: "100%", borderRadius: 16 }}
        zoomControl
      >
        {/* Keeps Leaflet's cached size in sync with the real container size —
            without this the map renders blank on mobile (see MapResizer above). */}
        <MapResizer />
        <RecenterOnUser pos={userPos} disabled={!!focusCrisis} />
        <FocusCrisis crisis={focusCrisis} />

        {/*
          TileLayer loads the map background images (tiles).
          Tiles are small 256×256 PNG images named by zoom/x/y.
          Leaflet requests them from OneMap's CDN — the {z}/{x}/{y} placeholders
          are replaced with real numbers at runtime depending on where you're looking.
          minZoom:11 = can't zoom out past SG island, maxZoom:19 = street level
        */}
        <TileLayer
          url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
          attribution='<a href="https://www.onemap.gov.sg/" target="_blank">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank">SLA</a>'
          minZoom={11}
          maxZoom={19}
        />

        {/*
          MarkerClusterGroup automatically groups nearby CrisisMarkers into a
          single numbered cluster badge when zoomed out, and splits them apart
          as you zoom in. This keeps the map readable when many crisis overlap.
        */}
        <MarkerClusterGroup>
          {crisis.map(crisis => (
            <CrisisMarker
              key={crisis.id}
              crisis={crisis}
              onSelect={onCrisisSelect}
              highlight={crisis.id === focusCrisis?.id}
            />
          ))}
        </MarkerClusterGroup>

        {/*
          CircleMarker is a fixed-pixel-size circle (unlike Circle which is
          geo-sized). radius=10 means 10px regardless of zoom level.
          pathOptions controls fill, stroke, and opacity — same idea as CSS.
        */}
        {shelters.map(shelter => (
          <CircleMarker
            key={shelter.id}
            center={[shelter.lat, shelter.lng]}
            radius={10}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#16A34A", fillOpacity: 0.9 }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 13, fontWeight: 700 }}>{shelter.name}</span>
              <br />
              <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 12, color: "#555" }}>
                {shelter.current_occupancy} / {shelter.capacity} capacity
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {hospitals.map(hospital => (
          <CircleMarker
            key={hospital.id}
            center={[hospital.lat, hospital.lng]}
            radius={10}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#2563EB", fillOpacity: 0.9 }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 13, fontWeight: 700 }}>{hospital.name}</span>
              <br />
              <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 12, color: "#555" }}>
                {hospital.beds_available} beds available
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* User's own location — violet dot with white ring (distinct from the
            blue hospital / green shelter markers) */}
        {userPos && (
          <CircleMarker
            ref={youMarkerRef}
            center={userPos}
            radius={9}
            pathOptions={{ color: "#fff", weight: 3, fillColor: YOU_COLOR, fillOpacity: 1 }}
          >
            <Tooltip direction="top" permanent={false} offset={[0, -14]}>
              <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 12 }}>You are here</span>
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      {/* Find me — recenters the map on the user's location (bottom-left) */}
      <button
        onClick={findMe}
        title="Center the map on my location"
        style={{
          position: "absolute", bottom: 28, left: 16, zIndex: 500,
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "#fff", color: YOU_COLOR,
          border: "none", borderRadius: 24, padding: "10px 16px",
          fontFamily: "Nunito, sans-serif", fontSize: 13, fontWeight: 800,
          cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
        }}
      >
        <LocateFixed size={16} /> Find me
      </button>

      {/* Map legend — overlaid in bottom-right corner of the map */}
      <div style={{
        position: "absolute", bottom: 28, right: 16, zIndex: 500,
        background: "#fff",
        borderRadius: 10,
        padding: "9px 12px",
        boxShadow: "0 2px 14px rgba(0,0,0,0.16)",
        fontFamily: "Nunito, sans-serif",
        minWidth: 124,
      }}>
        <div style={{ fontWeight: 800, fontSize: 10, color: "#1a1a2e", letterSpacing: 0.7, marginBottom: 7, textTransform: "uppercase" }}>
          Map Legend
        </div>
        <LegendRow color="#EF4444" label="High Severity" />
        <LegendRow color="#F97316" label="Medium Severity" />
        <LegendRow color="#EAB308" label="Low Severity" />
        <LegendRow color="#16A34A" label="Shelter" />
        <LegendRow color="#2563EB" label="Hospital" />
        <LegendRow color={YOU_COLOR} label="Your location" />
      </div>
    </div>
  );
}
