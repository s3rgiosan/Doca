import { storage } from 'wxt/utils/storage';
import type { Workspace } from '../model/workspace';
import { serial } from './queue';

// Each write copies the stored record first, because `getValue` returns the shared fallback object when the key is missing.
// Session storage is cleared when the browser restarts, because window and tab IDs change then.
const bindingsItem = storage.defineItem<Record<string, string>>('session:bindings', { fallback: {} });
const tabMapItem = storage.defineItem<Record<string, string>>('session:tabMap', { fallback: {} });
const restoringItem = storage.defineItem<Record<string, number>>('session:restoring', { fallback: {} });
const notOpenedItem = storage.defineItem<Record<string, string[]>>('session:notOpened', { fallback: {} });
const startupItem = storage.defineItem<boolean>('session:startupDone', { fallback: false });
const deletedItem = storage.defineItem<Record<string, DeletedWorkspace>>('session:deleted', { fallback: {} });

function toMap(record: Record<string, string>): Map<number, string> {
  return new Map(Object.entries(record).map(([id, value]) => [Number(id), value]));
}

/** Window ID to workspace ID. */
export async function getBindings(): Promise<Map<number, string>> {
  return toMap(await bindingsItem.getValue());
}

/** Binds the window. A workspace has one window at most, so an older binding of the workspace is removed. */
export function bindWindow(windowId: number, wsId: string): Promise<void> {
  return serial(async () => {
    const bindings = { ...(await bindingsItem.getValue()) };
    for (const [id, bound] of Object.entries(bindings)) {
      if (bound === wsId) {
        delete bindings[id];
      }
    }
    bindings[String(windowId)] = wsId;
    await bindingsItem.setValue(bindings);
  });
}

export function unbindWindow(windowId: number): Promise<void> {
  return serial(async () => {
    const bindings = { ...(await bindingsItem.getValue()) };
    delete bindings[String(windowId)];
    await bindingsItem.setValue(bindings);
  });
}

export async function windowForWorkspace(wsId: string): Promise<number | null> {
  for (const [windowId, bound] of await getBindings()) {
    if (bound === wsId) {
      return windowId;
    }
  }
  return null;
}

/** Browser tab ID to saved tab ID. */
export async function getTabMap(): Promise<Map<number, string>> {
  return toMap(await tabMapItem.getValue());
}

export function setTabIds(entries: Array<[number, string]>): Promise<void> {
  return serial(async () => {
    const map = { ...(await tabMapItem.getValue()) };
    for (const [tabId, savedId] of entries) {
      map[String(tabId)] = savedId;
    }
    await tabMapItem.setValue(map);
  });
}

export function forgetTabIds(browserTabIds: number[]): Promise<void> {
  return serial(async () => {
    const map = { ...(await tabMapItem.getValue()) };
    for (const tabId of browserTabIds) {
      delete map[String(tabId)];
    }
    await tabMapItem.setValue(map);
  });
}

export async function isStartupDone(): Promise<boolean> {
  return startupItem.getValue();
}

export function markStartupDone(): Promise<void> {
  return serial(() => startupItem.setValue(true));
}

/** How long a restore can block saves. A stopped worker cannot clear the flag, so the flag expires. */
export const RESTORE_GUARD_MS = 60_000;

/** Marks a workspace as being restored, so that a save does not capture a half-built window. */
export function setRestoring(wsId: string, now: number | null): Promise<void> {
  return serial(async () => {
    const restoring = { ...(await restoringItem.getValue()) };
    if (now === null) {
      delete restoring[wsId];
    } else {
      restoring[wsId] = now + RESTORE_GUARD_MS;
    }
    await restoringItem.setValue(restoring);
  });
}

export async function isRestoring(wsId: string, now: number): Promise<boolean> {
  const until = (await restoringItem.getValue())[wsId];
  return until !== undefined && now < until;
}

/**
 * Saved tabs that could not open in the window of their workspace. A save keeps them in the saved
 * list, so a URL that the browser refuses to open is not lost.
 */
export async function getNotOpened(wsId: string): Promise<Set<string>> {
  return new Set((await notOpenedItem.getValue())[wsId] ?? []);
}

/** Replaces the list when `replace` is true, else adds to it. */
export function setNotOpened(wsId: string, savedIds: string[], replace: boolean): Promise<void> {
  return serial(async () => {
    const all = { ...(await notOpenedItem.getValue()) };
    const ids = new Set(replace ? [] : (all[wsId] ?? []));
    savedIds.forEach((id) => ids.add(id));
    all[wsId] = [...ids];
    await notOpenedItem.setValue(all);
  });
}

/** A workspace as it was before its delete, so that an undo can restore it. */
export interface DeletedWorkspace {
  /** The record before the delete, with its tabs. */
  ws: Workspace;
  /** The window that showed the workspace, or null when it was closed. */
  windowId: number | null;
  /** The skip flag of the startup overlap fallback before the delete. */
  skipFallback: boolean;
  /** Saved tab IDs that could not open in the window of the workspace. */
  notOpened: string[];
  deletedAt: number;
}

/** The number of deleted workspaces that an undo can restore. Older ones are forgotten. */
export const DELETED_KEPT = 10;

export function rememberDeleted(entry: DeletedWorkspace): Promise<void> {
  return serial(async () => {
    const all = { ...(await deletedItem.getValue()), [entry.ws.id]: entry };
    const newest = Object.values(all)
      .sort((a, b) => b.deletedAt - a.deletedAt)
      .slice(0, DELETED_KEPT);
    await deletedItem.setValue(Object.fromEntries(newest.map((item) => [item.ws.id, item])));
  });
}

export async function getDeleted(wsId: string): Promise<DeletedWorkspace | null> {
  return (await deletedItem.getValue())[wsId] ?? null;
}

export function forgetDeleted(wsId: string): Promise<void> {
  return serial(async () => {
    const all = { ...(await deletedItem.getValue()) };
    delete all[wsId];
    await deletedItem.setValue(all);
  });
}
