import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { moveTabs } from '@/lib/actions/move';
import { saveWindow } from '@/lib/actions/save';
import { switchWindow } from '@/lib/actions/switch';
import { createFromWindow } from '@/lib/actions/window';
import { createActionQueue } from '@/lib/background/actions';
import { newWorkspace } from '@/lib/model/workspace';
import { markStartupDone } from '@/lib/store/session';
import { getWorkspace, putWorkspace } from '@/lib/store/workspaces';
import { createFakePort, type FakePort } from '../helpers/fake-port';

async function windowWith(port: FakePort, urls: string[]) {
  const win = await port.createWindow(urls[0]!);
  for (const url of urls.slice(1)) {
    await port.createTab({ windowId: win.id, url, active: false });
  }
  return win.id;
}

describe('createActionQueue', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await markStartupDone();
  });

  it('starts an action only after the previous one ends', async () => {
    const run = createActionQueue();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = run(async () => {
      log.push('first start');
      await gate;
      log.push('first end');
      return 1;
    });
    const second = run(async () => {
      log.push('second start');
      return 2;
    });
    await Promise.resolve();
    expect(log).toEqual(['first start']);
    release();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(log).toEqual(['first start', 'first end', 'second start']);
  });

  it('keeps going after an action fails', async () => {
    const run = createActionQueue();
    const failed = run(() => Promise.reject(new Error('boom')));
    const next = run(async () => 'next');
    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('next');
  });

  it('keeps a tab that moves into a workspace while the workspace opens', async () => {
    const tabs = [{ id: 'b1', url: 'https://example.com/?b1', finalUrl: 'https://example.com/?b1', title: 'B1', pinned: false, index: 0 }];
    await putWorkspace(newWorkspace({ id: 'b', name: 'B', deviceId: 'd', now: 0, tabs }), 1);
    const port = createFakePort();
    const win = await windowWith(port, ['https://example.com/?a1']);
    await createFromWindow(port, win, 'A', 2);
    const other = await windowWith(port, ['https://example.com/?x1', 'https://example.com/?moved']);
    const moved = (await port.getWindow(other))!.tabs[1]!;
    const run = createActionQueue();

    await Promise.all([run(() => switchWindow(port, win, 'b', 5)), run(() => moveTabs(port, [moved.id], 'b', 5))]);
    await saveWindow(port, win, 7);

    expect((await getWorkspace('b'))!.tabs.map((t) => t.url)).toEqual(['https://example.com/?b1', 'https://example.com/?moved']);
  });

  it('runs two quick switches from one window one after the other', async () => {
    for (const id of ['b', 'c']) {
      const url = `https://example.com/?${id}1`;
      await putWorkspace(newWorkspace({ id, name: id, deviceId: 'd', now: 0, tabs: [{ id: `${id}1`, url, finalUrl: url, title: id, pinned: false, index: 0 }] }), 1);
    }
    const port = createFakePort();
    const win = await windowWith(port, ['https://example.com/?a1']);
    const a = await createFromWindow(port, win, 'A', 2);
    const run = createActionQueue();

    await Promise.allSettled([run(() => switchWindow(port, win, 'b', 5)), run(() => switchWindow(port, win, 'c', 5))]);
    await saveWindow(port, win, 7);

    expect((await port.getWindow(win))!.tabs.slice(1).map((t) => t.url)).toEqual(['https://example.com/?c1']);
    expect((await getWorkspace('b'))!.tabs.map((t) => t.url)).toEqual(['https://example.com/?b1']);
    expect((await getWorkspace('c'))!.tabs.map((t) => t.url)).toEqual(['https://example.com/?c1']);
    expect((await getWorkspace(a))!.tabs.map((t) => t.url)).toEqual(['https://example.com/?a1']);
  });
});
