// Box Note to Markdown - Content Script
// Extracts notes session info from the page for Background to use
(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "getInfo") {
      const url = window.location.href;
      const match = url.match(/\/notes\/(\d+)/);
      const fileId = match ? match[1] : null;
      const title = document.title?.replace(/ - Box$/, "").trim() || "untitled";
      sendResponse({ fileId, title });
    }

    if (msg.action === "getNotesSession") {
      getNotesSession().then(sendResponse);
      return true;
    }

    if (msg.action === "fetchImage") {
      fetchImageAsBase64(msg.url).then(sendResponse);
      return true;
    }
  });

  async function getNotesSession() {
    try {
      // Find the notes iframe to get session params
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        const src = iframe.src || "";
        if (src.includes("notes.services.box.com")) {
          console.log("[BoxNote CS] Found notes iframe:", src);
          // Extract session token from iframe URL
          const urlObj = new URL(src);
          const session = urlObj.searchParams.get("s") || "";
          const noteId = src.match(/\/(\d+)\?/)?.[1] || "";
          return { success: true, iframeSrc: src, session, noteId };
        }
      }

      // Also check for session in page scripts
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        const text = s.textContent || "";
        const match = text.match(/["']s["']\s*:\s*["']([a-z0-9]+)["']/);
        if (match) {
          console.log("[BoxNote CS] Found session in script:", match[1]);
          return { success: true, session: match[1] };
        }
      }

      // Try to find in network requests or config
      console.log("[BoxNote CS] No iframe found, iframes count:", iframes.length);
      return { success: false, error: "No notes iframe found", iframeCount: iframes.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function fetchImageAsBase64(url) {
    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) return { data: null };
      const blob = await resp.blob();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve({ data: reader.result.split(",")[1] });
        reader.readAsDataURL(blob);
      });
    } catch { return { data: null }; }
  }
})();
