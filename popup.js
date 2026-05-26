// === State Management ===
function showState(id) {
  document.querySelectorAll(".state").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// === Settings (persisted in chrome.storage.local) ===
const DEFAULTS = { format: "md", filename: "{title}_{yyyy-mm-dd}", includeAssets: true, autoOpen: false, notification: true, logLevel: "info" };

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

async function saveSettings(s) {
  await chrome.storage.local.set({ settings: s });
}

// === Init ===
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  if (!url.match(/\.app\.box\.com\/notes\//)) {
    showState("state-unsupported");
    return;
  }

  try {
    const result = await chrome.tabs.sendMessage(tab.id, { action: "getTitle" }, { frameId: 0 });
    if (result?.title) {
      document.getElementById("note-title").textContent = result.title;
      document.getElementById("note-meta-text").textContent = "更新 数分前";
    }
  } catch {
    document.getElementById("note-title").textContent = tab.title?.replace(/ - Box$/, "") || "Box Note";
    document.getElementById("note-meta-text").textContent = "";
  }

  // Load settings into UI
  const s = await loadSettings();
  applySettingsToUI(s);
  updateHeaderFormat(s.format);
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
      showError(noteTitle, result?.error || "不明なエラー");
    }
  } catch (e) {
    showError(noteTitle, e.message || "エラー");
  }
});

function showError(noteTitle, errorMsg) {
  showState("state-error");
  document.getElementById("error-note-title").textContent = noteTitle;

  // Categorize error
  const errors = {
    auth: { icon: "⚠️", title: "認証が切れています", desc: "Boxへのログインセッションが期限切れです。再度ログインしてからお試しください。", action: "Boxにログイン", handler: () => window.open("https://app.box.com", "_blank") },
    rate: { icon: "⚠️", title: "リクエスト制限中", desc: "Box APIの利用制限に達しました。約1分後に再度お試しください。", action: "もう一度試す", handler: retry },
    network: { icon: "📡", title: "通信エラー", desc: "インターネットに接続できません。ネットワーク状況を確認してください。", action: "再試行", handler: retry },
    size: { icon: "📦", title: "ノートが大きすぎます", desc: "添付ファイルを含めると100MBを超えます。設定で添付を除外するか、添付を個別にDLしてください。", action: "添付を除外してDL", handler: retryNoAssets },
    permission: { icon: "🔒", title: "アクセス権がありません", desc: "このノートを閲覧する権限がありません。所有者に共有権限の付与を依頼してください。", action: "再試行", handler: retry },
    convert: { icon: "⚠️", title: "一部変換できないブロック", desc: "カスタムブロックがMarkdownに変換できませんでした。プレースホルダーとして保存されます。", action: "プレースホルダーでDL", handler: retry },
  };

  const key = Object.keys(errors).find((k) => errorMsg.toLowerCase().includes(k)) || "network";
  const err = errors[key] || errors.network;

  // Fallback for unknown errors
  const display = errorMsg.includes("Could not find") ? errors.convert : err;
  document.getElementById("error-icon-display").textContent = display.icon;
  document.getElementById("error-title").textContent = display.title;
  document.getElementById("error-desc").textContent = display.desc;

  const btn = document.getElementById("error-action-btn");
  btn.textContent = display.action;
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
  document.getElementById("setting-log-level").value = s.logLevel || "info";
  updateFilenamePreview(s.filename, s.format);
}

// Format is always md
function updateHeaderFormat() {
  document.querySelectorAll(".header-subtitle span").forEach((el) => {
    el.textContent = "MARKDOWN";
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

// Log level
document.getElementById("setting-log-level").addEventListener("change", async (e) => {
  const s = await loadSettings();
  s.logLevel = e.target.value;
  await saveSettings(s);
});

function updateFilenamePreview(pattern, format) {
  const now = new Date();
  const example = pattern
    .replace("{title}", "月次レビュー")
    .replace("{yyyy-mm-dd}", `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);
  document.getElementById("filename-preview").textContent = `例: ${example}.${format}`;
}

// History link
document.getElementById("history-link")?.addEventListener("click", () => chrome.downloads.showDefaultFolder());

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
