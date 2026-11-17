import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openWorkspace } from '@/lib/actions/open';
import { switchWindow } from '@/lib/actions/switch';
import { createFromWindow } from '@/lib/actions/window';
import { onManagerTabSeen, onTabAttached, onTabChanged, onTabRemoved, onWindowRemoved, runStartup, runSuspend } from '@/lib/background/events';
import { managerUrl, parseManagerUrl } from '@/lib/model/manager-url';
import { newWorkspace } from '@/lib/model/workspace';
import { nextDue } from '@/lib/store/dirty';
import { bindWindow, getBindings, getTabMap, isStartupDone, markStartupDone, setTabIds } from '@/lib/store/session';
import { getWorkspace, putWorkspace } from '@/lib/store/workspaces';
import { createFakePort, FAKE_MANAGER_BASE as base, type FakePort } from '../helpers/fake-port';

async function windowWith(port: FakePort, urls: string[]) {
  const win = await port.createWindow(urls[0]!);
  for (const url of urls.slice(1)) {
    await port.createTab({ windowId: win.id, url, active: false });
  }
  return win.id;
}
const tabsIn = async (port: FakePort, windowId: number) => (await port.getWindow(windowId))!.tabs;

describe('tab events', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('keeps the saved list when the window closes', async () => {
    await markStartupDone();
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    const wsId = await createFromWindow(port, windowId, 'X', 1);
    const before = (await getWorkspace(wsId))!;
    const tab = (await tabsIn(port, windowId))[1]!;
    await port.removeTabs([tab.id]);
    await onTabRemoved(port, tab.id, { windowId, isWindowClosing: true }, 5);
    expect(await nextDue()).toBeNull();
    expect(await getWorkspace(wsId)).toEqual(before);
  });

  it('recreates the manager tab of a bound window', async () => {
    await markStartupDone();
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, windowId, 'X', 1);
    const manager = (await tabsIn(port, windowId))[0]!;
    await port.removeTabs([manager.id]);
    await onTabRemoved(port, manager.id, { windowId, isWindowClosing: false }, 5);
    const tabs = await tabsIn(port, windowId);
    expect(parseManagerUrl(base, tabs[0]!.url)).toBe(wsId);
    expect(tabs[0]!.pinned).toBe(true);
  });

  it('does not recreate a manager tab in an unbound window', async () => {
    await markStartupDone();
    const port = createFakePort();
    const windowId = await windowWith(port, [managerUrl(base, 'gone'), 'https://a.test/']);
    const manager = (await tabsIn(port, windowId))[0]!;
    await port.removeTabs([manager.id]);
    await onTabRemoved(port, manager.id, { windowId, isWindowClosing: false }, 5);
    expect((await tabsIn(port, windowId)).map((t) => t.url)).toEqual(['https://a.test/']);
  });

  it('marks nothing dirty before startup is done', async () => {
    await bindWindow(1, 'a');
    await onTabChanged(createFakePort(), 1, 5);
    expect(await nextDue()).toBeNull();
  });

  it('marks a bound window dirty after startup', async () => {
    await markStartupDone();
    await bindWindow(1, 'a');
    await onTabChanged(createFakePort(), 1, 5);
    expect(await nextDue()).toBe(1005);
  });

  it('moves a dragged manager tab back to its own window', async () => {
    await markStartupDone();
    const port = createFakePort();
    const home = await windowWith(port, ['https://a.test/']);
    await createFromWindow(port, home, 'X', 1);
    const other = await windowWith(port, ['https://b.test/']);
    const manager = (await tabsIn(port, home))[0]!;
    await port.moveTabs([manager.id], other, -1);
    await onTabAttached(port, manager.id, other, 5);
    expect((await tabsIn(port, home))[0]!.id).toBe(manager.id);
    expect((await tabsIn(port, other)).map((t) => t.url)).toEqual(['https://b.test/']);
  });

  it('unbinds a closed window and keeps the workspace', async () => {
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0 }), 1);
    await bindWindow(1, 'a');
    await onWindowRemoved(1);
    expect((await getBindings()).size).toBe(0);
    expect(await getWorkspace('a')).not.toBeNull();
  });
});

describe('onManagerTabSeen', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('binds an unbound window that shows a manager tab', async () => {
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0 }), 1);
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://x.test/', managerUrl(base, 'a')]);
    const manager = (await tabsIn(port, windowId))[1]!;
    await onManagerTabSeen(port, manager);
    expect((await getBindings()).get(windowId)).toBe('a');
    expect((await tabsIn(port, windowId))[0]!.id).toBe(manager.id);
  });

  it('removes a manager tab for a workspace bound to another window', async () => {
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0 }), 1);
    const port = createFakePort();
    const home = await windowWith(port, [managerUrl(base, 'a')]);
    await bindWindow(home, 'a');
    const other = await windowWith(port, ['https://x.test/', managerUrl(base, 'a')]);
    await onManagerTabSeen(port, (await tabsIn(port, other))[1]!);
    expect((await tabsIn(port, other)).map((t) => t.url)).toEqual(['https://x.test/']);
  });

  it('removes a reopened manager tab from the window that already has one', async () => {
    await markStartupDone();
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, windowId, 'X', 1);
    const reopened = await port.createTab({ windowId, url: managerUrl(base, wsId), active: true });
    await onManagerTabSeen(port, reopened);
    const tabs = await tabsIn(port, windowId);
    expect(tabs.map((t) => parseManagerUrl(base, t.url) ?? t.url)).toEqual([wsId, 'https://a.test/']);
    expect(tabs[0]!.pinned).toBe(true);
  });
});

describe('onTabAttached for a manager tab with no home window', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  /** Drags the manager tab of a new workspace into `to`, then closes its home window. */
  async function dragManagerOut(port: FakePort, to: number) {
    const home = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, home, 'X', 1);
    const manager = (await tabsIn(port, home))[0]!;
    await port.moveTabs([manager.id], to, -1);
    port.windows.splice(port.windows.findIndex((w) => w.id === home), 1);
    return { wsId, managerId: manager.id };
  }

  it('binds an unbound window to the workspace of the manager tab', async () => {
    const port = createFakePort();
    const to = await windowWith(port, ['https://x.test/']);
    const { wsId, managerId } = await dragManagerOut(port, to);
    await onTabAttached(port, managerId, to, 5);
    expect((await getBindings()).get(to)).toBe(wsId);
    const tabs = await tabsIn(port, to);
    expect(tabs[0]!.id).toBe(managerId);
    expect(tabs[0]!.pinned).toBe(true);
  });

  it('removes the manager tab from a window of another workspace', async () => {
    const port = createFakePort();
    const to = await windowWith(port, ['https://x.test/']);
    const other = await createFromWindow(port, to, 'Other', 1);
    const { managerId } = await dragManagerOut(port, to);
    await onTabAttached(port, managerId, to, 5);
    expect((await tabsIn(port, to)).map((t) => parseManagerUrl(base, t.url) ?? t.url)).toEqual([other, 'https://x.test/']);
  });
});

describe('runStartup', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('binds by manager tab and by overlap, and removes stale manager tabs', async () => {
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0 }), 1);
    const tabs = [{ id: 's', url: 'https://b.test/', finalUrl: 'https://b.test/', title: 'B', pinned: false, index: 0 }];
    await putWorkspace(newWorkspace({ id: 'b', name: 'B', deviceId: 'd', now: 0, tabs }), 1);
    const port = createFakePort();
    const w1 = await windowWith(port, [managerUrl(base, 'a'), 'https://x.test/']);
    const w2 = await windowWith(port, [managerUrl(base, 'deleted'), 'https://b.test/']);
    await runStartup(port, 5);
    expect([...(await getBindings())].sort()).toEqual([
      [w1, 'a'],
      [w2, 'b'],
    ]);
    expect((await tabsIn(port, w2)).map((t) => parseManagerUrl(base, t.url))).toEqual(['b', null]);
    expect(await isStartupDone()).toBe(true);
    expect(await nextDue()).toBe(1005);
  });

  it('keeps the address of each saved tab that the overlap merge opens', async () => {
    const tabs = ['https://a.test/', 'https://b.test/'].map((url, index) => ({ id: `s${index}`, url, finalUrl: url, title: url, pinned: false, index }));
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0, tabs }), 1);
    const port = createFakePort({ commitLater: true });
    const windowId = await windowWith(port, ['https://a.test/']);
    await runStartup(port, 5);
    const merged = (await tabsIn(port, windowId)).find((t) => t.discarded)!;
    expect(merged.url).toBe('https://b.test/');
  });
});

describe('runSuspend', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('discards idle tabs in bound and unbound windows', async () => {
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0 }), 1);
    const port = createFakePort();
    const bound = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    await bindWindow(bound, 'a');
    const free = await windowWith(port, ['https://c.test/', 'https://d.test/']);
    await runSuspend(port, 60 * 60_000);
    expect((await tabsIn(port, bound)).map((t) => t.discarded)).toEqual([false, true]);
    expect((await tabsIn(port, free)).map((t) => t.discarded)).toEqual([false, true]);
  });

  it('moves the saved tab ID to the new ID that a discard gives', async () => {
    const port = createFakePort({ discardChangesId: true });
    const windowId = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    const [, idle] = await tabsIn(port, windowId);
    await setTabIds([[idle!.id, 's1']]);
    await runSuspend(port, 60 * 60_000);
    const after = (await tabsIn(port, windowId))[1]!;
    expect(after.id).not.toBe(idle!.id);
    const map = await getTabMap();
    expect(map.get(after.id)).toBe('s1');
    expect(map.has(idle!.id)).toBe(false);
  });
});

describe('onManagerTabSeen during openWorkspace', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  it('keeps the manager tab of a workspace that is opening in a new window', async () => {
    await putWorkspace(newWorkspace({ id: 'b', name: 'B', deviceId: 'd', now: 0 }), 1);
    const port = createFakePort();
    const createWindow = port.createWindow.bind(port);
    let seen: Promise<void> = Promise.resolve();
    // The browser reports the new manager tab while openWorkspace is still running.
    port.createWindow = async (url) => {
      const win = await createWindow(url);
      seen = onManagerTabSeen(port, win.tabs[0]!);
      return win;
    };
    const windowId = await openWorkspace(port, 'b');
    await seen;
    expect(port.calls.filter((call) => call.startsWith('removeTabs'))).toEqual([]);
    expect((await tabsIn(port, windowId)).map((tab) => parseManagerUrl(base, tab.url))).toEqual(['b']);
  });

  it('keeps the manager tab when the browser reports it after the window is bound', async () => {
    const tabs = [{ id: 's0', url: 'https://b1.test/', finalUrl: 'https://b1.test/', title: 'B1', pinned: false, index: 0 }];
    await putWorkspace(newWorkspace({ id: 'b', name: 'B', deviceId: 'd', now: 0, tabs }), 1);
    const port = createFakePort({ commitLater: true });
    const createTab = port.createTab.bind(port);
    let seen: Promise<void> = Promise.resolve();
    port.createTab = async (p) => {
      const created = await createTab(p);
      const manager = (await tabsIn(port, p.windowId))[0]!;
      seen = onManagerTabSeen(port, manager);
      return created;
    };
    const windowId = await openWorkspace(port, 'b');
    await seen;
    expect(port.calls.filter((call) => call.startsWith('removeTabs'))).toEqual([]);
    expect((await tabsIn(port, windowId)).map((tab) => parseManagerUrl(base, tab.url) ?? tab.url)).toEqual(['b', 'https://b1.test/']);
  });

  it('keeps the manager tab that a switch points at the new workspace', async () => {
    const tabs = [{ id: 's0', url: 'https://b1.test/', finalUrl: 'https://b1.test/', title: 'B1', pinned: false, index: 0 }];
    await putWorkspace(newWorkspace({ id: 'b', name: 'B', deviceId: 'd', now: 0, tabs }), 1);
    const port = createFakePort({ commitLater: true });
    const windowId = await windowWith(port, ['https://a1.test/']);
    await createFromWindow(port, windowId, 'A', 2);
    const managerId = (await tabsIn(port, windowId))[0]!.id;
    const navigateTab = port.navigateTab.bind(port);
    let seen: Promise<void> = Promise.resolve();
    port.navigateTab = async (tabId, url) => {
      await navigateTab(tabId, url);
      seen = onManagerTabSeen(port, (await tabsIn(port, windowId))[0]!);
    };
    await switchWindow(port, windowId, 'b', 5);
    await seen;
    const after = await tabsIn(port, windowId);
    expect(after[0]!.id).toBe(managerId);
    expect(after.map((tab) => parseManagerUrl(base, tab.url) ?? tab.url)).toEqual(['b', 'https://b1.test/']);
  });
});
