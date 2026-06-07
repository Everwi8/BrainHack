import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/layout/NavBar";
import { MapPin, MessageCircle, Share2, AlertTriangle, Zap, Users, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ApprovalContainer, MyPendingContainer } from "../components/feed/PendingReports";

// Maps the backend feed's tag enum (handler/feed.go) to display styling.
const TAG_DISPLAY = {
  URGENT_ALERT: { label: "URGENT ALERT", color: "#EF4444", bg: "#FEF2F2", icon: "alert" },
  LIVE:         { label: "LIVE",         color: "#EF4444", bg: "#FEF2F2", icon: "zap" },
  TRENDING:     { label: "TRENDING",     color: "#D97706", bg: "#FFFBEB", icon: "zap" },
  COMMUNITY:    { label: "COMMUNITY",    color: "#D97706", bg: "#FFFBEB", icon: "zap" },
};

// timeAgo renders a coarse relative timestamp from an ISO string.
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// toCard shapes a backend FeedItem into the props FeedCard renders. The feed
// item id IS the crisis id, so "View Detail" opens the same /crises/:id page
// the map markers link to — one crisis, two surfaces.
function toCard(item) {
  const d = TAG_DISPLAY[item.tag] ?? TAG_DISPLAY.COMMUNITY;
  return {
    id: item.id,
    crisisId: item.id,
    status: item.status || "active",
    tag: d.label, tagColor: d.color, tagBg: d.bg, tagIcon: d.icon,
    time: timeAgo(item.created_at),
    title: item.title,
    location: item.location || "Singapore",
    body: item.body,
    image: item.image_url || null,
    comments: item.comment_count ?? 0,
    shares: item.share_count ? String(item.share_count) : null,
    helpNeeded: item.help_needed,
  };
}

const MOCK_FEED = [
  {
    id: 1,
    tag: "URGENT ALERT",
    tagColor: "#EF4444",
    tagBg: "#FEF2F2",
    tagIcon: "alert",
    time: "2 mins ago",
    title: "Flash Flood at Orchard Road",
    location: "Orchard Road (Near Lucky Plaza)",
    body: "Heavy rainfall has caused significant water pooling. Traffic is diverted. Pedestrians advised to avoid basement levels of nearby malls. PUB teams are on-site.",
    image: null,
    comments: 24,
    shares: null,
    helpNeeded: true,
    action: { label: "View Detail", primary: true, href: "/crisis" },
  },
  {
    id: 2,
    tag: "LIVE",
    tagColor: "#EF4444",
    tagBg: "#FEF2F2",
    tagIcon: "zap",
    time: "23 mins ago",
    title: "Haze Alert in North-East",
    location: "Punggol, Sengkang",
    body: "PSI readings have reached 102 (Unhealthy) in the NE region. Elderly and children are advised to stay indoors. Distribution of masks starting at Community Centers.",
    image: null,
    comments: 156,
    shares: "3.2k",
    helpNeeded: false,
    action: { label: "Official Report", primary: false, href: "#" },
  },
  {
    id: 3,
    tag: "TRENDING",
    tagColor: "#D97706",
    tagBg: "#FFFBEB",
    tagIcon: "zap",
    time: "36 mins ago",
    title: "Gas Leak at Jurong Industrial Estate",
    location: "Jurong Island, Tuas",
    body: "A chemical gas leak has been reported near Jurong Island. Residents in Tuas and Pioneer are advised to close windows and stay indoors. SCDF HazMat teams are on-site.",
    image: null,
    comments: 89,
    shares: "5.5k",
    helpNeeded: false,
    action: { label: "Official Report", primary: false, href: "#" },
  },
  {
    id: 4,
    tag: "COMMUNITY",
    tagColor: "#D97706",
    tagBg: "#FFFBEB",
    tagIcon: "zap",
    time: "45 mins ago",
    title: "Power Outage in Tampines",
    location: "Tampines Central, Tampines",
    body: "Multiple blocks in Tampines Central experiencing power outage since 3:15 PM. SP Group crews are working to restore supply. Estimated restoration pending assessment.",
    image: null,
    comments: 32,
    shares: "177",
    helpNeeded: false,
    action: { label: "Official Report", primary: false, href: "#" },
  },
  {
    id: 5,
    tag: "LIVE",
    tagColor: "#EF4444",
    tagBg: "#FEF2F2",
    tagIcon: "zap",
    time: "1 hr ago",
    title: "MRT Service Disruption — East-West Line",
    location: "Jurong East to Clementi",
    body: "Free shuttle buses are deployed between Jurong East and Clementi due to a train fault. Estimated restoration time is 6:30 PM. Commuters advised to use alternative routes.",
    image: null,
    comments: 412,
    shares: "8.1k",
    helpNeeded: false,
    action: { label: "Official Report", primary: false, href: "#" },
  },
];

const TRENDING = [
  { category: "Crisis · Trending", title: "Orchard Road Floods", sub: "12.4K People affected" },
  { category: "Weather · Live", title: "Haze in North-East", sub: "Trending with #SGWeather" },
  { category: "Industrial · Trending", title: "Gas Leak at Jurong Industrial Estate", sub: "SCDF HazMat teams deployed" },
];

const EMERGENCY = [
  { label: "Police", number: "999" },
  { label: "Ambulance/SCDF", number: "995" },
  { label: "Haze Hotline", number: "1800 2255 632", highlight: true },
];

function TagIcon({ type, color }) {
  if (type === "alert") return <AlertTriangle size={13} color={color} style={{ marginRight: 4 }} />;
  return <Zap size={13} color={color} style={{ marginRight: 4 }} />;
}

function FeedCard({ item, onOpen, isCoordinator, onResolve, resolving }) {
  const resolved = item.status === "resolved";
  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 16,
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      borderLeft: !resolved && item.tag === "URGENT ALERT" ? "4px solid #EF4444" : "none",
      // Resolved crises stay as history — dimmed so active ones read first.
      opacity: resolved ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        {resolved ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "#DCFCE7", color: "#15803D",
            fontWeight: 700, fontSize: 11, letterSpacing: 0.8,
            padding: "3px 10px", borderRadius: 20,
          }}>
            <CheckCircle2 size={13} /> RESOLVED
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center",
            background: item.tagBg, color: item.tagColor,
            fontWeight: 700, fontSize: 11, letterSpacing: 0.8,
            padding: "3px 10px", borderRadius: 20,
          }}>
            <TagIcon type={item.tagIcon} color={item.tagColor} />
            {item.tag}
          </span>
        )}
        <span style={{ color: "#aaa", fontSize: 12 }}>{item.time}</span>
      </div>

      <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{item.title}</h2>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <MapPin size={13} color="#aaa" />
        <span style={{ color: "#888", fontSize: 13 }}>{item.location}</span>
      </div>

      {item.body && (
        <p style={{ margin: "0 0 14px", color: "#444", fontSize: 14, lineHeight: 1.6 }}>{item.body}</p>
      )}

      {item.tags?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {item.tags.map(t => (
            <span key={t} style={{
              fontSize: 12, fontWeight: 700, color: "#D97706",
              background: "#FFFBEB", borderRadius: 16, padding: "3px 10px",
            }}>{t}</span>
          ))}
        </div>
      )}

      {item.image && (
        <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <img src={item.image} alt={item.title} style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#888", fontSize: 13 }}>
            <MessageCircle size={14} /> {item.comments}
          </span>
          {item.helpNeeded && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#888", fontSize: 13 }}>
              <Users size={14} /> Help Needed
            </span>
          )}
          {item.shares && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#888", fontSize: 13 }}>
              <Share2 size={14} /> {item.shares}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Coordinators can mark an active crisis resolved once help is done.
              It then sinks to the end of the feed and drops off the map. */}
          {isCoordinator && !resolved && item.crisisId && (
            <button
              onClick={() => onResolve?.(item.crisisId)}
              disabled={resolving}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "8px 16px", borderRadius: 24,
                border: "1px solid #16A34A", background: "none", color: "#15803D",
                fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 13,
                cursor: resolving ? "default" : "pointer", opacity: resolving ? 0.6 : 1,
              }}
            >
              <CheckCircle2 size={14} /> {resolving ? "Resolving…" : "Resolve"}
            </button>
          )}
          <button
            onClick={() => item.crisisId && onOpen?.(item.crisisId)}
            disabled={!item.crisisId}
            style={{
              padding: "8px 18px",
              borderRadius: 24,
              border: "none",
              background: "#1a1a2e",
              color: "#fff",
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: item.crisisId ? "pointer" : "default",
              opacity: item.crisisId ? 1 : 0.5,
            }}
          >
            View Detail
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Timeline() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isCoordinator = user?.role === "coordinator";
  // One-off banner after submitting a report ("…will be reviewed" / "published").
  const [flash, setFlash] = useState(location.state?.flash || "");

  // The feed is derived from approved crises (GET /api/feed) — the exact same
  // rows the map renders as markers, just presented as cards. Pending reports
  // are excluded by the backend until a coordinator approves them.
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  const loadFeed = useCallback(() => {
    return api.get("/api/feed")
      .then((d) => setFeed(Array.isArray(d?.items) ? d.items.map(toCard) : []))
      .catch((err) => { console.error("load feed:", err); setFailed(true); });
  }, []);

  useEffect(() => {
    loadFeed().finally(() => setLoading(false));
  }, [loadFeed]);

  const openCrisis = (id) => navigate(`/crises/${id}`);

  // Coordinator resolves a crisis → it leaves the map and re-sorts to the feed
  // end. Refetch so the new order/status comes straight from the backend.
  const resolveCrisis = async (id) => {
    setResolvingId(id);
    try {
      await api.post(`/api/crises/${id}/resolve`);
      await loadFeed();
    } catch (err) {
      console.error("resolve crisis:", err);
    } finally {
      setResolvingId(null);
    }
  };
  // On a backend failure, fall back to the static sample feed so the page isn't
  // blank during a demo; otherwise show the live cards.
  const items = failed ? MOCK_FEED : feed;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif" }}>
      <Navbar />
      <div className="timeline-grid">

        {/* Left panel */}
        <div className="timeline-left">
          <div style={{
            background: "#fff",
            borderRadius: 16,
            padding: "24px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
            textAlign: "center",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "#FEF3C7", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 12px",
            }}>
              <Zap size={22} color="#D97706" />
            </div>
            <p style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 14, color: "#1a1a2e", lineHeight: 1.4 }}>
              See what's happening<br />in Singapore!
            </p>
            <button
              onClick={() => navigate("/report")}
              style={{
                background: "#1a1a2e", color: "#fff",
                border: "none", borderRadius: 24,
                padding: "10px 20px", fontFamily: "'Nunito', sans-serif",
                fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%",
              }}
            >
              Report Crisis
            </button>
          </div>

          {/* Brainy mascot placeholder */}
          <div style={{
            marginTop: 20, display: "flex", justifyContent: "center",
          }}>
            <img
              src="/brainy-mascot.png"
              alt="Brainy"
              style={{ width: 140, opacity: 0.9 }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
        </div>

        {/* Center feed */}
        <div>
          {flash && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46",
              borderRadius: 12, padding: "12px 16px", marginBottom: 16,
              fontSize: 14, fontWeight: 600,
            }}>
              <span>{flash}</span>
              <button
                onClick={() => setFlash("")}
                aria-label="Dismiss"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#065F46", fontWeight: 800, fontSize: 16 }}
              >×</button>
            </div>
          )}

          {/* Report-approval workflow: coordinators see the approval queue;
              everyone else sees their own reports still awaiting review. */}
          {isCoordinator ? <ApprovalContainer /> : <MyPendingContainer />}

          {loading ? (
            <div style={{ color: "#888", fontSize: 14, padding: "24px 4px" }}>Loading feed…</div>
          ) : items.length === 0 ? (
            <div style={{
              background: "#fff", borderRadius: 16, padding: "32px 24px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)", textAlign: "center", color: "#888", fontSize: 14,
            }}>
              No active crises right now. Tap <strong>Report Crisis</strong> to file one.
            </div>
          ) : (
            items.map(item => (
              <FeedCard
                key={item.id}
                item={item}
                onOpen={openCrisis}
                isCoordinator={isCoordinator}
                onResolve={resolveCrisis}
                resolving={resolvingId === item.crisisId}
              />
            ))
          )}
        </div>

        {/* Right panel */}
        <div className="timeline-right">
          {/* What's happening */}
          <div style={{
            background: "#fff", borderRadius: 16,
            padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#1a1a2e", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={16} color="#1a1a2e" /> What's happening
            </h3>
            {TRENDING.map((t, i) => (
              <div key={i} style={{ marginBottom: i < TRENDING.length - 1 ? 16 : 0 }}>
                <span style={{ fontSize: 11, color: "#aaa" }}>{t.category}</span>
                <p style={{ margin: "2px 0 2px", fontWeight: 800, fontSize: 14, color: "#1a1a2e" }}>{t.title}</p>
                <span style={{ fontSize: 12, color: "#aaa" }}>{t.sub}</span>
              </div>
            ))}
            <button style={{
              marginTop: 16, background: "none", border: "none",
              color: "#F59E0B", fontFamily: "'Nunito', sans-serif",
              fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0,
            }}>
              Show more
            </button>
          </div>

          {/* Emergency help */}
          <div style={{
            background: "#1a1a2e", borderRadius: 16,
            padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={15} color="#F59E0B" /> Emergency Help
            </h3>
            {EMERGENCY.map((e, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingBottom: i < EMERGENCY.length - 1 ? 12 : 0,
                marginBottom: i < EMERGENCY.length - 1 ? 12 : 0,
                borderBottom: i < EMERGENCY.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}>
                <span style={{ color: "#ccc", fontSize: 14 }}>{e.label}</span>
                <span style={{
                  fontWeight: 800, fontSize: 15,
                  color: e.highlight ? "#F59E0B" : "#EF4444",
                  letterSpacing: 0.5,
                }}>{e.number}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
