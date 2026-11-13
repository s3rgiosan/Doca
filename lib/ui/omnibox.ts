import type { Workspace } from '../model/workspace';

const MAX_SUGGESTIONS = 6;

/** The omnibox reads the description as XML, so markup characters are escaped. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function matches(text: string, workspaces: Workspace[]): Workspace[] {
  const query = text.trim().toLowerCase();
  return workspaces.filter((ws) => ws.name.toLowerCase().includes(query));
}

export function suggestWorkspaces(text: string, workspaces: Workspace[]): Array<{ content: string; description: string }> {
  return matches(text, workspaces)
    .slice(0, MAX_SUGGESTIONS)
    .map((ws) => ({ content: ws.name, description: escapeXml(ws.name) }));
}

/** Returns the workspace with that exact name (any case), else the first workspace whose name contains the text. */
export function resolveOmnibox(text: string, workspaces: Workspace[]): string | null {
  const query = text.trim().toLowerCase();
  const exact = workspaces.find((ws) => ws.name.toLowerCase() === query);
  if (exact) {
    return exact.id;
  }
  const first = matches(text, workspaces)[0];
  return first ? first.id : null;
}
