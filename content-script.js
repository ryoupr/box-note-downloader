// Box Note to Markdown - Content Script
(() => {
  // Elements to skip entirely during conversion
  const SKIP_SELECTORS = [
    ".collab-cursor-container",
    ".heading-collapse-container",
    ".heading-anchor-container",
    "img.ProseMirror-separator",
    "br.ProseMirror-trailingBreak",
  ];

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "convert") {
      extractMarkdown().then(sendResponse);
      return true;
    }
    if (msg.action === "dumpDOM") {
      const html = document.documentElement.outerHTML;
      sendResponse({ fullHtml: html });
      return;
    }
    if (msg.action === "getTitle") {
      const titleEl =
        document.querySelector('[data-testid="notes-title"]') ||
        document.querySelector('[class*="NotesHeader"] [class*="title"]') ||
        document.querySelector('h1[class*="title"]');
      const title = titleEl?.textContent?.trim() || document.title.replace(/ - Box$/, "").trim() || "untitled";
      sendResponse({ title });
    }
  });

  function shouldSkip(el) {
    return SKIP_SELECTORS.some((sel) => el.matches?.(sel));
  }

  async function extractMarkdown() {
    const images = [];
    let imgCounter = 0;

    const title = document.title.replace(/ - Box$/, "").trim() || "untitled";

    const editor =
      document.querySelector(".ProseMirror") ||
      document.querySelector('[contenteditable="true"]');

    if (!editor) {
      return { markdown: "<!-- Could not find Box Note content -->", images, title };
    }

    const markdown = convertNode(editor);

    // Fetch images as base64 from content script (same-origin)
    const resolvedImages = [];
    for (const img of images) {
      try {
        const resp = await fetch(img.url, { credentials: "include" });
        if (resp.ok) {
          const blob = await resp.blob();
          const base64 = await blobToBase64(blob);
          resolvedImages.push({ filename: img.filename, data: base64 });
        }
      } catch {}
    }

    return { markdown: markdown.trim(), images: resolvedImages, title };

    function convertNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node;

      // Skip collab cursors and ProseMirror UI widgets
      if (shouldSkip(el)) return "";

      const tag = el.tagName.toLowerCase();
      const children = () => Array.from(el.childNodes).map(convertNode).join("");

      if (/^h[1-6]$/.test(tag)) return `${"#".repeat(+tag[1])} ${children().trim()}\n\n`;
      if (tag === "p") { const t = children(); return t.trim() ? `${t}\n\n` : "\n"; }
      if (tag === "strong" || tag === "b") return `**${children()}**`;
      if (tag === "em" || tag === "i") return `*${children()}*`;
      if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") return `\`${children()}\``;
      if (tag === "s" || tag === "del") return `~~${children()}~~`;
      if (tag === "a") return `[${children()}](${el.getAttribute("href") || ""})`;

      // Embedded file preview (box-preview-node) — treat as image
      if (el.classList.contains("box-preview-node")) {
        const previewImg = el.querySelector("img.box-preview-wrapper-representation-image");
        if (previewImg) {
          const src = previewImg.getAttribute("src") || "";
          if (src) {
            imgCounter++;
            const ext = (src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i) || [])[1] || "png";
            const filename = `image_${imgCounter}.${ext.toLowerCase()}`;
            images.push({ url: src, filename });
            return `![](assets/${filename})`;
          }
        }
        return "";
      }

      if (tag === "img") {
        // Skip ProseMirror internal images
        if (el.classList.contains("ProseMirror-separator") || el.classList.contains("avatar-image")) return "";
        const src = el.getAttribute("src") || "";
        if (src) {
          imgCounter++;
          const ext = (src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i) || [])[1] || "png";
          const filename = `image_${imgCounter}.${ext.toLowerCase()}`;
          images.push({ url: src, filename });
          return `![](assets/${filename})`;
        }
        return "";
      }

      if (tag === "ul") return Array.from(el.children).map((li) => `- ${convertNode(li).trim()}`).join("\n") + "\n\n";
      if (tag === "ol") return Array.from(el.children).map((li, i) => `${i + 1}. ${convertNode(li).trim()}`).join("\n") + "\n\n";
      if (tag === "li") return children();
      if (tag === "blockquote") return children().trim().split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
      if (tag === "pre") return `\`\`\`\n${el.querySelector("code")?.textContent || el.textContent || ""}\n\`\`\`\n\n`;
      if (tag === "hr") return "---\n\n";
      if (tag === "br") return "\n";
      if (tag === "table") return convertTable(el);
      return children();
    }

    function convertTable(table) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (!rows.length) return "";
      const matrix = rows.map((r) =>
        Array.from(r.querySelectorAll("td,th")).map((c) => convertNode(c).trim().replace(/\n/g, " "))
      );
      const cols = Math.max(...matrix.map((r) => r.length));
      const lines = [];
      matrix.forEach((row, i) => {
        while (row.length < cols) row.push("");
        lines.push(`| ${row.join(" | ")} |`);
        if (i === 0) lines.push(`| ${Array(cols).fill("---").join(" | ")} |`);
      });
      return lines.join("\n") + "\n\n";
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
  }
})();
