import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { moveTabsToNewWorkspace, moveTabsWithUndo, undoMove } from '@/lib/actions/move';
import { openWorkspace } from '@/lib/actions/open';
import { createFromWindow, deleteWorkspace, restoreWorkspace } from '@/lib/actions/window';
import { handleMessage } from '@/lib/messages';
import { parseManagerUrl } from '@/lib/model/manager-url';
import { newWorkspace, type SavedTab, type Workspace } from '@/lib/model/workspace';
import { getSkipFallback, setSkipFallback } from '@/lib/store/device';
import { bindWindow, getBindings, getDeleted, markStartupDone, windowForWorkspace } from '@/lib/store/session';
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
const tabsIn = async (port: FakePort, windowId: number) => (await port.getWindow(windowId))!.tabs;
const urlsIn = async (port: FakePort, windowId: number) => (await tabsIn(port, windowId)).map((t) => t.url);

/**
 * The per-ID merge rule of the sync plan: a tombstone is final, so a deleted copy beats any copy that
 * is not deleted. Otherwise the higher rev wins.
 */
function mergeById(local: Workspace[], remote: Workspace[]): Workspace[] {
  const merged = new Map<string, Workspace>();
  for (const ws of [...local, ...remote]) {
    const other = merged.get(ws.id);
    if (!other) {
      merged.set(ws.id, ws);
    } else if (ws.deleted !== other.deleted) {
      merged.set(ws.id, ws.deleted ? ws : other);
    } else if (ws.rev > other.rev) {
      merged.set(ws.id, ws);
    }
  }
  return [...merged.values()];
}

describe('restoreWorkspace', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  it('restores a closed workspace with its name, colour and tabs', async () => {
    const port = createFakePort();
    const ws = newWorkspace({ id: 'w', name: 'Work', deviceId: 'd', now: 0, tabs: saved(['https://a.test/']), color: 'teal' });
    await putWorkspace(ws, 1);
    await deleteWorkspace(port, 'w', 2);
    expect((await getWorkspace('w'))!.tabs).toEqual([]);

    const id = await restoreWorkspace(port, 'w', 3);
    const restored = (await getWorkspace(id))!;
    expect(id).not.toBe('w');
    expect(restored).toMatchObject({ name: 'Work', color: 'teal', deleted: false, deletedAt: null });
    expect(restored.tabs).toEqual(saved(['https://a.test/']));
    expect((await getWorkspace('w'))!.deleted).toBe(true);
    expect((await listWorkspaces()).map((w) => w.id)).toEqual([id]);
    expect(await getDeleted('w')).toBeNull();
  });

  it('writes a restored copy that a merge with the tombstone keeps', async () => {
    const port = createFakePort();
    await putWorkspace(newWorkspace({ id: 'w', name: 'Work', deviceId: 'd', now: 0, tabs: saved(['https://a.test/']) }), 1);
    await deleteWorkspace(port, 'w', 2);
    const tombstone = (await getWorkspace('w'))!;
    const id = await restoreWorkspace(port, 'w', 3);
    const local = await listWorkspaces({ includeDeleted: true });

    // Another device has the tombstone with a higher rev.
    const merged = mergeById(local, [{ ...tombstone, rev: tombstone.rev + 5, deviceId: 'other' }]);
    const live = merged.filter((ws) => !ws.deleted);
    expect(live.map((ws) => ws.id)).toEqual([id]);
    expect(live[0]!.tabs.map((t) => t.url)).toEqual(['https://a.test/']);
    expect(merged.find((ws) => ws.id === 'w')!.deleted).toBe(true);
  });

  it('binds the window again and brings back its manager tab', async () => {
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    const wsId = await createFromWindow(port, windowId, 'Open', 1);
    await deleteWorkspace(port, wsId, 2);
    expect((await urlsIn(port, windowId)).some((url) => parseManagerUrl(base, url) !== null)).toBe(false);

    const id = await restoreWorkspace(port, wsId, 3);
    expect(await windowForWorkspace(id)).toBe(windowId);
    const tabs = await tabsIn(port, windowId);
    expect(parseManagerUrl(base, tabs[0]!.url)).toBe(id);
    expect(tabs[0]!.pinned).toBe(true);
    expect(tabs.slice(1).map((t) => t.url)).toEqual(['https://a.test/', 'https://b.test/']);
    expect((await getWorkspace(id))!.tabs.map((t) => t.url)).toEqual(['https://a.test/', 'https://b.test/']);
    expect((await getSkipFallback()).has(id)).toBe(false);
  });

  it('restores the workspace closed when its window now shows another workspace', async () => {
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, windowId, 'Open', 1);
    await deleteWorkspace(port, wsId, 2);
    await putWorkspace(newWorkspace({ id: 'other', name: 'Other', deviceId: 'd', now: 0 }), 3);
    await bindWindow(windowId, 'other');

    const id = await restoreWorkspace(port, wsId, 4);
    expect((await getBindings()).get(windowId)).toBe('other');
    expect(await windowForWorkspace(id)).toBeNull();
    expect((await getWorkspace(id))!.tabs.map((t) => t.url)).toEqual(['https://a.test/']);
    expect((await getSkipFallback()).has(id)).toBe(true);
  });

  it('restores the workspace closed when its window closed', async () => {
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, windowId, 'Open', 1);
    await deleteWorkspace(port, wsId, 2);
    port.windows.splice(0, port.windows.length);

    const id = await restoreWorkspace(port, wsId, 3);
    expect(await windowForWorkspace(id)).toBeNull();
    expect((await getWorkspace(id))!.tabs.map((t) => t.url)).toEqual(['https://a.test/']);
  });

  it('keeps the skip flag of a closed workspace', async () => {
    const port = createFakePort();
    await putWorkspace(newWorkspace({ id: 'w', name: 'Work', deviceId: 'd', now: 0 }), 1);
    await setSkipFallback('w', true);
    await deleteWorkspace(port, 'w', 2);
    const id = await restoreWorkspace(port, 'w', 3);
    expect((await getSkipFallback()).has(id)).toBe(true);
  });

  it('restores a workspace once only', async () => {
    const port = createFakePort();
    await putWorkspace(newWorkspace({ id: 'w', name: 'Work', deviceId: 'd', now: 0 }), 1);
    await deleteWorkspace(port, 'w', 2);
    await restoreWorkspace(port, 'w', 3);
    await expect(restoreWorkspace(port, 'w', 4)).rejects.toThrow('can no longer be restored');
    expect(await listWorkspaces()).toHaveLength(1);
  });

  it('refuses a workspace that is not deleted', async () => {
    const port = createFakePort();
    await putWorkspace(newWorkspace({ id: 'w', name: 'Work', deviceId: 'd', now: 0 }), 1);
    await expect(restoreWorkspace(port, 'w', 2)).rejects.toThrow('can no longer be restored');
  });

  it('answers the restore-workspace message with the new ID', async () => {
    const port = createFakePort();
    await putWorkspace(newWorkspace({ id: 'w', name: 'Work', deviceId: 'd', now: 0 }), 1);
    await handleMessage({ type: 'delete', wsId: 'w' }, port, () => 2);
    const reply = await handleMessage({ type: 'restore-workspace', wsId: 'w' }, port, () => 3);
    expect(reply.ok).toBe(true);
    const id = (reply as { value: string }).value;
    expect((await getWorkspace(id))!.name).toBe('Work');
  });
});

describe('undoMove', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  async function openPair(port: FakePort) {
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    const sourceWs = await createFromWindow(port, source, 'Source', 1);
    const target = await windowWith(port, ['https://t.test/']);
    const targetWs = await createFromWindow(port, target, 'Target', 1);
    return { source, sourceWs, target, targetWs };
  }

  it('moves tabs back out of the window of an open workspace', async () => {
    const port = createFakePort();
    const { source, target, targetWs } = await openPair(port);
    const b = (await tabsIn(port, source)).find((t) => t.url === 'https://b.test/')!;
    const { undo } = await moveTabsWithUndo(port, [b.id], targetWs, 2);
    expect(undo).toMatchObject({ wsId: targetWs, windowId: source, tabIds: [b.id], savedIds: [] });

    expect(await undoMove(port, undo!, 3)).toEqual({ moved: 1 });
    expect(await urlsIn(port, target)).not.toContain('https://b.test/');
    expect((await tabsIn(port, source)).find((t) => t.id === b.id)?.url).toBe('https://b.test/');
  });

  it('opens tabs again and takes them out of the saved list of a closed workspace', async () => {
    const port = createFakePort();
    await putWorkspace(newWorkspace({ id: 'closed', name: 'Closed', deviceId: 'd', now: 0, tabs: saved(['https://x.test/']) }), 1);
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/', 'https://c.test/']);
    await createFromWindow(port, source, 'Source', 1);
    const ids = (await tabsIn(port, source)).filter((t) => t.url === 'https://b.test/' || t.url === 'https://c.test/').map((t) => t.id);
    const { undo } = await moveTabsWithUndo(port, ids, 'closed', 2);
    expect(undo!.savedIds).toHaveLength(2);
    expect(await urlsIn(port, source)).not.toContain('https://b.test/');

    expect(await undoMove(port, undo!, 3)).toEqual({ moved: 2 });
    const urls = await urlsIn(port, source);
    expect(urls.slice(-2)).toEqual(['https://b.test/', 'https://c.test/']);
    expect((await getWorkspace('closed'))!.tabs).toEqual(saved(['https://x.test/']));
  });

  it('keeps a tab that fails to open in the saved list', async () => {
    const port = createFakePort({ failUrls: ['https://bad.test/'] });
    await putWorkspace(newWorkspace({ id: 'closed', name: 'Closed', deviceId: 'd', now: 0 }), 1);
    const source = await windowWith(port, ['https://bad.test/', 'https://a.test/', 'https://b.test/']);
    const ids = (await tabsIn(port, source)).filter((t) => t.url !== 'https://b.test/').map((t) => t.id);
    const { undo } = await moveTabsWithUndo(port, ids, 'closed', 2);

    expect(await undoMove(port, undo!, 3)).toEqual({ moved: 1 });
    expect(await urlsIn(port, source)).toEqual(['https://b.test/', 'https://a.test/']);
    expect((await getWorkspace('closed'))!.tabs.map((t) => [t.url, t.index])).toEqual([['https://bad.test/', 0]]);
  });

  it('moves tabs back from a closed workspace that opened after the move', async () => {
    const port = createFakePort();
    await putWorkspace(newWorkspace({ id: 'closed', name: 'Closed', deviceId: 'd', now: 0 }), 1);
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    await createFromWindow(port, source, 'Source', 1);
    const b = (await tabsIn(port, source)).find((t) => t.url === 'https://b.test/')!;
    const { undo } = await moveTabsWithUndo(port, [b.id], 'closed', 2);
    const opened = await openWorkspace(port, 'closed');
    expect(await urlsIn(port, opened)).toContain('https://b.test/');

    expect(await undoMove(port, undo!, 3)).toEqual({ moved: 1 });
    expect(await urlsIn(port, opened)).not.toContain('https://b.test/');
    expect(await urlsIn(port, source)).toContain('https://b.test/');
  });

  it('deletes the workspace that the move created when the undo leaves it empty', async () => {
    const port = createFakePort();
    const source = await windowWith(port, ['https://a.test/', 'https://b.test/']);
    await createFromWindow(port, source, 'Source', 1);
    const b = (await tabsIn(port, source)).find((t) => t.url === 'https://b.test/')!;
    const { wsId, undo } = await moveTabsToNewWorkspace(port, [b.id], 'Fresh', 2);
    expect(undo!.created).toBe(true);

    await undoMove(port, undo!, 3);
    expect((await getWorkspace(wsId))!.deleted).toBe(true);
    expect(await urlsIn(port, source)).toContain('https://b.test/');
  });

  it('refuses when the source window shows another workspace now', async () => {
    const port = createFakePort();
    const { source, targetWs } = await openPair(port);
    const b = (await tabsIn(port, source)).find((t) => t.url === 'https://b.test/')!;
    const { undo } = await moveTabsWithUndo(port, [b.id], targetWs, 2);
    await putWorkspace(newWorkspace({ id: 'other', name: 'Other', deviceId: 'd', now: 0 }), 3);
    await bindWindow(source, 'other');
    await expect(undoMove(port, undo!, 4)).rejects.toThrow('shows another workspace');
  });

  it('refuses when no tab of the move is left in the target', async () => {
    const port = createFakePort();
    const { source, target, targetWs } = await openPair(port);
    const b = (await tabsIn(port, source)).find((t) => t.url === 'https://b.test/')!;
    const { undo } = await moveTabsWithUndo(port, [b.id], targetWs, 2);
    await port.removeTabs([(await tabsIn(port, target)).find((t) => t.id === b.id)!.id]);
    await expect(undoMove(port, undo!, 3)).rejects.toThrow('no longer in “Target”');
  });

  it('answers move-tabs with the undo and moves back on undo-move', async () => {
    const port = createFakePort();
    const { source, target, targetWs } = await openPair(port);
    const b = (await tabsIn(port, source)).find((t) => t.url === 'https://b.test/')!;
    const reply = await handleMessage({ type: 'move-tabs', tabIds: [b.id], wsId: targetWs }, port, () => 2);
    expect(reply).toMatchObject({ ok: true, value: { moved: 1, undo: { wsId: targetWs } } });
    const { undo } = (reply as { value: { undo: Parameters<typeof undoMove>[1] } }).value;
    expect(await handleMessage({ type: 'undo-move', undo }, port, () => 3)).toEqual({ ok: true, value: { moved: 1 } });
    expect(await urlsIn(port, target)).not.toContain('https://b.test/');
  });
});
