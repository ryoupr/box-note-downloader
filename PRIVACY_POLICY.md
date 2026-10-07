# Privacy Policy — BoxNote DL

**Last updated:** October 6, 2026

## Overview

BoxNote DL is a Chrome extension that downloads Box Notes as Markdown files with embedded images. It runs in your browser, and the only network requests it makes go to the Box servers that the Box Note you have open already uses (`*.app.box.com` and `notes.services.box.com`). It does not collect personal data, and it does not send any data to the developer or to any other server.

## Data Collection

**We do not collect any personal data.**

This extension:
- Does NOT collect personal information
- Does NOT track browsing activity
- Does NOT use analytics or telemetry
- Does NOT send any data to the developer or to any server other than Box (see Data Usage below)
- Does NOT store any user data outside of your browser

## Data Usage

The extension accesses Box Note content **only** on `*.app.box.com/notes/*` pages, including the Box Notes editor that those pages embed from `notes.services.box.com`, and only when you explicitly click the download button. The accessed content is:
- Processed locally in your browser
- Converted to Markdown format
- Saved to your local device via the Chrome Downloads API

To download embedded images, the extension requests them from Box using your existing Box session (your browser attaches your Box sign-in cookies, as it does for the Box page itself). Because Box image links expire, it first asks Box (`notes.services.box.com`) for fresh image links, the same request the Box Notes editor itself makes. Like the editor, the extension copies Box's anti-forgery token (the `csrf-token` cookie) into this request. These requests contain only that token and identifiers issued by Box (the note's file ID, the image IDs and their storage namespace, and your Box host name). The text of your note is never sent anywhere.

No data leaves your browser except to your local file system and the Box requests described above.

## Data Handled by the Extension

The Chrome Web Store requires extensions to disclose the types of user data they handle, even when the data is processed only on your device. BoxNote DL handles the following:

| Type | What | How it is used |
|------|------|----------------|
| Website content | The text and images of the Box Note you download | Read from the open page, converted to Markdown, and saved to your device. The text and images are never sent anywhere; only the identifiers described in Data Usage above (such as the file ID and image IDs) are sent to Box. |
| Authentication information | Box's anti-forgery token (the `csrf-token` cookie) | Read from your Box cookies and sent only to Box, in the image link request described above. Never stored or sent anywhere else. |

Neither is kept by the extension after the download finishes.

## Permissions

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Access the current Box Note page content when you click the extension |
| `downloads` | Save the converted Markdown file to your device |
| `webNavigation` | Detect when a Box Note page is loaded |
| `storage` | Store extension preferences locally |
| `host_permissions` (*.app.box.com, notes.services.box.com) | Access Box Note content for conversion, and request fresh image links from Box |

## Third-Party Services

This extension does not integrate with any analytics platforms, advertising networks, or other third-party services. The only service it communicates with is Box itself, which it reaches through your own signed-in Box session, and only when you click the download button (see Data Usage).

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue on our [GitHub repository](https://github.com/ryoupr/box-note-downloader/issues).
