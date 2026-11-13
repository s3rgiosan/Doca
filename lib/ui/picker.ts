import type { Workspace } from '../model/workspace';
import { sidebarGroups } from './sidebar';

export type PickerRow = { kind: 'new'; name: string } | { kind: 'workspace'; ws: Workspace; current: boolean };

export interface PickerOptions {
  /** The workspace of the window, or undefined for a window with no workspace. */
  currentId: string | undefined;
  /** Shows the current workspace as a row that cannot be picked. */
  showCurrent: boolean;
  bound: Set<string>;
  query: string;
}

/**
 * Returns the rows of the workspace picker: the new-workspace row, then the current workspace, then
 * the open and the closed workspaces, each sorted by name. The typed text filters the names and is
 * the name of the new workspace.
 */
export function pickerRows(workspaces: Workspace[], options: PickerOptions): PickerRow[] {
  const query = options.query.trim();
  const groups = sidebarGroups(workspaces, options.bound, query);
  const matching = [...groups.open, ...groups.closed];
  const current = matching.find((ws) => ws.id === options.currentId);
  const others = matching.filter((ws) => ws.id !== options.currentId);
  const rows: PickerRow[] = [{ kind: 'new', name: query }];
  if (current && options.showCurrent) {
    rows.push({ kind: 'workspace', ws: current, current: true });
  }
  for (const ws of others) {
    rows.push({ kind: 'workspace', ws, current: false });
  }
  return rows;
}

/** A new workspace needs a name, and the current workspace is not a target. */
export function isPickable(row: PickerRow): boolean {
  return row.kind === 'new' ? row.name !== '' : !row.current;
}

/**
 * Returns the index of the row that Enter picks before the user moves the highlight, or -1.
 * Typed text that matches a workspace picks that workspace. Other text picks the new row.
 */
export function firstPickable(rows: PickerRow[], query: string): number {
  if (query.trim() === '') {
    return -1;
  }
  const match = rows.findIndex((row) => row.kind === 'workspace' && isPickable(row));
  return match === -1 ? 0 : match;
}

/** The element id of an option in the list with the given id. */
export function optionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

/** The id for `aria-activedescendant`: the highlighted option while the list is open, else undefined. */
export function activeOptionId(open: boolean, highlight: number, count: number, listId: string): string | undefined {
  return open && highlight >= 0 && highlight < count ? optionId(listId, highlight) : undefined;
}
