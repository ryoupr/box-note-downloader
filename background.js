// Box Note to Markdown - Background Service Worker (API-based)
importScripts("lib/jszip.min.js");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "download") {
    handleDownload(msg.settings || {}, msg.fileId).then(sendResponse);
    return true;
  }
});

async function handleDownload(settings, fileId) {
  const { format = "md", filename: filenamePattern = "{title}_{yyyy-mm-dd}", includeAssets = true } = settings;

  try {
    if (!fileId) return { success: false, error: "No file ID found in URL" };
    console.log("[BoxNote] Fetching file:", fileId);

    // 1. Get file info (title)
    const infoResp = await fetch(`https://api.box.com/2.0/files/${fileId}`, { credentials: "include" });
    if (!infoResp.ok) {
      if (infoResp.status === 401 || infoResp.status === 403) return { success: false, error: "auth" };
      if (infoResp.status === 429) return { success: false, error: "rate" };
      return { success: false, error: `network: HTTP ${infoResp.status}` };
    }
    const fileInfo = await infoResp.json();
    const noteTitle = fileInfo.name?.replace(/\.boxnote$/, "") || "untitled";
    console.log("[BoxNote] Title:", noteTitle);

    // 2. Download .boxnote content (ProseMirror JSON)
    const contentResp = await fetch(`https://api.box.com/2.0/files/${fileId}/content`, { credentials: "include" });
    if (!contentResp.ok) return { success: false, error: `network: content HTTP ${contentResp.status}` };
    const boxnote = await contentResp.json();
    console.log("[BoxNote] Got boxnote JSON, nodes:", boxnote.doc?.content?.length);

    // 3. Convert ProseMirror JSON → Markdown
    const { markdown, images } = convertBoxnoteToMarkdown(boxnote);
    console.log("[BoxNote] Converted. MD length:", markdown.length, "images:", images.length);

    // 4. Build filename
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const safeName = filenamePattern
      .replace("{title}", noteTitle)
      .replace("{yyyy-mm-dd}", dateStr)
      .replace(/[<>:"/\\|?*]/g, "_")
      .slice(0, 100);

    // 5. Download images and package
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

      // Download images
      for (const img of images) {
        try {
          const resp = await fetch(img.url, { credentials: "include" });
          if (resp.ok) {
            const blob = await resp.blob();
            assets.file(img.filename, blob);
            console.log("[BoxNote] Image OK:", img.filename);
          }
        } catch (e) {
          console.log("[BoxNote] Image failed:", img.filename, e.message);
        }
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

// === ProseMirror JSON → Markdown converter ===
function convertBoxnoteToMarkdown(boxnote) {
  const images = [];
  let imgCounter = 0;
  const doc = boxnote.doc || boxnote;
  const nodes = doc.content || [];

  const markdown = nodes.map(node => convertNode(node)).join("");
  return { markdown: markdown.trim(), images };

  function convertNode(node) {
    if (!node) return "";
    const { type, content, attrs, text, marks } = node;

    switch (type) {
      case "text":
        return applyMarks(text || "", marks);

      case "heading": {
        const level = attrs?.level || 1;
        const inner = (content || []).map(convertNode).join("");
        return `${"#".repeat(level)} ${inner.trim()}\n\n`;
      }

      case "paragraph": {
        const inner = (content || []).map(convertNode).join("");
        return inner.trim() ? `${inner}\n\n` : "\n";
      }

      case "bullet_list":
      case "bulletList":
        return (content || []).map(li => `- ${convertNode(li).trim()}`).join("\n") + "\n\n";

      case "ordered_list":
      case "orderedList":
        return (content || []).map((li, i) => `${i + 1}. ${convertNode(li).trim()}`).join("\n") + "\n\n";

      case "check_list":
      case "checkList":
        return (content || []).map(li => {
          const checked = li.attrs?.checked ? "x" : " ";
          return `- [${checked}] ${convertListItemContent(li)}`;
        }).join("\n") + "\n\n";

      case "list_item":
      case "listItem":
      case "check_list_item":
      case "checkListItem":
        return (content || []).map(convertNode).join("");

      case "blockquote":
        return (content || []).map(convertNode).join("").trim().split("\n").map(l => `> ${l}`).join("\n") + "\n\n";

      case "code_block":
      case "codeBlock": {
        const lang = attrs?.language || "";
        const code = (content || []).map(n => n.text || "").join("");
        return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
      }

      case "horizontal_rule":
      case "horizontalRule":
        return "---\n\n";

      case "hard_break":
      case "hardBreak":
        return "\n";

      case "table":
        return convertTable(content || []);

      case "table_row":
      case "tableRow":
        return (content || []).map(convertNode).join("");

      case "table_cell":
      case "tableCell":
      case "table_header":
      case "tableHeader":
        return (content || []).map(convertNode).join("").trim().replace(/\n/g, " ");

      case "image": {
        const src = attrs?.src || "";
        if (src) {
          imgCounter++;
          const ext = (src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i) || [])[1] || "png";
          const filename = `image_${imgCounter}.${ext.toLowerCase()}`;
          images.push({ url: src, filename });
          return `![](assets/${filename})`;
        }
        return "";
      }

      case "box_image":
      case "boxImage":
      case "media":
      case "mediaSingle": {
        // Box-specific image node
        const fileId = attrs?.fileId || attrs?.file_id || attrs?.id || "";
        if (fileId) {
          imgCounter++;
          const filename = `image_${imgCounter}.png`;
          const url = `https://api.box.com/2.0/files/${fileId}/content`;
          images.push({ url, filename });
          return `![](assets/${filename})`;
        }
        return "";
      }

      default:
        // Recurse into unknown nodes
        if (content) return (content).map(convertNode).join("");
        return "";
    }
  }

  function convertListItemContent(li) {
    return (li.content || []).map(convertNode).join("").trim();
  }

  function convertTable(rows) {
    if (!rows.length) return "";
    const matrix = rows.map(row =>
      (row.content || []).map(cell => convertNode(cell))
    );
    const cols = Math.max(...matrix.map(r => r.length));
    const lines = [];
    matrix.forEach((row, i) => {
      while (row.length < cols) row.push("");
      lines.push(`| ${row.join(" | ")} |`);
      if (i === 0) lines.push(`| ${Array(cols).fill("---").join(" | ")} |`);
    });
    return lines.join("\n") + "\n\n";
  }

  function applyMarks(text, marks) {
    if (!marks || !marks.length) return text;
    let result = text;
    for (const mark of marks) {
      switch (mark.type) {
        case "strong": case "bold": result = `**${result}**`; break;
        case "em": case "italic": result = `*${result}*`; break;
        case "code": result = `\`${result}\``; break;
        case "strike": case "strikethrough": result = `~~${result}~~`; break;
        case "link": result = `[${result}](${mark.attrs?.href || ""})`; break;
        case "underline": result = `<u>${result}</u>`; break;
      }
    }
    return result;
  }
}
