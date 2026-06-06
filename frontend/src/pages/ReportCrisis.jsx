// Report Crisis — capture a photo of an incident, let Brainy suggest tags, then
// post it to the Feed. Step 1 is a live camera; step 2 reviews the shot and
// collects a caption / tags / location before posting.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import BrainyMascot from "../components/BrainyMascot";
import { api } from "../lib/api";

const MONO = "'Courier New', ui-monospace, monospace";
const DEFAULT_TAGS = ["#flood", "#road", "#help"];

// tagsFromType turns the vision model's crisis_type into a short suggestion list.
function tagsFromType(type) {
  if (!type || type === "none" || type === "other") return DEFAULT_TAGS;
  const primary = `#${type.replace(/_/g, "")}`;
  const extras = ["#road", "#help", "#sg"].filter((t) => t !== primary);
  return [primary, ...extras].slice(0, 3);
}

function SpeechBubble({ children }) {
  return (
    <div
      style={{
        position: "relative", background: "#fff", borderRadius: 18,
        padding: "14px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
        fontSize: 15, fontWeight: 600, color: "#1f2937", lineHeight: 1.5,
        textAlign: "center", maxWidth: 280,
      }}
    >
      {children}
      <div style={{
        position: "absolute", bottom: -9, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0, borderLeft: "10px solid transparent",
        borderRight: "10px solid transparent", borderTop: "10px solid #fff",
      }} />
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: 1,
      color: "#6B7280", marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

export default function ReportCrisis() {
  const navigate = useNavigate();

  const [step, setStep] = useState("capture"); // "capture" | "review"
  const [captured, setCaptured] = useState(null); // { url, dataUrl, file }
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [selectedTags, setSelectedTags] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [cameraReady, setCameraReady] = useState(true); // false → show upload fallback

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const sessionRef = useRef(null);

  // Drive the live camera while on the capture step; tear it down on leave.
  useEffect(() => {
    if (step !== "capture") return;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraReady(false);
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
        setCameraReady(true);
      } catch {
        setCameraReady(false);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStreaming(false);
    };
  }, [step]);

  // Best-effort location auto-tag (the header promises "auto-tagging location").
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLocation((prev) => prev || `≈ ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
      () => {},
      { timeout: 8000 },
    );
  }, []);

  const beginReview = (url, dataUrl, file) => {
    setCaptured({ url, dataUrl, file });
    setStep("review");
    analyze(file);
  };

  const onShutter = () => {
    const video = videoRef.current;
    // No live frame yet — fall back to picking a photo from the device.
    if (!video || !streamRef.current || video.videoWidth === 0) {
      fileInputRef.current?.click();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    canvas.toBlob(
      (blob) => beginReview(URL.createObjectURL(blob), dataUrl, new File([blob], "report.jpg", { type: "image/jpeg" })),
      "image/jpeg",
      0.9,
    );
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => beginReview(URL.createObjectURL(file), reader.result, file);
    reader.readAsDataURL(file);
  };

  // analyze sends the shot to the vision endpoint and seeds suggested tags from
  // the detected crisis type. Falls back to defaults if the backend is down.
  const analyze = async (file) => {
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append("image", file);
      if (sessionRef.current) form.append("session_id", sessionRef.current);

      const res = await api.postForm("/api/chat/photo", form);
      if (res.session_id) sessionRef.current = res.session_id;

      const suggested = tagsFromType(res?.crisis_card?.type);
      setTags(suggested);
      if (res?.crisis_card?.type) setSelectedTags([suggested[0]]);
    } catch {
      setTags(DEFAULT_TAGS);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleTag = (t) =>
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const submit = () => {
    if (!captured) return;
    const report = {
      id: `r-${Date.now()}`,
      tag: "YOUR REPORT",
      tagColor: "#D97706",
      tagBg: "#FFFBEB",
      tagIcon: "zap",
      time: "Just now",
      title: caption.trim() || "Citizen crisis report",
      location: location.trim() || "Location not specified",
      body: caption.trim(),
      tags: selectedTags,
      image: captured.dataUrl,
      comments: 0,
      shares: null,
      helpNeeded: true,
      action: { label: "View Detail", primary: true, href: "/crisis" },
    };
    try {
      const existing = JSON.parse(localStorage.getItem("brainy_reports") || "[]");
      localStorage.setItem("brainy_reports", JSON.stringify([report, ...existing]));
    } catch {
      // ignore storage quota / parse errors — still navigate to the feed
    }
    navigate("/timeline");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif" }}>
      <Navbar />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPickFile}
        style={{ display: "none" }}
      />

      <div className="report-layout">
        {step === "capture" ? (
          <>
            {/* ── Live camera panel ── */}
            <div className="report-main">
              <div style={{
                position: "relative", background: "#2b2b2b", borderRadius: 20,
                overflow: "hidden", height: 560, width: "100%",
              }}>
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

                {/* Header: REC + flash */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, zIndex: 2,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 20px",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 13, color: "#D6D3CD" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
                    REC — auto-tagging location
                  </span>
                  <Zap size={18} color="#D6D3CD" />
                </div>

                {/* Placeholder shown until the live feed is available */}
                {!streaming && (
                  <div style={{
                    position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 10,
                    fontFamily: MONO, color: "#8A8780",
                  }}>
                    <span style={{ fontStyle: "italic", fontSize: 16 }}>[ live camera ]</span>
                    {!cameraReady && (
                      <span style={{ fontSize: 12 }}>Camera unavailable — tap the shutter to upload a photo</span>
                    )}
                  </div>
                )}

                {/* Shutter */}
                <button
                  onClick={onShutter}
                  title="Capture photo"
                  style={{
                    position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
                    width: 62, height: 62, borderRadius: "50%", cursor: "pointer", zIndex: 2,
                    background: "#C9C9C9", border: "4px solid rgba(255,255,255,0.65)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
                  }}
                />
              </div>
            </div>

            {/* ── Brainy ── */}
            <div className="report-side">
              <SpeechBubble>I can see water on the road. Tap when you're ready, I'll suggest the next steps.</SpeechBubble>
              <BrainyMascot mood="surprised" width={220} />
            </div>
          </>
        ) : (
          <>
            {/* ── Captured photo ── */}
            <div className="report-main">
              <img
                src={captured?.url}
                alt="Captured report"
                style={{ width: "100%", borderRadius: 16, display: "block", boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}
              />
            </div>

            {/* ── Caption / tags / location / post ── */}
            <div className="report-side" style={{ alignItems: "stretch" }}>
              <div>
                <FieldLabel>CAPTION</FieldLabel>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add description..."
                  rows={4}
                  style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical",
                    border: "1px solid #D7D2C7", borderRadius: 10, padding: "10px 12px",
                    fontFamily: MONO, fontSize: 13, color: "#1f2937", background: "#fff", outline: "none",
                  }}
                />
              </div>

              <div>
                <FieldLabel>SUGGESTED TAGS</FieldLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {analyzing ? (
                    <span style={{ fontFamily: MONO, fontSize: 12, color: "#9CA3AF" }}>Analyzing photo…</span>
                  ) : (
                    tags.map((t) => {
                      const on = selectedTags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleTag(t)}
                          style={{
                            fontFamily: MONO, fontSize: 13, cursor: "pointer",
                            padding: "6px 14px", borderRadius: 20,
                            border: `1px solid ${on ? "#1a1a2e" : "#C9C3B6"}`,
                            background: on ? "#1a1a2e" : "transparent",
                            color: on ? "#fff" : "#3F3F46",
                          }}
                        >
                          {t}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <FieldLabel>LOCATION</FieldLabel>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location..."
                  style={{
                    width: "100%", boxSizing: "border-box",
                    border: "1px solid #D7D2C7", borderRadius: 10, padding: "10px 12px",
                    fontFamily: MONO, fontSize: 13, color: "#1f2937", background: "#fff", outline: "none",
                  }}
                />
              </div>

              <button
                onClick={submit}
                style={{
                  alignSelf: "flex-start", background: "#1a1a2e", color: "#fff",
                  border: "none", borderRadius: 10, padding: "10px 28px",
                  fontFamily: MONO, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                POST
              </button>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 8 }}>
                <SpeechBubble>Image successfully captured! Add a description for this situation, so that other users can be aware.</SpeechBubble>
                <BrainyMascot mood="happy" width={200} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
