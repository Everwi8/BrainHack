// Profile & settings — lets the signed-in user edit their display name, change
// their password, and manage the volunteer skills used by the "find my match"
// flow. Name/password go to PATCH /api/auth/me; skills to POST /api/volunteers.
import { useEffect, useState } from "react";
import { UserCircle, ShieldCheck, Sparkles, Check } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

const INK = "#1a1a2e";

function Card({ title, icon, children }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
      padding: 22, display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#6B7280", letterSpacing: 0.3 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  border: "1px solid #D7D2C7", borderRadius: 10, padding: "10px 12px",
  fontFamily: "'Nunito', sans-serif", fontSize: 14, color: INK, background: "#fff", outline: "none",
};

const btnStyle = (disabled) => ({
  alignSelf: "flex-start",
  background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 24,
  padding: "10px 26px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 14,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
});

// Inline save-result line (green on success, red on error).
function Msg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      fontSize: 12.5, fontWeight: 700,
      color: msg.ok ? "#15803D" : "#B91C1C",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {msg.ok && <Check size={14} />} {msg.text}
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();

  // ── Account (name + password) ──
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountMsg, setAccountMsg] = useState(null); // { ok, text }

  // ── Skills ──
  const [catalog, setCatalog] = useState([]);
  const [skills, setSkills] = useState(new Set());
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillsMsg, setSkillsMsg] = useState(null);

  useEffect(() => {
    api.get("/api/volunteers/skills")
      .then((res) => setCatalog(Array.isArray(res?.skills) ? res.skills : []))
      .catch(() => {});
    api.get("/api/volunteers/me")
      .then((res) => setSkills(new Set(Array.isArray(res?.skills) ? res.skills : [])))
      .catch(() => {});
  }, []);

  const saveAccount = async () => {
    setAccountMsg(null);
    if (password && password !== confirm) {
      setAccountMsg({ ok: false, text: "Passwords don't match." });
      return;
    }
    if (password && password.length < 6) {
      setAccountMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    const payload = {};
    if (name.trim() && name.trim() !== user?.name) payload.name = name.trim();
    if (password) payload.password = password;
    if (Object.keys(payload).length === 0) {
      setAccountMsg({ ok: false, text: "Nothing to update." });
      return;
    }
    setSavingAccount(true);
    try {
      const updated = await api.patch("/api/auth/me", payload);
      if (payload.name) updateUser({ name: updated.name });
      setPassword("");
      setConfirm("");
      setAccountMsg({ ok: true, text: "Profile updated." });
    } catch (err) {
      setAccountMsg({ ok: false, text: err.message || "Could not update profile." });
    } finally {
      setSavingAccount(false);
    }
  };

  const toggleSkill = (slug) => setSkills((prev) => {
    const next = new Set(prev);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    return next;
  });

  const saveSkills = async () => {
    setSkillsMsg(null);
    setSavingSkills(true);
    try {
      await api.post("/api/volunteers", { skills: [...skills] });
      setSkillsMsg({ ok: true, text: "Skills saved." });
    } catch (err) {
      setSkillsMsg({ ok: false, text: err.message || "Could not save skills." });
    } finally {
      setSavingSkills(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif" }}>
      <Navbar />

      <div style={{ maxWidth: 640, margin: "24px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "#e0d5c5",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <UserCircle size={40} color="#7a6a56" />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: INK }}>{user?.name || "Your profile"}</div>
            <div style={{ fontSize: 13, color: "#6B7280" }}>
              {user?.email}{user?.role ? ` · ${user.role}` : ""}
            </div>
          </div>
        </div>

        {/* Account */}
        <Card title="Account" icon={<ShieldCheck size={16} color="#92400E" />}>
          <Field label="DISPLAY NAME">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
          </Field>
          <Field label="EMAIL">
            <input value={user?.email ?? ""} disabled style={{ ...inputStyle, background: "#F3F4F6", color: "#9CA3AF" }} />
          </Field>
          <Field label="NEW PASSWORD">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} placeholder="Leave blank to keep current" autoComplete="new-password" />
          </Field>
          <Field label="CONFIRM NEW PASSWORD">
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} placeholder="Re-enter new password" autoComplete="new-password" />
          </Field>
          <Msg msg={accountMsg} />
          <button onClick={saveAccount} disabled={savingAccount} style={btnStyle(savingAccount)}>
            {savingAccount ? "Saving…" : "Save changes"}
          </button>
        </Card>

        {/* Skills */}
        <Card title="Volunteer skills" icon={<Sparkles size={16} color="#7C3AED" />}>
          <p style={{ margin: 0, fontSize: 13, color: "#6B6B6B", textAlign: "left" }}>
            Pick what you can help with so Brainy can match you to the right tasks.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {catalog.length === 0 ? (
              <span style={{ fontSize: 13, color: "#9CA3AF" }}>Loading skills…</span>
            ) : catalog.map((s) => {
              const on = skills.has(s.slug);
              return (
                <button
                  key={s.slug}
                  onClick={() => toggleSkill(s.slug)}
                  style={{
                    border: `1.5px solid ${on ? "#7C3AED" : "#E5E7EB"}`,
                    background: on ? "#EDE9FE" : "#fff",
                    color: on ? "#6D28D9" : "#4B5563",
                    borderRadius: 999, padding: "7px 13px", fontSize: 12.5, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {on ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
          <Msg msg={skillsMsg} />
          <button onClick={saveSkills} disabled={savingSkills} style={btnStyle(savingSkills)}>
            {savingSkills ? "Saving…" : "Save skills"}
          </button>
        </Card>
      </div>
    </div>
  );
}
