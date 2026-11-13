import { useMemo, useState } from 'preact/hooks';
import { createActionLock, type ActionLock } from './action-lock';

/** Returns the busy state and a function that runs one async action at a time. */
export function useAction(): [boolean, ActionLock['run']] {
  const [busy, setBusy] = useState(false);
  const lock = useMemo(() => createActionLock(setBusy), []);
  return [busy, lock.run];
}
