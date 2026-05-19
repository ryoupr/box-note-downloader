// Box Note to Markdown - Background Service Worker
importScripts("lib/jszip.min.js");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "download") {
    handleDownload(msg.settings || {}).then(sendResponse);
    return true;
  }
});

async function handleDownload(settings) {
  const { format = "md", filename: filenamePattern = "{title}_{yyyy-mm-dd}", includeAssets = true } = settings;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("[BoxNote] Active tab:", tab?.id, tab?.url);
    if (!tab?.id) return { success: false, error: "No active tab" };

    // Get title from main frame
    let noteTitle = "untitled";
    try {
      const titleResult = await chrome.tabs.sendMessage(tab.id, { action: "getTitle" }, { frameId: 0 });
      if (titleResult?.title) noteTitle = titleResult.title;
      console.log("[BoxNote] Title from main frame:", noteTitle);
    } catch (e) {
      console.log("[BoxNote] Title fetch failed:", e.message);
    }

    // Get content - try main frame first, then iframes
    let result = null;
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => []);
    // Sort: main frame (0) last so iframe takes priority if both have content
    const sortedFrames = [...(frames || [])].sort((a, b) => {
      // Prefer notes.services.box.com frames
      const aIsNotes = a.url?.includes("notes.services") ? 0 : 1;
      const bIsNotes = b.url?.includes("notes.services") ? 0 : 1;
      return aIsNotes - bIsNotes;
    });
    for (const frame of sortedFrames) {
      try {
        const r = await chrome.tabs.sendMessage(tab.id, { action: "convert" }, { frameId: frame.frameId });
        if (r?.markdown && !r.markdown.includes("Could not find")) {
          console.log("[BoxNote] Content from frame", frame.frameId, "("+frame.url?.slice(0,40)+")", "md:", r.markdown.length, "images:", r.images.length);
          // Prefer result with images
          if (!result || r.images.length > result.images.length) {
            result = r;
          }
          if (r.images.length > 0) break; // Found images, use this
        }
      } catch {}
    }

    if (!result?.markdown) {
      return { success: false, error: "convert: Could not find Box Note content." };
    }

    const { markdown, images } = result;

    // Build filename from pattern
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const safeName = filenamePattern
      .replace("{title}", noteTitle)
      .replace("{yyyy-mm-dd}", dateStr)
      .replace(/[<>:"/\\|?*]/g, "_")
      .slice(0, 100);

    console.log("[BoxNote] Saving as:", safeName, "images:", images.length, "includeAssets:", includeAssets);

    const hasImages = includeAssets && images.length > 0;

    if (!hasImages) {
      const dataUrl = "data:text/markdown;base64," + btoa(unescape(encodeURIComponent(markdown)));
      const filename = `${safeName}.${format}`;
      await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
      console.log("[BoxNote] Download complete:", filename);
      return { success: true, filename };
    } else {
      const zip = new JSZip();
      const folder = zip.folder(safeName);
      folder.file(`${safeName}.${format}`, markdown);
      const assets = folder.folder("assets");

      for (const img of images) {
        assets.file(img.filename, img.data, { base64: true });
        console.log("[BoxNote] Added image:", img.filename);
      }

      const base64 = await zip.generateAsync({ type: "base64" });
      const dataUrl = "data:application/zip;base64," + base64;
      const filename = `${safeName}.zip`;
      await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
      console.log("[BoxNote] Download complete:", filename);
      return { success: true, filename };
    }
  } catch (e) {
    console.error("[BoxNote] Error:", e);
    return { success: false, error: e.message || "Unknown error" };
  }
}
