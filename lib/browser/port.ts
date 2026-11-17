import { browser, type Browser } from 'wxt/browser';
import { MANAGER_PATH } from '../model/manager-url';

export interface PortTab {
  id: number;
  windowId: number;
  index: number;
  url: string;
  title: string;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  discarded: boolean;
  /** Time in milliseconds since the epoch when the tab was last active. */
  lastAccessed?: number;
  favIconUrl?: string;
  /** True while the address has not committed. A discard then loses the address, and the tab stays blank. */
  pending?: boolean;
  /** The address the tab is navigating to, while the navigation has not committed. */
  pendingUrl?: string;
}

export interface PortWindow {
  id: number;
  focused: boolean;
  minimized: boolean;
  /** Sorted by index. */
  tabs: PortTab[];
}

/** The tab and window calls that Doca uses. Actions take this interface, so tests can use an in-memory browser. */
export interface BrowserPort {
  /** The full URL of the manager page, without parameters. */
  managerBase: string;
  /** Normal windows only. */
  getWindows(): Promise<PortWindow[]>;
  getWindow(windowId: number): Promise<PortWindow | null>;
  /** Opens a focused window with one tab. */
  createWindow(url: string): Promise<PortWindow>;
  /** Focuses the window. A minimized window is restored first. */
  focusWindow(windowId: number): Promise<void>;
  createTab(p: { windowId: number; url: string; index?: number; pinned?: boolean; active: boolean }): Promise<PortTab>;
  /**
   * Returns the tab after the discard, or null when the browser did not discard it. The tab ID can change.
   * Call it only for a tab whose address has committed.
   */
  discardTab(tabId: number): Promise<PortTab | null>;
  /** Loads another address in the tab. */
  navigateTab(tabId: number, url: string): Promise<void>;
  /** Waits until the address of the tab commits. Returns null when the tab closes or the time runs out. */
  waitForUrl(tabId: number, timeoutMs: number): Promise<PortTab | null>;
  /** An index of -1 puts the tabs at the end of the window. */
  moveTabs(tabIds: number[], windowId: number, index: number): Promise<void>;
  removeTabs(tabIds: number[]): Promise<void>;
  pinTab(tabId: number): Promise<void>;
}

export function toPortTab(tab: Browser.tabs.Tab): PortTab {
  return {
    id: tab.id ?? -1,
    windowId: tab.windowId,
    index: tab.index,
    // A tab that has not committed yet has an empty `url` and its target in `pendingUrl`.
    url: tab.url || tab.pendingUrl || '',
    title: tab.title ?? '',
    pinned: tab.pinned,
    active: tab.active,
    audible: tab.audible ?? false,
    discarded: tab.discarded,
    lastAccessed: tab.lastAccessed,
    favIconUrl: tab.favIconUrl,
    pending: !tab.url,
    pendingUrl: tab.pendingUrl,
  };
}

function toPortWindow(win: Browser.windows.Window): PortWindow {
  const tabs = (win.tabs ?? []).map(toPortTab).sort((a, b) => a.index - b.index);
  return { id: win.id ?? -1, focused: win.focused, minimized: win.state === 'minimized', tabs };
}

export function createChromePort(): BrowserPort {
  return {
    managerBase: browser.runtime.getURL(MANAGER_PATH),
    async getWindows() {
      const windows = await browser.windows.getAll({ populate: true, windowTypes: ['normal'] });
      return windows.map(toPortWindow);
    },
    async getWindow(windowId) {
      try {
        return toPortWindow(await browser.windows.get(windowId, { populate: true }));
      } catch {
        return null;
      }
    },
    async createWindow(url) {
      const win = await browser.windows.create({ url, focused: true });
      return toPortWindow(win!);
    },
    async focusWindow(windowId) {
      const win = await browser.windows.get(windowId);
      if (win.state === 'minimized') {
        await browser.windows.update(windowId, { state: 'normal' });
      }
      await browser.windows.update(windowId, { focused: true });
    },
    async createTab(p) {
      return toPortTab(await browser.tabs.create(p));
    },
    async discardTab(tabId) {
      const tab = await browser.tabs.discard(tabId);
      return tab ? toPortTab(tab) : null;
    },
    async moveTabs(tabIds, windowId, index) {
      await browser.tabs.move(tabIds, { windowId, index });
    },
    async removeTabs(tabIds) {
      await browser.tabs.remove(tabIds);
    },
    async pinTab(tabId) {
      await browser.tabs.update(tabId, { pinned: true });
    },
    async navigateTab(tabId, url) {
      await browser.tabs.update(tabId, { url });
    },
    waitForUrl(tabId, timeoutMs) {
      return new Promise((resolve) => {
        const finish = (tab: PortTab | null) => {
          clearTimeout(timer);
          browser.tabs.onUpdated.removeListener(onUpdated);
          browser.tabs.onRemoved.removeListener(onRemoved);
          resolve(tab);
        };
        const onUpdated = (id: number, _change: unknown, tab: Browser.tabs.Tab) => {
          if (id === tabId && tab.url) {
            finish(toPortTab(tab));
          }
        };
        const onRemoved = (id: number) => {
          if (id === tabId) {
            finish(null);
          }
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        browser.tabs.onUpdated.addListener(onUpdated);
        browser.tabs.onRemoved.addListener(onRemoved);
        // The address can commit before the listeners exist, so the tab is read once after they are added.
        browser.tabs.get(tabId).then(
          (tab) => tab.url && finish(toPortTab(tab)),
          () => finish(null),
        );
      });
    },
  };
}
