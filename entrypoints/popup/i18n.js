// BoxNote DL - Custom i18n layer
// chrome.i18n follows the browser UI language and cannot be switched at runtime.
// This layer loads the selected locale's messages.json (saved in storage as
// `uiLanguage`, "auto" by default) and applies it to [data-i18n] elements,
// so users can switch languages from the Settings screen.
(() => {
  "use strict";

  // Locales shipped in _locales/. Must match directory names exactly.
  const SUPPORTED = ["en", "ja", "zh_CN", "es", "hi", "ar", "pt_BR", "ru", "bn"];

  // Languages written right-to-left.
  const RTL = ["ar"];

  let cache = { locale: null, messages: null };

  // Map a BCP-47 UI language (e.g. "zh-CN", "pt-BR", "en-US") to a shipped locale.
  function resolveLocale(uiLang) {
    if (!uiLang) return "en";
    const norm = uiLang.replace("-", "_");
    // Exact match (e.g. zh_CN, pt_BR)
    if (SUPPORTED.includes(norm)) return norm;
    const lang = norm.split("_")[0].toLowerCase();
    // Chinese variants default to Simplified
    if (lang === "zh") return "zh_CN";
    // Other variants fall back to the base language if shipped
    const base = SUPPORTED.find((l) => l.toLowerCase() === lang);
    if (base) return base;
    // Prefix match for the remainder (e.g. es-419 -> es)
    const prefix = SUPPORTED.find((l) => l.toLowerCase().startsWith(lang + "_"));
    if (prefix) return prefix;
    return "en";
  }

  async function getEffectiveLocale() {
    try {
      const { settings } = await chrome.storage.local.get("settings");
      const pref = settings?.uiLanguage || "auto";
      if (pref !== "auto" && SUPPORTED.includes(pref)) return pref;
    } catch { /* storage unavailable (e.g. content script context) -> fall through */ }
    try {
      return resolveLocale(chrome.i18n.getUILanguage());
    } catch {
      return "en";
    }
  }

  async function loadMessages(locale) {
    if (cache.locale === locale && cache.messages) return cache.messages;
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`i18n load failed: ${locale}`);
    const json = await res.json();
    const flat = {};
    for (const [k, v] of Object.entries(json)) flat[k] = v?.message ?? "";
    cache = { locale, messages: flat };
    return flat;
  }

  // Translate a single key. `subs` replaces $1..$9 style placeholders
  // ($TITLE$ etc. are replaced by callers via String.replace).
  function translate(messages, key, subs) {
    let s = messages[key] ?? "";
    if (subs !== undefined) {
      const arr = Array.isArray(subs) ? subs : [subs];
      arr.forEach((v, i) => {
        s = s.split(`$${i + 1}`).join(String(v));
      });
    }
    return s;
  }

  // Apply loaded messages to all [data-i18n] elements.
  // data-i18n="key"            -> textContent
  // data-i18n-ph="key"         -> placeholder attribute
  // data-i18n-aria="key"       -> aria-label attribute
  function applyToDOM(messages) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const msg = messages[el.getAttribute("data-i18n")];
      if (msg !== undefined) el.textContent = msg;
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      const msg = messages[el.getAttribute("data-i18n-ph")];
      if (msg !== undefined) el.setAttribute("placeholder", msg);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const msg = messages[el.getAttribute("data-i18n-aria")];
      if (msg !== undefined) el.setAttribute("aria-label", msg);
    });
  }

  function applyDir(locale) {
    document.documentElement.setAttribute("dir", RTL.includes(locale) ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", locale.replace("_", "-"));
  }

  // Main entry: resolve locale, load, apply. Returns { locale, t }.
  async function initI18n() {
    const locale = await getEffectiveLocale();
    let messages;
    try {
      messages = await loadMessages(locale);
    } catch {
      messages = await loadMessages("en");
    }
    applyToDOM(messages);
    applyDir(locale);
    const t = (key, subs) => {
      const s = translate(messages, key, subs);
      return s !== "" ? s : (cache.messages?.[key] ?? key);
    };
    return { locale, t, messages };
  }

  // Expose globally for popup.js / background.js
  globalThis.BoxNoteI18n = {
    SUPPORTED,
    resolveLocale,
    getEffectiveLocale,
    loadMessages,
    applyToDOM,
    initI18n,
  };
})();
