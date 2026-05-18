# Privacy Policy — BoxNote DL

**Last updated:** May 19, 2026

## Overview

BoxNote DL is a Chrome extension that downloads Box Notes as Markdown files with embedded images. This extension operates entirely within your browser and does not collect, store, or transmit any personal data to external servers.

## Data Collection

**We do not collect any personal data.**

This extension:
- Does NOT collect personal information
- Does NOT track browsing activity
- Does NOT use analytics or telemetry
- Does NOT transmit any data to external servers
- Does NOT store any user data outside of your browser

## Data Usage

The extension accesses Box Note content **only** on `*.app.box.com/notes/*` pages when you explicitly click the download button. The accessed content is:
- Processed locally in your browser
- Converted to Markdown format
- Saved to your local device via the Chrome Downloads API

No data leaves your browser except to your local file system.

## Permissions

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Access the current Box Note page content when you click the extension |
| `downloads` | Save the converted Markdown file to your device |
| `webNavigation` | Detect when a Box Note page is loaded |
| `storage` | Store extension preferences locally |
| `host_permissions` (*.app.box.com) | Access Box Note content for conversion |

## Third-Party Services

This extension does not integrate with any third-party services, analytics platforms, or advertising networks.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue on our [GitHub repository](https://github.com/ryoupr/box-note-downloader/issues).
