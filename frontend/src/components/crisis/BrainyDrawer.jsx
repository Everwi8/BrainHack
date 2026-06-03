// Jerald — slide-in Brainy chat drawer for the Crisis Detail page.
//
// Opens from the right edge. Sends messages to Perrin's POST /api/chat with the
// current crisis as context, and falls back to a local contextual reply if that
// endpoint isn't live yet (it's currently a stub). Reuses Perrin's chat UI
// components so the look matches the main Chat page.
//
// ── API CONTRACT (for Perrin) ─────────────────────────────────────────────────
//   POST /api/chat
//   Request body:  { message: string, crisis_id: string, history: [{role,text}] }
//   Response body: { reply: string }   (also accepts { text } or { message })
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import BrainyMascot from "../BrainyMascot";
import MessageBubble from "../chat/MessageBubble";
import ChatInput from "../chat/ChatInput";

function nowTime() {
  return new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
}

// Local fallback reply — used only when the backend /api/chat isn't available.
// Uses the crisis data so the canned answer still feels specific and useful.
function localReply(message, crisis) {
  const m = message.toLowerCase();
  const s = crisis.sensors ?? {};
  const openTasks = (crisis.tasks ?? []).filter((t) => t.status === "open" || t.status === "urgent");

  if (m.includes("safe") || m.includes("danger") || m.includes("evacuate")) {
    return `For ${crisis.title}: follow marshals on site and avoid low-lying areas. If water is rising near you, move to higher ground and head to the nearest shelter. Want me to point you to it on the map?`;
  }
  if (m.includes("task") || m.includes("help") || m.includes("do")) {
    return openTasks.length
      ? `There ${openTasks.length === 1 ? "is" : "are"} ${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} right now. The most urgent is “${openTasks[0].title}” (${openTasks[0].note}). Tap a task card to sign up to help with it.`
      : "All tasks here are currently covered — thank you! I'll ping the group chat if a new one opens up.";
  }
  if (m.includes("water") || m.includes("drain") || m.includes("flood")) {
    return s.pub_drain_pct != null
      ? `The PUB drain sensor here reads ${s.pub_drain_pct}% and rain is at ${s.nea_rain_mm ?? "—"}mm. ${s.pub_drain_pct > 80 ? "That's in ALERT range — flooding likely." : s.pub_drain_pct > 60 ? "That's a WARNING level — stay alert." : "Levels are okay for now."}`
      : "There's no live water-level sensor attached to this crisis right now.";
  }
  return `I'm tracking ${crisis.title} (${crisis.address}). ${crisis.summary} Ask me about safety, the open tasks, or live sensor readings.`;
}

export default function BrainyDrawer({ open, onClose, crisis }) {
  // Seed the conversation with a contextual greeting once the crisis is known.
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef(null);

  // Reset the greeting whenever the drawer opens for a (possibly different) crisis.
  useEffect(() => {
    if (open && crisis) {
      setMessages([{
        id: "greet",
        role: "bot",
        text: `Hi! I'm watching **${crisis.title}**. ${crisis.summary} Ask me anything — safety, tasks, or the live readings.`,
        timestamp: nowTime(),
      }]);
    }
  }, [open, crisis]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function sendMessage(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isTyping) return;

    const userMsg = { id: Date.now(), role: "user", text: trimmed, timestamp: nowTime() };
    const history = [...messages, userMsg].map((mm) => ({ role: mm.role, text: mm.text }));
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    let reply;
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, crisis_id: crisis.id, history }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      reply = data.reply ?? data.text ?? data.message;
      if (!reply) throw new Error("empty reply"); // stub returns nothing → fall back
    } catch {
      reply = localReply(trimmed, crisis); // backend not ready — graceful fallback
    }

    setMessages((prev) => [...prev, { id: Date.now() + 1, role: "bot", text: reply, timestamp: nowTime() }]);
    setIsTyping(false);
  }

  return (
    <>
      {/* Backdrop — fades in; click to close. pointerEvents off when hidden so it
          doesn't block the page underneath. */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1400,
          background: "rgba(0,0,0,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
      />

      {/* Panel — slides in from the right via translateX. */}
      <aside
        role="dialog"
        aria-label="Chat with Brainy"
        aria-hidden={!open}
        style={{
          position: "fixed", top: 0, right: 0, zIndex: 1401,
          height: "100vh", width: "min(400px, 92vw)",
          background: "#F5F0E8",
          boxShadow: "-8px 0 30px rgba(0,0,0,0.18)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          display: "flex", flexDirection: "column",
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px", background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)", flexShrink: 0,
        }}>
          <BrainyMascot mood={isTyping ? "normal" : "happy"} width={40} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: "#1a1a2e" }}>Brainy</div>
            <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 700 }}>
              {isTyping ? "thinking…" : "online · crisis co-pilot"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: "#F3F4F6", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#E5E7EB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F3F4F6")}
          >
            <X size={18} color="#374151" />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 6px" }}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} role={msg.role} text={msg.text} timestamp={msg.timestamp} />
          ))}
          {isTyping && (
            <div style={{ fontSize: 12.5, color: "#9CA3AF", fontWeight: 700, margin: "2px 0 14px 44px" }}>
              Brainy is typing…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 14px 16px", flexShrink: 0 }}>
          <ChatInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSend={() => sendMessage()}
            disabled={isTyping}
          />
        </div>
      </aside>
    </>
  );
}
