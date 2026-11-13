import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { assignWindow, createEmptyWorkspace, createFromWindow, deleteWorkspace, renameWorkspace } from '@/lib/actions/window';
import { managerUrl, parseManagerUrl } from '@/lib/model/manager-url';
import { newWorkspace, type SavedTab } from '@/lib/model/workspace';
import { getSkipFallback } from '@/lib/store/device';
import { bindWindow, getBindings, markStartupDone, setRestoring, windowForWorkspace } from '@/lib/store/session';
import { getWorkspace, listWorkspaces, putWorkspace } from '@/lib/store/workspaces';
import { createFakePort, FAKE_MANAGER_BASE as base, type FakePort } from '../helpers/fake-port';

const saved = (urls: string[]): SavedTab[] => urls.map((url, index) => ({ id: `s${index}`, url, finalUrl: url, title: url, pinned: false, index }));

async function windowWith(port: FakePort, urls: string[]) {
  const win = await port.createWindow(urls[0]!);
  for (const url of urls.slice(1)) {
    await port.createTab({ windowId: win.id, url, active: false });
  }
  return win.id;
}
const urlsIn = async (port: FakePort, windowId: number) => (await port.getWindow(windowId))!.tabs.map((t) => t.url);

describe('window actions', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  it('saves a window as a new workspace and adds the manager tab', async () => {
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    const wsId = await createFromWindow(port, windowId, 'Client X', 5);
    const ws = (await getWorkspace(wsId))!;
    expect(ws.name).toBe('Client X');
    expect(ws.tabs.map((t) => t.url)).toEqual(['https://a.test/', 'https://b.test/']);
    expect(await windowForWorkspace(wsId)).toBe(windowId);
    expect(parseManagerUrl(base, (await urlsIn(port, windowId))[0])).toBe(wsId);
  });

  it('creates an empty workspace in a new window', async () => {
    const port = createFakePort();
    const wsId = await createEmptyWorkspace(port, 'New', 5);
    expect(port.windows).toHaveLength(1);
    expect(await windowForWorkspace(wsId)).toBe(port.windows[0]!.id);
  });

  it('keeps no new workspace when the window refuses the switch', async () => {
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const a = await createFromWindow(port, windowId, 'A', 2);
    await setRestoring(a, 4);
    await expect(createEmptyWorkspace(port, 'New', 5, windowId)).rejects.toThrow('still opening');
    expect((await listWorkspaces({ includeDeleted: true })).map((ws) => ws.id)).toEqual([a]);
    expect(await windowForWorkspace(a)).toBe(windowId);
  });

  it('keeps no new workspace when its window cannot open', async () => {
    const port = createFakePort();
    port.createWindow = async () => {
      throw new Error('no window');
    };
    await expect(createEmptyWorkspace(port, 'New', 5)).rejects.toThrow('no window');
    expect(await listWorkspaces({ includeDeleted: true })).toEqual([]);
  });

  it('merges the window and the saved list when assigning', async () => {
    await putWorkspace(newWorkspace({ id: 'w', name: 'W', deviceId: 'd', now: 0, tabs: saved(['https://b.test/', 'https://c.test/']) }), 1);
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    expect(await assignWindow(port, windowId, 'w', 5)).toBe('assigned');
    const tabs = (await port.getWindow(windowId))!.tabs;
    expect(tabs.map((t) => t.url)).toEqual([managerUrl(base, 'w'), 'https://a.test/', 'https://b.test/', 'https://c.test/']);
    expect(tabs[3]!.discarded).toBe(true);
    expect((await getWorkspace('w'))!.tabs).toHaveLength(3);
  });

  it('keeps the address of each saved tab that assigning opens', async () => {
    await putWorkspace(newWorkspace({ id: 'w', name: 'W', deviceId: 'd', now: 0, tabs: saved(['https://b.test/', 'https://c.test/']) }), 1);
    const port = createFakePort({ commitLater: true, neverCommit: ['https://c.test/'] });
    const windowId = await windowWith(port, ['https://a.test/']);
    await assignWindow(port, windowId, 'w', 5);
    const tabs = (await port.getWindow(windowId))!.tabs;
    expect(tabs.map((t) => t.url)).toEqual([managerUrl(base, 'w'), 'https://a.test/', 'https://b.test/', 'https://c.test/']);
    expect(tabs.map((t) => t.discarded)).toEqual([false, false, true, false]);
  });

  it('changes nothing when the workspace is open in another window', async () => {
    await putWorkspace(newWorkspace({ id: 'w', name: 'W', deviceId: 'd', now: 0 }), 1);
    const port = createFakePort();
    const other = await windowWith(port, ['https://x.test/']);
    await bindWindow(other, 'w');
    const windowId = await windowWith(port, ['https://a.test/']);
    expect(await assignWindow(port, windowId, 'w', 5)).toBe('open-elsewhere');
    expect(await urlsIn(port, windowId)).toEqual(['https://a.test/']);
    expect(await windowForWorkspace('w')).toBe(other);
  });

  it('renames a workspace', async () => {
    await putWorkspace(newWorkspace({ id: 'w', name: 'W', deviceId: 'd', now: 0 }), 1);
    await renameWorkspace('w', 'Renamed', 5);
    expect((await getWorkspace('w'))!.name).toBe('Renamed');
  });

  it('deletes an open workspace and keeps its tabs open', async () => {
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, windowId, 'X', 5);
    await deleteWorkspace(port, wsId, 6);
    expect(await urlsIn(port, windowId)).toEqual(['https://a.test/']);
    expect((await getBindings()).size).toBe(0);
    expect((await getWorkspace(wsId))!.deleted).toBe(true);
    expect((await getSkipFallback()).has(wsId)).toBe(false);
  });
});
