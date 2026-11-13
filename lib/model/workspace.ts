/** One tab in a saved workspace. The manager tab is never a SavedTab. */
export interface SavedTab {
  id: string;
  /** The URL that the tab opened with. */
  url: string;
  /** The URL after redirects, as last seen in the window. */
  finalUrl: string;
  title: string;
  pinned: boolean;
  /** The position in the window, with the manager tab left out. */
  index: number;
}

/** The keys of the workspace colours. Each key has a `--ws-<key>` token in the theme. */
export const WORKSPACE_COLORS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

export function isWorkspaceColor(value: unknown): value is WorkspaceColor {
  return typeof value === 'string' && (WORKSPACE_COLORS as readonly string[]).includes(value);
}

export interface Workspace {
  id: string;
  name: string;
  rev: number;
  updatedAt: number;
  deviceId: string;
  deleted: boolean;
  deletedAt: number | null;
  /** The colour key. A workspace with no valid key uses the colour that `workspaceColor` derives from its ID. */
  color?: WorkspaceColor;
  tabs: SavedTab[];
}

export function newWorkspace(p: {
  id: string;
  name: string;
  deviceId: string;
  now: number;
  tabs?: SavedTab[];
  color?: WorkspaceColor;
}): Workspace {
  return {
    id: p.id,
    name: p.name,
    rev: 0,
    updatedAt: p.now,
    deviceId: p.deviceId,
    deleted: false,
    deletedAt: null,
    tabs: p.tabs ?? [],
    ...(p.color === undefined ? {} : { color: p.color }),
  };
}

/** Returns the colour of the workspace: its own key when valid, else a stable colour from its ID. */
export function workspaceColor(ws: Pick<Workspace, 'id' | 'color'>): WorkspaceColor {
  if (isWorkspaceColor(ws.color)) {
    return ws.color;
  }
  let hash = 0;
  for (const char of ws.id) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return WORKSPACE_COLORS[hash % WORKSPACE_COLORS.length]!;
}

/** Returns the first palette colour that no live workspace shows. When all are in use, the colours repeat in order. */
export function nextColor(workspaces: Workspace[]): WorkspaceColor {
  const live = workspaces.filter((ws) => !ws.deleted);
  const used = new Set(live.map((ws) => workspaceColor(ws)));
  const unused = WORKSPACE_COLORS.find((color) => !used.has(color));
  return unused ?? WORKSPACE_COLORS[live.length % WORKSPACE_COLORS.length]!;
}

/** A deleted workspace keeps its record as a tombstone, so that sync can delete it on other devices. */
export function tombstone(ws: Workspace, now: number): Workspace {
  return { ...ws, deleted: true, deletedAt: now, tabs: [] };
}

/** Lowercases the scheme and the host and removes the fragment. Text that is not a URL is returned unchanged. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}
