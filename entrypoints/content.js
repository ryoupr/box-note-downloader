// Box Note to Markdown - Content Script
export default defineContentScript({
  matches: [
    'https://*.app.box.com/notes/*',
    'https://notes.services.box.com/*',
  ],
  runAt: 'document_end',
  allFrames: true,
  main() {
    // Elements to skip entirely during conversion
    const SKIP_SELECTORS = [
      '.collab-cursor-container',
      '.heading-collapse-container',
      '.heading-anchor-container',
      '.check-list-item-checkbox-container',
      'img.ProseMirror-separator',
      'br.ProseMirror-trailingBreak',
    ];

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'convert') {
        extractMarkdown({ includeAssets: msg.includeAssets !== false }).then(
          sendResponse,
        );
        return true;
      }
      if (msg.action === 'dumpDOM') {
        const html = document.documentElement.outerHTML;
        sendResponse({ fullHtml: html });
        return;
      }
      if (msg.action === 'fetchImage') {
        fetchImageAsBase64(msg.url).then(sendResponse);
        return true;
      }
      if (msg.action === 'getTitle') {
        const titleEl =
          document.querySelector('[data-testid="notes-title"]') ||
          document.querySelector('[class*="NotesHeader"] [class*="title"]') ||
          document.querySelector('h1[class*="title"]');
        const title =
          titleEl?.textContent?.trim() ||
          document.title.replace(/ - Box$/, '').trim() ||
          'untitled';
        sendResponse({ title });
      }
    });

    function shouldSkip(el) {
      return SKIP_SELECTORS.some((sel) => el.matches?.(sel));
    }

    async function extractMarkdown({ includeAssets = true } = {}) {
      const images = [];
      let imgCounter = 0;

      const title = document.title.replace(/ - Box$/, '').trim() || 'untitled';

      const editor =
        document.querySelector('.ProseMirror') ||
        document.querySelector('[contenteditable="true"]');

      if (!editor) {
        return {
          markdown: '<!-- Could not find Box Note content -->',
          images,
          title,
        };
      }

      // Direct DOM query for debugging
      const directImgs = editor.querySelectorAll(
        '.image-node-view, [data-component-type="image"]',
      );
      console.log(
        '[BoxNote CS] ★ Direct query: image-node-view count:',
        directImgs.length,
      );
      directImgs.forEach((el, i) =>
        console.log('[BoxNote CS]   img', i, el.tagName, el.className.slice(0, 60)),
      );

      const markdown = convertNode(editor);
      console.log('[BoxNote CS] Conversion done. Images found:', images.length);
      console.log(
        '[BoxNote CS] image-node-views in DOM:',
        editor.querySelectorAll('.image-node-view, [data-component-type="image"]')
          .length,
      );
      console.log(
        '[BoxNote CS] img[data-testid=img-element]:',
        editor.querySelectorAll('img[data-testid="img-element"]').length,
      );

      // The editor's <img src> holds a signed URL that expires (~15 min after
      // it was issued) and is never refreshed while the image stays loaded.
      // Ask Box for fresh signed URLs (original resolution) right before the
      // download; fall back to the DOM src if that fails.
      // Images aren't downloaded when assets are off, so don't contact Box.
      const freshUrls = includeAssets
        ? await requestFreshSignedUrls(images.map((i) => i.url))
        : new Map();

      // Don't fetch images here (CORS: notes.services → app.box.com blocked)
      // Return URLs for background/main-frame to fetch
      const imageRefs = images.map((img) => {
        const fresh = freshUrls.get(img.url);
        return {
          filename: img.filename,
          url: fresh || img.url,
          fallbackUrl: fresh ? img.url : undefined,
        };
      });

      return {
        markdown: markdown.trim(),
        images: imageRefs,
        title,
        debug: {
          directImgCount: directImgs.length,
          convertedImgCount: images.length,
          refreshedUrlCount: freshUrls.size,
        },
      };

      function convertNode(node, indent = 0) {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node;

        // Skip collab cursors and ProseMirror UI widgets
        if (shouldSkip(el)) return '';

        const tag = el.tagName.toLowerCase();
        const children = () =>
          Array.from(el.childNodes)
            .map((n) => convertNode(n, indent))
            .join('');

        // Box Notes native image (must check before tag-based dispatch)
        if (
          el.classList.contains('image-node-view') ||
          el.getAttribute('data-component-type') === 'image'
        ) {
          console.log(
            '[BoxNote CS] ★ Found image-node-view!',
            el.tagName,
            el.className.slice(0, 40),
          );
          const imgEl =
            el.querySelector('img[data-testid="img-element"]') ||
            el.querySelector('img:not(.avatar-image)');
          if (imgEl) {
            const src = imgEl.getAttribute('src') || '';
            if (src) {
              imgCounter++;
              const name =
                imgEl.getAttribute('data-file-name') || `image_${imgCounter}.png`;
              const safeName = name
                .replace(/[<>:\"/\\|?*]/g, '_')
                .replace(/\s+/g, '_');
              images.push({ url: src, filename: safeName });
              return `![${name}](assets/${safeName})`;
            }
          }
          return '';
        }

        if (/^h[1-6]$/.test(tag))
          return `${'#'.repeat(+tag[1])} ${children().trim()}\n\n`;
        if (tag === 'p') {
          const t = children();
          return t.trim() ? `${t}\n\n` : '\n';
        }
        if (tag === 'strong' || tag === 'b') return `**${children()}**`;
        if (tag === 'em' || tag === 'i') return `*${children()}*`;
        if (tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre')
          return `\`${children()}\``;
        if (tag === 's' || tag === 'del') return `~~${children()}~~`;
        if (tag === 'a')
          return `[${children()}](${el.getAttribute('href') || ''})`;

        // Embedded file preview (box-preview-node)
        if (el.classList.contains('box-preview-node')) {
          const previewImg = el.querySelector('img');
          if (previewImg) {
            const src = previewImg.getAttribute('src') || '';
            if (src) {
              imgCounter++;
              const ext =
                (src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i) || [])[1] || 'png';
              const filename = `image_${imgCounter}.${ext}`;
              images.push({ url: src, filename });
              return `![](assets/${filename})`;
            }
          }
          return '';
        }

        if (tag === 'img') {
          if (
            el.classList.contains('ProseMirror-separator') ||
            el.classList.contains('avatar-image')
          )
            return '';
          if (
            el.closest('.image-node-view') ||
            el.closest('[data-component-type="image"]')
          )
            return '';
          const src = el.getAttribute('src') || '';
          if (src) {
            imgCounter++;
            const ext =
              (src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i) || [])[1] || 'png';
            const filename = `image_${imgCounter}.${ext}`;
            images.push({ url: src, filename });
            return `![](assets/${filename})`;
          }
          return '';
        }

        if (tag === 'ul') {
          const isCheck = el.classList.contains('check-list');
          return convertList(el, indent, isCheck ? 'check' : 'bullet');
        }
        if (tag === 'ol') {
          return convertList(el, indent, 'ordered');
        }
        if (tag === 'li')
          return Array.from(el.childNodes)
            .map((n) => convertNode(n, indent))
            .join('');
        if (tag === 'blockquote')
          return (
            children()
              .trim()
              .split('\n')
              .map((l) => `> ${l}`)
              .join('\n') + '\n\n'
          );
        if (tag === 'pre')
          return `\`\`\`\n${el.querySelector('code')?.textContent || el.textContent || ''}\n\`\`\`\n\n`;
        if (tag === 'hr') return '---\n\n';
        if (tag === 'br') return '\n';
        if (tag === 'table') return convertTable(el);
        return children();
      }

      function convertList(ul, indent, type) {
        const pad = '  '.repeat(indent);
        const lines = [];
        let ordIdx = 0;
        const kids = Array.from(ul.children);

        for (let i = 0; i < kids.length; i++) {
          const child = kids[i];
          const childTag = child.tagName?.toLowerCase();

          if (childTag === 'li') {
            ordIdx++;
            let prefix;
            if (type === 'check') {
              const checked = child.classList.contains('is-checked') ? 'x' : ' ';
              prefix = `- [${checked}] `;
            } else if (type === 'ordered') {
              prefix = `${ordIdx}. `;
            } else {
              prefix = '- ';
            }

            // Get li text (skip checkbox container)
            const text = Array.from(child.childNodes)
              .filter((n) => !n.matches?.('.check-list-item-checkbox-container'))
              .map((n) => convertNode(n, indent))
              .join('')
              .trim();
            lines.push(`${pad}${prefix}${text}`);
          } else if (childTag === 'ul' || childTag === 'ol') {
            // Sibling sub-list = nested indent
            const subType = child.classList?.contains('check-list')
              ? 'check'
              : childTag === 'ol'
                ? 'ordered'
                : 'bullet';
            lines.push(convertList(child, indent + 1, subType).trimEnd());
          }
        }
        return lines.join('\n') + (indent === 0 ? '\n\n' : '\n');
      }

      function convertTable(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (!rows.length) return '';
        const matrix = rows.map((r) =>
          Array.from(r.querySelectorAll('td,th')).map((c) =>
            convertNode(c).trim().replace(/\n/g, ' '),
          ),
        );
        const cols = Math.max(...matrix.map((r) => r.length));
        const lines = [];
        matrix.forEach((row, i) => {
          while (row.length < cols) row.push('');
          lines.push(`| ${row.join(' | ')} |`);
          if (i === 0) lines.push(`| ${Array(cols).fill('---').join(' | ')} |`);
        });
        return lines.join('\n') + '\n\n';
      }
    }

    // Box Notes image URLs look like
    //   https://<host>/app-api/child-objects/files/<fileId>/<namespace>/<childId>[/representations/...]?X-Box-Signature=...
    function parseChildObjectUrl(src) {
      try {
        const u = new URL(src);
        // Only Box web app hosts (same set as the content script matches)
        if (u.protocol !== 'https:' || !isBoxAppHost(u.hostname)) return null;
        const m = u.pathname.match(
          /\/child-objects\/files\/(\d+)\/([^/]+)\/([^/?#]+)/,
        );
        if (!m) return null;
        return {
          fileId: m[1],
          namespace: decodeURIComponent(m[2]),
          childId: decodeURIComponent(m[3]),
          hostname: u.hostname,
        };
      } catch {
        return null;
      }
    }

    function getCookie(name) {
      for (const part of document.cookie.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return v.join('=');
      }
      return '';
    }

    // Same endpoint the Box Notes editor itself uses (SCS signed requests).
    // Only reachable same-origin from the notes.services.box.com frame.
    const SCS_DOWNLOAD_ENDPOINT = '/scs/signed-requests-download';
    const SCS_MAX_BATCH = 50;
    // Don't let a stalled request block the 'convert' response forever
    const SCS_TIMEOUT_MS = 10000;

    function isBoxAppHost(hostname) {
      return hostname === 'app.box.com' || hostname.endsWith('.app.box.com');
    }

    // Returns Map<original src, fresh signed URL of the original image>.
    // Never throws: on any failure the map simply lacks that entry.
    async function requestFreshSignedUrls(srcs) {
      const result = new Map();
      if (location.hostname !== 'notes.services.box.com') return result;

      // Group by note file id (all images normally share one), and by child
      // id so an image that appears twice is requested only once
      const groups = new Map();
      for (const src of srcs) {
        const ref = parseChildObjectUrl(src);
        if (!ref) continue;
        const key = `${ref.fileId}|${ref.hostname}`;
        if (!groups.has(key)) groups.set(key, { ...ref, children: new Map() });
        const children = groups.get(key).children;
        if (!children.has(ref.childId)) {
          children.set(ref.childId, { ref, srcs: new Set() });
        }
        children.get(ref.childId).srcs.add(src);
      }

      const csrf = getCookie('csrf-token');
      for (const group of groups.values()) {
        const children = [...group.children.values()];
        for (let i = 0; i < children.length; i += SCS_MAX_BATCH) {
          const batch = children.slice(i, i + SCS_MAX_BATCH);
          try {
            const resp = await fetch(SCS_DOWNLOAD_ENDPOINT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'csrf-token': csrf,
              },
              body: JSON.stringify({
                fileId: group.fileId,
                childIds: batch.map((c) => ({
                  id: c.ref.childId,
                  namespace: c.ref.namespace,
                })),
                // Notes opened through a shared link (/s/...) would need the
                // link here; the iframe can't read the parent URL, so they are
                // not supported and fall back to the DOM src.
                sharedLink: '',
                hostname: group.hostname,
              }),
              signal: AbortSignal.timeout(SCS_TIMEOUT_MS),
            });
            if (!resp.ok) {
              console.warn('[BoxNote CS] Signed URL refresh failed: HTTP', resp.status);
              continue;
            }
            const body = await resp.json();
            const items = Array.isArray(body?.items) ? body.items : [];
            for (const c of batch) {
              const forChild = items.filter(
                (it) => it?.childId === c.ref.childId && typeof it.url === 'string',
              );
              // Prefer the original (no /representations/); Box lists it first.
              const best =
                forChild.find((it) => !it.url.includes('/representations/')) ||
                forChild[0];
              if (best && isTrustedImageUrl(best.url, group.hostname)) {
                for (const src of c.srcs) result.set(src, best.url);
              }
            }
          } catch (err) {
            console.warn('[BoxNote CS] Signed URL refresh error:', err?.message);
          }
        }
      }
      console.log(
        '[BoxNote CS] Signed URLs refreshed:',
        result.size,
        '/',
        srcs.length,
      );
      return result;
    }

    // Only accept https URLs on the same Box host as the original image.
    function isTrustedImageUrl(url, hostname) {
      try {
        const u = new URL(url);
        return u.protocol === 'https:' && u.hostname === hostname;
      } catch {
        return false;
      }
    }

    function blobToBase64(blob) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    }

    async function fetchImageAsBase64(url) {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) return { data: null, error: `HTTP ${resp.status}` };
        const blob = await resp.blob();
        const data = await blobToBase64(blob);
        return { data };
      } catch (e) {
        return { data: null, error: e.message };
      }
    }
  },
});
