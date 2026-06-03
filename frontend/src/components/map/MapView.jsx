import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import CrisisMarker from "./CrisisMarker";

// Leaflet's default PNG marker icons have a broken path in Vite/webpack builds
// because the bundler moves asset files. This block patches Leaflet to use
// the CDN copy of those images so the default icon works as a fallback.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// A small helper that renders one row of the map legend
function LegendRow({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
      <div style={{
        width: 12, height: 12, borderRadius: "50%",
        background: color,
        border: "2px solid #fff",
        boxShadow: "0 0 4px rgba(0,0,0,0.2)",
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 12, color: "#444", fontFamily: "Nunito, sans-serif" }}>{label}</span>
    </div>
  );
}

// MapView receives pre-filtered arrays from Map.jsx.
// When the user unchecks "Shelters", Map.jsx passes an empty [] here,
// so MapView doesn't need to know about filter state at all — clean separation.
export default function MapView({ crisis = [], shelters = [], hospitals = [], userPos, loading }) {
  return (
    // Outer wrapper is position:relative so the legend overlay and
    // loading spinner can sit on top of the map using position:absolute.
    <div style={{ position: "relative", height: "100%", minHeight: 580 }}>

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
        center={[1.3521, 103.8198]}
        zoom={12}
        style={{ height: "100%", minHeight: 580, width: "100%", borderRadius: 16 }}
        zoomControl
      >
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
            <CrisisMarker key={crisis.id} crisis={crisis} />
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

        {/* User's own location — blue dot with white ring */}
        {userPos && (
          <CircleMarker
            center={userPos}
            radius={9}
            pathOptions={{ color: "#fff", weight: 3, fillColor: "#3B82F6", fillOpacity: 1 }}
          >
            <Tooltip direction="top" permanent={false} offset={[0, -14]}>
              <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 12 }}>You are here</span>
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      {/* Map legend — overlaid in bottom-right corner of the map */}
      <div style={{
        position: "absolute", bottom: 28, right: 16, zIndex: 500,
        background: "#fff",
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: "0 2px 14px rgba(0,0,0,0.16)",
        fontFamily: "Nunito, sans-serif",
        minWidth: 150,
      }}>
        <div style={{ fontWeight: 800, fontSize: 11, color: "#1a1a2e", letterSpacing: 0.8, marginBottom: 10, textTransform: "uppercase" }}>
          Map Legend
        </div>
        <LegendRow color="#EF4444" label="High Severity" />
        <LegendRow color="#F97316" label="Medium Severity" />
        <LegendRow color="#EAB308" label="Low Severity" />
        <LegendRow color="#16A34A" label="Shelter" />
        <LegendRow color="#2563EB" label="Hospital" />
        <LegendRow color="#3B82F6" label="Your location" />
      </div>
    </div>
  );
}
