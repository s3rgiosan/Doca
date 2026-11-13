/** The shortest time that a toast stays on screen. */
export const TOAST_MS = 10_000;

/** A reason to keep a toast on screen: the pointer is over it, or the focus is in it. */
export type HoldReason = 'hover' | 'focus';

export interface DismissTimer {
  /** Stops the countdown until each reason is released. */
  hold(reason: HoldReason): void;
  /** Starts the full countdown again when no reason holds the toast. */
  release(reason: HoldReason): void;
  stop(): void;
}

/**
 * Calls `onExpire` after `ms`. While the toast has the pointer or the focus, the countdown stops.
 * When both leave, the full countdown starts again, so the user always gets `ms` to read the toast.
 */
export function createDismissTimer(onExpire: () => void, ms: number = TOAST_MS): DismissTimer {
  const holds = new Set<HoldReason>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const start = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stopped = true;
      onExpire();
    }, ms);
  };
  start();

  return {
    hold(reason) {
      holds.add(reason);
      clearTimeout(timer);
    },
    release(reason) {
      holds.delete(reason);
      if (!stopped && holds.size === 0) {
        start();
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
