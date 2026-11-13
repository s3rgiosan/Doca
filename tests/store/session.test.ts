import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getSkipFallback, setSkipFallback } from '@/lib/store/device';
import { markDirty, nextDue, takeDue } from '@/lib/store/dirty';
import {
  bindWindow,
  forgetTabIds,
  getBindings,
  getTabMap,
  isStartupDone,
  markStartupDone,
  setTabIds,
  unbindWindow,
  windowForWorkspace,
} from '@/lib/store/session';

describe('session store', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('binds a workspace to one window only', async () => {
    await bindWindow(1, 'a');
    await bindWindow(2, 'a');
    expect([...(await getBindings())]).toEqual([[2, 'a']]);
    expect(await windowForWorkspace('a')).toBe(2);
  });

  it('unbinds a window', async () => {
    await bindWindow(1, 'a');
    await unbindWindow(1);
    expect(await windowForWorkspace('a')).toBeNull();
  });

  it('maps browser tab IDs to saved tab IDs', async () => {
    await setTabIds([
      [5, 't5'],
      [6, 't6'],
    ]);
    await forgetTabIds([5]);
    expect([...(await getTabMap())]).toEqual([[6, 't6']]);
  });

  it('records when startup is done', async () => {
    expect(await isStartupDone()).toBe(false);
    await markStartupDone();
    expect(await isStartupDone()).toBe(true);
  });
});

describe('skip fallback flags', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('adds and removes a workspace', async () => {
    await setSkipFallback('a', true);
    await setSkipFallback('b', true);
    await setSkipFallback('a', false);
    expect([...(await getSkipFallback())]).toEqual(['b']);
  });
});

describe('dirty flags', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('gives a workspace when its debounced due time passes', async () => {
    await markDirty('a', 0);
    await markDirty('a', 500);
    expect(await nextDue()).toBe(1500);
    expect(await takeDue(1000)).toEqual([]);
    expect(await takeDue(1500)).toEqual(['a']);
    expect(await takeDue(9999)).toEqual([]);
    expect(await nextDue()).toBeNull();
  });
});
