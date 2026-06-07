// Aiya — Brainy greeting + actions panel (right side of home page)
import { useNavigate } from "react-router-dom";
import { Camera, MessageCircle, Mic, Waves, BedDouble, Home as HomeIcon, AlertTriangle, LifeBuoy } from "lucide-react";

// Each quick topic opens the chat and auto-sends `prompt` to Brainy.
const quickTopics = [
  { Icon: Waves,         label: "Floods",        bg: "#DBEAFE", color: "#3B82F6", prompt: "Are there any flood alerts in Singapore right now?" },
  { Icon: BedDouble,     label: "Hospital Beds", bg: "#dbfee3", color: "#2ba552", prompt: "Which hospitals have available beds right now?" },
  { Icon: HomeIcon,      label: "Shelters",      bg: "#fef3db", color: "#efa42c", prompt: "Where are the nearest emergency shelters I can go to?" },
  { Icon: AlertTriangle, label: "Find Out More", bg: "#FEF3C7", color: "#F59E0B", prompt: "What is BrainySG and what can you help me with?" },
  { Icon: LifeBuoy,      label: "Get Help",      bg: "#FEE2E2", color: "#EF4444", prompt: "I need help during an emergency — what should I do?" },
];

export default function BrainyPanel() {
  const navigate = useNavigate();

  return (
    <div style={{ alignSelf: "start" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", textAlign: "right", marginBottom: 10 }}>
        I am a: <span style={{ fontWeight: 800 }}>resident</span>
      </div>
      <div style={{
        background: "#fff",
        borderRadius: 20,
        padding: "20px",
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#999", letterSpacing: 1, marginBottom: 14 }}>ACTIONS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { Icon: Camera,        label: "Snap a photo",      action: () => navigate("/chat", { state: { action: "photo" } }) },
            { Icon: MessageCircle, label: "Chat with Brainy",  action: () => navigate("/chat") },
            { Icon: Mic,           label: "Record voice memos",action: () => navigate("/chat", { state: { action: "voice" } }) },
          ].map(({ Icon, label, action }) => (
            <button key={label} onClick={action} style={{
              background: "#fff",
              border: "1.5px solid #E5E7EB",
              borderRadius: 30,
              padding: "11px 16px",
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "#1a1a2e",
              transition: "border-color 0.15s, background 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.background = "#EFF6FF"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#999", letterSpacing: 1, margin: "20px 0 14px" }}>QUICK TOPICS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {quickTopics.map(({ Icon, label, bg, color, prompt }) => (
            <button key={label} onClick={() => navigate("/chat", { state: { prompt } })} style={{
              background: bg,
              border: "none",
              borderRadius: 14,
              padding: "12px 6px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              fontFamily: "'Nunito', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              color: "#1a1a2e",
              transition: "transform 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = ""}
            >
              <Icon size={22} color={color} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}