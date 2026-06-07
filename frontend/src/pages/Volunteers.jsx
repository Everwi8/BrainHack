// James — volunteer group chat page (tabbed by crisis, voice recording, task status tracker)
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Mic, Paperclip, Play, X } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import { useVoiceRecorder, extensionFromMime } from "../lib/useVoiceRecorder";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

function toTitleCase(value = "") {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tabLabelFromTitle(title = "") {
  if (!title) return "Crisis";
  return title.length > 22 ? `${title.slice(0, 22)}...` : title;
}

function mapCrisisToTab(crisis) {
  return {
    id: crisis.id,
    label: tabLabelFromTitle(crisis.title),
    title: crisis.title,
    meta: [
      toTitleCase(crisis.type),
      toTitleCase(crisis.severity),
      crisis.location_name || "",
    ].filter(Boolean).join(" • "),
  };
}

function senderBadge(role) {
  if (role === "brainy") return "#B9D530";
  if (role === "coord") return "#4F7FEA";
  return "#9EC4DA";
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function Volunteers() {
  const [activeGroup, setActiveGroup] = useState("");
  const [crisisTabs, setCrisisTabs] = useState([]);
  const [draft, setDraft] = useState("");
  const [messagesByGroup, setMessagesByGroup] = useState({});
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [pendingVoiceClip, setPendingVoiceClip] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceSessionByGroup, setVoiceSessionByGroup] = useState({});
  const [isLoadingCrises, setIsLoadingCrises] = useState(true);
  const [crisesError, setCrisesError] = useState("");

  const { isRecording, recordingSeconds, start: startRecorder, stop: stopRecorder } = useVoiceRecorder();

  const clipUrlsRef = useRef([]);

  const group = useMemo(() => {
    if (crisisTabs.length === 0) return null;
    return crisisTabs.find((item) => item.id === activeGroup) ?? crisisTabs[0];
  }, [activeGroup, crisisTabs]);
  const messages = messagesByGroup[activeGroup] ?? [];
  const canSend = Boolean(activeGroup) && Boolean(draft.trim() || pendingVoiceClip) && !isRecording && !isSendingVoice;
  const statusText = isRecording
    ? `Recording ${formatDuration(recordingSeconds)}...`
    : isSendingVoice
      ? (voiceStatus || "Uploading and transcribing voice note...")
      : (voiceStatus || (pendingVoiceClip ? `Voice note ready (${formatDuration(pendingVoiceClip.duration)}).` : ""));

  // Revoke any object URLs we created for clip playback on unmount.
  useEffect(() => {
    return () => clipUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadCrises = async () => {
      if (!ignore) setIsLoadingCrises(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/crises`);
        const payload = await readJSONSafe(res);
        if (!res.ok) {
          throw new Error(payload.error ?? payload.__raw ?? `Could not load crises: ${res.status}`);
        }

        const rows = Array.isArray(payload) ? payload : [];
        const tabs = rows
          .filter((row) => row?.id && row?.title && row?.status === "active")
          .map((row) => mapCrisisToTab({
            id: row.id,
            title: row.title,
            type: row.type,
            severity: row.severity,
            location_name: row.location_name,
          }));

        if (ignore) return;
        setCrisisTabs(tabs);
        setMessagesByGroup((prev) => {
          const next = {};
          tabs.forEach((tab) => {
            next[tab.id] = prev[tab.id] ?? [];
          });
          return next;
        });
        setActiveGroup((prev) => {
          if (tabs.length === 0) return "";
          if (prev && tabs.some((tab) => tab.id === prev)) return prev;
          return tabs[0].id;
        });
        setCrisesError("");
      } catch (err) {
        if (!ignore) {
          setCrisesError(err?.message || "Could not load crises.");
          setCrisisTabs([]);
          setActiveGroup("");
        }
      } finally {
        if (!ignore) setIsLoadingCrises(false);
      }
    };

    loadCrises();
    const timer = setInterval(loadCrises, 30000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, []);

  const clearPendingVoiceClip = (nextStatus = "") => {
    if (!pendingVoiceClip?.url) return;
    URL.revokeObjectURL(pendingVoiceClip.url);
    clipUrlsRef.current = clipUrlsRef.current.filter((url) => url !== pendingVoiceClip.url);
    setPendingVoiceClip(null);
    setVoiceStatus(nextStatus);
  };

  const stopVoiceRecording = async () => {
    setVoiceStatus("Processing voice note...");
    const clip = await stopRecorder();
    if (!clip) {
      setVoiceStatus("Unable to stop recording cleanly. Please retry.");
      return;
    }
    const url = URL.createObjectURL(clip.blob);
    clipUrlsRef.current.push(url);
    setPendingVoiceClip({ blob: clip.blob, url, duration: clip.duration, mimeType: clip.mimeType });
    setVoiceStatus(`Voice note ready (${formatDuration(clip.duration)}). Press send.`);
  };

  const startVoiceRecording = async () => {
    if (!activeGroup) {
      setVoiceStatus("No active crisis group selected.");
      return;
    }
    clearPendingVoiceClip();
    const err = await startRecorder();
    if (err) {
      setVoiceStatus(err);
      return;
    }
    setVoiceStatus("Recording... tap mic to stop.");
  };

  const handleMicClick = () => {
    if (isSendingVoice) return;
    if (isRecording) {
      stopVoiceRecording();
      return;
    }
    startVoiceRecording();
  };

  const getAuthToken = () =>
    localStorage.getItem("brainy_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt_token") ||
    localStorage.getItem("jwt") ||
    "";

  const readJSONSafe = async (res) => {
    const raw = await res.text();
    if (!raw.trim()) return { __empty: true };
    try {
      return JSON.parse(raw);
    } catch {
      return { __raw: raw };
    }
  };

  const uploadVoice = async (voiceClip, sessionID) => {
    const form = new FormData();
    const ext = extensionFromMime(voiceClip.mimeType || "");
    form.append("audio", voiceClip.blob, `voice-note.${ext}`);
    if (sessionID) form.append("session_id", sessionID);

    const token = getAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await fetch(`${API_BASE_URL}/api/voice`, {
      method: "POST",
      headers,
      body: form,
    });

    const body = await readJSONSafe(res);

    if (!res.ok) {
      throw new Error(body.error ?? body.__raw ?? `Voice request failed: ${res.status}`);
    }

    if (body.__empty) {
      throw new Error("Voice endpoint returned an empty response. Restart backend and verify /api/voice handler is returning JSON.");
    }

    return body;
  };

  const handleSendMessage = async () => {
    if (!canSend || !activeGroup) return;

    const outgoingText = draft.trim();
    const now = () => new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });

    // Text-only path remains local for now.
    if (!pendingVoiceClip) {
      const textMsg = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sender: "Me",
        role: "me",
        text: outgoingText,
        at: now(),
      };
      setMessagesByGroup((prev) => ({
        ...prev,
        [activeGroup]: [...(prev[activeGroup] ?? []), textMsg],
      }));
      setDraft("");
      setVoiceStatus("");
      return;
    }

    setIsSendingVoice(true);
    setVoiceStatus("Uploading and transcribing voice note...");

    try {
      const sessionID = voiceSessionByGroup[activeGroup] ?? "";
      const data = await uploadVoice(pendingVoiceClip, sessionID);
      const transcript = (data.transcript ?? "").trim();
      const reply = (data.reply ?? "").trim();
      const nextSessionID = data.session_id ?? sessionID;

      if (nextSessionID) {
        setVoiceSessionByGroup((prev) => ({ ...prev, [activeGroup]: nextSessionID }));
      }

      setMessagesByGroup((prev) => {
        const list = [...(prev[activeGroup] ?? [])];

        if (outgoingText) {
          list.push({
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sender: "Me",
            role: "me",
            text: outgoingText,
            at: now(),
          });
        }

        list.push({
          id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sender: "Me",
          role: "me",
          text: transcript || "Voice note sent.",
          audioDuration: pendingVoiceClip.duration ?? null,
          audioUrl: pendingVoiceClip.url ?? null,
          at: now(),
        });

        if (reply) {
          list.push({
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sender: "Brainy • auto-update",
            role: "brainy",
            text: reply,
            at: now(),
          });
        }

        return { ...prev, [activeGroup]: list };
      });

      setDraft("");
      setPendingVoiceClip(null);
      setVoiceStatus("Voice note sent.");
    } catch (err) {
      setVoiceStatus(err?.message || "Could not send voice note.");
    } finally {
      setIsSendingVoice(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#F5F0E8",
        fontFamily: "'Nunito', sans-serif",
        boxSizing: "border-box",
      }}
    >
      <Navbar />

      <main
        style={{
          width: "100%",
          maxWidth: 1660,
          margin: "0 auto",
          padding: "26px 26px 30px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          {crisisTabs.map((item) => {
            const active = item.id === activeGroup;
            return (
              <button
                key={item.id}
                onClick={() => setActiveGroup(item.id)}
                style={{
                  border: "none",
                  borderRadius: 22,
                  padding: "11px 22px",
                  background: active ? "#111111" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#3F3F46",
                  fontSize: 33 / 2,
                  fontWeight: 700,
                  lineHeight: 1,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <section
          style={{
            border: "2px solid #1E1E1E",
            borderRadius: 30,
            background: "#ECE8DF",
            overflow: "hidden",
            height: 760,
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
          }}
        >
          <header
            style={{
              borderBottom: "2px solid #1E1E1E",
              padding: "20px 50px 18px",
              background: "#E8E4D8",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 38 / 2, color: "#131313", lineHeight: 1.2 }}>
              {group?.title || "No active crisis"}
            </div>
            <div
              style={{
                marginTop: 4,
                color: "#6F6E78",
                fontSize: 31 / 2,
                fontWeight: 700,
              }}
            >
              {group?.meta || "No crisis metadata"}
            </div>
          </header>

          <div
            style={{
              background: "#f0e5e5",
              borderBottom: "2px solid #1E1E1E",
              padding: "20px 16px 26px",
              boxSizing: "border-box",
              overflowY: "scroll",
              overflowX: "hidden",
              minHeight: 0,
            }}
          >
            {messages.length === 0 && (
              <div style={{ color: "#6F6E78", fontSize: 14, fontWeight: 700, textAlign: "center", marginTop: 18 }}>
                {isLoadingCrises ? "Loading crisis groups..." : (crisesError || "No messages yet for this crisis.")}
              </div>
            )}

            {messages.map((message) => {
              if (message.role === "me") {
                const hasVoice = Boolean(message.audioUrl);
                return (
                  <div key={message.id} style={{ width: "100%", display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "42%", gap: 8 }}>
                      <div style={{ color: "#6F6D77", fontWeight: 700, fontSize: 30 / 2, marginBottom: 5 }}>{message.sender}</div>
                      {hasVoice ? (
                        <>
                          <audio
                            controls
                            src={message.audioUrl}
                            style={{
                              width: "min(360px, 100%)",
                              display: "block",
                              border: "2px solid #1E1E1E",
                              borderRadius: 999,
                              background: "#9EC4DA",
                              boxSizing: "border-box",
                            }}
                          />
                          {message.text && (
                            <div
                              style={{
                                border: "2px solid #1E1E1E",
                                borderRadius: 18,
                                background: "#9EC4DA",
                                padding: "10px 14px",
                                fontSize: 34 / 2,
                                color: "#141414",
                                lineHeight: 1.25,
                                width: "min(360px, 100%)",
                                boxSizing: "border-box",
                              }}
                            >
                              {message.text}
                            </div>
                          )}
                          {!message.text && message.audioDuration != null && (
                            <div style={{ fontSize: 12, color: "#6F6D77", fontWeight: 700 }}>
                              Voice note ({formatDuration(message.audioDuration)})
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          style={{
                            border: "2px solid #1E1E1E",
                            borderRadius: 999,
                            background: "#9EC4DA",
                            padding: "13px 22px",
                            fontSize: 34 / 2,
                            color: "#141414",
                            lineHeight: 1.25,
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                        >
                          {message.text}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 16, maxWidth: "58%" }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      background: senderBadge(message.role),
                      flexShrink: 0,
                      marginTop: 35 / 2,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: message.role === "brainy" ? "#D97706" : "#6F6D77",
                        fontWeight: 800,
                        fontSize: 33 / 2,
                        marginBottom: 5,
                      }}
                    >
                      {message.sender}
                    </div>
                    <div
                      style={{
                        border: "2px solid #1E1E1E",
                        borderRadius: 999,
                        background: "#ECE8DF",
                        padding: "13px 22px",
                        fontSize: 34 / 2,
                        color: "#141414",
                        lineHeight: 1.25,
                        boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
                      }}
                    >
                      {message.text}
                      {message.audioUrl && (
                        <audio
                          controls
                          src={message.audioUrl}
                          style={{ width: "100%", marginTop: 8, maxWidth: 380 }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <footer
            style={{
              padding: "14px 14px",
              background: "#ECE8DF",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gridTemplateRows: "auto auto",
              gap: 14,
              alignItems: "center",
            }}
          >
            <div
              style={{
                gridColumn: "1 / -1",
                minHeight: 24,
                fontSize: 13,
                color: isRecording ? "#B42318" : "#666666",
                fontWeight: isRecording ? 700 : 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>{statusText}</span>
                {pendingVoiceClip && !isRecording && (
                  <button
                    onClick={() => clearPendingVoiceClip("Voice note deleted.")}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#1E1E1E",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                    title="Delete recorded voice note"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: "2px solid #1E1E1E",
                  background: "#F5F4F0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title="Attach Camera"
              >
                <Camera size={32} color="#111111" />
              </button>
              <button
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: "2px solid #1E1E1E",
                  background: "#F5F4F0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title={isRecording ? "Stop Recording" : "Start Recording"}
                onClick={handleMicClick}
              >
                <Mic size={32} color={isRecording ? "#B42318" : "#111111"} />
              </button>
              <button
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: "2px solid #1E1E1E",
                  background: "#F5F4F0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title="Attach File"
              >
                <Paperclip size={32} color="#111111" />
              </button>
            </div>

            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message group..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              style={{
                width: "100%",
                height: 56,
                borderRadius: 999,
                border: "2px solid #1E1E1E",
                background: "#E4E4E4",
                fontFamily: "'Nunito', sans-serif",
                fontSize: 34 / 2,
                color: "#111111",
                padding: "0 22px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <button
              title="Send Message"
              onClick={handleSendMessage}
              disabled={!canSend}
              style={{
                width: 62,
                height: 62,
                borderRadius: "50%",
                border: "none",
                background: canSend ? "#1C1E22" : "#757A82",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: canSend ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              <Play size={32} color="#FFFFFF" fill="#FFFFFF" />
            </button>
          </footer>
        </section>
      </main>
    </div>
  );
}
