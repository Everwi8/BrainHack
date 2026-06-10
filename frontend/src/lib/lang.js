// User language preference for Brainy. Singapore has 4 official languages
// (English, Mandarin, Malay, Tamil); the highest-risk crisis demographic — the
// elderly — skews toward Mandarin and Malay. We also offer Singlish for a
// distinctly local voice. The preference is stored client-side and passed to the
// chat API as a short code; the backend maps that code to a fixed reply-language
// directive (a server-side whitelist), so this value never injects prompt text.

export const LANG_KEY = "brainy_lang";

// The default language. Singlish (Singapore English) is the local lingua franca,
// so it's the out-of-the-box voice for Brainy.
export const DEFAULT_LANG = "en-SG";

// The selectable languages. `code` is what we send to the backend; `native` is
// shown in the language's own script so users recognise it at a glance. Singlish
// leads as the default; plain English is intentionally not offered.
export const LANGUAGES = [
  { code: "en-SG", label: "Singlish", native: "Singlish" },
  { code: "zh",    label: "Mandarin", native: "中文" },
  { code: "ms",    label: "Malay",    native: "Bahasa Melayu" },
  { code: "ta",    label: "Tamil",    native: "தமிழ்" },
];

// getLang resolves the saved preference. First-time users default from the
// browser's language so a zh/ms/ta locale gets a sensible starting point;
// otherwise Singlish.
export function getLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved) return saved;
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("ms")) return "ms";
  if (nav.startsWith("ta")) return "ta";
  return DEFAULT_LANG;
}

export function setLang(code) {
  localStorage.setItem(LANG_KEY, code);
}
