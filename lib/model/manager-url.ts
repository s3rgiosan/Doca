export const MANAGER_PATH = '/manager.html';

/** `base` is the full URL of the manager page, from `browser.runtime.getURL(MANAGER_PATH)`. */
export function managerUrl(base: string, wsId: string): string {
  return `${base}?ws=${encodeURIComponent(wsId)}`;
}

/** Returns the workspace ID of a manager tab URL, or null for any other URL. */
export function parseManagerUrl(base: string, url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // `origin` is "null" for non-special schemes such as chrome-extension, so the page is cut from the href.
  const page = parsed.href.split(/[?#]/)[0];
  if (page !== base) {
    return null;
  }
  return parsed.searchParams.get('ws') || null;
}

/**
 * Returns the workspace ID of a manager tab. A tab that is navigating counts as the page it goes to,
 * so a manager tab that switches workspace is not taken for a stray one.
 */
export function managerTabWorkspace(base: string, tab: { url: string; pendingUrl?: string }): string | null {
  return parseManagerUrl(base, tab.pendingUrl) ?? parseManagerUrl(base, tab.url);
}
