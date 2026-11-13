import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDismissTimer, TOAST_MS } from '@/lib/ui/dismiss-timer';

describe('createDismissTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits at least 10 seconds', () => {
    expect(TOAST_MS).toBeGreaterThanOrEqual(10_000);
    const expire = vi.fn();
    createDismissTimer(expire);
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('does not expire while the pointer or the focus holds it', () => {
    const expire = vi.fn();
    const timer = createDismissTimer(expire);
    vi.advanceTimersByTime(TOAST_MS - 100);
    timer.hold('hover');
    timer.hold('focus');
    vi.advanceTimersByTime(TOAST_MS * 5);
    timer.release('hover');
    vi.advanceTimersByTime(TOAST_MS * 5);
    expect(expire).not.toHaveBeenCalled();
  });

  it('starts the full time again when the last hold ends', () => {
    const expire = vi.fn();
    const timer = createDismissTimer(expire);
    timer.hold('focus');
    vi.advanceTimersByTime(TOAST_MS * 2);
    timer.release('focus');
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('never expires after a stop', () => {
    const expire = vi.fn();
    const timer = createDismissTimer(expire);
    timer.stop();
    timer.hold('hover');
    timer.release('hover');
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(expire).not.toHaveBeenCalled();
  });
});
