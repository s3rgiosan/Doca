import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { moveTabs, moveTabsToNewWorkspace } from '@/lib/actions/move';
import { createFromWindow } from '@/lib/actions/window';
import { newWorkspace, type SavedTab } from '@/lib/model/workspace';
import { markStartupDone, windowForWorkspace } from '@/lib/store/session';
import { getWorkspace, listWorkspaces, putWorkspace } from '@/lib/store/workspaces';
import { createFakePort, type FakePort } from '../helpers/fake-port';

async function windowWith(port: FakePort, urls: string[]) {
  const win = await port.createWindow(urls[0]!);
  for (const url of urls.slice(1)) {
    await port.createTab({ windowId: win.id, url, active: false });
  }
  return win.id;
}
const tabsIn = async (port: FakePort, windowId: number) => (await port.getWindow(windowId))!.tabs;
const closedTarget = (tabs: SavedTab[] = []) => putWorkspace(newWorkspace({ id: 'closed', name: 'Closed', deviceId: 'd', now: 0, tabs }), 1);

describe('moveTabs', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  it('moves tabs into the window of an open workspace and keeps the pinned state', async () => {
    const port = createFakePort();
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    await createFromWindow(port, source, 'Source', 1);
    const target = await windowWith(port, ['https://t.test/']);
    const targetWs = await createFromWindow(port, target, 'Target', 1);
    const b = (await tabsIn(port, source)).find((t) => t.url === 'https://b.test/')!;
    await port.pinTab(b.id);
    expect(await moveTabs(port, [b.id], targetWs, 2)).toEqual({ moved: 1 });
    const moved = (await tabsIn(port, target)).find((t) => t.url === 'https://b.test/')!;
    expect(moved.pinned).toBe(true);
    expect((await tabsIn(port, source)).map((t) => t.url)).not.toContain('https://b.test/');
  });

  it('adds tabs to a closed workspace, then closes them', async () => {
    await closedTarget([{ id: 'x', url: 'https://x.test/', finalUrl: 'https://x.test/', title: 'X', pinned: false, index: 0 }]);
    const port = createFakePort();
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/', 'https://c.test/']);
    const ids = (await tabsIn(port, source)).filter((t) => t.url !== 'https://a.test/').map((t) => t.id);
    expect(await moveTabs(port, ids, 'closed', 2)).toEqual({ moved: 2 });
    const ws = (await getWorkspace('closed'))!;
    expect(ws.tabs.map((t) => [t.url, t.index])).toEqual([
      ['https://x.test/', 0],
      ['https://b.test/', 1],
      ['https://c.test/', 2],
    ]);
    expect((await tabsIn(port, source)).map((t) => t.url)).toEqual(['https://a.test/']);
  });

  it('keeps the tabs open when the closed workspace cannot be written', async () => {
    await closedTarget();
    const port = createFakePort();
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    const b = (await tabsIn(port, source))[1]!;
    const spy = vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('quota'));
    await expect(moveTabs(port, [b.id], 'closed', 2)).rejects.toThrow('quota');
    spy.mockRestore();
    expect(await tabsIn(port, source)).toHaveLength(2);
  });

  it('skips the manager tab and tabs already in the target', async () => {
    const port = createFakePort();
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    await createFromWindow(port, source, 'Source', 1);
    const target = await windowWith(port, ['https://t.test/']);
    const targetWs = await createFromWindow(port, target, 'Target', 1);
    const sourceTabs = await tabsIn(port, source);
    const manager = sourceTabs[0]!;
    const b = sourceTabs.find((t) => t.url === 'https://b.test/')!;
    const inTarget = (await tabsIn(port, target)).find((t) => t.url === 'https://t.test/')!;
    expect(await moveTabs(port, [manager.id, b.id, inTarget.id], targetWs, 2)).toEqual({ moved: 1 });
    expect((await tabsIn(port, source))[0]!.id).toBe(manager.id);
  });

  it('rejects a deleted target', async () => {
    const port = createFakePort();
    await expect(moveTabs(port, [1], 'missing', 2)).rejects.toThrow();
  });
});

describe('moveTabsToNewWorkspace', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  it('creates a closed workspace with the tabs, then closes them here', async () => {
    const port = createFakePort();
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/', 'https://c.test/']);
    await createFromWindow(port, source, 'Source', 1);
    const ids = (await tabsIn(port, source)).filter((t) => t.url !== 'https://a.test/' && t.url.startsWith('https://')).map((t) => t.id);

    const result = await moveTabsToNewWorkspace(port, ids, 'Fresh', 2);

    expect(result.moved).toBe(2);
    const ws = (await getWorkspace(result.wsId))!;
    expect(ws.name).toBe('Fresh');
    expect(ws.tabs.map((t) => t.url)).toEqual(['https://b.test/', 'https://c.test/']);
    expect(await windowForWorkspace(result.wsId)).toBeNull();
    expect(port.windows).toHaveLength(1);
    expect((await tabsIn(port, source)).map((t) => t.url)).not.toContain('https://b.test/');
  });

  it('creates nothing when no selected tab can move', async () => {
    const port = createFakePort();
    const source = await windowWith(port, ['https://a.test/']);
    await createFromWindow(port, source, 'Source', 1);
    const manager = (await tabsIn(port, source))[0]!;
    await expect(moveTabsToNewWorkspace(port, [manager.id, 9999], 'Fresh', 2)).rejects.toThrow('No selected tab can move.');
    expect((await listWorkspaces()).map((ws) => ws.name)).toEqual(['Source']);
  });
});
