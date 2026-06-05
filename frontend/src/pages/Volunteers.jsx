// James — volunteer group chat page (tabbed by crisis, voice recording, task status tracker)
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Mic, Paperclip, Play, X } from "lucide-react";
import Navbar from "../components/layout/NavBar";

// dummy data for volunteer groups and messages
const GROUPS = [
  {
    id: "brainy",
    label: "Brainy",
    title: "Brainy Coordination Channel",
    meta: "Islandwide Monitoring • 18 helpers • 5 Open Tasks",
    messages: [
      { id: "b1", sender: "Brainy • auto-update", role: "brainy", text: "Heavy rain cells moving toward North region. Flood risk elevated for Kranji in the next 30 minutes.", at: "09:11" },
      { id: "b2", sender: "RC Lim (Coordinator)", role: "coord", text: "Deploy 2 volunteers to Kranji drain point B. Confirm when dispatched.", at: "09:13" },
      { id: "b3", sender: "Me", role: "me", text: "Copy. Pairing up and moving now.", at: "09:14" },
    ],
  },
  {
    id: "flash-flood",
    label: "Flash Flood • 12",
    title: "Flash Flood - Pasir Ris Dr 3",
    meta: "Water 78% • 12 helpers • 3 Open Tasks",
    messages: [
      { id: "f1", sender: "Brainy • auto-update", role: "brainy", text: "PUB drain at 78%, up from 65% 15 min ago", at: "09:22" },
      { id: "f2", sender: "Aisha (Coordinator)", role: "coord", text: "PUB drain at 78%, up from 65% 15 min ago", at: "09:25" },
      { id: "f3", sender: "Me", role: "me", text: "I am on my way, 8 more minutes", at: "09:26" },
      { id: "f4", sender: "Brainy • auto-update", role: "brainy", text: "New task created by RC Lim: \"Reroute pedestrians at gate 3\"", at: "09:29" },
    ],
  },
  {
    id: "fire",
    label: "Fire • 5",
    title: "Fire - Bedok North Ave 3",
    meta: "Smoke level Medium • 5 helpers • 2 Open Tasks",
    messages: [
      { id: "r1", sender: "Brainy • auto-update", role: "brainy", text: "SCDF response team on-site. Keep perimeter clear for emergency vehicles.", at: "11:01" },
      { id: "r2", sender: "Hassan (Coordinator)", role: "coord", text: "Need 1 volunteer to guide evacuees to temporary shelter point.", at: "11:03" },
      { id: "r3", sender: "Me", role: "me", text: "Available. Moving to shelter point now.", at: "11:04" },
    ],
  },
];

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
  const [activeGroup, setActiveGroup] = useState("flash-flood");
  const [draft, setDraft] = useState("");
  const [messagesByGroup, setMessagesByGroup] = useState(() =>
    GROUPS.reduce((acc, item) => {
      acc[item.id] = item.messages.map((msg) => ({ ...msg }));
      return acc;
    }, {})
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingVoiceClip, setPendingVoiceClip] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("");

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const clipUrlsRef = useRef([]);
  const recordingStartRef = useRef(0);

  const group = useMemo(
    () => GROUPS.find((item) => item.id === activeGroup) ?? GROUPS[0],
    [activeGroup]
  );
  const messages = messagesByGroup[activeGroup] ?? [];
  const canSend = Boolean(draft.trim() || pendingVoiceClip) && !isRecording;
  const statusText = isRecording
    ? `Recording ${formatDuration(recordingSeconds)}...`
    : pendingVoiceClip
      ? `Voice note ready (${formatDuration(pendingVoiceClip.duration)}).`
      : voiceStatus;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      clipUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const stopMediaStream = () => {
    if (!mediaStreamRef.current) return;
    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const clearPendingVoiceClip = (nextStatus = "") => {
    if (!pendingVoiceClip?.url) return;
    URL.revokeObjectURL(pendingVoiceClip.url);
    clipUrlsRef.current = clipUrlsRef.current.filter((url) => url !== pendingVoiceClip.url);
    setPendingVoiceClip(null);
    setVoiceStatus(nextStatus);
  };

  const stopVoiceRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    setVoiceStatus("Processing voice note...");

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    stopMediaStream();
    setVoiceStatus("Unable to stop recording cleanly. Please retry.");
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceStatus("Voice recording is not supported in this browser.");
      return;
    }

    try {
      clearPendingVoiceClip();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const elapsed = Math.max(1, Math.floor((Date.now() - recordingStartRef.current) / 1000));
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        clipUrlsRef.current.push(url);
        setPendingVoiceClip({ blob, url, duration: elapsed });
        setRecordingSeconds(elapsed);
        setVoiceStatus(`Voice note ready (${formatDuration(elapsed)}). Press send.`);
        stopMediaStream();
      };

      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
      setVoiceStatus("Recording... tap mic to stop.");

      recorder.start();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setRecordingSeconds(elapsed);
      }, 250);
    } catch {
      stopMediaStream();
      setVoiceStatus("Microphone permission denied or unavailable.");
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopVoiceRecording();
      return;
    }
    startVoiceRecording();
  };

  const handleSendMessage = () => {
    if (!canSend) return;

    const outgoingText = draft.trim();
    const message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: "Me",
      role: "me",
      text: outgoingText,
      audioDuration: pendingVoiceClip?.duration ?? null,
      audioUrl: pendingVoiceClip?.url ?? null,
      at: new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessagesByGroup((prev) => ({
      ...prev,
      [activeGroup]: [...(prev[activeGroup] ?? []), message],
    }));

    setDraft("");
    setPendingVoiceClip(null);
    setVoiceStatus("");
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
          {GROUPS.map((item) => {
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
              {group.title}
            </div>
            <div
              style={{
                marginTop: 4,
                color: "#6F6E78",
                fontSize: 31 / 2,
                fontWeight: 700,
              }}
            >
              {group.meta}
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
