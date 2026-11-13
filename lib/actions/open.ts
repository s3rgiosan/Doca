import type { BrowserPort, PortTab } from '../browser/port';
import { managerTabWorkspace, managerUrl } from '../model/manager-url';
import { setSkipFallback } from '../store/device';
import { markDirty } from '../store/dirty';
import { bindWindow, setNotOpened, setRestoring, setTabIds, unbindWindow, windowForWorkspace } from '../store/session';
import type { SavedTab, Workspace } from '../model/workspace';
import { getWorkspace } from '../store/workspaces';

/**
 * Opens a saved workspace in a new window. The manager tab is pinned first. The first saved tab
 * loads and becomes active. All other tabs are created in the background and discarded at once.
 */
export async function openWorkspace(port: BrowserPort, wsId: string): Promise<number> {
  const ws = await getWorkspace(wsId);
  if (!ws || ws.deleted) {
    throw new Error(`Workspace ${wsId} does not exist`);
  }
  await setRestoring(wsId, Date.now());
  const win = await port.createWindow(managerUrl(port.managerBase, wsId));
  const managerTab = win.tabs[0]!;
  await port.pinTab(managerTab.id);
  await bindWindow(win.id, wsId);
  await setSkipFallback(wsId, false);

  await restoreTabs(port, win.id, ws);
  await setRestoring(wsId, null);
  await markDirty(wsId, Date.now());
  return win.id;
}

/** Focuses the window of the workspace. A workspace with no window opens in a new one. */
export async function switchToWorkspace(port: BrowserPort, wsId: string): Promise<void> {
  const windowId = await windowForWorkspace(wsId);
  if (windowId !== null) {
    const win = await port.getWindow(windowId);
    if (win) {
      await port.focusWindow(windowId);
      return;
    }
    await unbindWindow(windowId);
  }
  await openWorkspace(port, wsId);
}

/**
 * Makes sure that the window has one manager tab for the workspace, pinned at index 0.
 * Manager tabs for other workspaces and extra copies are removed.
 */
export async function ensureManagerTab(port: BrowserPort, windowId: number, wsId: string): Promise<void> {
  const win = await port.getWindow(windowId);
  if (!win) {
    return;
  }
  const managers = win.tabs.filter((tab) => managerTabWorkspace(port.managerBase, tab) !== null);
  const keep = managers.find((tab) => managerTabWorkspace(port.managerBase, tab) === wsId);
  const extra = managers.filter((tab) => tab !== keep).map((tab) => tab.id);
  if (extra.length > 0) {
    await port.removeTabs(extra);
  }
  if (!keep) {
    await port.createTab({ windowId, url: managerUrl(port.managerBase, wsId), index: 0, pinned: true, active: false });
    return;
  }
  if (!keep.pinned) {
    await port.pinTab(keep.id);
  }
  const current = (await port.getWindow(windowId))?.tabs.find((tab) => tab.id === keep.id);
  if (current && current.index !== 0) {
    await port.moveTabs([keep.id], windowId, 0);
  }
}

/** How long a restored tab may take to commit its address before it stays loaded. */
export const URL_WAIT_MS = 15_000;

/** A saved tab that is open in a window. */
export interface OpenedTab {
  tab: PortTab;
  savedId: string;
  active: boolean;
}

export interface OpenedTabs {
  opened: OpenedTab[];
  /** Saved tab IDs that the browser did not open. */
  failed: string[];
}

/**
 * Opens the saved tabs of the workspace in the window. The first tab loads and becomes active. Each
 * other tab is discarded as soon as its address commits. A discard before that leaves a blank tab, so
 * a tab whose address does not commit stays loaded. Tabs that fail to open are recorded.
 */
export async function restoreTabs(port: BrowserPort, windowId: number, ws: Workspace): Promise<void> {
  const result = await openSavedTabs(port, windowId, ws.tabs, true);
  await setNotOpened(ws.id, result.failed, true);
  await suspendOpenedTabs(port, result.opened);
}

/**
 * Creates a tab for each saved tab and returns the tabs at once. Their addresses can still be
 * pending. With `activateFirst`, the first tab becomes active. A tab that fails to open is logged.
 */
export async function openSavedTabs(port: BrowserPort, windowId: number, tabs: SavedTab[], activateFirst: boolean): Promise<OpenedTabs> {
  const opened: OpenedTab[] = [];
  const failed: string[] = [];
  for (const saved of tabs) {
    const url = saved.finalUrl || saved.url;
    const active = activateFirst && opened.length === 0;
    try {
      const tab = await port.createTab({ windowId, url, pinned: saved.pinned, active });
      opened.push({ tab, savedId: saved.id, active });
    } catch (error) {
      failed.push(saved.id);
      console.warn(`Doca could not open ${url}`, error);
    }
  }
  return { opened, failed };
}

/**
 * Discards each inactive opened tab after its address commits, then records the tab IDs. A tab whose
 * address does not commit in time stays loaded, because a discard would leave it blank.
 */
export async function suspendOpenedTabs(port: BrowserPort, opened: OpenedTab[]): Promise<void> {
  await Promise.all(
    opened
      .filter((entry) => !entry.active)
      .map(async (entry) => {
        try {
          const ready = await port.waitForUrl(entry.tab.id, URL_WAIT_MS);
          if (!ready || ready.url === '') {
            return;
          }
          // The discard can give the tab a new ID, so the ID comes from the discarded tab.
          const discarded = await port.discardTab(ready.id);
          if (discarded) {
            entry.tab = discarded;
          }
        } catch (error) {
          console.warn(`Doca could not suspend ${entry.tab.url}`, error);
        }
      }),
  );
  await setTabIds(opened.map((entry) => [entry.tab.id, entry.savedId]));
}
