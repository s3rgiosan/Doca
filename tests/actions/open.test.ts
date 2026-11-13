import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ensureManagerTab, openWorkspace, switchToWorkspace } from '@/lib/actions/open';
import { managerUrl, parseManagerUrl } from '@/lib/model/manager-url';
import { newWorkspace, type SavedTab } from '@/lib/model/workspace';
import { getSkipFallback, setSkipFallback } from '@/lib/store/device';
import { bindWindow, getTabMap, windowForWorkspace } from '@/lib/store/session';
import { putWorkspace } from '@/lib/store/workspaces';
import { createFakePort, FAKE_MANAGER_BASE as base } from '../helpers/fake-port';

const saved = (n: number): SavedTab[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, url: `https://t${i}.test/`, finalUrl: `https://t${i}.test/`, title: `T${i}`, pinned: false, index: i }));

async function seed(n: number) {
  await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0, tabs: saved(n) }), 1);
}

describe('openWorkspace', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('opens 30 tabs with all but one discarded and the manager tab pinned first', async () => {
    await seed(30);
    await setSkipFallback('a', true);
    const port = createFakePort();
    const windowId = await openWorkspace(port, 'a');
    const tabs = (await port.getWindow(windowId))!.tabs;
    expect(tabs).toHaveLength(31);
    expect(parseManagerUrl(base, tabs[0]!.url)).toBe('a');
    expect(tabs[0]!.pinned).toBe(true);
    expect(tabs.filter((t) => t.discarded)).toHaveLength(29);
    const loaded = tabs.slice(1).filter((t) => !t.discarded);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.active).toBe(true);
    expect(await windowForWorkspace('a')).toBe(windowId);
    expect((await getSkipFallback()).has('a')).toBe(false);
  });

  it('records the tab IDs that the discard returns', async () => {
    await seed(3);
    const port = createFakePort({ discardChangesId: true });
    const windowId = await openWorkspace(port, 'a');
    const tabs = (await port.getWindow(windowId))!.tabs.slice(1);
    const map = await getTabMap();
    expect(tabs.map((t) => map.get(t.id))).toEqual(['s0', 's1', 's2']);
  });

  it('keeps opening tabs after one fails', async () => {
    await seed(30);
    const port = createFakePort({ failUrls: ['https://t5.test/'] });
    const windowId = await openWorkspace(port, 'a');
    expect((await port.getWindow(windowId))!.tabs).toHaveLength(30);
  });

  it('keeps the address of every restored tab', async () => {
    await seed(5);
    const port = createFakePort({ commitLater: true });
    const windowId = await openWorkspace(port, 'a');
    const tabs = (await port.getWindow(windowId))!.tabs.slice(1);
    expect(tabs.map((t) => t.url)).toEqual(saved(5).map((t) => t.url));
    expect(tabs.filter((t) => t.discarded)).toHaveLength(4);
  });

  it('leaves a tab loaded when its address never commits', async () => {
    await seed(3);
    const port = createFakePort({ commitLater: true, neverCommit: ['https://t2.test/'] });
    const windowId = await openWorkspace(port, 'a');
    const t2 = (await port.getWindow(windowId))!.tabs.find((t) => t.url === 'https://t2.test/')!;
    expect(t2.discarded).toBe(false);
  });

  it('leaves the manager tab active for an empty workspace', async () => {
    await seed(0);
    const port = createFakePort();
    const windowId = await openWorkspace(port, 'a');
    const tabs = (await port.getWindow(windowId))!.tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.active).toBe(true);
  });
});

describe('switchToWorkspace', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('focuses a bound minimized window and opens no new one', async () => {
    await seed(1);
    const port = createFakePort();
    const win = await port.createWindow(managerUrl(base, 'a'));
    port.windows[0]!.minimized = true;
    await bindWindow(win.id, 'a');
    await switchToWorkspace(port, 'a');
    expect(port.windows).toHaveLength(1);
    expect(port.windows[0]!.minimized).toBe(false);
    expect(port.windows[0]!.focused).toBe(true);
  });

  it('opens the workspace when its bound window is gone', async () => {
    await seed(1);
    const port = createFakePort();
    await bindWindow(999, 'a');
    await switchToWorkspace(port, 'a');
    expect(port.windows).toHaveLength(1);
  });
});

describe('ensureManagerTab', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('moves the manager tab to index 0, pins it and removes extra ones', async () => {
    const port = createFakePort();
    const win = await port.createWindow('https://x.test/');
    await port.createTab({ windowId: win.id, url: 'https://y.test/', active: false });
    await port.createTab({ windowId: win.id, url: 'https://z.test/', active: false });
    await port.createTab({ windowId: win.id, url: managerUrl(base, 'a'), active: false });
    await port.createTab({ windowId: win.id, url: managerUrl(base, 'a'), active: false });
    await ensureManagerTab(port, win.id, 'a');
    const tabs = (await port.getWindow(win.id))!.tabs;
    expect(tabs.map((t) => parseManagerUrl(base, t.url))).toEqual(['a', null, null, null]);
    expect(tabs[0]!.pinned).toBe(true);
  });

  it('creates a pinned manager tab when none exists', async () => {
    const port = createFakePort();
    const win = await port.createWindow('https://x.test/');
    await ensureManagerTab(port, win.id, 'a');
    const tabs = (await port.getWindow(win.id))!.tabs;
    expect(parseManagerUrl(base, tabs[0]!.url)).toBe('a');
    expect(tabs[0]!.pinned).toBe(true);
    expect(tabs[1]!.active).toBe(true);
  });

  it('keeps a manager tab that is navigating to the workspace', async () => {
    const port = createFakePort();
    const win = await port.createWindow(managerUrl(base, 'old'));
    await port.createTab({ windowId: win.id, url: 'https://x.test/', active: false });
    port.windows[0]!.tabs[0]!.pendingUrl = managerUrl(base, 'a');
    await ensureManagerTab(port, win.id, 'a');
    expect(port.calls.filter((call) => call.startsWith('removeTabs'))).toEqual([]);
    expect((await port.getWindow(win.id))!.tabs).toHaveLength(2);
  });
});
