import type { BrowserPort, PortTab, PortWindow } from '@/lib/browser/port';

export const FAKE_MANAGER_BASE = 'chrome-extension://abc/manager.html';

export type FakePort = BrowserPort & { windows: PortWindow[]; calls: string[] };

/** An in-memory browser. Indexes stay contiguous after every change, as in a real window. */
export function createFakePort(
  opts: {
    failUrls?: string[];
    discardChangesId?: boolean;
    /** New tabs start with a pending address that commits in waitForUrl, as in Chrome. */
    commitLater?: boolean;
    /** Addresses that never commit. */
    neverCommit?: string[];
  } = {},
): FakePort {
  const windows: PortWindow[] = [];
  const calls: string[] = [];
  let nextId = 100;

  const reindex = (win: PortWindow) => win.tabs.forEach((tab, i) => (tab.index = i));
  const windowOf = (windowId: number) => {
    const win = windows.find((w) => w.id === windowId);
    if (!win) {
      throw new Error(`No window ${windowId}`);
    }
    return win;
  };
  const findTab = (tabId: number) => {
    for (const win of windows) {
      const tab = win.tabs.find((t) => t.id === tabId);
      if (tab) {
        return { win, tab };
      }
    }
    throw new Error(`No tab ${tabId}`);
  };
  const copyWindow = (win: PortWindow): PortWindow => ({ ...win, tabs: win.tabs.map((t) => ({ ...t })) });
  const makeTab = (windowId: number, url: string, active: boolean, pinned = false): PortTab => ({
    id: nextId++,
    windowId,
    index: 0,
    url,
    title: url,
    pinned,
    active,
    audible: false,
    discarded: false,
    lastAccessed: 0,
  });
  const setActive = (win: PortWindow, tab: PortTab) => win.tabs.forEach((t) => (t.active = t === tab));

  return {
    windows,
    calls,
    managerBase: FAKE_MANAGER_BASE,
    async getWindows() {
      return windows.map(copyWindow);
    },
    async getWindow(windowId) {
      const win = windows.find((w) => w.id === windowId);
      return win ? copyWindow(win) : null;
    },
    async createWindow(url) {
      calls.push(`createWindow ${url}`);
      const id = nextId++;
      windows.forEach((w) => (w.focused = false));
      const win: PortWindow = { id, focused: true, minimized: false, tabs: [makeTab(id, url, true)] };
      windows.push(win);
      return copyWindow(win);
    },
    async focusWindow(windowId) {
      calls.push(`focusWindow ${windowId}`);
      const win = windowOf(windowId);
      windows.forEach((w) => (w.focused = false));
      win.minimized = false;
      win.focused = true;
    },
    async createTab(p) {
      calls.push(`createTab ${p.url}`);
      if (opts.failUrls?.includes(p.url)) {
        throw new Error(`Cannot open ${p.url}`);
      }
      const win = windowOf(p.windowId);
      const tab = makeTab(p.windowId, p.url, p.active, p.pinned ?? false);
      tab.pending = opts.commitLater ?? false;
      const at = p.index === undefined || p.index < 0 ? win.tabs.length : Math.min(p.index, win.tabs.length);
      win.tabs.splice(at, 0, tab);
      if (p.active) {
        setActive(win, tab);
      }
      reindex(win);
      return { ...tab };
    },
    async discardTab(tabId) {
      const { tab } = findTab(tabId);
      if (tab.active) {
        return null;
      }
      // Chrome drops a pending address when it discards the tab, and the tab stays blank.
      if (tab.pending) {
        tab.url = '';
      }
      tab.discarded = true;
      if (opts.discardChangesId) {
        tab.id = nextId++;
      }
      return { ...tab };
    },
    async moveTabs(tabIds, windowId, index) {
      calls.push(`moveTabs ${tabIds.join(',')} -> ${windowId}@${index}`);
      const target = windowOf(windowId);
      const moving = tabIds.map((id) => findTab(id));
      for (const { win, tab } of moving) {
        win.tabs.splice(win.tabs.indexOf(tab), 1);
        reindex(win);
      }
      const at = index < 0 ? target.tabs.length : Math.min(index, target.tabs.length);
      target.tabs.splice(at, 0, ...moving.map(({ tab }) => ({ ...tab, windowId, active: false })));
      reindex(target);
    },
    async removeTabs(tabIds) {
      calls.push(`removeTabs ${tabIds.join(',')}`);
      // Chrome rejects the whole call when one ID is closed, and then removes no tab.
      const dead = tabIds.find((id) => !windows.some((win) => win.tabs.some((t) => t.id === id)));
      if (dead !== undefined) {
        throw new Error(`No tab with id: ${dead}.`);
      }
      for (const id of tabIds) {
        const { win, tab } = findTab(id);
        win.tabs.splice(win.tabs.indexOf(tab), 1);
        reindex(win);
      }
    },
    async pinTab(tabId) {
      findTab(tabId).tab.pinned = true;
    },
    async navigateTab(tabId, url) {
      calls.push(`navigateTab ${tabId} ${url}`);
      findTab(tabId).tab.url = url;
    },
    async waitForUrl(tabId) {
      const { tab } = findTab(tabId);
      if (opts.neverCommit?.includes(tab.url)) {
        return null;
      }
      tab.pending = false;
      return { ...tab };
    },
  };
}
