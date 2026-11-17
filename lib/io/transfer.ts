import { isWorkspaceColor, type SavedTab, type Workspace } from '../model/workspace';

export const EXPORT_FORMAT = 'doca-export';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: number;
  workspaces: Workspace[];
}

export class ImportError extends Error {}

export const MAX_IMPORT_WORKSPACES = 500;
export const MAX_IMPORT_TABS = 1000;
export const MAX_IMPORT_TEXT_LENGTH = 200;

/** The schemes that a saved tab can have and that are safe to reopen. */
const RESTORABLE_SCHEMES = new Set(['http:', 'https:', 'file:', 'about:', 'chrome:']);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Writes the live workspaces as JSON. Deleted workspaces are left out. */
export function exportWorkspaces(workspaces: Workspace[], now: number): string {
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: now,
    workspaces: workspaces.filter((ws) => !ws.deleted).map(withoutLegacyFields),
  };
  return JSON.stringify(file, null, 2);
}

/** Reads an export file. It throws ImportError for a file that it cannot read completely. */
export function parseImport(text: string): Workspace[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }
  if (!isRecord(data) || data.format !== EXPORT_FORMAT) {
    throw new ImportError('The file is not a Doca export.');
  }
  if (data.version !== 1) {
    throw new ImportError(`This version of Doca cannot read export version ${String(data.version)}.`);
  }
  if (!Array.isArray(data.workspaces)) {
    throw new ImportError('The file has no workspace list.');
  }
  if (data.workspaces.length > MAX_IMPORT_WORKSPACES) {
    throw new ImportError(`The file has more than ${MAX_IMPORT_WORKSPACES} workspaces.`);
  }
  return data.workspaces.map((item, i) => parseWorkspace(item, i));
}

/**
 * Prepares imported workspaces for writing. The IDs in the file are not trusted: a workspace or tab
 * whose ID is not a UUID, or repeats an ID, gets a new ID. A workspace whose ID exists in the store or
 * earlier in the file gets new IDs and " (imported)" after its name. The rev starts again, so the first
 * write gives rev 1.
 */
export function planImport(incoming: Workspace[], existingIds: Set<string>, newId: () => string): Workspace[] {
  const plannedIds = new Set<string>();
  return incoming.map((ws) => {
    const taken = existingIds.has(ws.id) || plannedIds.has(ws.id);
    const id = taken || !UUID_PATTERN.test(ws.id) ? newId() : ws.id;
    plannedIds.add(id);
    const tabIds = new Set<string>();
    const tabs = ws.tabs.map((tab) => {
      const tabId = taken || !UUID_PATTERN.test(tab.id) || tabIds.has(tab.id) ? newId() : tab.id;
      tabIds.add(tabId);
      return { ...tab, id: tabId };
    });
    return { ...ws, id, name: taken ? `${ws.name} (imported)` : ws.name, rev: 0, tabs };
  });
}

/** Stored workspaces can still carry the old `suspendAfterMinutes` property. The export leaves it out. */
function withoutLegacyFields(ws: Workspace): Workspace {
  const { suspendAfterMinutes: _ignored, ...rest } = ws as Workspace & { suspendAfterMinutes?: unknown };
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWorkspace(item: unknown, position: number): Workspace {
  if (!isRecord(item) || typeof item.id !== 'string' || item.id === '' || typeof item.name !== 'string' || !Array.isArray(item.tabs)) {
    throw new ImportError(`Workspace ${position + 1} has no ID, name or tab list.`);
  }
  if (item.tabs.length > MAX_IMPORT_TABS) {
    throw new ImportError(`Workspace ${position + 1} has more than ${MAX_IMPORT_TABS} tabs.`);
  }
  const tabs: SavedTab[] = [];
  item.tabs.forEach((tab, i) => {
    const parsed = parseTab(tab, i, item.name as string);
    if (parsed) {
      tabs.push({ ...parsed, index: tabs.length });
    }
  });
  return {
    id: item.id,
    name: item.name.slice(0, MAX_IMPORT_TEXT_LENGTH),
    rev: typeof item.rev === 'number' ? item.rev : 0,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
    deviceId: typeof item.deviceId === 'string' ? item.deviceId : '',
    deleted: false,
    deletedAt: null,
    ...(isWorkspaceColor(item.color) ? { color: item.color } : {}),
    tabs,
  };
}

/** Returns the tab, or null when its URL has a scheme that cannot be reopened. */
function parseTab(item: unknown, index: number, workspaceName: string): SavedTab | null {
  if (!isRecord(item) || typeof item.id !== 'string' || typeof item.url !== 'string') {
    throw new ImportError(`Tab ${index + 1} of "${workspaceName}" has no ID or URL.`);
  }
  if (!isRestorableUrl(item.url)) {
    return null;
  }
  const finalUrl = typeof item.finalUrl === 'string' && isRestorableUrl(item.finalUrl) ? item.finalUrl : item.url;
  const title = typeof item.title === 'string' ? item.title : item.url;
  return {
    id: item.id,
    url: item.url,
    finalUrl,
    title: title.slice(0, MAX_IMPORT_TEXT_LENGTH),
    pinned: item.pinned === true,
    index,
  };
}

function isRestorableUrl(text: string): boolean {
  try {
    return RESTORABLE_SCHEMES.has(new URL(text).protocol);
  } catch {
    return false;
  }
}
