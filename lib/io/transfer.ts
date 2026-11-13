import { isWorkspaceColor, type SavedTab, type Workspace } from '../model/workspace';

export const EXPORT_FORMAT = 'doca-export';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: number;
  workspaces: Workspace[];
}

export class ImportError extends Error {}

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
  return data.workspaces.map((item, i) => parseWorkspace(item, i));
}

/**
 * Prepares imported workspaces for writing. Import never overwrites: a workspace whose ID exists
 * gets new IDs and " (imported)" after its name. The rev starts again, so the first write gives rev 1.
 */
export function planImport(incoming: Workspace[], existingIds: Set<string>, newId: () => string): Workspace[] {
  return incoming.map((ws) => {
    if (!existingIds.has(ws.id)) {
      return { ...ws, rev: 0 };
    }
    return {
      ...ws,
      id: newId(),
      name: `${ws.name} (imported)`,
      rev: 0,
      tabs: ws.tabs.map((tab) => ({ ...tab, id: newId() })),
    };
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
  return {
    id: item.id,
    name: item.name,
    rev: typeof item.rev === 'number' ? item.rev : 0,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
    deviceId: typeof item.deviceId === 'string' ? item.deviceId : '',
    deleted: false,
    deletedAt: null,
    ...(isWorkspaceColor(item.color) ? { color: item.color } : {}),
    tabs: item.tabs.map((tab, i) => parseTab(tab, i, item.name as string)),
  };
}

function parseTab(item: unknown, index: number, workspaceName: string): SavedTab {
  if (!isRecord(item) || typeof item.id !== 'string' || typeof item.url !== 'string') {
    throw new ImportError(`Tab ${index + 1} of "${workspaceName}" has no ID or URL.`);
  }
  return {
    id: item.id,
    url: item.url,
    finalUrl: typeof item.finalUrl === 'string' ? item.finalUrl : item.url,
    title: typeof item.title === 'string' ? item.title : item.url,
    pinned: item.pinned === true,
    index,
  };
}
