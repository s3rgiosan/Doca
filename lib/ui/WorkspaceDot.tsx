import { workspaceColor, type Workspace } from '../model/workspace';

/** A small circle in the colour of the workspace. The name stays the accessible label. */
export function WorkspaceDot(props: { ws: Pick<Workspace, 'id' | 'color'> }) {
  return <span class="ws-dot" aria-hidden="true" style={{ background: `var(--ws-${workspaceColor(props.ws)})` }} />;
}
