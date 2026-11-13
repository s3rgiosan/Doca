import { browser } from 'wxt/browser';
import { moveTabsToNewWorkspace, moveTabsWithUndo, undoMove, type MoveUndo } from './actions/move';
import { switchToWorkspace } from './actions/open';
import { switchWindow } from './actions/switch';
import {
  assignWindow,
  createEmptyWorkspace,
  createFromWindow,
  deleteWorkspace,
  renameWorkspace,
  restoreWorkspace,
} from './actions/window';
import type { WorkspaceColor } from './model/workspace';
import type { BrowserPort } from './browser/port';
import { exportWorkspaces, parseImport, planImport } from './io/transfer';
import { setSettings, type Settings } from './store/device';
import { getWorkspace, listWorkspaces, putWorkspace } from './store/workspaces';

export type Message =
  /** With a window, that window switches to the workspace. */
  | { type: 'switch'; wsId: string; windowId?: number }
  | { type: 'create-from-window'; windowId: number; name: string }
  | { type: 'create-empty'; name: string; windowId?: number; color?: WorkspaceColor }
  | { type: 'assign'; windowId: number; wsId: string }
  /** The colour is optional. Without it, the workspace keeps its colour. */
  | { type: 'rename'; wsId: string; name: string; color?: WorkspaceColor }
  | { type: 'delete'; wsId: string }
  /** Undoes the delete of the workspace. The reply value is the ID of the restored workspace. */
  | { type: 'restore-workspace'; wsId: string }
  /** The reply value is a `MoveResult`. */
  | { type: 'move-tabs'; tabIds: number[]; wsId: string }
  | { type: 'move-to-new'; tabIds: number[]; name: string }
  /** Moves the tabs of a move back. `undo` comes from the reply to the move. */
  | { type: 'undo-move'; undo: MoveUndo }
  | { type: 'set-settings'; settings: Settings }
  | { type: 'export' }
  | { type: 'import'; text: string };

export type Reply = { ok: true; value?: unknown } | { ok: false; error: string };

/** Runs a change that a UI page asked for. All changes run in the service worker. */
export async function handleMessage(msg: Message, port: BrowserPort, now: () => number): Promise<Reply> {
  try {
    const value = await run(msg, port, now);
    return value === undefined ? { ok: true } : { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function run(msg: Message, port: BrowserPort, now: () => number): Promise<unknown> {
  switch (msg.type) {
    case 'switch': {
      const ws = await getWorkspace(msg.wsId);
      if (!ws || ws.deleted) {
        throw new Error('This workspace does not exist.');
      }
      return msg.windowId === undefined ? switchToWorkspace(port, msg.wsId) : switchWindow(port, msg.windowId, msg.wsId, now());
    }
    case 'create-from-window':
      return createFromWindow(port, msg.windowId, msg.name, now());
    case 'create-empty':
      return createEmptyWorkspace(port, msg.name, now(), msg.windowId, msg.color);
    case 'assign':
      return assignWindow(port, msg.windowId, msg.wsId, now());
    case 'rename':
      return renameWorkspace(msg.wsId, msg.name, now(), msg.color);
    case 'delete':
      return deleteWorkspace(port, msg.wsId, now());
    case 'restore-workspace':
      return restoreWorkspace(port, msg.wsId, now());
    case 'move-tabs':
      return moveTabsWithUndo(port, msg.tabIds, msg.wsId, now());
    case 'move-to-new':
      return moveTabsToNewWorkspace(port, msg.tabIds, msg.name, now());
    case 'undo-move':
      return undoMove(port, msg.undo, now());
    case 'set-settings':
      return setSettings(msg.settings);
    case 'export':
      return exportWorkspaces(await listWorkspaces(), now());
    case 'import':
      return importText(msg.text, now());
    default:
      throw new Error('Unknown message.');
  }
}

/** Returns the number of imported workspaces. A file that cannot be read changes nothing. */
async function importText(text: string, now: number): Promise<number> {
  const incoming = parseImport(text);
  const existing = await listWorkspaces({ includeDeleted: true });
  const planned = planImport(incoming, new Set(existing.map((ws) => ws.id)), () => crypto.randomUUID());
  for (const ws of planned) {
    await putWorkspace(ws, now);
  }
  return planned.length;
}

const UNREACHABLE = 'Doca could not reach its background service. Reload the extension and try again.';

/** Sends a message from a UI page to the service worker. The returned promise never rejects. */
export async function sendMessage(msg: Message): Promise<Reply> {
  try {
    const reply = (await browser.runtime.sendMessage(msg)) as Reply | undefined;
    return reply ?? { ok: false, error: UNREACHABLE };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/**
 * Wraps `handle` as a `runtime.onMessage` listener. The reply goes through `sendResponse`, and the
 * listener returns true to keep the channel open, because not every browser accepts a returned promise.
 */
export function createMessageListener(handle: (msg: Message) => Promise<Reply>) {
  return (msg: unknown, _sender: unknown, sendResponse: (reply: Reply) => void): true => {
    void handle(msg as Message).then(sendResponse, (error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  };
}
