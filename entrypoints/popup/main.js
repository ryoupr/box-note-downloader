// Bundled by Vite: side-effect import registers globalThis.BoxNoteI18n.
import './i18n.js';

// === State Management ===
function showState(id) {
  document.querySelectorAll(".state").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// === i18n (loaded via lib/i18n.js) ===
let I18N = { locale: "en", t: (k) => k, messages: {} };

async function initLocale() {
  try {
    I18N = await globalThis.BoxNoteI18n.initI18n();
  } catch {
    I18N = { locale: "en", t: (k) => k, messages: {} };
  }
  return I18N;
}

function t(key, subs) {
  return I18N.t(key, subs);
}

// === Settings (persisted in chrome.storage.local) ===
const DEFAULTS = { format: "md", filename: "{title}_{yyyy-mm-dd}", includeAssets: true, autoOpen: false, notification: true, logLevel: "info", developerMode: false, uiLanguage: "auto" };

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

async function saveSettings(s) {
  await chrome.storage.local.set({ settings: s });
}

// === Version (from manifest, single source of truth) ===
function initVersion() {
  try {
    const { version } = chrome.runtime.getManifest();
    if (version) {
      document.querySelectorAll(".app-version").forEach((el) => {
        el.textContent = `v${version}`;
      });
    }
  } catch {
    // Ignore: version display stays empty outside extension context
  }
}

// === Init ===
(async () => {
  initVersion();
  await initLocale();

  // Initial dynamic text (kept out of data-i18n so language switching
  // never overwrites the fetched note title)
  document.getElementById("note-title").textContent = t("loadingTitle");
  document.getElementById("note-meta-text").textContent = t("metaChecking");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  if (!url.match(/\.app\.box\.com\/notes\//)) {
    showState("state-unsupported");
    // Load settings into UI even on unsupported state (for language select)
    const s0 = await loadSettings();
    applySettingsToUI(s0);
    return;
  }

  try {
    const result = await chrome.tabs.sendMessage(tab.id, { action: "getTitle" }, { frameId: 0 });
    if (result?.title) {
      document.getElementById("note-title").textContent = result.title;
      document.getElementById("note-meta-text").textContent = "";
    }
  } catch {
    document.getElementById("note-title").textContent = tab.title?.replace(/ - Box$/, "") || "Box Note";
    document.getElementById("note-meta-text").textContent = "";
  }

  // Load settings into UI
  const s = await loadSettings();
  applySettingsToUI(s);
})();

// === Download ===
document.getElementById("btn-download").addEventListener("click", async () => {
  const noteTitle = document.getElementById("note-title").textContent;
  showState("state-downloading");
  document.getElementById("dl-note-title").textContent = noteTitle;

  try {
    const settings = await loadSettings();
    const result = await chrome.runtime.sendMessage({ action: "download", settings });

    if (result?.success) {
      showState("state-success");
      document.getElementById("success-note-title").textContent = noteTitle;
      document.getElementById("success-file").textContent = result.filename || "";

      if (settings.autoOpen) chrome.downloads.showDefaultFolder();
    } else {
      showError(noteTitle, result?.error || t("errUnknown"));
    }
  } catch (e) {
    showError(noteTitle, e.message || t("errUnknown"));
  }
});

function showError(noteTitle, errorMsg) {
  showState("state-error");
  document.getElementById("error-note-title").textContent = noteTitle;

  // Categorize error (keys map to _locales/*/messages.json)
  const errors = {
    auth: { icon: "⚠️", titleKey: "errAuthTitle", descKey: "errAuthDesc", actionKey: "errAuthAction", handler: () => window.open("https://app.box.com", "_blank") },
    rate: { icon: "⚠️", titleKey: "errRateTitle", descKey: "errRateDesc", actionKey: "errRateAction", handler: retry },
    network: { icon: "📡", titleKey: "errNetworkTitle", descKey: "errNetworkDesc", actionKey: "errNetworkAction", handler: retry },
    size: { icon: "📦", titleKey: "errSizeTitle", descKey: "errSizeDesc", actionKey: "errSizeAction", handler: retryNoAssets },
    permission: { icon: "🔒", titleKey: "errPermissionTitle", descKey: "errPermissionDesc", actionKey: "errPermissionAction", handler: retry },
    convert: { icon: "⚠️", titleKey: "errConvertTitle", descKey: "errConvertDesc", actionKey: "errConvertAction", handler: retry },
  };

  const key = Object.keys(errors).find((k) => String(errorMsg).toLowerCase().includes(k)) || "network";
  const err = errors[key] || errors.network;

  // Fallback for unknown errors
  const display = String(errorMsg).includes("Could not find") ? errors.convert : err;
  document.getElementById("error-icon-display").textContent = display.icon;
  document.getElementById("error-title").textContent = t(display.titleKey);
  document.getElementById("error-desc").textContent = t(display.descKey);

  const btn = document.getElementById("error-action-btn");
  btn.textContent = t(display.actionKey);
  btn.onclick = display.handler;
}

function retry() {
  showState("state-idle");
  document.getElementById("btn-download").click();
}

async function retryNoAssets() {
  const s = await loadSettings();
  s.includeAssets = false;
  await saveSettings(s);
  retry();
}

// === Open button ===
document.getElementById("btn-open").addEventListener("click", () => chrome.downloads.showDefaultFolder());

// === Settings Navigation ===
document.querySelectorAll("#btn-settings, #btn-settings-success, #btn-settings-unsupported, #btn-settings-error").forEach((btn) => {
  btn?.addEventListener("click", () => showState("state-settings"));
});
document.getElementById("btn-back").addEventListener("click", () => showState("state-idle"));

// === Settings UI ===
function applySettingsToUI(s) {
  document.getElementById("setting-filename").value = s.filename;
  document.getElementById("setting-include-assets").checked = s.includeAssets;
  document.getElementById("setting-auto-open").checked = s.autoOpen;
  document.getElementById("setting-notification").checked = s.notification;
  document.getElementById("setting-developer-mode").checked = !!s.developerMode;
  document.getElementById("setting-log-level").value = s.logLevel || "info";
  document.getElementById("setting-language").value = s.uiLanguage || "auto";
  updateDevOnlyVisibility(s.developerMode);
  updateFilenamePreview(s.filename, s.format);
}

// Developer mode: show/hide debug-only settings
function updateDevOnlyVisibility(enabled) {
  document.querySelectorAll(".dev-only").forEach((el) => {
    el.classList.toggle("hidden", !enabled);
  });
}

// Filename pattern
document.getElementById("setting-filename").addEventListener("input", async (e) => {
  const s = await loadSettings();
  s.filename = e.target.value;
  await saveSettings(s);
  updateFilenamePreview(s.filename, s.format);
});

// Toggles
["setting-include-assets", "setting-auto-open", "setting-notification"].forEach((id) => {
  document.getElementById(id).addEventListener("change", async (e) => {
    const s = await loadSettings();
    const key = id.replace("setting-", "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    s[key] = e.target.checked;
    await saveSettings(s);
  });
});

// Developer mode toggle
document.getElementById("setting-developer-mode").addEventListener("change", async (e) => {
  const s = await loadSettings();
  s.developerMode = e.target.checked;
  await saveSettings(s);
  updateDevOnlyVisibility(s.developerMode);
});

// Log level
document.getElementById("setting-log-level").addEventListener("change", async (e) => {
  const s = await loadSettings();
  s.logLevel = e.target.value;
  await saveSettings(s);
});

// Language: save + re-apply immediately
document.getElementById("setting-language").addEventListener("change", async (e) => {
  const s = await loadSettings();
  s.uiLanguage = e.target.value;
  await saveSettings(s);
  await initLocale();
  updateFilenamePreview(s.filename, s.format);
});

function updateFilenamePreview(pattern, format) {
  const now = new Date();
  const example = pattern
    .replace("{title}", "Monthly review")
    .replace("{yyyy-mm-dd}", `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);
  const prefix = t("filenamePreviewPrefix").replace("$TITLE$", `${example}.${format}`);
  document.getElementById("filename-preview").textContent = prefix;
}

// Downloads folder link
document.getElementById("open-downloads-folder-link")?.addEventListener("click", () => chrome.downloads.showDefaultFolder());

// === DOM Debug ===
document.getElementById("btn-debug-dom")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return alert("No active tab");

  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
  const notesFrame = frames.find(f => f.url.includes("notes.services.box.com"));

  // Dump both main frame and notes iframe
  const results = [];
  for (const frame of [{ frameId: 0, url: "main" }, ...(notesFrame ? [notesFrame] : [])]) {
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { action: "dumpDOM" }, { frameId: frame.frameId });
      if (result?.fullHtml) {
        results.push({ frameId: frame.frameId, url: frame.url, html: result.fullHtml });
      }
    } catch {}
  }

  if (!results.length) { alert("No DOM found"); return; }

  // Download each as separate file
  for (const r of results) {
    const label = r.url.includes("notes.services") ? "iframe" : "main";
    const blob = new Blob([r.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: `boxnote-dom-${label}.html`, saveAs: false });
    URL.revokeObjectURL(url);
  }
  alert(`Downloaded ${results.length} DOM file(s)`);
});
