import { Camera, Mic, SendHorizontal } from "lucide-react";
import { useState } from "react";

export default function ChatInput({ value, onChange, onSend, onCamera, onMic, disabled = false }) {
  const [focused, setFocused] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !disabled) {
      e.preventDefault();
      onSend?.();
    }
  };

  const iconBtn = (onClick, Icon) => (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: 6, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
      onMouseLeave={e => e.currentTarget.style.background = "none"}
    >
      <Icon size={20} color="#6B7280" />
    </button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "#fff", borderRadius: 30,
      padding: "8px 8px 8px 14px",
      boxShadow: focused && !disabled
        ? "0 0 0 2px #F59E0B, 0 2px 8px rgba(0,0,0,0.08)"
        : "0 2px 8px rgba(0,0,0,0.08)",
      opacity: disabled ? 0.6 : 1,
      transition: "box-shadow 0.2s, opacity 0.2s",
    }}>
      {iconBtn(onCamera, Camera)}
      {iconBtn(onMic, Mic)}
      <input
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={disabled ? "Brainy is thinking..." : "Type a message..."}
        disabled={disabled}
        style={{
          flex: 1, border: "none", outline: "none",
          fontFamily: "'Nunito', sans-serif", fontSize: 14, color: "#1a1a2e",
          background: "transparent", cursor: disabled ? "not-allowed" : "text",
        }}
      />
      <button
        onClick={onSend}
        disabled={disabled}
        style={{
          width: 36, height: 36, borderRadius: "50%",
          background: disabled ? "#93C5FD" : "#3B82F6",
          border: "none", cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "#2563EB"; }}
        onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = "#3B82F6"; }}
      >
        <SendHorizontal size={16} color="#fff" />
      </button>
    </div>
  );
}
