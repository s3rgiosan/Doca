import { storage } from 'wxt/utils/storage';
import type { Workspace } from '../model/workspace';
import { getDeviceId } from './device';
import { serial } from './queue';

const indexItem = storage.defineItem<string[]>('local:ws.index', { fallback: [] });

function key(id: string): `local:${string}` {
  return `local:ws.${id}`;
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return (await storage.getItem<Workspace>(key(id))) ?? null;
}

export async function listWorkspaces(opts: { includeDeleted?: boolean } = {}): Promise<Workspace[]> {
  const ids = await indexItem.getValue();
  const records = await Promise.all(ids.map((id) => getWorkspace(id)));
  return records.filter((ws): ws is Workspace => ws !== null && (opts.includeDeleted === true || !ws.deleted));
}

/** Writes the workspace with the next rev, the current time and this device's ID. Returns the written record. */
export async function putWorkspace(ws: Workspace, now: number): Promise<Workspace> {
  const deviceId = await getDeviceId();
  return serial(() => write(ws, now, deviceId));
}

/**
 * Reads the workspace and writes the result of `change`, with no other write in between.
 * `change` returns null to write nothing. Returns the written record, or null.
 */
export async function updateWorkspace(
  id: string,
  change: (ws: Workspace) => Workspace | null,
  now: number,
): Promise<Workspace | null> {
  const deviceId = await getDeviceId();
  return serial(async () => {
    const ws = await getWorkspace(id);
    const next = ws ? change(ws) : null;
    return next ? write(next, now, deviceId) : null;
  });
}

/**
 * Removes the record and its index entry, with no tombstone. Use it only for a workspace that no
 * other device can know, for example one that was created in a failed action.
 */
export function removeWorkspace(id: string): Promise<void> {
  return serial(async () => {
    await storage.removeItem(key(id));
    const ids = await indexItem.getValue();
    await indexItem.setValue(ids.filter((other) => other !== id));
  });
}

async function write(ws: Workspace, now: number, deviceId: string): Promise<Workspace> {
  const written: Workspace = { ...ws, rev: ws.rev + 1, updatedAt: now, deviceId };
  await storage.setItem(key(ws.id), written);
  const ids = await indexItem.getValue();
  if (!ids.includes(ws.id)) {
    await indexItem.setValue([...ids, ws.id]);
  }
  return written;
}
