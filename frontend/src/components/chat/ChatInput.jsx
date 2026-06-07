import { Camera, Image as ImageIcon, Mic, SendHorizontal } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

const ChatInput = forwardRef(function ChatInput({
  value, onChange, onSend, onPickImage, onMic, onTakePhoto,
  recording = false, transcribing = false, disabled = false,
}, ref) {
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const uploadInputRef = useRef(null);

  const takePhoto = () => { setMenuOpen(false); onTakePhoto?.(); };
  const openUpload = () => { setMenuOpen(false); uploadInputRef.current?.click(); };

  // Let the parent open the upload picker programmatically (camera capture is
  // driven by the parent's modal via onTakePhoto).
  useImperativeHandle(ref, () => ({ openUpload }));

  // While recording, the text field and send are locked but the mic stays
  // active so the user can tap it again to stop.
  const locked = disabled || recording;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !locked) {
      e.preventDefault();
      onSend?.();
    }
  };

  const handleCameraClick = () => { if (!locked) setMenuOpen(o => !o); };

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
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Camera — opens a small menu: take a photo or upload */}
      <div style={{ position: "relative", flexShrink: 0, display: "flex" }}>
        <button
          onClick={handleCameraClick}
          disabled={locked}
          title="Add a photo"
          style={{
            background: menuOpen ? "#F3F4F6" : "none",
            border: "none", cursor: locked ? "not-allowed" : "pointer",
            padding: 6, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { if (!locked) e.currentTarget.style.background = "#F3F4F6"; }}
          onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = "none"; }}
        >
          <Camera size={20} color="#6B7280" />
        </button>

        {menuOpen && (
          <>
            {/* Backdrop: click anywhere else to dismiss the menu */}
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
            />
            <div style={{
              position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 50,
              background: "#fff", borderRadius: 12, padding: 6, minWidth: 180,
              boxShadow: "0 4px 18px rgba(0,0,0,0.16)", border: "1px solid #F3F4F6",
            }}>
              {[
                { Icon: Camera,    label: "Take a photo", onClick: takePhoto },
                { Icon: ImageIcon, label: "Upload a photo", onClick: openUpload },
              ].map(({ Icon, label, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    background: "none", border: "none", cursor: "pointer",
                    padding: "10px 12px", borderRadius: 8, textAlign: "left",
                    fontFamily: "'Nunito', sans-serif", fontSize: 14, fontWeight: 600, color: "#1a1a2e",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  <Icon size={18} color="#6B7280" /> {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

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
});

export default ChatInput;
