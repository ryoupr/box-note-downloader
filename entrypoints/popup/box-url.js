// Box Note URL detection for the popup.
//
// Box serves notes at https://app.box.com/notes/<id>, and at
// https://<subdomain>.app.box.com/notes/<id> for enterprises with a custom
// subdomain. Both must be accepted (the content script match pattern
// `https://*.app.box.com/notes/*` already covers both hosts).
const BOX_APP_HOST = "app.box.com";

export function isBoxNoteUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = url.hostname;
  const isBoxAppHost = host === BOX_APP_HOST || host.endsWith(`.${BOX_APP_HOST}`);
  return url.protocol === "https:" && isBoxAppHost && url.pathname.startsWith("/notes/");
}
