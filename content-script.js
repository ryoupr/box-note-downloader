// Box Note to Markdown - Content Script (API-based)
// Only used to extract file ID and title from the page
(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "getInfo") {
      const url = window.location.href;
      const match = url.match(/\/notes\/(\d+)/);
      const fileId = match ? match[1] : null;

      const titleEl =
        document.querySelector('[data-testid="notes-title"]') ||
        document.querySelector('[class*="NotesHeader"] [class*="title"]') ||
        document.querySelector('h1[class*="title"]');
      const title = titleEl?.textContent?.trim() || document.title.replace(/ - Box$/, "").trim() || "untitled";

      sendResponse({ fileId, title });
    }
  });
})();
