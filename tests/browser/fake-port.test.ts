import { describe, expect, it } from 'vitest';
import { createFakePort } from '../helpers/fake-port';

async function windowWithTabs(urls: string[]) {
  const port = createFakePort();
  const win = await port.createWindow(urls[0]!);
  for (const url of urls.slice(1)) {
    await port.createTab({ windowId: win.id, url, active: false });
  }
  return { port, windowId: win.id };
}

const urlsOf = async (port: ReturnType<typeof createFakePort>, windowId: number) =>
  (await port.getWindow(windowId))!.tabs.map((t) => [t.index, t.url]);

describe('fake port', () => {
  it('keeps indexes in order after a move and a remove', async () => {
    const { port, windowId } = await windowWithTabs(['a', 'b', 'c']);
    const other = await port.createWindow('x');
    const tabs = (await port.getWindow(windowId))!.tabs;
    await port.moveTabs([tabs[0]!.id], other.id, -1);
    expect(await urlsOf(port, windowId)).toEqual([
      [0, 'b'],
      [1, 'c'],
    ]);
    expect(await urlsOf(port, other.id)).toEqual([
      [0, 'x'],
      [1, 'a'],
    ]);
    await port.removeTabs([tabs[1]!.id]);
    expect(await urlsOf(port, windowId)).toEqual([[0, 'c']]);
  });

  it('inserts a tab at an index', async () => {
    const { port, windowId } = await windowWithTabs(['a', 'b']);
    await port.createTab({ windowId, url: 'm', index: 0, pinned: true, active: false });
    expect(await urlsOf(port, windowId)).toEqual([
      [0, 'm'],
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('rejects a URL in failUrls', async () => {
    const port = createFakePort({ failUrls: ['bad'] });
    const win = await port.createWindow('a');
    await expect(port.createTab({ windowId: win.id, url: 'bad', active: false })).rejects.toThrow();
  });

  it('does not discard the active tab', async () => {
    const { port, windowId } = await windowWithTabs(['a']);
    const tab = (await port.getWindow(windowId))!.tabs[0]!;
    expect(await port.discardTab(tab.id)).toBeNull();
  });

  it('can give a new ID on discard', async () => {
    const port = createFakePort({ discardChangesId: true });
    const win = await port.createWindow('a');
    const tab = await port.createTab({ windowId: win.id, url: 'b', active: false });
    const after = await port.discardTab(tab.id);
    expect(after!.id).not.toBe(tab.id);
    expect(after!.discarded).toBe(true);
    expect(await port.getWindow(win.id).then((w) => w!.tabs.map((t) => t.id))).toContain(after!.id);
  });

  it('activates one tab per window', async () => {
    const { port, windowId } = await windowWithTabs(['a', 'b']);
    const tabs = (await port.getWindow(windowId))!.tabs;
    await port.activateTab(tabs[1]!.id);
    const after = (await port.getWindow(windowId))!.tabs;
    expect(after.map((t) => t.active)).toEqual([false, true]);
  });

  it('restores and focuses a minimized window', async () => {
    const { port, windowId } = await windowWithTabs(['a']);
    port.windows.find((w) => w.id === windowId)!.minimized = true;
    await port.focusWindow(windowId);
    const win = (await port.getWindow(windowId))!;
    expect(win.minimized).toBe(false);
    expect(win.focused).toBe(true);
  });

  it('removes no tab when one ID is closed, as Chrome does', async () => {
    const { port, windowId } = await windowWithTabs(['a', 'b']);
    const live = (await port.getWindow(windowId))!.tabs[1]!.id;
    await expect(port.removeTabs([live, 9999])).rejects.toThrow('No tab with id: 9999');
    expect(await urlsOf(port, windowId)).toEqual([
      [0, 'a'],
      [1, 'b'],
    ]);
  });
});
