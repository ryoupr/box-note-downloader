// Box Note to Markdown - Content Script
(() => {
  // Elements to skip entirely during conversion
  const SKIP_SELECTORS = [
    ".collab-cursor-container",
    ".heading-collapse-container",
    ".heading-anchor-container",
    ".check-list-item-checkbox-container",
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
    if (msg.action === "fetchImage") {
      fetchImageAsBase64(msg.url).then(sendResponse);
      return true;
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

    // Direct DOM query for debugging
    const directImgs = editor.querySelectorAll('.image-node-view, [data-component-type="image"]');
    console.log("[BoxNote CS] ★ Direct query: image-node-view count:", directImgs.length);
    directImgs.forEach((el, i) => console.log("[BoxNote CS]   img", i, el.tagName, el.className.slice(0, 60)));

    const markdown = convertNode(editor);
    console.log("[BoxNote CS] Conversion done. Images found:", images.length);
    console.log("[BoxNote CS] image-node-views in DOM:", editor.querySelectorAll('.image-node-view, [data-component-type="image"]').length);
    console.log("[BoxNote CS] img[data-testid=img-element]:", editor.querySelectorAll('img[data-testid="img-element"]').length);

    // Don't fetch images here (CORS: notes.services → app.box.com blocked)
    // Return URLs for background/main-frame to fetch
    const imageRefs = images.map(img => ({ filename: img.filename, url: img.url }));

    return { markdown: markdown.trim(), images: imageRefs, title, debug: { directImgCount: directImgs.length, convertedImgCount: images.length } };

    function convertNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node;

      // Skip collab cursors and ProseMirror UI widgets
      if (shouldSkip(el)) return "";

      const tag = el.tagName.toLowerCase();
      const children = () => Array.from(el.childNodes).map(convertNode).join("");

      // Box Notes native image (must check before tag-based dispatch)
      if (el.classList.contains("image-node-view") || el.getAttribute("data-component-type") === "image") {
        console.log("[BoxNote CS] ★ Found image-node-view!", el.tagName, el.className.slice(0, 40));
        const imgEl = el.querySelector('img[data-testid="img-element"]') || el.querySelector("img:not(.avatar-image)");
        if (imgEl) {
          const src = imgEl.getAttribute("src") || "";
          if (src) {
            imgCounter++;
            const name = imgEl.getAttribute("data-file-name") || `image_${imgCounter}.png`;
            const safeName = name.replace(/[<>:"/\\|?*]/g, "_");
            images.push({ url: src, filename: safeName });
            return `![${name}](assets/${safeName})`;
          }
        }
        return "";
      }

      if (/^h[1-6]$/.test(tag)) return `${"#".repeat(+tag[1])} ${children().trim()}\n\n`;
      if (tag === "p") { const t = children(); return t.trim() ? `${t}\n\n` : "\n"; }
      if (tag === "strong" || tag === "b") return `**${children()}**`;
      if (tag === "em" || tag === "i") return `*${children()}*`;
      if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") return `\`${children()}\``;
      if (tag === "s" || tag === "del") return `~~${children()}~~`;
      if (tag === "a") return `[${children()}](${el.getAttribute("href") || ""})`;

      // Embedded file preview (box-preview-node)
      if (el.classList.contains("box-preview-node")) {
        const previewImg = el.querySelector("img") ;
        if (previewImg) {
          const src = previewImg.getAttribute("src") || "";
          if (src) {
            imgCounter++;
            const ext = (src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i) || [])[1] || "png";
            const filename = `image_${imgCounter}.${ext}`;
            images.push({ url: src, filename });
            return `![](assets/${filename})`;
          }
        }
        return "";
      }

      if (tag === "img") {
        if (el.classList.contains("ProseMirror-separator") || el.classList.contains("avatar-image")) return "";
        if (el.closest(".image-node-view") || el.closest('[data-component-type="image"]')) return "";
        const src = el.getAttribute("src") || "";
        if (src) {
          imgCounter++;
          const ext = (src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i) || [])[1] || "png";
          const filename = `image_${imgCounter}.${ext}`;
          images.push({ url: src, filename });
          return `![](assets/${filename})`;
        }
        return "";
      }

      if (tag === "ul") {
        if (el.classList.contains("check-list")) {
          return Array.from(el.children).map((li) => {
            const checked = li.classList.contains("is-checked") ? "x" : " ";
            // Skip checkbox container, only get text content
            const text = Array.from(li.childNodes).filter(n => !n.matches?.(".check-list-item-checkbox-container")).map(convertNode).join("").trim();
            return `- [${checked}] ${text}`;
          }).join("\n") + "\n\n";
        }
        return Array.from(el.children).map((li) => `- ${convertNode(li).trim()}`).join("\n") + "\n\n";
      }
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

  async function fetchImageAsBase64(url) {
    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) return { data: null, error: `HTTP ${resp.status}` };
      const blob = await resp.blob();
      const data = await blobToBase64(blob);
      return { data };
    } catch (e) {
      return { data: null, error: e.message };
    }
  }
})();
