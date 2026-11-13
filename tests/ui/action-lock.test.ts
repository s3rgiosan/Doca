import { describe, expect, it } from 'vitest';
import { createActionLock } from '@/lib/ui/action-lock';

describe('createActionLock', () => {
  it('runs one action at a time and ignores a repeat while it runs', async () => {
    const lock = createActionLock();
    let release: () => void = () => {};
    let calls = 0;
    const first = lock.run(
      () =>
        new Promise<string>((resolve) => {
          calls++;
          release = () => resolve('done');
        }),
    );
    expect(lock.busy()).toBe(true);
    const second = await lock.run(async () => {
      calls++;
      return 'again';
    });
    expect(second).toBeUndefined();
    release();
    expect(await first).toBe('done');
    expect(calls).toBe(1);
    expect(lock.busy()).toBe(false);
  });

  it('frees the lock when the action throws', async () => {
    const lock = createActionLock();
    await expect(
      lock.run(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(lock.busy()).toBe(false);
    expect(await lock.run(async () => 1)).toBe(1);
  });

  it('reports the busy state to a listener', async () => {
    const seen: boolean[] = [];
    const lock = createActionLock((busy) => seen.push(busy));
    await lock.run(async () => 1);
    expect(seen).toEqual([true, false]);
  });
});
