import type { BrowserPort, PortTab } from '../browser/port';
import { parseManagerUrl } from '../model/manager-url';
import type { SavedTab } from '../model/workspace';
import { markDirty } from '../store/dirty';
import { forgetTabIds, getBindings, getTabMap } from '../store/session';
import { newWorkspace } from '../model/workspace';
import { getDeviceId } from '../store/device';
import { openSavedTabs, suspendOpenedTabs } from './open';
import { colorForNew, deleteWorkspace } from './window';
import { getWorkspace, putWorkspace, updateWorkspace } from '../store/workspaces';

/** What a move changed, so that `undoMove` can move the same tabs back. */
export interface MoveUndo {
  /** The workspace that got the tabs. */
  wsId: string;
  /** The window that the tabs came from. */
  windowId: number;
  /** The workspace of that window at the time of the move, or null for a window with no workspace. */
  fromWsId: string | null;
  /** Browser tab IDs of the tabs that moved into the window of an open workspace. */
  tabIds: number[];
  /** Saved tab IDs of the tabs that were added to the saved list of a closed workspace. */
  savedIds: string[];
  /** True when the move created the workspace. An undo that leaves it closed and empty deletes it. */
  created: boolean;
}

export interface MoveResult {
  moved: number;
  /** Null when nothing moved or the tabs came from more than one window. */
  undo: MoveUndo | null;
}

/**
 * Moves tabs to another workspace. An open target gets the tabs in its window. A closed target gets
 * them in its saved list, and the tabs close only after that write succeeds.
 * The manager tab and tabs that are already in the target window are skipped.
 */
export async function moveTabs(port: BrowserPort, tabIds: number[], targetWsId: string, now: number): Promise<{ moved: number }> {
  const { moved } = await moveTabsWithUndo(port, tabIds, targetWsId, now);
  return { moved };
}

/** Moves tabs as `moveTabs` does, and returns what an undo needs to move them back. */
export async function moveTabsWithUndo(port: BrowserPort, tabIds: number[], targetWsId: string, now: number): Promise<MoveResult> {
  const target = await getWorkspace(targetWsId);
  if (!target || target.deleted) {
    throw new Error(`Workspace ${targetWsId} does not exist`);
  }
  const bindings = await getBindings();
  const windows = await port.getWindows();
  let targetWindow: number | null = null;
  for (const [windowId, wsId] of bindings) {
    if (wsId === targetWsId && windows.some((win) => win.id === windowId)) {
      targetWindow = windowId;
    }
  }

  const wanted = new Set(tabIds);
  const moving: PortTab[] = windows
    .flatMap((win) => win.tabs)
    .filter((tab) => wanted.has(tab.id))
    .filter((tab) => parseManagerUrl(port.managerBase, tab.url) === null && tab.windowId !== targetWindow)
    // A tab with no URL yet cannot be saved, so it is not closed into a closed workspace.
    .filter((tab) => targetWindow !== null || tab.url !== '');
  if (moving.length === 0) {
    return { moved: 0, undo: null };
  }
  const ids = moving.map((tab) => tab.id);

  let savedIds: string[] = [];
  if (targetWindow !== null) {
    await port.moveTabs(ids, targetWindow, -1);
    await markDirty(targetWsId, now);
  } else {
    savedIds = await addToSavedList(targetWsId, moving, now);
    await port.removeTabs(ids);
    await forgetTabIds(ids);
  }

  const sourceWorkspaces = new Set(moving.map((tab) => bindings.get(tab.windowId)).filter((id) => id !== undefined));
  for (const wsId of sourceWorkspaces) {
    await markDirty(wsId, now);
  }
  const sourceWindows = new Set(moving.map((tab) => tab.windowId));
  const undo: MoveUndo | null =
    sourceWindows.size === 1
      ? {
          wsId: targetWsId,
          windowId: moving[0]!.windowId,
          fromWsId: bindings.get(moving[0]!.windowId) ?? null,
          tabIds: targetWindow === null ? [] : ids,
          savedIds,
          created: false,
        }
      : null;
  return { moved: moving.length, undo };
}

/**
 * Moves the tabs of a move back to the window that they came from, at the end of that window. The
 * window must still show the workspace that it showed at the time of the move. When
 * the target is open, the tabs move out of its window. When the target is closed, the tabs open in
 * the background and leave its saved list only after they open. Tabs that the user closed or moved
 * elsewhere are skipped. Returns the number of tabs that moved back.
 */
export async function undoMove(port: BrowserPort, undo: MoveUndo, now: number): Promise<{ moved: number }> {
  const source = await port.getWindow(undo.windowId);
  if (!source) {
    throw new Error('The window of these tabs is closed.');
  }
  const target = await getWorkspace(undo.wsId);
  if (!target || target.deleted) {
    throw new Error('The workspace of these tabs no longer exists.');
  }
  const bindings = await getBindings();
  const sourceWsId = bindings.get(undo.windowId) ?? null;
  if (sourceWsId !== undo.fromWsId) {
    throw new Error('The window of these tabs shows another workspace now.');
  }
  const targetWindowId = [...bindings].find(([, wsId]) => wsId === undo.wsId)?.[0];
  const targetWindow = targetWindowId === undefined ? null : await port.getWindow(targetWindowId);

  let moved = 0;
  if (targetWindow) {
    moved = await moveBackFromWindow(port, undo, targetWindow.tabs);
    if (moved > 0) {
      await markDirty(undo.wsId, now);
    }
  } else {
    moved = await moveBackFromSavedList(port, undo, target.tabs, now);
  }
  if (moved === 0) {
    throw new Error(`These tabs are no longer in “${target.name}”.`);
  }

  if (sourceWsId !== null) {
    await markDirty(sourceWsId, now);
  }
  if (undo.created && !targetWindow) {
    const after = await getWorkspace(undo.wsId);
    if (after && !after.deleted && after.tabs.length === 0) {
      await deleteWorkspace(port, undo.wsId, now);
    }
  }
  return { moved };
}

/**
 * Adds the tabs after the last tab of the workspace's saved list and returns their saved tab IDs. It
 * throws when the workspace does not exist or is deleted, and then writes nothing.
 */
export async function addToSavedList(wsId: string, tabs: PortTab[], now: number): Promise<string[]> {
  let addedIds: string[] = [];
  const written = await updateWorkspace(
    wsId,
    (ws) => {
      if (ws.deleted) {
        return null;
      }
      const added: SavedTab[] = tabs.map((tab, i) => ({
        id: crypto.randomUUID(),
        url: tab.url,
        finalUrl: tab.url,
        title: tab.title,
        pinned: tab.pinned,
        index: ws.tabs.length + i,
      }));
      addedIds = added.map((tab) => tab.id);
      return { ...ws, tabs: [...ws.tabs, ...added] };
    },
    now,
  );
  if (!written) {
    throw new Error(`Workspace ${wsId} does not exist`);
  }
  return addedIds;
}

/**
 * Creates a closed workspace and moves the tabs into its saved list. The tabs then close here. A
 * selection with no tab that can move creates nothing.
 */
export async function moveTabsToNewWorkspace(
  port: BrowserPort,
  tabIds: number[],
  name: string,
  now: number,
): Promise<{ wsId: string } & MoveResult> {
  const wanted = new Set(tabIds);
  const windows = await port.getWindows();
  const canMove = windows
    .flatMap((win) => win.tabs)
    .some((tab) => wanted.has(tab.id) && parseManagerUrl(port.managerBase, tab.url) === null);
  if (!canMove) {
    throw new Error('No selected tab can move.');
  }
  const wsId = crypto.randomUUID();
  await putWorkspace(newWorkspace({ id: wsId, name, deviceId: await getDeviceId(), now, color: await colorForNew(undefined) }), now);
  const { moved, undo } = await moveTabsWithUndo(port, tabIds, wsId, now);
  return { wsId, moved, undo: undo && { ...undo, created: true } };
}

/** Moves the tabs of the undo that are in the target window back to the source window. */
async function moveBackFromWindow(port: BrowserPort, undo: MoveUndo, targetTabs: PortTab[]): Promise<number> {
  const tabMap = await getTabMap();
  const tabIds = new Set(undo.tabIds);
  const savedIds = new Set(undo.savedIds);
  const back = targetTabs.filter((tab) => {
    const savedId = tabMap.get(tab.id);
    const listed = tabIds.has(tab.id) || (savedId !== undefined && savedIds.has(savedId));
    return listed && parseManagerUrl(port.managerBase, tab.url) === null;
  });
  if (back.length === 0) {
    return 0;
  }
  await port.moveTabs(
    back.map((tab) => tab.id),
    undo.windowId,
    -1,
  );
  return back.length;
}

/**
 * Opens the saved tabs of the undo in the source window, then removes the tabs that opened from the
 * saved list. A tab that fails to open stays in the saved list, so no tab is lost.
 */
async function moveBackFromSavedList(port: BrowserPort, undo: MoveUndo, savedTabs: SavedTab[], now: number): Promise<number> {
  const savedIds = new Set(undo.savedIds);
  const wanted = savedTabs.filter((tab) => savedIds.has(tab.id));
  if (wanted.length === 0) {
    return 0;
  }
  const { opened } = await openSavedTabs(port, undo.windowId, wanted, false);
  const openedIds = new Set(opened.map((entry) => entry.savedId));
  await updateWorkspace(
    undo.wsId,
    (ws) =>
      ws.deleted
        ? null
        : { ...ws, tabs: ws.tabs.filter((tab) => !openedIds.has(tab.id)).map((tab, index) => ({ ...tab, index })) },
    now,
  );
  await suspendOpenedTabs(port, opened);
  return opened.length;
}
