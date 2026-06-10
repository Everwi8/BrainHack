// James — volunteer group chat page (tabbed by crisis, voice recording, task status tracker)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Mic, Play, X } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import { useVoiceRecorder, extensionFromMime } from "../lib/useVoiceRecorder";
import CameraCapture from "../components/chat/CameraCapture";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

function toTitleCase(value = "") {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tabLabelFromTitle(title = "") {
  if (!title) return "Crisis";
  return title.length > 22 ? `${title.slice(0, 22)}...` : title;
}

// A tab is now one joined TASK (each task has its own group chat). The label is
// the task title; the meta line carries the parent crisis context.
function mapTaskToTab(task) {
  return {
    id: task.id,
    label: tabLabelFromTitle(task.title),
    title: task.title,
    crisisTitle: task.crisis_title || "",
    meta: [
      task.crisis_title,
      toTitleCase(task.crisis_type),
      toTitleCase(task.crisis_severity),
      task.crisis_location || "",
    ].filter(Boolean).join(" • "),
  };
}

function senderBadge(role) {
  if (role === "brainy") return "#B9D530";
  if (role === "coord") return "#4F7FEA";
  return "#9EC4DA";
}

// Render a chat message: turn **bold** into <strong> and break each sentence
// onto its own line so dense guidance (e.g. Brainy's welcome) is easy to scan.
// Author line breaks are preserved; decimals like "3.5" aren't treated as
// sentence ends since the split requires whitespace after the punctuation.
function renderBold(text, keyPrefix) {
  return text.split(/\*\*(.*?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyPrefix}-${i}`}>{part}</strong> : part
  );
}

function formatMessageText(text) {
  if (!text) return null;
  const lines = [];
  String(text).split(/\n+/).forEach((para) => {
    const trimmed = para.trim();
    if (!trimmed) return;
    trimmed.split(/(?<=[.!?])\s+/).forEach((sentence) => {
      const s = sentence.trim();
      if (s) lines.push(s);
    });
  });
  return lines.map((line, i) => (
    <span
      key={i}
      style={{ display: "block", marginBottom: i === lines.length - 1 ? 0 : 6 }}
    >
      {renderBold(line, i)}
    </span>
  ));
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatChatTime(timestamp) {
  if (!timestamp) return new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
}

function decodeBase64URL(value) {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized);
}

function getCurrentUserIDFromToken() {
  const token = (
    localStorage.getItem("brainy_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt_token") ||
    localStorage.getItem("jwt") ||
    ""
  );
  if (!token) return "";
  try {
    const payload = JSON.parse(decodeBase64URL(token.split(".")[1] || ""));
    return payload.user_id || payload.userID || payload.sub || "";
  } catch {
    return "";
  }
}

// getAuthToken / readJSONSafe are module-scope (pure) helpers so the data-loading
// effects can reference them without a use-before-declare hazard.
function getAuthToken() {
  return (
    localStorage.getItem("brainy_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt_token") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

async function readJSONSafe(res) {
  const raw = await res.text();
  if (!raw.trim()) return { __empty: true };
  try {
    return JSON.parse(raw);
  } catch {
    return { __raw: raw };
  }
}

export default function Volunteers() {
  const [activeGroup, setActiveGroup] = useState("");
  const [taskTabs, setTaskTabs] = useState([]);
  const [draft, setDraft] = useState("");
  const [messagesByGroup, setMessagesByGroup] = useState({});
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [pendingVoiceClip, setPendingVoiceClip] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [tasksError, setTasksError] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false); // header leave-task gate
  const [leaving, setLeaving] = useState(false);                 // in-flight leave
  const [confirmDiscardPending, setConfirmDiscardPending] = useState(false);

  const { isRecording, recordingSeconds, start: startRecorder, stop: stopRecorder } = useVoiceRecorder();

  const clipUrlsRef = useRef([]);
  const imageUrlsRef = useRef([]);
  const uploadInputRef = useRef(null);
  // The scrollable message list, so we can keep it pinned to the newest message.
  const messageListRef = useRef(null);
  const currentUserID = useMemo(() => getCurrentUserIDFromToken(), []);
  // Task to open on arrival, passed from the Crisis Detail join flow (?task_id=).
  const preselectTaskId = useMemo(
    () => new URLSearchParams(window.location.search).get("task_id") || "",
    [],
  );

  const group = useMemo(() => {
    if (taskTabs.length === 0) return null;
    return taskTabs.find((item) => item.id === activeGroup) ?? taskTabs[0];
  }, [activeGroup, taskTabs]);
  const messages = messagesByGroup[activeGroup] ?? [];
  const canSend = Boolean(activeGroup) && Boolean(draft.trim() || pendingVoiceClip || pendingImage) && !isRecording && !isSendingVoice;
  const statusText = isRecording
    ? `Recording ${formatDuration(recordingSeconds)}...`
    : isSendingVoice
      ? (voiceStatus || "Uploading and transcribing voice note...")
      : (
        voiceStatus
        || (pendingVoiceClip
          ? `Voice note ready (${formatDuration(pendingVoiceClip.duration)}).`
          : (pendingImage ? `Photo ready (${pendingImage.file.name}). Press send.` : ""))
      );

  // Revoke any object URLs we created for clip playback on unmount.
  useEffect(() => {
    return () => {
      clipUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Keep the chat pinned to the bottom whenever a new message appears — the
  // user's own message, or Brainy's reply that arrives via the 2.5s poll. Keyed
  // on message count (not the array) so it fires on a genuine new message and
  // not on every no-op poll, and on activeGroup so switching tabs lands at the
  // latest message too. Without this, Brainy's answer renders below the fold and
  // the user has to scroll manually — easy to miss entirely.
  useEffect(() => {
    const el = messageListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeGroup]);

  useEffect(() => {
    let ignore = false;

    // Tabs are the tasks the user has JOINED (one per crisis for non-coordinators,
    // many for coordinators). Joining happens on the Crisis Detail page; this page
    // is just the per-task group chats they already have access to.
    const loadMyTasks = async () => {
      if (!ignore) setIsLoadingTasks(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/tasks/mine`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await readJSONSafe(res);
        if (!res.ok) {
          throw new Error(payload.error ?? payload.__raw ?? `Could not load your tasks: ${res.status}`);
        }

        const rows = Array.isArray(payload) ? payload : [];
        const tabs = rows.filter((row) => row?.id && row?.title).map(mapTaskToTab);

        if (ignore) return;
        setTaskTabs(tabs);
        setMessagesByGroup((prev) => {
          const next = {};
          tabs.forEach((tab) => {
            next[tab.id] = prev[tab.id] ?? [];
          });
          return next;
        });
        setActiveGroup((prev) => {
          if (tabs.length === 0) return "";
          // Prefer the task passed in via ?task_id (just joined), then the
          // currently-open tab, then the first one.
          if (preselectTaskId && tabs.some((tab) => tab.id === preselectTaskId)) return preselectTaskId;
          if (prev && tabs.some((tab) => tab.id === prev)) return prev;
          return tabs[0].id;
        });
        setTasksError("");
      } catch (err) {
        if (!ignore) {
          setTasksError(err?.message || "Could not load your tasks.");
          setTaskTabs([]);
          setActiveGroup("");
        }
      } finally {
        if (!ignore) setIsLoadingTasks(false);
      }
    };

    loadMyTasks();
    const timer = setInterval(loadMyTasks, 30000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leave the active task → frees the per-crisis slot and drops its chat tab.
  // Gated behind a confirmation (the header button reveals Cancel / Confirm)
  // so a stray click can't drop someone out of their task group.
  const leaveActiveTask = async () => {
    if (!activeGroup) return;
    setLeaving(true);
    const leftId = activeGroup;
    const token = getAuthToken();
    try {
      await fetch(`${API_BASE_URL}/api/tasks/${leftId}/join`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* ignore — refresh will reconcile */ }
    setTaskTabs((prev) => prev.filter((t) => t.id !== leftId));
    setActiveGroup("");
    setConfirmingLeave(false);
    setLeaving(false);
  };

  const mapServerMessageToUI = useCallback((msg) => {
    const senderID = msg?.sender_user_id || "";
    const senderRole = String(msg?.sender_role || "").toLowerCase();
    const isMine = Boolean(currentUserID && senderID && senderID === currentUserID);
    const isBrainy = senderRole === "brainy" || senderRole === "assistant";

    return {
      id: msg?.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: isMine ? "Me" : isBrainy ? "Brainy" : (msg?.sender_name || (senderRole === "coordinator" ? "Coordinator" : "Volunteer")),
      role: isMine ? "me" : isBrainy ? "brainy" : "coord",
      text: (msg?.message_text || msg?.transcript || "").trim(),
      messageType: msg?.message_type || "text",
      audioDuration: null,
      audioUrl: msg?.audio_url || null,
      imageUrl: msg?.image_url || null,
      at: formatChatTime(msg?.created_at),
    };
  }, [currentUserID]);

  useEffect(() => {
    if (!activeGroup) return undefined;
    let ignore = false;

    const loadGroupMessages = async () => {
      if (!ignore) {
        setIsLoadingMessages(true);
        setMessagesError("");
      }

      try {
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/taskchat/${activeGroup}/messages`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await readJSONSafe(res);
        if (!res.ok) {
          throw new Error(payload.error ?? payload.__raw ?? `Could not load group chat: ${res.status}`);
        }
        const rows = Array.isArray(payload?.messages) ? payload.messages : [];
        if (!ignore) {
          setMessagesByGroup((prev) => ({
            ...prev,
            [activeGroup]: rows.map(mapServerMessageToUI),
          }));
        }
      } catch (err) {
        if (!ignore) setMessagesError(err?.message || "Could not load group chat messages.");
      } finally {
        if (!ignore) setIsLoadingMessages(false);
      }
    };

    loadGroupMessages();
    const timer = setInterval(loadGroupMessages, 2500);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [activeGroup, mapServerMessageToUI]);

  const clearPendingVoiceClip = (nextStatus = "") => {
    if (!pendingVoiceClip?.url) return;
    URL.revokeObjectURL(pendingVoiceClip.url);
    clipUrlsRef.current = clipUrlsRef.current.filter((url) => url !== pendingVoiceClip.url);
    setPendingVoiceClip(null);
    setConfirmDiscardPending(false);
    setVoiceStatus(nextStatus);
  };

  const clearPendingImage = (nextStatus = "") => {
    if (pendingImage?.url) {
      URL.revokeObjectURL(pendingImage.url);
      imageUrlsRef.current = imageUrlsRef.current.filter((url) => url !== pendingImage.url);
    }
    setPendingImage(null);
    setConfirmDiscardPending(false);
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
      setVoiceStatus("No task selected.");
      return;
    }
    clearPendingVoiceClip();
    clearPendingImage();
    setConfirmDiscardPending(false);
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

  const uploadVoice = async (voiceClip) => {
    const form = new FormData();
    const ext = extensionFromMime(voiceClip.mimeType || "");
    form.append("audio", voiceClip.blob, `voice-note.${ext}`);

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

  const uploadImage = async (file) => {
    const token = getAuthToken();
    if (!token) throw new Error("Please login first to upload photos.");

    const form = new FormData();
    form.append("image", file);

    const res = await fetch(`${API_BASE_URL}/api/groupchat/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const body = await readJSONSafe(res);
    if (!res.ok) {
      throw new Error(body.error ?? body.__raw ?? `Image upload failed: ${res.status}`);
    }
    if (!body?.image_url) {
      throw new Error("Image upload endpoint returned no image_url.");
    }
    return body.image_url;
  };

  const postGroupChatMessage = async (taskID, payload) => {
    const token = getAuthToken();
    if (!token) throw new Error("Please login first to send group chat messages.");

    const res = await fetch(`${API_BASE_URL}/api/taskchat/${taskID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await readJSONSafe(res);
    if (!res.ok) {
      throw new Error(body.error ?? body.__raw ?? `Could not send group chat message: ${res.status}`);
    }
    if (!body?.message) {
      throw new Error("Group chat endpoint returned no message payload.");
    }
    return body.message;
  };

  const handleSendMessage = async () => {
    if (!canSend || !activeGroup) return;

    const outgoingText = draft.trim();

    setIsSendingVoice(true);

    if (pendingImage) {
      setVoiceStatus("Uploading photo...");
      try {
        const imageURL = await uploadImage(pendingImage.file);
        const saved = await postGroupChatMessage(activeGroup, {
          message_type: "image",
          message_text: outgoingText,
          image_url: imageURL,
        });
        setMessagesByGroup((prev) => ({
          ...prev,
          [activeGroup]: [...(prev[activeGroup] ?? []), mapServerMessageToUI(saved)],
        }));
        setDraft("");
        clearPendingImage("Photo sent.");
      } catch (err) {
        setVoiceStatus(err?.message || "Could not send photo.");
      } finally {
        setIsSendingVoice(false);
      }
      return;
    }

    // Text-only path persists straight to crisis group chat history.
    if (!pendingVoiceClip) {
      try {
        const saved = await postGroupChatMessage(activeGroup, {
          message_type: "text",
          message_text: outgoingText,
        });
        setMessagesByGroup((prev) => ({
          ...prev,
          [activeGroup]: [...(prev[activeGroup] ?? []), mapServerMessageToUI(saved)],
        }));
        setDraft("");
        setVoiceStatus("");
      } catch (err) {
        setVoiceStatus(err?.message || "Could not send message.");
      } finally {
        setIsSendingVoice(false);
      }
      return;
    }

    setVoiceStatus("Uploading and transcribing voice note...");

    try {
      const data = await uploadVoice(pendingVoiceClip);
      const transcript = (data.transcript ?? "").trim();
      const saved = await postGroupChatMessage(activeGroup, {
        message_type: "voice",
        message_text: outgoingText || transcript,
        transcript,
      });

      const mapped = mapServerMessageToUI(saved);
      mapped.audioUrl = pendingVoiceClip.url;
      mapped.audioDuration = pendingVoiceClip.duration;

      setMessagesByGroup((prev) => ({
        ...prev,
        [activeGroup]: [...(prev[activeGroup] ?? []), mapped],
      }));

      setDraft("");
      setPendingVoiceClip(null);
      setConfirmDiscardPending(false);
      setVoiceStatus("Voice note sent.");
    } catch (err) {
      setVoiceStatus(err?.message || "Could not send voice note.");
    } finally {
      setIsSendingVoice(false);
    }
  };

  const openUpload = () => {
    setCameraMenuOpen(false);
    uploadInputRef.current?.click();
  };

  const handlePhotoSelected = (file) => {
    if (!file) return;
    clearPendingVoiceClip();
    setConfirmDiscardPending(false);
    if (pendingImage?.url) {
      URL.revokeObjectURL(pendingImage.url);
      imageUrlsRef.current = imageUrlsRef.current.filter((url) => url !== pendingImage.url);
    }
    const url = URL.createObjectURL(file);
    imageUrlsRef.current.push(url);
    setPendingImage({ file, url });
    setVoiceStatus(`Photo ready (${file.name}). Press send.`);
  };

  const requestDiscardPending = () => {
    if (!pendingVoiceClip && !pendingImage) return;
    setConfirmDiscardPending(true);
  };

  const cancelDiscardPending = () => setConfirmDiscardPending(false);

  const confirmDiscard = () => {
    if (pendingVoiceClip) {
      clearPendingVoiceClip("Voice note deleted.");
      return;
    }
    if (pendingImage) clearPendingImage("Photo removed.");
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
        className="taskchat-main"
        style={{
          width: "100%",
          maxWidth: 1660,
          margin: "0 auto",
          padding: "26px 26px 30px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          {taskTabs.map((item) => {
            const active = item.id === activeGroup;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setConfirmingLeave(false);
                  setActiveGroup(item.id);
                }}
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
          className="taskchat-section"
          style={{
            border: "2px solid #1E1E1E",
            borderRadius: 30,
            background: "#ECE8DF",
            overflow: "hidden",
            // Fit within the viewport so the chat doesn't push the page into a
            // scroll. Caps at 760px on tall screens; on shorter laptops it
            // shrinks to leave room for the navbar (64), main padding (56) and
            // the task-tab row (~50). The message list inside still scrolls.
            height: "min(760px, calc(100vh - 170px))",
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
          }}
        >
          <header
            className="taskchat-header"
            style={{
              borderBottom: "2px solid #1E1E1E",
              padding: "20px 50px 18px",
              background: "#E8E4D8",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="taskchat-title" style={{ fontWeight: 800, fontSize: 38 / 2, color: "#131313", lineHeight: 1.2 }}>
                {group?.title || "No task selected"}
              </div>
              <div
                className="taskchat-meta"
                style={{
                  marginTop: 4,
                  color: "#6F6E78",
                  fontSize: 31 / 2,
                  fontWeight: 700,
                }}
              >
                {group?.meta || "Join a task from a crisis to start collaborating"}
              </div>
            </div>
            {group && (
              confirmingLeave ? (
                <div style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#6F6E78", fontSize: 13, fontWeight: 800 }}>Leave this task?</span>
                  <button
                    onClick={() => setConfirmingLeave(false)}
                    disabled={leaving}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      border: "1.5px solid #D5D2C9", background: "#fff", color: "#6F6E78",
                      borderRadius: 999, padding: "8px 16px",
                      fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 13, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={leaveActiveTask}
                    disabled={leaving}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      border: "1.5px solid #B42318", background: "#B42318", color: "#fff",
                      borderRadius: 999, padding: "8px 16px",
                      fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 13, cursor: "pointer",
                    }}
                  >
                    <X size={14} /> {leaving ? "Leaving…" : "Confirm leave"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingLeave(true)}
                  title="Leave this task"
                  style={{
                    flexShrink: 0,
                    display: "inline-flex", alignItems: "center", gap: 6,
                    border: "1.5px solid #B42318", background: "#fff", color: "#B42318",
                    borderRadius: 999, padding: "8px 16px",
                    fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 13, cursor: "pointer",
                  }}
                >
                  <X size={14} /> Leave task
                </button>
              )
            )}
          </header>

          <div
            ref={messageListRef}
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
                {isLoadingTasks
                  ? "Loading your tasks..."
                  : taskTabs.length === 0
                    ? (tasksError || "You haven't joined any tasks yet. Join a task from a crisis to start collaborating.")
                    : isLoadingMessages
                      ? "Loading group chat history..."
                      : (messagesError || "No messages yet for this task.")}
              </div>
            )}

            {messages.map((message) => {
              if (message.role === "me") {
                const hasVoice = Boolean(message.audioUrl);
                const hasImage = Boolean(message.imageUrl);
                return (
                  <div key={message.id} style={{ width: "100%", display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                    <div className="taskchat-bubble-me" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "42%", gap: 8, textAlign: "left" }}>
                      <div style={{ color: "#6F6D77", fontWeight: 700, fontSize: 30 / 2, marginBottom: 5 }}>{message.sender}</div>
                      {hasImage ? (
                        <>
                          <img
                            src={message.imageUrl}
                            alt="Shared"
                            style={{
                              width: "min(360px, 100%)",
                              maxHeight: 260,
                              objectFit: "cover",
                              borderRadius: 18,
                              border: "2px solid #1E1E1E",
                              display: "block",
                              boxSizing: "border-box",
                              background: "#9EC4DA",
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
                        </>
                      ) : hasVoice ? (
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

              // Multi-sentence/multi-line text reads better in a rounded card
              // than a fully-rounded pill (which over-curves tall bubbles).
              const isMultiLine = /\n|[.!?]\s+\S/.test((message.text || "").replace(/\*\*/g, ""));
              return (
                <div key={message.id} className="taskchat-bubble-other" style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 16, maxWidth: "58%" }}>
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
                  <div style={{ minWidth: 0, textAlign: "left" }}>
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
                        borderRadius: message.imageUrl || isMultiLine ? 18 : 999,
                        background: "#ECE8DF",
                        padding: "13px 22px",
                        fontSize: 34 / 2,
                        color: "#141414",
                        lineHeight: 1.25,
                        boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
                      }}
                    >
                      {message.imageUrl && (
                        <img
                          src={message.imageUrl}
                          alt="Shared"
                          style={{
                            width: "min(360px, 100%)",
                            maxHeight: 260,
                            objectFit: "cover",
                            borderRadius: 14,
                            border: "2px solid #1E1E1E",
                            display: "block",
                            boxSizing: "border-box",
                            marginBottom: message.text ? 10 : 0,
                            background: "#ECE8DF",
                          }}
                        />
                      )}
                      {formatMessageText(message.text)}
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
            className="taskchat-footer"
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
                {(pendingVoiceClip || pendingImage) && !isRecording && (
                  confirmDiscardPending ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={cancelDiscardPending}
                        style={{
                          border: "1px solid #D1D5DB",
                          background: "#fff",
                          color: "#6B7280",
                          borderRadius: 999,
                          padding: "2px 9px",
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmDiscard}
                        style={{
                          border: "none",
                          background: "#B91C1C",
                          color: "#fff",
                          borderRadius: 999,
                          padding: "2px 10px",
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        title={pendingVoiceClip ? "Confirm delete voice note" : "Confirm remove photo"}
                      >
                        Confirm
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={requestDiscardPending}
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
                      title={pendingVoiceClip ? "Delete recorded voice note" : "Remove selected photo"}
                    >
                      <X size={14} />
                    </button>
                  )
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    handlePhotoSelected(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
                <button
                  className="taskchat-iconbtn"
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: "50%",
                    border: "2px solid #1E1E1E",
                    background: cameraMenuOpen ? "#E5E2DA" : "#F5F4F0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  title="Add Photo"
                  onClick={() => setCameraMenuOpen((prev) => !prev)}
                >
                  <Camera size={32} color="#111111" />
                </button>
                {cameraMenuOpen && (
                  <>
                    <div
                      onClick={() => setCameraMenuOpen(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 20 }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 10px)",
                        left: 0,
                        zIndex: 30,
                        background: "#FFFFFF",
                        border: "1px solid #E5E7EB",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        borderRadius: 12,
                        minWidth: 190,
                        padding: 6,
                      }}
                    >
                      <button
                        onClick={() => {
                          setCameraMenuOpen(false);
                          setCameraOpen(true);
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          border: "none",
                          borderRadius: 8,
                          background: "transparent",
                          cursor: "pointer",
                          padding: "10px 12px",
                          fontFamily: "'Nunito', sans-serif",
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#1F2937",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F4F6"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <Camera size={18} color="#6B7280" />
                        Take a photo
                      </button>
                      <button
                        onClick={openUpload}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          border: "none",
                          borderRadius: 8,
                          background: "transparent",
                          cursor: "pointer",
                          padding: "10px 12px",
                          fontFamily: "'Nunito', sans-serif",
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#1F2937",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F4F6"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <ImageIcon size={18} color="#6B7280" />
                        Upload a photo
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                className="taskchat-iconbtn"
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
            </div>

            <input
              className="taskchat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message group… (type @Brainy to ask)"
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
              className="taskchat-iconbtn"
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
      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            handlePhotoSelected(file);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
          onUpload={() => {
            setCameraOpen(false);
            openUpload();
          }}
        />
      )}
    </div>
  );
}
