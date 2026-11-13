import { render } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { toPortTab, type PortTab } from '@/lib/browser/port';
import { parseManagerUrl } from '@/lib/model/manager-url';
import type { Workspace } from '@/lib/model/workspace';
import { sendMessage, type Message, type Reply } from '@/lib/messages';
import { getBindings } from '@/lib/store/session';
import { listWorkspaces } from '@/lib/store/workspaces';
import type { PickerRow } from '@/lib/ui/picker';
import { tabLabel, withoutManager } from '@/lib/ui/sidebar';
import { useAction } from '@/lib/ui/useAction';
import { Favicon } from '@/lib/ui/Favicon';
import { SuspendedIcon } from '@/lib/ui/SuspendedIcon';
import { WorkspacePicker } from '@/lib/ui/WorkspacePicker';
import '@/lib/ui/theme.css';
import './style.css';

const managerBase = browser.runtime.getURL('/manager.html');

interface State {
  windowId: number;
  tab: PortTab | null;
  /** True when the active tab is the Doca tab. The popup then lists the tabs of the workspace. */
  onManager: boolean;
  /** The tabs of this window, without the Doca tab. */
  windowTabs: PortTab[];
  boundTo: string | undefined;
  workspaces: Workspace[];
  bound: Set<string>;
}

async function loadState(): Promise<State> {
  const win = await browser.windows.getCurrent();
  const [bindings, workspaces, rawTabs] = await Promise.all([getBindings(), listWorkspaces(), browser.tabs.query({ windowId: win.id! })]);
  const tabs = rawTabs.map(toPortTab);
  const active = tabs.find((tab) => tab.active) ?? null;
  return {
    windowId: win.id!,
    tab: active,
    onManager: active !== null && parseManagerUrl(managerBase, active.url) !== null,
    windowTabs: withoutManager(tabs, managerBase),
    boundTo: bindings.get(win.id!),
    workspaces,
    bound: new Set(bindings.values()),
  };
}

const rowLabel = (row: PickerRow) => (row.kind === 'new' ? `New workspace "${row.name}"` : row.ws.name);

/** The tabs of the workspace. A click goes to the tab. */
function TabList(props: { name: string; tabs: PortTab[] }) {
  const [error, setError] = useState('');
  const goTo = (tabId: number) => {
    setError('');
    browser.tabs.update(tabId, { active: true }).then(
      () => window.close(),
      () => setError('This tab is not available any more.'),
    );
  };
  return (
    <div class="popup">
      <header class="head">{props.name}</header>
      <div role="alert">{error && <p class="error">{error}</p>}</div>
      <ul class="tab-list">
        {props.tabs.map((tab) => (
          <li key={tab.id}>
            <button class="plain tab-row" title={tab.url} onClick={() => goTo(tab.id)}>
              <Favicon src={tab.favIconUrl} />
              <span class="tab-row-title">{tabLabel(tab)}</span>
              {tab.discarded && <SuspendedIcon />}
            </button>
          </li>
        ))}
      </ul>
      {props.tabs.length === 0 && <p class="muted">This workspace has no other tabs.</p>}
    </div>
  );
}

function Popup() {
  const [state, setState] = useState<State | null>(null);
  const [target, setTarget] = useState<PickerRow | null>(null);
  const [error, setError] = useState('');
  const [openElsewhere, setOpenElsewhere] = useState<string | null>(null);
  const moveButton = useRef<HTMLButtonElement>(null);
  const [busy, lock] = useAction();
  const workspaceFieldId = useId();
  const saveFieldId = useId();

  useEffect(() => {
    void loadState().then(setState);
  }, []);

  // After a pick, Enter moves the tab.
  useEffect(() => {
    if (target) {
      moveButton.current?.focus();
    }
  }, [target]);

  if (!state) {
    return (
      <div class="popup" aria-busy="true">
        <p class="muted">Loading…</p>
      </div>
    );
  }
  if (state.onManager) {
    const name = state.workspaces.find((ws) => ws.id === state.boundTo)?.name ?? 'This window';
    return <TabList name={name} tabs={state.windowTabs} />;
  }

  /** Sends the message and closes the popup when it succeeds. */
  const run = async (msg: Message, close = true): Promise<Reply | undefined> =>
    lock(async () => {
      setError('');
      const reply = await sendMessage(msg);
      if (!reply.ok) {
        setError(reply.error);
      } else if (close) {
        window.close();
      }
      return reply;
    });

  const { tab } = state;
  const current = state.workspaces.find((ws) => ws.id === state.boundTo);

  const moveTab = () => {
    if (!tab || !target) {
      return;
    }
    const msg: Message =
      target.kind === 'new'
        ? { type: 'move-to-new', tabIds: [tab.id], name: target.name }
        : { type: 'move-tabs', tabIds: [tab.id], wsId: target.ws.id };
    void run(msg);
  };

  const saveWindow = async (row: PickerRow) => {
    if (row.kind === 'new') {
      void run({
        type: 'create-from-window',
        windowId: state.windowId,
        name: row.name,
      });
      return;
    }
    const reply = await run({ type: 'assign', windowId: state.windowId, wsId: row.ws.id }, false);
    if (reply?.ok && reply.value === 'open-elsewhere') {
      setOpenElsewhere(row.ws.id);
    } else if (reply?.ok) {
      window.close();
    }
  };

  const moveAllThere = async (wsId: string) => {
    const tabs = await browser.tabs.query({ windowId: state.windowId });
    const tabIds = tabs.filter((t) => parseManagerUrl(managerBase, t.url) === null).map((t) => t.id!);
    void run({ type: 'move-tabs', tabIds, wsId });
  };

  let pickerLabel = '';
  let pickerWorkspace: Workspace | undefined;
  if (target) {
    pickerLabel = rowLabel(target);
    pickerWorkspace = target.kind === 'workspace' ? target.ws : undefined;
  } else if (current) {
    pickerLabel = `${current.name} – current`;
    pickerWorkspace = current;
  }

  return (
    <div class="popup">
      <header class="head">Manage tab</header>

      {tab && (
        <>
          <div class="tab">
            <Favicon src={tab.favIconUrl} />
            <div class="tab-text">
              <div class="tab-title">{tabLabel(tab)}</div>
              <div class="tab-url">{tab.url}</div>
            </div>
          </div>
          <label class="field-label" for={workspaceFieldId}>
            Workspace
          </label>
          <WorkspacePicker
            inputId={workspaceFieldId}
            disabled={busy}
            workspaces={state.workspaces}
            bound={state.bound}
            currentId={state.boundTo}
            showCurrent
            label={pickerLabel}
            labelWorkspace={pickerWorkspace}
            placeholder="No workspace"
            autoFocus
            onPick={setTarget}
          />
          <div class="actions">
            <button class="secondary" onClick={() => window.close()}>
              Cancel
            </button>
            <button ref={moveButton} class="primary" disabled={!target || busy} onClick={moveTab}>
              Move tab
            </button>
          </div>
        </>
      )}

      <div role="alert">{error && <p class="error">{error}</p>}</div>

      {state.boundTo === undefined && (
        <section>
          <label class="field-label" for={saveFieldId}>
            This window has no workspace
          </label>
          <WorkspacePicker
            inputId={saveFieldId}
            disabled={busy}
            workspaces={state.workspaces}
            bound={state.bound}
            currentId={undefined}
            showCurrent={false}
            label=""
            placeholder="Save all its tabs to…"
            onPick={(row) => void saveWindow(row)}
          />
          {openElsewhere && (
            <p>
              That workspace is open in another window.{' '}
              <button class="primary" disabled={busy} onClick={() => void moveAllThere(openElsewhere)}>
                Move this window's tabs there
              </button>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

render(<Popup />, document.getElementById('app')!);
