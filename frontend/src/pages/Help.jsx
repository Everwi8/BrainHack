import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/NavBar";
import BrainyMascot from "../components/BrainyMascot";
import {
  Bell, MapPin, Camera, Mic, Building2, Home as HomeIcon,
  Users, Flame, Car, Package, Info, Send, AlertCircle,
  Waves, ChevronLeft, ChevronRight, CheckCircle
} from "lucide-react";

const NAV_LINKS = [
  { label: "Home",  path: "/" },
  { label: "Map",   path: "/map" },
  { label: "Tasks", path: "/crisis" },
  { label: "Chat",  path: "/chat" },
];

const helpOptions = [
  {
    id: "medical",
    Icon: Building2, iconBg: "#FCA5A5", iconColor: "#DC2626",
    title: "Medical Help", subtitle: "I'm hurt or someone near me is.",
    tag: "Medical Help",
    tagColor: "#DC2626", tagBg: "#FEE2E2",
    followUp: "How urgent is the situation?",
    questions: [
      { key: "urgency", label: "Urgency", type: "select", options: ["Life-threatening", "Serious but stable", "Minor injury"] },
      { key: "count",   label: "How many people need help?", type: "select", options: ["Just me", "2–5 people", "More than 5"] },
      { key: "conscious", label: "Is the person conscious?", type: "select", options: ["Yes", "No", "Unsure"] },
      { key: "details", label: "Describe what happened (optional)", type: "text" },
    ],
  },
  {
    id: "shelter",
    Icon: HomeIcon, iconBg: "#FBCFE8", iconColor: "#DB2777",
    title: "Shelter", subtitle: "I need a safe place to go",
    tag: "Shelter",
    tagColor: "#DB2777", tagBg: "#FCE7F3",
    followUp: "Tell us more about your situation",
    questions: [
      { key: "people",   label: "How many people need shelter?", type: "select", options: ["Just me", "My family (2–5)", "Large group (5+)"] },
      { key: "mobility", label: "Any mobility issues?",          type: "select", options: ["No", "Yes — wheelchair", "Yes — elderly", "Yes — infant"] },
      { key: "pets",     label: "Do you have pets?",             type: "select", options: ["No", "Yes — small", "Yes — large"] },
      { key: "details",  label: "Current location / notes (optional)", type: "text" },
    ],
  },
  {
    id: "elderly",
    Icon: Users, iconBg: "#86EFAC", iconColor: "#16A34A",
    title: "Elderly/Vulnerable", subtitle: "Someone here needs extra care",
    tag: "Elderly/Vulnerable",
    tagColor: "#16A34A", tagBg: "#DCFCE7",
    followUp: "Tell us about the person who needs help",
    questions: [
      { key: "relation",  label: "Who is this person?",     type: "select", options: ["Myself", "Family member", "Neighbour", "Stranger"] },
      { key: "condition", label: "What is their condition?",type: "select", options: ["Alone and unable to move", "Needs medication", "Confused/disoriented", "Other"] },
      { key: "contact",   label: "Can they be contacted?",  type: "select", options: ["Yes", "No", "Unsure"] },
      { key: "details",   label: "Any other details (optional)", type: "text" },
    ],
  },
  {
    id: "water",
    Icon: Waves, iconBg: "#BFDBFE", iconColor: "#2563EB",
    title: "Water rising", subtitle: "Flood water is getting worse",
    tag: "Water Rising",
    tagColor: "#2563EB", tagBg: "#DBEAFE",
    followUp: "How bad is the flooding?",
    questions: [
      { key: "level",    label: "Water level",           type: "select", options: ["Ankle deep", "Knee deep", "Waist deep", "Above waist"] },
      { key: "trapped",  label: "Are you trapped?",      type: "select", options: ["No, I can move", "Partially — ground floor", "Yes — upper floor", "Yes — vehicle"] },
      { key: "people",   label: "Number of people",      type: "select", options: ["Just me", "2–5", "More than 5"] },
      { key: "details",  label: "Exact location / notes (optional)", type: "text" },
    ],
  },
  {
    id: "fire",
    Icon: Flame, iconBg: "#FCA5A5", iconColor: "#DC2626",
    title: "Fire nearby", subtitle: "Heavy Smoke / Fire",
    tag: "Fire Nearby",
    tagColor: "#DC2626", tagBg: "#FEE2E2",
    followUp: "Tell us about the fire",
    questions: [
      { key: "proximity", label: "How close is the fire?",   type: "select", options: ["My unit/room", "Same floor", "Same building", "Nearby building"] },
      { key: "smoke",     label: "Is there heavy smoke?",    type: "select", options: ["Yes", "No", "Some smoke"] },
      { key: "evacuated", label: "Have you evacuated?",      type: "select", options: ["Yes, I'm outside", "No — I can't leave", "Partially evacuated"] },
      { key: "details",   label: "Any other details (optional)", type: "text" },
    ],
  },
  {
    id: "transport",
    Icon: Car, iconBg: "#FCD9A8", iconColor: "#D97706",
    title: "Stuck/Transport", subtitle: "Can't get out of this area",
    tag: "Stuck/Transport",
    tagColor: "#D97706", tagBg: "#FEF3C7",
    followUp: "Where are you stuck?",
    questions: [
      { key: "location",  label: "Where are you?",          type: "select", options: ["In a vehicle", "On foot", "In a building", "Outdoors"] },
      { key: "reason",    label: "Why can't you leave?",    type: "select", options: ["Road blocked", "Flooded road", "Vehicle breakdown", "Injured", "Other"] },
      { key: "people",    label: "How many people?",        type: "select", options: ["Just me", "2–5", "More than 5"] },
      { key: "details",   label: "Current location / notes (optional)", type: "text" },
    ],
  },
  {
    id: "supplies",
    Icon: Package, iconBg: "#D8B4FE", iconColor: "#7C3AED",
    title: "Supplies Needed", subtitle: "Food, Water or Essentials",
    tag: "Supplies Needed",
    tagColor: "#7C3AED", tagBg: "#F3E8FF",
    followUp: "What do you need?",
    questions: [
      { key: "type",     label: "What supplies?",            type: "select", options: ["Food", "Water", "Medication", "Baby supplies", "Mixed / All of the above"] },
      { key: "duration", label: "How long have you been without?", type: "select", options: ["Less than 1 day", "1–2 days", "More than 2 days"] },
      { key: "people",   label: "How many people?",          type: "select", options: ["1–2", "3–5", "More than 5"] },
      { key: "details",  label: "Any dietary/medical needs (optional)", type: "text" },
    ],
  },
  {
    id: "info",
    Icon: Info, iconBg: "#FCD9A8", iconColor: "#D97706",
    title: "Need info", subtitle: "",
    tag: "Need Info",
    tagColor: "#D97706", tagBg: "#FEF3C7",
    followUp: "What information do you need?",
    questions: [
      { key: "topic",   label: "What topic?",               type: "select", options: ["Evacuation routes", "Shelter locations", "Emergency contacts", "Relief centres", "Other"] },
      { key: "urgent",  label: "How urgent?",               type: "select", options: ["Need it now", "Within the hour", "Just good to know"] },
      { key: "details", label: "Describe what you need (optional)", type: "text" },
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const selectedOption = helpOptions.find(o => o.id === selected);

  function handleSelect(id) {
    setSelected(id);
    setAnswers({});
    setSubmitted(false);
  }

  function handleBack() {
    setSelected(null);
    setAnswers({});
    setSubmitted(false);
  }

  function handleSubmit() {
    setSubmitted(true);
    setTimeout(() => navigate("/chat"), 1800);
  }

  // ── DETAIL VIEW ──────────────────────────────────────────────
  if (selected && selectedOption) {
    const allAnswered = selectedOption.questions
      .filter(q => q.type === "select")
      .every(q => answers[q.key]);

    return (
      <div style={{ minHeight: "100vh", width: "100%", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }}>
        {/* Navbar */}
        <Navbar />

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 120px", boxSizing: "border-box" }}>

          {/* Back button */}
          <button onClick={handleBack} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 14, color: "#666", display: "flex", alignItems: "center", gap: 6, marginBottom: 24, padding: 0 }}>
            <ChevronLeft size={18} /> Back to all options
          </button>

          {/* Tag pill */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: selectedOption.tagBg, color: selectedOption.tagColor, borderRadius: 30, padding: "6px 16px", fontSize: 13, fontWeight: 700, marginBottom: 20}}>
            <selectedOption.Icon size={14} color={selectedOption.tagColor} />
            {selectedOption.tag}
          </div>

          {/* Brainy bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 20, padding: "14px 20px", marginBottom: 28 }}>
            <BrainyMascot mood="angry" width={56} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>
              {submitted ? "Got it! Connecting you now..." : selectedOption.followUp}
            </div>
          </div>

          {submitted ? (
            /* Success state */
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <CheckCircle size={36} color="#16A34A" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e", marginBottom: 8 }}>Help request sent!</div>
              <div style={{ fontSize: 14, color: "#666" }}>Redirecting you to chat with Brainy...</div>
            </div>
          ) : (
            /* Questions */
            <div style={{ display: "flex", flexDirection: "column", gap: 20 , textAlign: "left" }}>
              {selectedOption.questions.map((q, i) => (
                <div key={q.key}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>
                    {i + 1}. {q.label}
                  </div>
                  {q.type === "select" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {q.options.map(opt => {
                        const isChosen = answers[q.key] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => setAnswers(prev => ({ ...prev, [q.key]: opt }))}
                            style={{
                              background: isChosen ? "#1a1a2e" : "#fff",
                              color: isChosen ? "#fff" : "#1a1a2e",
                              border: isChosen ? "2px solid #1a1a2e" : "2px solid #E5E7EB",
                              borderRadius: 30,
                              padding: "9px 18px",
                              fontFamily: "'Nunito', sans-serif",
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: "pointer",
                              transition: "all 0.15s",
                              display: "flex", alignItems: "center", gap: 6,
                            }}
                          >
                            {isChosen && <CheckCircle size={13} />}
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={answers[q.key] || ""}
                      onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                      placeholder="Type here..."
                      rows={3}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        border: "1.5px solid #E5E7EB", borderRadius: 14,
                        padding: "12px 16px",
                        fontFamily: "'Nunito', sans-serif", fontSize: 14,
                        color: "#1a1a2e", resize: "none", outline: "none",
                        background: "#F9FAFB",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky bottom */}
        {!submitted && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #E5E7EB", padding: "12px 32px", display: "flex", gap: 12, alignItems: "center", zIndex: 200, boxSizing: "border-box" }}>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Anything else? (Optional)"
              style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 30, padding: "12px 20px", fontFamily: "'Nunito', sans-serif", fontSize: 14, color: "#1a1a2e", outline: "none", background: "#F9FAFB" }}
            />
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              style={{
                background: allAnswered ? "#1a1a2e" : "#D1D5DB",
                color: "#fff", border: "none", borderRadius: 30,
                padding: "12px 28px",
                fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 15,
                cursor: allAnswered ? "pointer" : "not-allowed",
                whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8,
                transition: "background 0.15s",
              }}
            >
              <Send size={16} /> SEND FOR HELP
            </button>
            <button style={{ background: "#fff", color: "#EF4444", border: "2px solid #EF4444", borderRadius: 30, padding: "12px 20px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <AlertCircle size={16} /> SOS - 995
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── MAIN HELP VIEW ───────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }}>
      {/* Navbar */}
      <Navbar />

      <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", padding: "24px 32px 120px", boxSizing: "border-box" }}>
        {/* Brainy header */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 20, padding: "16px 24px", marginBottom: 28 }}>
          <BrainyMascot mood="surprised" width={72} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: "#1a1a2e", lineHeight: 1.4 }}>
            I'm here, tell me what you need and I'll get help to you.
          </div>
          <div style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={13} color="#10B981" />
            <span style={{ color: "#10B981", fontWeight: 700 }}>GPS active</span> • Pasir Ris Dr 3
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", marginBottom: 4 }}>What do you need ?</h2>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>Tap one. You can add details after.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
          {helpOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              style={{
                background: "#fff",
                border: "2px solid #E5E7EB",
                borderRadius: 18, padding: "20px 16px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                textAlign: "center", fontFamily: "'Nunito', sans-serif",
                transition: "transform 0.15s, box-shadow 0.15s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.1)"; e.currentTarget.style.borderColor = opt.iconColor; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
            >
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: opt.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <opt.Icon size={28} color={opt.iconColor} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e" }}>{opt.title}</div>
                {opt.subtitle && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{opt.subtitle}</div>}
              </div>
              <div style={{ fontSize: 11, color: opt.iconColor, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                Tap for details <ChevronRight size={11} />
              </div>
            </button>
          ))}
        </div>

        {/* Snap / Voice row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          {[
            { Icon: Camera, iconBg: "#FEF3C7", iconColor: "#D97706", title: "Snap a photo",       subtitle: "Auto-tags location, Brainy will decipher the situation", action: () => navigate("/chat") },
            { Icon: Mic,    iconBg: "#FEF3C7", iconColor: "#D97706", title: "Record a voice note", subtitle: "Speak if you can't type. Brainy will transcribe it",       action: () => navigate("/chat") },
          ].map(({ Icon, iconBg, iconColor, title, subtitle, action }) => (
            <button key={title} onClick={action} style={{ background: "#fff", border: "2px solid #E5E7EB", borderRadius: 18, padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, fontFamily: "'Nunito', sans-serif", textAlign: "left", transition: "border-color 0.15s, background 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#F59E0B"; e.currentTarget.style.background = "#FFFBEB"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
            >
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={22} color={iconColor} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e" }}>{title}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sticky bottom */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #E5E7EB", padding: "12px 32px", display: "flex", gap: 12, alignItems: "center", zIndex: 200, boxSizing: "border-box" }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else? (Optional, you can skip this)"
          style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 30, padding: "12px 20px", fontFamily: "'Nunito', sans-serif", fontSize: 14, color: "#1a1a2e", outline: "none", background: "#F9FAFB" }}
        />
        <button onClick={() => navigate("/chat")} style={{ background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 30, padding: "12px 28px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
          <Send size={16} /> SEND FOR HELP
        </button>
        <button style={{ background: "#fff", color: "#EF4444", border: "2px solid #EF4444", borderRadius: 30, padding: "12px 20px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <AlertCircle size={16} /> SOS - 995
        </button>
      </div>
    </div>
  );
}