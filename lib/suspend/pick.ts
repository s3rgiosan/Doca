import type { PortTab } from '../browser/port';
import { parseManagerUrl } from '../model/manager-url';
import type { Settings } from '../store/device';

export interface SuspendContext {
  now: number;
  managerBase: string;
  settings: Settings;
}

/** Returns the IDs of idle tabs to discard. */
export function pickTabsToDiscard(tabs: PortTab[], ctx: SuspendContext): number[] {
  return tabs.filter((tab) => shouldDiscard(tab, ctx)).map((tab) => tab.id);
}

function shouldDiscard(tab: PortTab, ctx: SuspendContext): boolean {
  // A discard before the address commits leaves a blank tab.
  if (tab.active || tab.pinned || tab.audible || tab.discarded || tab.pending || tab.lastAccessed === undefined) {
    return false;
  }
  if (parseManagerUrl(ctx.managerBase, tab.url) !== null || isAllowlisted(tab.url, ctx.settings.allowlist)) {
    return false;
  }
  const minutes = ctx.settings.suspendAfterMinutes;
  if (minutes <= 0) {
    return false;
  }
  const idleMs = ctx.now - tab.lastAccessed;
  return idleMs >= minutes * 60_000;
}

/** An allowlist entry covers its own host and every subdomain of it. */
function isAllowlisted(url: string, allowlist: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return allowlist.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    return allowed !== '' && (host === allowed || host.endsWith(`.${allowed}`));
  });
}
