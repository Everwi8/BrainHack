// Live webcam capture modal for the chat. Mirrors the ReportCrisis camera flow:
// getUserMedia → <video> → draw a frame to <canvas> → toBlob → File. Works on
// desktop (real webcam) and mobile; if the camera is unavailable or denied it
// offers an upload fallback instead.
import { useEffect, useRef, useState } from "react";
import { X, Image as ImageIcon } from "lucide-react";

export default function CameraCapture({ onCapture, onClose, onUpload }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(false);

  // Start the camera on mount; tear the stream down on unmount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStreaming(true);
      } catch {
        setError(true);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const shutter = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        // Above the Crisis Detail Brainy drawer (zIndex 1401) — this is a
        // top-level capture modal that must sit over everything.
        position: "fixed", inset: 0, zIndex: 1600,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a", borderRadius: 20, overflow: "hidden",
          width: "100%", maxWidth: 560, boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", color: "#fff",
        }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Take a photo</span>
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: "none", border: "none", cursor: "pointer", color: "#D1D5DB",
              padding: 4, display: "flex", borderRadius: 8,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera viewport */}
        <div style={{ position: "relative", background: "#000", aspectRatio: "4 / 3", width: "100%" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", display: streaming ? "block" : "none",
            }}
          />

          {!streaming && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12, color: "#9CA3AF",
              textAlign: "center", padding: 24,
            }}>
              {error ? (
                <>
                  <span style={{ fontSize: 14 }}>
                    Camera unavailable or permission denied.
                  </span>
                  <button
                    onClick={onUpload}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "#fff", color: "#1a1a2e", border: "none",
                      borderRadius: 10, padding: "10px 16px", cursor: "pointer",
                      fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 14,
                    }}
                  >
                    <ImageIcon size={18} /> Upload a photo instead
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 14, fontStyle: "italic" }}>Starting camera…</span>
              )}
            </div>
          )}
        </div>

        {/* Footer / shutter */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px", position: "relative", minHeight: 56,
        }}>
          <button
            onClick={shutter}
            disabled={!streaming}
            title="Capture photo"
            style={{
              width: 60, height: 60, borderRadius: "50%",
              cursor: streaming ? "pointer" : "not-allowed",
              background: streaming ? "#fff" : "#6B7280",
              border: "4px solid rgba(255,255,255,0.5)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
            }}
          />
          {streaming && (
            <button
              onClick={onUpload}
              title="Upload a photo instead"
              style={{
                position: "absolute", right: 16, background: "none", border: "none",
                cursor: "pointer", color: "#D1D5DB", padding: 8, display: "flex", borderRadius: 8,
              }}
            >
              <ImageIcon size={22} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
