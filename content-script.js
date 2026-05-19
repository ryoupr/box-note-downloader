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
          const urlObj = new URL(src);
          return {
            success: true,
            iframeSrc: src,
            fileId: urlObj.searchParams.get("fileId") || "",
            authCode: urlObj.searchParams.get("authCode") || "",
            sharedLink: urlObj.searchParams.get("sharedLink") || "",
            hostname: urlObj.searchParams.get("hostname") || "",
          };
        }
      }

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
