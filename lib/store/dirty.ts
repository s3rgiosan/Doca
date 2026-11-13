import { storage } from 'wxt/utils/storage';
import { serial } from './queue';

/** Time between the last tab change and the save of the workspace. */
export const SAVE_DEBOUNCE_MS = 1000;

// Each write copies the stored record first, because `getValue` returns the shared fallback object when the key is missing.
// Workspace ID to due time. It is in local storage, so pending saves survive a stopped service worker.
const dirtyItem = storage.defineItem<Record<string, number>>('local:dirty', { fallback: {} });

export function markDirty(wsId: string, now: number): Promise<void> {
  return serial(async () => {
    const dirty = { ...(await dirtyItem.getValue()) };
    dirty[wsId] = now + SAVE_DEBOUNCE_MS;
    await dirtyItem.setValue(dirty);
  });
}

/** Returns the workspaces that are due and removes their flags. */
export function takeDue(now: number): Promise<string[]> {
  return serial(async () => {
    const dirty = { ...(await dirtyItem.getValue()) };
    const due = Object.keys(dirty).filter((wsId) => dirty[wsId]! <= now);
    for (const wsId of due) {
      delete dirty[wsId];
    }
    if (due.length > 0) {
      await dirtyItem.setValue(dirty);
    }
    return due;
  });
}

export async function nextDue(): Promise<number | null> {
  const times = Object.values(await dirtyItem.getValue());
  return times.length > 0 ? Math.min(...times) : null;
}
