// Box Note to Markdown - Content Script (API-based)
// Fetches .boxnote JSON via Box's internal web API (same-origin, cookie auth)
(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "getInfo") {
      const url = window.location.href;
      const match = url.match(/\/notes\/(\d+)/);
      const fileId = match ? match[1] : null;
      const title = document.title?.replace(/ - Box$/, "").trim() || "untitled";
      sendResponse({ fileId, title });
    }

    if (msg.action === "fetchBoxnote") {
      fetchBoxnoteContent(msg.fileId).then(sendResponse);
      return true; // async
    }

    if (msg.action === "fetchImage") {
      fetchImageAsBase64(msg.url).then(sendResponse);
      return true;
    }
  });

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

  async function fetchBoxnoteContent(fileId) {
    try {
      console.log("[BoxNote CS] Fetching boxnote content for:", fileId);

      // Method 1: Try Box's internal download endpoint (same-origin, cookie auth)
      // The .boxnote file content can be fetched via the standard download URL
      const downloadUrl = `https://${window.location.hostname}/index.php?rm=box_download_file&file_id=${fileId}`;
      console.log("[BoxNote CS] Trying download URL:", downloadUrl);

      let resp = await fetch(downloadUrl, { credentials: "same-origin" });
      console.log("[BoxNote CS] Download response:", resp.status, resp.headers.get("content-type"));

      if (resp.ok) {
        const text = await resp.text();
        console.log("[BoxNote CS] Got content, length:", text.length, "preview:", text.slice(0, 100));
        try {
          const json = JSON.parse(text);
          return { success: true, boxnote: json };
        } catch {
          // Might be a redirect or HTML page
          console.log("[BoxNote CS] Not JSON, trying alternative...");
        }
      }

      // Method 2: Try the /api endpoint
      const apiUrl = `https://${window.location.hostname}/api/2.0/files/${fileId}/content`;
      console.log("[BoxNote CS] Trying API URL:", apiUrl);
      resp = await fetch(apiUrl, { credentials: "same-origin" });
      console.log("[BoxNote CS] API response:", resp.status, resp.headers.get("content-type"));

      if (resp.ok) {
        const text = await resp.text();
        console.log("[BoxNote CS] Got content, length:", text.length, "preview:", text.slice(0, 100));
        try {
          const json = JSON.parse(text);
          return { success: true, boxnote: json };
        } catch {
          console.log("[BoxNote CS] Not JSON from API endpoint");
        }
      }

      // Method 3: Try notes.services.box.com endpoint
      const notesUrl = `https://notes.services.box.com/1.0/notes/${fileId}`;
      console.log("[BoxNote CS] Trying notes service URL:", notesUrl);
      resp = await fetch(notesUrl, { credentials: "include" });
      console.log("[BoxNote CS] Notes service response:", resp.status, resp.headers.get("content-type"));

      if (resp.ok) {
        const text = await resp.text();
        console.log("[BoxNote CS] Got content, length:", text.length, "preview:", text.slice(0, 100));
        try {
          const json = JSON.parse(text);
          return { success: true, boxnote: json };
        } catch {
          console.log("[BoxNote CS] Not JSON from notes service");
        }
      }

      return { success: false, error: `All methods failed. Last status: ${resp.status}` };
    } catch (e) {
      console.error("[BoxNote CS] Error:", e);
      return { success: false, error: e.message };
    }
  }
})();
