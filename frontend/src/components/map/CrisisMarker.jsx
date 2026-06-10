import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import { useNavigate } from "react-router-dom";

// Maps each severity level to a dot colour matching BrainySG's brand colours.
// Covers both the triage vocabulary (critical/warning/low) and the crises-table
// vocabulary (low/medium/high/critical) so live rows colour correctly.
const SEVERITY_COLORS = {
  critical: "#EF4444", // red
  high:     "#EF4444", // red
  warning:  "#F97316", // orange
  medium:   "#F97316", // orange
  low:      "#EAB308", // yellow
};

// L.divIcon lets us draw a custom HTML element as a map marker instead of
// using a PNG image. Here we make a coloured circle that matches severity.
function buildIcon(severity) {
  const color = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.warning;
  return L.divIcon({
    // The 'html' string is injected directly into the DOM as the marker's element.
    html: `<div style="
      width:18px; height:18px;
      border-radius:50%;
      background:${color};
      border:2.5px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    // 'className:""' removes Leaflet's default white square background
    className: "",
    // iconSize tells Leaflet how large the hit-box should be
    iconSize: [18, 18],
    // iconAnchor is the pixel within the icon that sits on the lat/lng point
    iconAnchor: [9, 9],
  });
}

// `highlight` keeps the tooltip permanently open — used when the map was opened
// via a "View Map" deep link so the target crisis is unmistakable.
export default function CrisisMarker({ crisis, onSelect, highlight = false }) {
  // useNavigate is React Router's hook for programmatic navigation.
  // Calling navigate("/crises/crisis-1") is the same as the user clicking
  // <Link to="/crises/crisis-1">, but triggered from a Leaflet click event.
  const navigate = useNavigate();

  return (
    <Marker
      position={[crisis.lat, crisis.lng]}
      icon={buildIcon(crisis.severity)}
      eventHandlers={{
        // Leaflet fires "click" when the marker is clicked on the map.
        // When the parent supplies onSelect (the Map page's triage popup), call
        // it; otherwise fall back to navigating to the crisis detail page.
        click: () => {
          if (onSelect) onSelect(crisis);
          else navigate(`/crises/${crisis.id}`);
        },
      }}
    >
      {/* Tooltip appears on hover — shows the crisis name, severity, and a
          call-to-action so the user knows clicking opens the detail page. */}
      <Tooltip direction="top" offset={[0, -12]} permanent={highlight}>
        <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>
          {crisis.title}
        </span>
        <br />
        <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 12, color: "#666", textTransform: "capitalize" }}>
          {crisis.severity} severity
        </span>
        <br />
        <span style={{ fontFamily: "Nunito, sans-serif", fontSize: 12, fontWeight: 800, color: "#16A34A" }}>
          {onSelect ? "Click for triage →" : "Click for details →"}
        </span>
      </Tooltip>
    </Marker>
  );
}
