import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
// Manifest values below are migrated 1:1 from the legacy hand-written
// manifest.json (permissions, host_permissions, icons, action, default_locale,
// __MSG_appName__/__MSG_appDesc__). The extension version comes from
// package.json (1.0.3). content_scripts and background/service_worker are
// generated from the entrypoints/ directory.
export default defineConfig({
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'en',
    permissions: ['activeTab', 'downloads', 'webNavigation', 'storage'],
    host_permissions: [
      'https://*.app.box.com/*',
      'https://notes.services.box.com/*',
    ],
    icons: {
      16: '/icons/icon16.png',
      19: '/icons/icon19.png',
      32: '/icons/icon32.png',
      38: '/icons/icon38.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
    action: {
      default_popup: 'popup.html',
      default_icon: {
        16: '/icons/icon16.png',
        48: '/icons/icon48.png',
      },
    },
  },
});
