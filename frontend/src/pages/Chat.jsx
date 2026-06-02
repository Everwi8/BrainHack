import { useState, useRef, useEffect } from "react";
import { Waves, House, Zap, AlertTriangle, Activity, Bot, X } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import BrainyMascot from "../components/BrainyMascot";
import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import InlineShelterCard from "../components/chat/InlineShelterCard";
import InlineHospitalCard from "../components/chat/InlineHospitalCard";
import InlineCrisisCard from "../components/chat/InlineCrisisCard";
import { api } from "../lib/api";

// ── Mock responses (swap out for real API call when backend is ready) ──────────
const MOCK_RESPONSES = {
  flood: {
    text: "Current flood alerts in your area:\n• **Pasir Ris Drive 3** — Active (water level rising)\n• **Tampines Ave 5** — Warning\n\nAvoid flooded roads and move valuables to higher ground. Do you want me to show nearby evacuation routes?",
    crisisCard: {
      type: "flood", severity: "critical",
      title: "Flash flood: Pasir Ris Dr 3",
      location: "Pasir Ris Drive 3, near Block 512",
      detail: "Water level at 88% of capacity — flooding likely. Avoid the area and move to higher ground.",
    },
  },
  shelter: {
    text: "Here are the nearest emergency shelters to your current location:",
    shelterCard: { name: "Pasir Ris Community Club", distance: "400m away", status: "Open" },
  },
  hospital: {
    text: "Here are the nearest hospitals and their latest reported bed availability:",
    hospitalCard: { name: "Changi General Hospital", distance: "2.3 km away", beds: 42, total: 180 },
  },
  situation: {
    text: "Here's the most urgent situation near you right now:",
    crisisCard: {
      type: "cascade", severity: "critical",
      title: "Flash-flood cascade: Pasir Ris Dr 3",
      location: "Pasir Ris Drive 3",
      detail: "Heavy thundery showers over Pasir Ris while the canal is at 88% capacity — flash flooding likely within the hour. Avoid underpasses and low-lying roads.",
    },
  },
  haze: {
    text: "The PSI reading is currently **42 (Good)** islandwide. Haze has cleared and outdoor activities are safe for now. I'll notify you if conditions change.",
  },
  help: {
    text: "I can help you with:\n• **Floods** — real-time water level alerts\n• **Shelters** — nearest open shelters near you\n• **Haze** — air quality & PSI readings\n• **Incidents** — report something you see nearby\n\nWhat do you need right now?",
  },
  "find out more": {
    text: "**BrainySG** monitors live feeds from NEA, PUB, and SCDF to keep you informed during emergencies. I can guide you to safety, find shelters, or help you report incidents. What would you like to explore?",
  },
  incident: {
    text: "To report an incident, I'll need a few details:\n1. What type of incident is it? (flood, fire, medical, etc.)\n2. What is the exact location?\n3. Are there injuries?\n\nYou can also tap the **camera icon** to attach a photo.",
  },
  safe: {
    text: "Glad to hear you're safe! Stay indoors if possible and keep monitoring alerts. I'm here if anything changes — just message me.",
  },
  default: {
    text: "I'm here to help! You can ask me about **flood alerts**, **nearby shelters**, **haze levels**, or tap one of the quick buttons below. What do you need?",
  },
};

function getBotResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes("hospital") || lower.includes("bed") || lower.includes("medical")) return MOCK_RESPONSES.hospital;
  if (lower.includes("situation") || lower.includes("summary") || lower.includes("happening")) return MOCK_RESPONSES.situation;
  if (lower.includes("flood") || lower.includes("water"))       return MOCK_RESPONSES.flood;
  if (lower.includes("shelter") || lower.includes("evacuate"))  return MOCK_RESPONSES.shelter;
  if (lower.includes("haze") || lower.includes("psi") || lower.includes("air")) return MOCK_RESPONSES.haze;
  if (lower.includes("help") || lower.includes("assist"))       return MOCK_RESPONSES.help;
  if (lower.includes("find out") || lower.includes("more info")) return MOCK_RESPONSES["find out more"];
  if (lower.includes("incident") || lower.includes("report"))   return MOCK_RESPONSES.incident;
  if (lower.includes("safe") || lower.includes("okay") || lower.includes("ok")) return MOCK_RESPONSES.safe;
  return MOCK_RESPONSES.default;
}
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_MESSAGES = [
  {
    id: 1,
    role: "bot",
    text: "Good morning, John! It looks like there's a **Flash Flood** warning near Pasir Ris Drive 3. Are you currently in that area? I can provide safety instructions or show you the nearest shelters.",
    timestamp: "09:41 AM",
  },
  {
    id: 2,
    role: "user",
    text: "I'm nearby. Can you show me where the nearest shelters are? Also, is there any haze report today?",
    timestamp: "09:42 AM",
  },
  {
    id: 3,
    role: "bot",
    text: "Haze has cleared islandwide! Regarding shelters, here is the closest one to your current location:",
    timestamp: "09:42 AM",
    shelterCard: { name: "Pasir Ris Community Club", distance: "400m away", status: "Open" },
  },
];

const QUICK_CHIPS = [
  { label: "Situation",     Icon: Activity,       color: "#0F766E", bg: "#CCFBF1", action: "situation" },
  { label: "Floods",        Icon: Waves,         color: "#2563EB", bg: "#DBEAFE" },
  { label: "Shelters",      Icon: House,          color: "#D97706", bg: "#FEF3C7" },
  { label: "Help",          Icon: Zap,            color: "#DC2626", bg: "#FEE2E2" },
  { label: "Find out more", Icon: AlertTriangle,  color: "#B45309", bg: "#FEF9C3" },
];

function nowTime() {
  return new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
}

// Animated typing indicator — three bouncing dots
function TypingIndicator() {
  return (
    <>
      <style>{`
        @keyframes brainy-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 18 }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "#374151", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Bot size={18} color="#fff" />
        </div>
        <div style={{
          background: "#fff", borderRadius: "18px 18px 18px 4px",
          padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          {[0, 0.16, 0.32].map((delay, i) => (
            <div key={i} style={{
              width: 7, height: 7, borderRadius: "50%", background: "#9CA3AF",
              animation: `brainy-bounce 1.2s ease-in-out ${delay}s infinite`,
            }} />
          ))}
        </div>
      </div>
    </>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);   // { file, url }
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handlePickImage = (file) => {
    // Replacing an un-sent preview: free the old object URL first.
    if (pendingImage?.url) URL.revokeObjectURL(pendingImage.url);
    setPendingImage({ file, url: URL.createObjectURL(file) });
  };

  const cancelPhoto = () => {
    if (pendingImage?.url) URL.revokeObjectURL(pendingImage.url);
    setPendingImage(null);
  };

  const sendPhoto = async () => {
    if (!pendingImage || isTyping) return;

    const caption = input.trim();
    const { file, url } = pendingImage;

    // Show the user's photo (and caption) immediately.
    setMessages(prev => [...prev, {
      id: Date.now(), role: "user", text: caption, imageUrl: url, timestamp: nowTime(),
    }]);
    setInput("");
    setPendingImage(null);   // keep the object URL alive — it's now owned by the message
    setIsTyping(true);

    const form = new FormData();
    form.append("image", file);
    if (caption) form.append("caption", caption);
    if (sessionId) form.append("session_id", sessionId);

    try {
      const res = await api.postForm("/api/chat/photo", form);
      if (res.session_id) setSessionId(res.session_id);
      setMessages(prev => [...prev, {
        id: Date.now(), role: "bot", text: res.reply, timestamp: nowTime(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now(), role: "bot",
        text: `Sorry, I couldn't analyse that photo. ${err.message}`,
        timestamp: nowTime(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessage = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isTyping) return;

    const userMsg = { id: Date.now(), role: "user", text: trimmed, timestamp: nowTime() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Inline rich cards are still keyword-driven from mock data until Sanjey's
    // crisis/shelter/hospital endpoints are live; we attach them to whichever
    // reply we end up showing (real or fallback).
    const mock = getBotResponse(trimmed);
    const cards = {
      shelterCard: mock.shelterCard,
      hospitalCard: mock.hospitalCard,
      crisisCard: mock.crisisCard,
    };

    try {
      const res = await api.post("/api/chat", { message: trimmed, session_id: sessionId });
      if (res.session_id) setSessionId(res.session_id);
      setMessages(prev => [...prev, {
        id: Date.now(), role: "bot", text: res.reply, timestamp: nowTime(), ...cards,
      }]);
    } catch {
      // Backend unreachable — degrade gracefully to the canned response so the
      // demo keeps working offline.
      setMessages(prev => [...prev, { id: Date.now(), role: "bot", timestamp: nowTime(), ...mock }]);
    } finally {
      setIsTyping(false);
    }
  };

  // showSituation pulls the live triage report and renders the top findings as
  // crisis cards — this is the AI triage backend driving the chat with real
  // data. Falls back to the canned situation card if the backend is down.
  const showSituation = async () => {
    if (isTyping) return;
    setMessages(prev => [...prev, {
      id: Date.now(), role: "user", text: "What's the current situation?", timestamp: nowTime(),
    }]);
    setIsTyping(true);
    try {
      const report = await api.get("/api/triage");
      const top = (report.findings ?? []).slice(0, 3).map(f => ({
        type: f.type, severity: f.severity, title: f.title,
        location: f.location, detail: f.detail,
      }));
      if (top.length === 0) {
        setMessages(prev => [...prev, {
          id: Date.now(), role: "bot", timestamp: nowTime(),
          text: "Good news — no active alerts across Singapore right now. I'll let you know if anything changes.",
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now(), role: "bot", timestamp: nowTime(),
          text: `Here are the ${top.length} most urgent situations across Singapore right now:`,
          crisisCards: top,
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: "bot", timestamp: nowTime(), ...MOCK_RESPONSES.situation }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box",
    }}>
      <Navbar />

      <div style={{
        flex: 1, overflow: "hidden",
        display: "flex", gap: 24,
        padding: "0 40px",
        maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box",
      }}>
        {/* ── Left panel ── */}
        <div style={{
          width: 264, flexShrink: 0,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "24px 0 20px", gap: 16,
        }}>
          <BrainyMascot mood={isTyping ? "normal" : "happy"} width={240} />
          <div style={{
            background: "#fff", borderRadius: 20, padding: "18px 20px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: "100%",
          }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#1a1a2e", marginBottom: 8 }}>
              I'm Brainy!
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
              {isTyping
                ? "Brainy is thinking..."
                : "Your personal emergency buddy. I can help you find shelters, check flood levels, or report incidents nearby."}
            </div>
          </div>
        </div>

        {/* ── Chat area ── */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          padding: "0 0 20px", overflow: "hidden",
        }}>
          {/* Messages scroll area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0 4px" }}>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                text={msg.text}
                timestamp={msg.timestamp}
              >
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Shared photo"
                    style={{
                      maxWidth: "100%", borderRadius: 12, marginTop: msg.text ? 8 : 0,
                      display: "block",
                    }}
                  />
                )}
                {msg.shelterCard && (
                  <InlineShelterCard
                    name={msg.shelterCard.name}
                    distance={msg.shelterCard.distance}
                    status={msg.shelterCard.status}
                  />
                )}
                {msg.hospitalCard && (
                  <InlineHospitalCard
                    name={msg.hospitalCard.name}
                    distance={msg.hospitalCard.distance}
                    beds={msg.hospitalCard.beds}
                    total={msg.hospitalCard.total}
                  />
                )}
                {msg.crisisCard && (
                  <InlineCrisisCard
                    type={msg.crisisCard.type}
                    severity={msg.crisisCard.severity}
                    title={msg.crisisCard.title}
                    location={msg.crisisCard.location}
                    detail={msg.crisisCard.detail}
                  />
                )}
                {msg.crisisCards?.map((c, i) => (
                  <InlineCrisisCard
                    key={i}
                    type={c.type}
                    severity={c.severity}
                    title={c.title}
                    location={c.location}
                    detail={c.detail}
                  />
                ))}
              </MessageBubble>
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick-action chips */}
          <div style={{ display: "flex", gap: 8, padding: "10px 0 10px", flexWrap: "wrap" }}>
            {QUICK_CHIPS.map(({ label, Icon, color, bg, action }) => (
              <button
                key={label}
                onClick={() => (action === "situation" ? showSituation() : sendMessage(label))}
                disabled={isTyping}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: bg, border: "none", borderRadius: 20,
                  padding: "8px 14px",
                  fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 13,
                  color, cursor: isTyping ? "not-allowed" : "pointer",
                  opacity: isTyping ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => { if (!isTyping) e.currentTarget.style.opacity = "0.75"; }}
                onMouseLeave={e => { if (!isTyping) e.currentTarget.style.opacity = "1"; }}
              >
                <Icon size={14} color={color} />
                {label}
              </button>
            ))}
          </div>

          {/* Pending photo preview */}
          {pendingImage && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "#fff", borderRadius: 16, padding: 10, marginBottom: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}>
              <img
                src={pendingImage.url}
                alt="Preview"
                style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
              />
              <div style={{ flex: 1, fontSize: 13, color: "#6B7280", fontWeight: 600 }}>
                Photo ready to send. Add an optional note, then tap send.
              </div>
              <button
                onClick={cancelPhoto}
                disabled={isTyping}
                title="Remove photo"
                style={{
                  background: "none", border: "none", cursor: isTyping ? "not-allowed" : "pointer",
                  padding: 6, borderRadius: 8, display: "flex", flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                <X size={18} color="#6B7280" />
              </button>
            </div>
          )}

          {/* Input bar */}
          <ChatInput
            value={input}
            onChange={e => setInput(e.target.value)}
            onSend={() => (pendingImage ? sendPhoto() : sendMessage())}
            onPickImage={handlePickImage}
            disabled={isTyping}
          />
        </div>
      </div>
    </div>
  );
}
