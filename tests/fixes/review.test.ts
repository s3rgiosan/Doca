import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { moveTabs } from '@/lib/actions/move';
import { openWorkspace } from '@/lib/actions/open';
import { flushDue, saveWindow } from '@/lib/actions/save';
import { createFromWindow, deleteWorkspace, renameWorkspace } from '@/lib/actions/window';
import { createBoot } from '@/lib/background/boot';
import { onWindowRemoved, runStartup } from '@/lib/background/events';
import { toPortTab } from '@/lib/browser/port';
import { captureTabs } from '@/lib/model/capture';
import { newWorkspace, type SavedTab } from '@/lib/model/workspace';
import { createMessageListener } from '@/lib/messages';
import { getSkipFallback } from '@/lib/store/device';
import { bindWindow, getBindings, isStartupDone, markStartupDone } from '@/lib/store/session';
import { getWorkspace, putWorkspace } from '@/lib/store/workspaces';
import { createFakePort, FAKE_MANAGER_BASE as base, type FakePort } from '../helpers/fake-port';

const saved = (urls: string[]): SavedTab[] => urls.map((url, index) => ({ id: `s${index}`, url, finalUrl: url, title: url, pinned: false, index }));
async function windowWith(port: FakePort, urls: string[]) {
  const win = await port.createWindow(urls[0]!);
  for (const url of urls.slice(1)) {
    await port.createTab({ windowId: win.id, url, active: false });
  }
  return win.id;
}

/** Starts a save that has read the workspace and now waits on its window read until finish() is called. */
function gatedSave(port: FakePort, windowId: number) {
  const realGetWindow = port.getWindow.bind(port);
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let reached!: () => void;
  const waiting = new Promise<void>((resolve) => (reached = resolve));
  port.getWindow = async (id) => {
    // Only the save's first window read waits. Other calls go straight through.
    port.getWindow = realGetWindow;
    reached();
    await gate;
    return realGetWindow(id);
  };
  const running = saveWindow(port, windowId, 2);
  void running.catch(() => undefined);
  return {
    waiting,
    async finish() {
      open();
      await running;
    },
  };
}

describe('review fixes', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('keeps a saved tab that failed to open', async () => {
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0, tabs: saved(['https://t0.test/', 'bad://x', 'https://t2.test/']) }), 1);
    await markStartupDone();
    const port = createFakePort({ failUrls: ['bad://x'] });
    await openWorkspace(port, 'a');
    await flushDue(port, Date.now() + 5000);
    expect((await getWorkspace('a'))!.tabs.map((t) => t.url)).toEqual(['https://t0.test/', 'https://t2.test/', 'bad://x']);
  });

  it('merges a window bound by URL overlap at startup instead of overwriting the workspace', async () => {
    await putWorkspace(newWorkspace({ id: 'a', name: 'A', deviceId: 'd', now: 0, tabs: saved(['https://a.test/', 'https://b.test/']) }), 1);
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    await runStartup(port, 5);
    expect((await getBindings()).get(windowId)).toBe('a');
    await flushDue(port, 10_000);
    expect((await getWorkspace('a'))!.tabs.map((t) => t.url).sort()).toEqual(['https://a.test/', 'https://b.test/']);
  });

  it('flags a workspace for the overlap fallback when its window closes', async () => {
    await bindWindow(1, 'a');
    await onWindowRemoved(1);
    expect((await getSkipFallback()).has('a')).toBe(true);
  });

  it('answers a message through sendResponse and keeps the channel open', async () => {
    const listener = createMessageListener(async () => ({ ok: true, value: 7 }));
    const sendResponse = vi.fn();
    expect(listener({ type: 'export' }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true, value: 7 }));
  });

  it('reads pendingUrl when the URL is empty', () => {
    const tab = toPortTab({ id: 1, windowId: 1, index: 0, url: '', pendingUrl: 'https://p.test/', pinned: false, active: false, discarded: true } as never);
    expect(tab.url).toBe('https://p.test/');
  });

  it('keeps the saved URL of a tab whose live URL is empty', () => {
    const result = captureTabs([{ id: 2, index: 0, url: '', title: '', pinned: false }], saved(['https://a.test/']), new Map([[2, 's0']]), base, () => 'n');
    expect(result.tabs[0]).toMatchObject({ id: 's0', finalUrl: 'https://a.test/' });
  });

  it('does not move or close a tab with no URL into a closed workspace', async () => {
    await putWorkspace(newWorkspace({ id: 'closed', name: 'C', deviceId: 'd', now: 0 }), 1);
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/', '']);
    const empty = (await port.getWindow(windowId))!.tabs[1]!;
    expect(await moveTabs(port, [empty.id], 'closed', 2)).toEqual({ moved: 0 });
    expect((await port.getWindow(windowId))!.tabs).toHaveLength(2);
  });

  it('starts again after a failed boot', async () => {
    let calls = 0;
    const boot = createBoot(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('first start fails');
      }
    });
    await expect(boot()).rejects.toThrow();
    await expect(boot()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it('finishes startup when removing a stale manager tab fails', async () => {
    const port = createFakePort();
    await windowWith(port, [`${base}?ws=gone`, 'https://x.test/']);
    port.removeTabs = async () => {
      throw new Error('No tab');
    };
    await runStartup(port, 5);
    expect(await isStartupDone()).toBe(true);
  });

  it('does not bring back a workspace deleted while a save runs', async () => {
    await markStartupDone();
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, windowId, 'X', 1);
    await port.createTab({ windowId, url: 'https://b.test/', active: false });
    const save = gatedSave(port, windowId);
    await save.waiting;
    await deleteWorkspace(port, wsId, 3);
    await save.finish();
    expect((await getWorkspace(wsId))!.deleted).toBe(true);
  });

  it('keeps a rename that runs during a save', async () => {
    await markStartupDone();
    const port = createFakePort();
    const windowId = await windowWith(port, ['https://a.test/']);
    const wsId = await createFromWindow(port, windowId, 'X', 1);
    await port.createTab({ windowId, url: 'https://b.test/', active: false });
    const save = gatedSave(port, windowId);
    await save.waiting;
    await renameWorkspace(wsId, 'Renamed', 3);
    await save.finish();
    const ws = (await getWorkspace(wsId))!;
    expect(ws.name).toBe('Renamed');
    expect(ws.tabs).toHaveLength(2);
  });
});
