import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Waves, House, Zap, AlertTriangle, Activity, Bot, X, Plus, MessageSquare, Trash2 } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import BrainyMascot from "../components/BrainyMascot";
import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import CameraCapture from "../components/chat/CameraCapture";
import InlineCrisisCard from "../components/chat/InlineCrisisCard";
import { api } from "../lib/api";
import { getLang } from "../lib/lang";
import { useVoiceRecorder, extensionFromMime } from "../lib/useVoiceRecorder";

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
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);             // previous chats (sidebar)
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false); // mobile: previous-chats dropdown
  const [pendingImage, setPendingImage] = useState(null);   // { file, url }
  const [cameraOpen, setCameraOpen] = useState(false);      // live webcam capture modal
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { isRecording, start: startRecording, stop: stopRecording } = useVoiceRecorder();
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);      // imperative handle to open the photo picker
  const location = useLocation();
  const navigate = useNavigate();
  const consumedIntentRef = useRef(null); // guards against re-running the same arrival intent
  const geoRef = useRef(null);            // { lat, lng } once geolocation resolves, for personalisation

  // Warm the location cache on mount so the first message usually has coords.
  // Best-effort: failure/denial just leaves geoRef null and we personalise by
  // name only.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {},
      { timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  // ensureGeo resolves the user's coordinates at send time: it reuses a cached
  // fix, otherwise asks the browser again (permission may have been granted
  // after the mount attempt). Resolves to null if unavailable/denied so the
  // caller can still send without location.
  const ensureGeo = useCallback(() => {
    if (geoRef.current) return Promise.resolve(geoRef.current);
    if (!navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          resolve(geoRef.current);
        },
        () => resolve(null),
        { timeout: 8000, maximumAge: 300000 },
      );
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // loadSessions refreshes the "previous chats" list for the signed-in user.
  const loadSessions = useCallback(async () => {
    try {
      const res = await api.get("/api/chat/sessions");
      setSessions(Array.isArray(res.sessions) ? res.sessions : []);
    } catch {
      setSessions([]); // not logged in / backend down — just show no history
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // newChat clears the view so the next message starts a fresh session
  // (the backend creates the row on first send).
  const newChat = () => {
    if (isTyping) return;
    setSessionId(null);
    setMessages([]);
    setInput("");
    setConfirmDeleteSessionId(null);
  };

  // openSession loads a past conversation's transcript into the view.
  const openSession = async (id) => {
    if (isTyping || id === sessionId) return;
    setConfirmDeleteSessionId(null);
    try {
      const res = await api.get(`/api/chat/sessions/${id}`);
      setSessionId(res.id);
      setMessages((res.messages ?? []).map(m => ({
        id: m.id, role: m.role, text: m.text, imageUrl: m.imageUrl || undefined,
      })));
    } catch (err) {
      setMessages([{ id: Date.now(), role: "bot", timestamp: nowTime(),
        text: `Sorry, I couldn't open that chat. ${err.message}` }]);
    }
  };

  // Request deletion first, then require an explicit confirmation click.
  const requestDeleteSession = (id, e) => {
    e.stopPropagation();
    setConfirmDeleteSessionId(id);
  };

  // deleteSession removes a past conversation; if it's the open one, reset.
  const deleteSession = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/api/chat/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (id === sessionId) newChat();
    } catch {
      /* ignore — leave the list as-is on failure */
    } finally {
      setConfirmDeleteSessionId(null);
    }
  };

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
    form.append("lang", getLang());
    const photoGeo = await ensureGeo();
    if (photoGeo) {
      form.append("lat", photoGeo.lat);
      form.append("lng", photoGeo.lng);
    }

    try {
      const res = await api.postForm("/api/chat/photo", form);
      if (res.session_id) setSessionId(res.session_id);
      setMessages(prev => [...prev, {
        id: Date.now(), role: "bot", text: res.reply, timestamp: nowTime(),
        crisisCard: res.crisis_card ?? undefined,
      }]);
      loadSessions(); // refresh sidebar order/title (and pick up a new session)
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

    // Stream the reply over SSE: show the typing indicator until the first
    // token, then drop it and grow a single bot bubble token-by-token.
    const botId = Date.now() + 1;
    let acc = "";
    let started = false;
    const appendToken = (tok) => {
      acc += tok;
      if (!started) {
        started = true;
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: botId, role: "bot", text: acc, timestamp: nowTime(),
        }]);
      } else {
        setMessages(prev => prev.map(m => m.id === botId ? { ...m, text: acc } : m));
      }
    };

    try {
      const coords = await ensureGeo();
      await api.postStream("/api/chat/stream", {
        message: trimmed,
        session_id: sessionId,
        lang: getLang(),
        ...(coords ?? {}),
      }, {
        onToken: appendToken,
        onDone: (info) => {
          if (info.session_id) setSessionId(info.session_id);
          loadSessions(); // refresh sidebar order/title (and pick up a new session)
        },
        onError: (msg) => {
          const text = `Sorry, I couldn't reach Brainy just now. ${msg}`;
          if (started) {
            setMessages(prev => prev.map(m => m.id === botId ? { ...m, text } : m));
          } else {
            setMessages(prev => [...prev, {
              id: botId, role: "bot", text, timestamp: nowTime(),
            }]);
          }
        },
      });
    } finally {
      setIsTyping(false);
    }
  };

  // Act on an intent passed via router state from the Home page:
  //   { prompt }          → Quick Topics: auto-send the message
  //   { action: "photo" } → "Snap a photo": open the device camera
  //   { action: "voice" } → "Record voice memos": start recording
  // The intent is consumed once: we clear the router state and remember it so a
  // refresh, back-navigation, or StrictMode double-run can't re-trigger it.
  useEffect(() => {
    const { prompt, action } = location.state ?? {};
    const intent = prompt ?? action;
    if (!intent || consumedIntentRef.current === intent) return;
    consumedIntentRef.current = intent;
    navigate(location.pathname, { replace: true, state: {} });

    if (prompt) sendMessage(prompt);
    else if (action === "photo") setCameraOpen(true);
    else if (action === "voice") handleMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, navigate]);

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
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now(), role: "bot", timestamp: nowTime(),
        text: `Sorry, I couldn't load the current situation. ${err.message}`,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // handleMic toggles voice capture. Tapping while recording stops it, uploads
  // the clip to the STT endpoint, then feeds the transcript through the normal
  // chat flow so Brainy replies just as if the user had typed it.
  const handleMic = async () => {
    if (isTyping || isTranscribing) return;

    if (!isRecording) {
      const err = await startRecording();
      if (err) {
        setMessages(prev => [...prev, { id: Date.now(), role: "bot", text: err, timestamp: nowTime() }]);
      }
      return;
    }

    const clip = await stopRecording();
    if (!clip) return;

    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", clip.blob, `voice-note.${extensionFromMime(clip.mimeType)}`);
      if (sessionId) form.append("session_id", sessionId);

      const data = await api.postForm("/api/voice", form);
      if (data.session_id) setSessionId(data.session_id);

      const transcript = (data.transcript ?? "").trim();
      if (transcript) {
        sendMessage(transcript);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now(), role: "bot", timestamp: nowTime(),
          text: "I couldn't make out any speech in that recording — mind trying again?",
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now(), role: "bot", timestamp: nowTime(),
        text: `Sorry, I couldn't transcribe that. ${err.message}`,
      }]);
    } finally {
      setIsTranscribing(false);
    }
  };

  // renderSessions draws the "previous chats" list, shared by the desktop
  // sidebar and the mobile history dropdown. onPick fires after a row is opened
  // (used on mobile to close the dropdown).
  const renderSessions = (onPick) => (
    sessions.length === 0 ? (
      <div style={{ fontSize: 13, color: "#9CA3AF", padding: "6px 2px" }}>
        No previous chats yet.
      </div>
    ) : (
      sessions.map(s => {
        const active = s.id === sessionId;
        return (
          <div
            key={s.id}
            onClick={() => { openSession(s.id); onPick?.(); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 10px", borderRadius: 10, marginBottom: 4,
              cursor: "pointer",
              background: active ? "#CCFBF1" : "transparent",
              color: active ? "#0F766E" : "#374151",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F3F4F6"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <MessageSquare size={15} style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1, fontSize: 13, fontWeight: 600,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {s.title || "New chat"}
            </span>
            <button
              onClick={(e) => requestDeleteSession(s.id, e)}
              title="Delete chat"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 3,
                borderRadius: 6, display: "flex", flexShrink: 0, color: "#9CA3AF",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#DC2626"}
              onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}
            >
              <Trash2 size={14} />
            </button>
            {confirmDeleteSessionId === s.id && (
              <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteSessionId(null); }}
                  style={{
                    background: "#fff", border: "1px solid #D1D5DB", cursor: "pointer",
                    borderRadius: 6, padding: "2px 6px", fontSize: 11, fontWeight: 700, color: "#6B7280",
                    fontFamily: "'Nunito', sans-serif",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  style={{
                    background: "#FEE2E2", border: "1px solid #FCA5A5", cursor: "pointer",
                    borderRadius: 6, padding: "2px 6px", fontSize: 11, fontWeight: 800, color: "#B91C1C",
                    fontFamily: "'Nunito', sans-serif",
                  }}
                >
                  Confirm
                </button>
              </span>
            )}
          </div>
        );
      })
    )
  );

  return (
    <div style={{
      height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column",
      background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box",
    }}>
      <Navbar />

      <div className="chat-layout">
        {/* ── Left panel ── */}
        <div className="chat-left-panel">
          <div className="chat-left-mascot">
            <BrainyMascot mood={isTyping ? "normal" : "happy"} width={240} />
          </div>
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

          {/* ── Previous chats ── */}
          <div style={{
            background: "#fff", borderRadius: 20, padding: "16px 16px 12px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: "100%",
            display: "flex", flexDirection: "column", minHeight: 0, flex: 1,
          }}>
            <button
              onClick={newChat}
              disabled={isTyping}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "#0F766E", color: "#fff", border: "none", borderRadius: 12,
                padding: "10px 14px", fontFamily: "'Nunito', sans-serif", fontWeight: 800,
                fontSize: 14, cursor: isTyping ? "not-allowed" : "pointer",
                opacity: isTyping ? 0.5 : 1, marginBottom: 12, flexShrink: 0,
              }}
            >
              <Plus size={16} /> New chat
            </button>

            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
              color: "#9CA3AF", marginBottom: 8, flexShrink: 0,
            }}>
              Previous chats
            </div>

            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {renderSessions()}
            </div>
          </div>
        </div>

        {/* ── Chat area ── */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          padding: "0 0 20px", overflow: "hidden",
        }}>
          {/* Mobile-only toolbar — the desktop left panel (mascot / New chat /
              history) is hidden ≤640px, so surface those controls here. */}
          <div className="chat-mobile-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BrainyMascot mood={isTyping ? "normal" : "happy"} width={36} />
              <span style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e" }}>Brainy</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => { newChat(); setMobileHistoryOpen(false); }}
                disabled={isTyping}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "#0F766E", color: "#fff", border: "none", borderRadius: 10,
                  padding: "8px 12px", fontFamily: "'Nunito', sans-serif", fontWeight: 800,
                  fontSize: 13, cursor: isTyping ? "not-allowed" : "pointer", opacity: isTyping ? 0.5 : 1,
                }}
              >
                <Plus size={15} /> New
              </button>
              <button
                onClick={() => setMobileHistoryOpen(o => !o)}
                title="Previous chats"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: mobileHistoryOpen ? "#CCFBF1" : "#fff",
                  color: "#0F766E", border: "1.5px solid #CCFBF1", borderRadius: 10,
                  padding: "8px 12px", fontFamily: "'Nunito', sans-serif", fontWeight: 800,
                  fontSize: 13, cursor: "pointer",
                }}
              >
                <MessageSquare size={15} /> History
              </button>
            </div>
          </div>

          {/* Mobile history dropdown */}
          {mobileHistoryOpen && (
            <div className="chat-mobile-history">
              {renderSessions(() => setMobileHistoryOpen(false))}
            </div>
          )}

          {/* Messages scroll area */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 4px" }}>
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
            ref={chatInputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onSend={() => (pendingImage ? sendPhoto() : sendMessage())}
            onPickImage={handlePickImage}
            onTakePhoto={() => setCameraOpen(true)}
            onMic={handleMic}
            recording={isRecording}
            transcribing={isTranscribing}
            disabled={isTyping || isTranscribing}
          />
        </div>

        {cameraOpen && (
          <CameraCapture
            onCapture={(file) => { handlePickImage(file); setCameraOpen(false); }}
            onClose={() => setCameraOpen(false)}
            onUpload={() => { setCameraOpen(false); chatInputRef.current?.openUpload(); }}
          />
        )}
      </div>
    </div>
  );
}
