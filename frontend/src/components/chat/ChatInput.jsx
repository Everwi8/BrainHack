import { Camera, Mic, SendHorizontal } from "lucide-react";
import { useRef, useState } from "react";

export default function ChatInput({
  value, onChange, onSend, onPickImage, onMic,
  recording = false, transcribing = false, disabled = false,
}) {
  const [focused, setFocused] = useState(false);
  const fileInputRef = useRef(null);

  // While recording, the text field and send are locked but the mic stays
  // active so the user can tap it again to stop.
  const locked = disabled || recording;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !locked) {
      e.preventDefault();
      onSend?.();
    }
  };

  const handleCameraClick = () => { if (!locked) fileInputRef.current?.click(); };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onPickImage?.(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  const placeholder = recording
    ? "Recording… tap the mic to stop"
    : transcribing
      ? "Transcribing your voice note…"
      : disabled
        ? "Brainy is thinking…"
        : "Type a message…";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "#fff", borderRadius: 30,
      padding: "8px 8px 8px 14px",
      boxShadow: focused && !locked
        ? "0 0 0 2px #F59E0B, 0 2px 8px rgba(0,0,0,0.08)"
        : "0 2px 8px rgba(0,0,0,0.08)",
      opacity: disabled ? 0.6 : 1,
      transition: "box-shadow 0.2s, opacity 0.2s",
    }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Camera */}
      <button
        onClick={handleCameraClick}
        disabled={locked}
        style={{
          background: "none", border: "none", cursor: locked ? "not-allowed" : "pointer",
          padding: 6, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!locked) e.currentTarget.style.background = "#F3F4F6"; }}
        onMouseLeave={e => e.currentTarget.style.background = "none"}
      >
        <Camera size={20} color="#6B7280" />
      </button>

      {/* Mic — turns red while recording; clickable then so it can stop */}
      <button
        onClick={onMic}
        disabled={disabled}
        title={recording ? "Stop recording" : "Record a voice note"}
        style={{
          background: recording ? "#FEE2E2" : "none",
          border: "none", cursor: disabled ? "not-allowed" : "pointer",
          padding: 6, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!disabled && !recording) e.currentTarget.style.background = "#F3F4F6"; }}
        onMouseLeave={e => { if (!recording) e.currentTarget.style.background = "none"; }}
      >
        <Mic size={20} color={recording ? "#DC2626" : "#6B7280"} />
      </button>

      <input
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        disabled={locked}
        style={{
          flex: 1, border: "none", outline: "none",
          fontFamily: "'Nunito', sans-serif", fontSize: 14, color: "#1a1a2e",
          background: "transparent", cursor: locked ? "not-allowed" : "text",
        }}
      />
      <button
        onClick={onSend}
        disabled={locked}
        style={{
          width: 36, height: 36, borderRadius: "50%",
          background: locked ? "#93C5FD" : "#3B82F6",
          border: "none", cursor: locked ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (!locked) e.currentTarget.style.background = "#2563EB"; }}
        onMouseLeave={e => { if (!locked) e.currentTarget.style.background = "#3B82F6"; }}
      >
        <SendHorizontal size={16} color="#fff" />
      </button>
    </div>
  );
}
