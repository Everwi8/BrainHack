// Profile & settings — lets the signed-in user edit their display name, change
// their password, and manage the volunteer skills used by the "find my match"
// flow. Name/password go to PATCH /api/auth/me; skills to POST /api/volunteers.
import { useEffect, useState } from "react";
import { UserCircle, ShieldCheck, Sparkles, Check, Languages } from "lucide-react";
import Navbar from "../components/layout/NavBar";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { LANGUAGES, getLang, setLang } from "../lib/lang";

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
  const [confirmAccountSave, setConfirmAccountSave] = useState(false);
  const [accountMsg, setAccountMsg] = useState(null); // { ok, text }

  // ── Language ── (saved on the account; mirrored to local cache for the chat)
  const [lang, setLangState] = useState(user?.language || getLang());
  const [langMsg, setLangMsg] = useState(null);
  const [savingLang, setSavingLang] = useState(false);
  const [pendingLang, setPendingLang] = useState(null); // chosen-but-unconfirmed switch

  // ── Skills ──
  const [catalog, setCatalog] = useState([]);
  const [skills, setSkills] = useState(new Set());
  const [savingSkills, setSavingSkills] = useState(false);
  const [confirmSkillsSave, setConfirmSkillsSave] = useState(false);
  const [skillsMsg, setSkillsMsg] = useState(null);

  useEffect(() => {
    api.get("/api/volunteers/skills")
      .then((res) => setCatalog(Array.isArray(res?.skills) ? res.skills : []))
      .catch(() => {});
    api.get("/api/volunteers/me")
      .then((res) => setSkills(new Set(Array.isArray(res?.skills) ? res.skills : [])))
      .catch(() => {});
    // Pull the canonical saved language from the account and mirror it locally,
    // so the picker and the chat reflect the stored value (not a stale cache).
    api.get("/api/auth/me")
      .then((me) => { if (me?.language) { setLangState(me.language); setLang(me.language); } })
      .catch(() => {});
  }, []);

  const buildAccountPayload = () => {
    const payload = {};
    if (name.trim() && name.trim() !== user?.name) payload.name = name.trim();
    if (password) payload.password = password;
    return payload;
  };

  const requestSaveAccount = () => {
    setAccountMsg(null);
    if (password && password !== confirm) {
      setAccountMsg({ ok: false, text: "Passwords don't match." });
      return;
    }
    if (password && password.length < 6) {
      setAccountMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    const payload = buildAccountPayload();
    if (Object.keys(payload).length === 0) {
      setAccountMsg({ ok: false, text: "Nothing to update." });
      return;
    }
    setConfirmAccountSave(true);
  };

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
    const payload = buildAccountPayload();
    if (Object.keys(payload).length === 0) {
      setAccountMsg({ ok: false, text: "Nothing to update." });
      setConfirmAccountSave(false);
      return;
    }
    setSavingAccount(true);
    try {
      const updated = await api.patch("/api/auth/me", payload);
      if (payload.name) updateUser({ name: updated.name });
      setPassword("");
      setConfirm("");
      setAccountMsg({ ok: true, text: "Profile updated." });
      setConfirmAccountSave(false);
    } catch (err) {
      setAccountMsg({ ok: false, text: err.message || "Could not update profile." });
    } finally {
      setSavingAccount(false);
    }
  };

  // Clicking a language chip stages the switch; the user must confirm before it
  // is saved, so a stray tap doesn't silently change Brainy's language.
  const requestLang = (code) => {
    if (savingLang || code === lang) return;
    setLangMsg(null);
    setPendingLang(code);
  };

  const cancelLang = () => setPendingLang(null);

  const confirmLang = async () => {
    const code = pendingLang;
    if (!code || savingLang) return;
    const prev = lang;
    // Optimistic: update the UI + local cache immediately, then persist.
    setLangState(code);
    setLang(code);
    setSavingLang(true);
    setLangMsg(null);
    try {
      const updated = await api.patch("/api/auth/me", { language: code });
      const saved = updated?.language ?? code;
      updateUser({ language: saved });
      const picked = LANGUAGES.find((l) => l.code === saved);
      setLangMsg({ ok: true, text: `Brainy will reply in ${picked?.label || "Singlish"}.` });
      setPendingLang(null);
    } catch (err) {
      setLangState(prev);
      setLang(prev);
      setLangMsg({ ok: false, text: err.message || "Could not save language." });
    } finally {
      setSavingLang(false);
    }
  };

  const toggleSkill = (slug) => {
    setConfirmSkillsSave(false);
    setSkills((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };

  const requestSaveSkills = () => {
    setSkillsMsg(null);
    setConfirmSkillsSave(true);
  };

  const saveSkills = async () => {
    setSkillsMsg(null);
    setSavingSkills(true);
    try {
      await api.post("/api/volunteers", { skills: [...skills] });
      setSkillsMsg({ ok: true, text: "Skills saved." });
      setConfirmSkillsSave(false);
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
            <input
              value={name}
              onChange={(e) => {
                setConfirmAccountSave(false);
                setName(e.target.value);
              }}
              style={inputStyle}
              placeholder="Your name"
            />
          </Field>
          <Field label="EMAIL">
            <input value={user?.email ?? ""} disabled style={{ ...inputStyle, background: "#F3F4F6", color: "#9CA3AF" }} />
          </Field>
          <Field label="NEW PASSWORD">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setConfirmAccountSave(false);
                setPassword(e.target.value);
              }}
              style={inputStyle}
              placeholder="Leave blank to keep current"
              autoComplete="new-password"
            />
          </Field>
          <Field label="CONFIRM NEW PASSWORD">
            <input
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirmAccountSave(false);
                setConfirm(e.target.value);
              }}
              style={inputStyle}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </Field>
          <Msg msg={accountMsg} />
          {confirmAccountSave ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setConfirmAccountSave(false)}
                disabled={savingAccount}
                style={{
                  ...btnStyle(savingAccount),
                  background: "#fff", color: "#6B7280", border: "1px solid #D1D5DB", padding: "10px 18px",
                }}
              >
                Cancel
              </button>
              <button onClick={saveAccount} disabled={savingAccount} style={btnStyle(savingAccount)}>
                {savingAccount ? "Saving…" : "Confirm save"}
              </button>
            </div>
          ) : (
            <button onClick={requestSaveAccount} disabled={savingAccount} style={btnStyle(savingAccount)}>
              Save changes
            </button>
          )}
        </Card>

        {/* Language */}
        <Card title="Language" icon={<Languages size={16} color="#0F766E" />}>
          <p style={{ margin: 0, fontSize: 13, color: "#6B6B6B", textAlign: "left" }}>
            Choose the language Brainy replies in. Singapore's official languages plus Singlish.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {LANGUAGES.map((l) => {
              const on = l.code === lang;
              const pending = l.code === pendingLang;
              const border = pending ? "#D97706" : on ? "#0F766E" : "#E5E7EB";
              const bg = pending ? "#FEF3C7" : on ? "#CCFBF1" : "#fff";
              const fg = pending ? "#B45309" : on ? "#0F766E" : "#4B5563";
              return (
                <button
                  key={l.code}
                  onClick={() => requestLang(l.code)}
                  disabled={savingLang}
                  style={{
                    border: `1.5px solid ${border}`,
                    background: bg,
                    color: fg,
                    borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 700,
                    cursor: savingLang ? "default" : "pointer", fontFamily: "inherit",
                    opacity: savingLang && !on ? 0.6 : 1,
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                >
                  {on && <Check size={13} />}
                  {l.native}
                  {l.native !== l.label && (
                    <span style={{ color: fg, fontWeight: 600, opacity: 0.7 }}>· {l.label}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Confirm before switching, so a stray tap can't change the language. */}
          {pendingLang && (
            <div style={{
              display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10,
              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12,
              padding: "10px 12px",
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#92400E", flex: 1, textAlign: "left" }}>
                Switch Brainy's language to {LANGUAGES.find((l) => l.code === pendingLang)?.label}?
              </span>
              <button
                onClick={cancelLang}
                disabled={savingLang}
                style={{
                  border: "1.5px solid #D7D2C7", background: "#fff", color: "#6B7280",
                  borderRadius: 999, padding: "7px 16px", fontSize: 12.5, fontWeight: 800,
                  cursor: savingLang ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmLang}
                disabled={savingLang}
                style={{
                  border: "none", background: "#0F766E", color: "#fff",
                  borderRadius: 999, padding: "7px 18px", fontSize: 12.5, fontWeight: 800,
                  cursor: savingLang ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                {savingLang ? "Saving…" : "Confirm"}
              </button>
            </div>
          )}

          <Msg msg={langMsg} />
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
          {confirmSkillsSave ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setConfirmSkillsSave(false)}
                disabled={savingSkills}
                style={{
                  ...btnStyle(savingSkills),
                  background: "#fff", color: "#6B7280", border: "1px solid #D1D5DB", padding: "10px 18px",
                }}
              >
                Cancel
              </button>
              <button onClick={saveSkills} disabled={savingSkills} style={btnStyle(savingSkills)}>
                {savingSkills ? "Saving…" : "Confirm save"}
              </button>
            </div>
          ) : (
            <button onClick={requestSaveSkills} disabled={savingSkills} style={btnStyle(savingSkills)}>
              Save skills
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
