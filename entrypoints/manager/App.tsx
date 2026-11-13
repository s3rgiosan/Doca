import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { toPortTab, type PortTab } from '@/lib/browser/port';
import { nextColor, workspaceColor, type Workspace } from '@/lib/model/workspace';
import type { MoveResult } from '@/lib/actions/move';
import { sendMessage, type Message, type Reply } from '@/lib/messages';
import { getBindings } from '@/lib/store/session';
import { listWorkspaces } from '@/lib/store/workspaces';
import type { PickerRow } from '@/lib/ui/picker';
import { filterTabs, mainView, sidebarGroups, tabLabel, withoutManager } from '@/lib/ui/sidebar';
import { useAction } from '@/lib/ui/useAction';
import { ActionMenu } from '@/lib/ui/ActionMenu';
import { Favicon } from '@/lib/ui/Favicon';
import { ConfirmDialog } from '@/lib/ui/ConfirmDialog';
import { Icon } from '@/lib/ui/Icon';
import { ExternalLink, Pencil, Plus, SettingsIcon, Trash } from '@/lib/ui/icons';
import { Modal } from '@/lib/ui/Modal';
import { NameDialog } from '@/lib/ui/NameDialog';
import { isMacPlatform, newWindowClick, newWindowHint } from '@/lib/ui/platform';
import { Settings } from '@/lib/ui/Settings';
import { SuspendedIcon } from '@/lib/ui/SuspendedIcon';
import { Toast, type ToastMessage } from '@/lib/ui/Toast';
import { WorkspaceDot } from '@/lib/ui/WorkspaceDot';
import { WorkspacePicker } from '@/lib/ui/WorkspacePicker';

const wsId = new URLSearchParams(location.search).get('ws') ?? '';
const managerBase = location.href.split(/[?#]/)[0]!;
const DRAG_TYPE = 'application/x-doca-tab';
const mac = isMacPlatform();

interface State {
  windowId: number | null;
  workspaces: Workspace[];
  bound: Set<string>;
  tabs: PortTab[];
}

async function loadState(): Promise<State> {
  const win = await browser.windows.getCurrent();
  const windowId = win.id ?? null;
  const [workspaces, bindings, rawTabs] = await Promise.all([
    listWorkspaces(),
    getBindings(),
    windowId === null ? Promise.resolve([]) : browser.tabs.query({ windowId }),
  ]);
  const tabs = withoutManager(rawTabs.map(toPortTab), managerBase);
  return { windowId, workspaces, bound: new Set(bindings.values()), tabs };
}

/** Reloads the state after any tab or storage change, at most once per 100 ms. */
function useLiveState(): State | null {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void loadState().then(setState), 100);
    };
    void loadState().then(setState);
    const events = [
      browser.tabs.onCreated,
      browser.tabs.onRemoved,
      browser.tabs.onUpdated,
      browser.tabs.onMoved,
      browser.tabs.onAttached,
      browser.tabs.onDetached,
      browser.tabs.onActivated,
      browser.storage.onChanged,
    ] as Array<{ addListener(cb: () => void): void; removeListener(cb: () => void): void }>;
    events.forEach((event) => event.addListener(refresh));
    return () => events.forEach((event) => event.removeListener(refresh));
  }, []);
  return state;
}

const tabCount = (count: number) => `${count} ${count === 1 ? 'tab' : 'tabs'}`;

export function App() {
  const state = useLiveState();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Workspace | null>(null);
  // The error of the last save in the name dialog.
  const [dialogError, setDialogError] = useState('');
  const [deleting, setDeleting] = useState<Workspace | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [busy, run] = useAction();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastKey = useRef(0);
  // True while the settings have changes that are not saved.
  const settingsDirty = useRef(false);
  const saveSettings = useRef<(() => Promise<boolean>) | null>(null);
  const [askSaveSettings, setAskSaveSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  // A selector for the element that gets the focus after the next render.
  const pendingFocus = useRef<string | null>(null);
  // The selector of the button that opened the new workspace dialog.
  const createOpener = useRef('.side-action');

  useEffect(() => {
    if (pendingFocus.current) {
      const target = document.querySelector<HTMLElement>(pendingFocus.current);
      target?.focus();
      // A disabled target cannot take the focus. The next render tries again.
      if (!target || document.activeElement === target) {
        pendingFocus.current = null;
      }
    }
  });

  const current = state?.workspaces.find((ws) => ws.id === wsId);
  useEffect(() => {
    document.title = current ? current.name : 'Doca';
  }, [current?.name]);

  // A tab that closed or moved away cannot stay selected.
  useEffect(() => {
    if (!state) {
      return;
    }
    const ids = new Set(state.tabs.map((tab) => tab.id));
    setSelected((old) => new Set([...old].filter((id) => ids.has(id))));
  }, [state]);

  const groups = useMemo(() => sidebarGroups(state?.workspaces ?? [], state?.bound ?? new Set(), query), [state, query]);
  const tabs = useMemo(() => filterTabs(state?.tabs ?? [], query), [state, query]);

  if (!state) {
    return (
      <div class="layout">
        <nav class="sidebar" aria-label="Workspaces">
          <div class="brand">Doca</div>
        </nav>
        <main class="main" aria-busy="true">
          <p class="muted" role="status">
            Loading…
          </p>
        </main>
      </div>
    );
  }

  const send = async (msg: Message) => {
    setError('');
    const reply = await sendMessage(msg);
    if (!reply.ok) {
      setError(reply.error);
    }
    return reply;
  };

  /** Sends one message at a time. A repeat click while a message is in flight does nothing. */
  const act = (msg: Message) => run(() => send(msg));

  const showToast = (message: Omit<ToastMessage, 'key'>) => {
    toastKey.current += 1;
    setToast({ ...message, key: toastKey.current });
  };

  const toastHasFocus = () => Boolean(document.activeElement?.closest('.toast'));

  /** Closes the toast. The focus goes to the sidebar when it was in the toast. */
  const closeToast = () => {
    if (toastHasFocus()) {
      pendingFocus.current = '.side-action';
    }
    setToast(null);
  };

  /**
   * Sends the undo message. On success, a new toast says what happened. An error goes to the alert
   * region. When the focus was in the toast, it goes to the close button of the new toast.
   */
  const undo = (msg: Message, doneText: (value: unknown) => string) =>
    run(async () => {
      const hadFocus = toastHasFocus();
      const reply = await send(msg);
      if (!reply.ok) {
        setToast(null);
        if (hadFocus) {
          pendingFocus.current = '.side-action';
        }
        return;
      }
      showToast({ text: doneText(reply.value) });
      if (hadFocus) {
        pendingFocus.current = '.toast-close';
      }
    });

  /** Shows the result of a move, with an Undo button when the move can be undone. */
  const showMoved = (reply: Reply, targetName: string) => {
    if (!reply.ok) {
      return;
    }
    const { moved, undo: undoInfo } = reply.value as MoveResult;
    if (moved === 0) {
      return;
    }
    const text = `Moved ${tabCount(moved)} to “${targetName}”.`;
    if (!undoInfo) {
      showToast({ text });
      return;
    }
    showToast({
      text,
      actionLabel: 'Undo',
      onAction: () =>
        void undo({ type: 'undo-move', undo: undoInfo }, (value) => `Moved ${tabCount((value as { moved: number }).moved)} back.`),
    });
  };

  const moveTabsTo = async (tabIds: number[], ws: Workspace) => {
    const reply = await act({ type: 'move-tabs', tabIds, wsId: ws.id });
    if (reply) {
      showMoved(reply, ws.name);
    }
    return reply;
  };

  const triggerOf = (id: string) => `[data-menu-trigger="${id}"]`;

  const toggle = (id: number) =>
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const moveSelected = async (target: PickerRow) => {
    const tabIds = [...selected];
    let reply: Reply | undefined;
    if (target.kind === 'new') {
      reply = await act({ type: 'move-to-new', tabIds, name: target.name });
      if (reply) {
        showMoved(reply, target.name);
      }
    } else {
      reply = await moveTabsTo(tabIds, target.ws);
    }
    if (reply?.ok) {
      setSelected(new Set());
    }
  };

  const confirmDelete = (ws: Workspace) =>
    run(async () => {
      const reply = await send({ type: 'delete', wsId: ws.id });
      setDeleting(null);
      if (reply.ok) {
        showToast({
          text: `Deleted “${ws.name}”.`,
          actionLabel: 'Undo',
          onAction: () =>
            void undo({ type: 'restore-workspace', wsId: ws.id }, () => `Restored “${ws.name}”.`),
        });
      }
      // The row leaves the list after the next refresh. The focus moves to the sidebar when it has nowhere to go.
      setTimeout(() => {
        if (document.activeElement === document.body) {
          document.querySelector<HTMLElement>('.side-action')?.focus();
        }
      }, 300);
    });

  /** Sends a name message from a dialog. The dialog closes on success and shows the error otherwise. */
  const submitName = (msg: Message, close: () => void) =>
    run(async () => {
      setDialogError('');
      const reply = await sendMessage(msg);
      if (reply.ok) {
        close();
      } else {
        setDialogError(reply.error);
      }
    });

  const closeSettings = () => {
    pendingFocus.current = '.side-action.side-settings';
    settingsDirty.current = false;
    setAskSaveSettings(false);
    setSettingsOpen(false);
  };

  /** Closes the settings, or asks first when they have changes that are not saved. */
  const requestCloseSettings = () => {
    if (settingsDirty.current) {
      setAskSaveSettings(true);
      return;
    }
    closeSettings();
  };

  const backToSettings = () => {
    pendingFocus.current = '.modal.wide .modal-foot .primary';
    setAskSaveSettings(false);
  };

  /** Saves the settings and closes them. A failed save keeps them open with the error. */
  const saveAndCloseSettings = async () => {
    setSavingSettings(true);
    const saved = (await saveSettings.current?.()) ?? false;
    setSavingSettings(false);
    if (saved) {
      closeSettings();
      return;
    }
    backToSettings();
  };

  const openCreate = (opener: string) => {
    createOpener.current = opener;
    setDialogError('');
    setCreating(true);
  };

  const closeRename = () => {
    if (renaming) {
      pendingFocus.current = triggerOf(renaming.id);
    }
    setRenaming(null);
  };

  const closeCreate = () => {
    pendingFocus.current = createOpener.current;
    setCreating(false);
  };

  const row = (ws: Workspace) => (
    <li
      key={ws.id}
      class={`ws-row${ws.id === wsId ? ' current' : ''}${dropTarget === ws.id ? ' drop' : ''}`}
      onDragOver={(event) => {
        if (ws.id !== wsId && event.dataTransfer?.types.includes(DRAG_TYPE)) {
          event.preventDefault();
          setDropTarget(ws.id);
        }
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(event) => {
        event.preventDefault();
        setDropTarget(null);
        const tabId = Number(event.dataTransfer?.getData(DRAG_TYPE));
        if (tabId) {
          void moveTabsTo([tabId], ws);
        }
      }}
    >
      <WorkspaceDot ws={ws} />
      <button
        class="ws-name plain"
        title={ws.name}
        aria-current={ws.id === wsId ? 'true' : undefined}
        disabled={busy}
        onClick={(event) => {
          // A click with the modifier key opens the workspace in a new window.
          const windowId = newWindowClick(event, mac) ? undefined : (state.windowId ?? undefined);
          void act({ type: 'switch', wsId: ws.id, windowId });
        }}
      >
        {ws.name}
      </button>
      <ActionMenu
        label={`Actions for ${ws.name}`}
        triggerId={ws.id}
        open={openMenu === ws.id}
        disabled={busy}
        onOpenChange={(open) => setOpenMenu(open ? ws.id : null)}
        groups={[
          ws.id !== wsId && !state.bound.has(ws.id)
            ? [
                {
                  label: 'Open in new window',
                  icon: <Icon icon={ExternalLink} />,
                  hint: newWindowHint(mac),
                  onSelect: () => void act({ type: 'switch', wsId: ws.id }),
                },
              ]
            : [],
          [{ label: 'Rename', icon: <Icon icon={Pencil} />, onSelect: () => setRenaming(ws) }],
          [{ label: 'Delete', icon: <Icon icon={Trash} />, danger: true, onSelect: () => setDeleting(ws) }],
        ]}
      />
    </li>
  );

  const view = mainView(state.workspaces, wsId);

  /** The main area: the current workspace, or a prompt to make or pick one. */
  const renderMain = () => {
    switch (view) {
      case 'workspace':
        return current ? workspaceMain(current) : null;
      case 'no-workspaces':
        return (
          <section class="empty-state" aria-labelledby="empty-title">
            <h1 id="empty-title">No workspaces yet</h1>
            <p class="muted">A workspace keeps a set of tabs, so you can close them and open them again later.</p>
            <button class="primary" disabled={busy} onClick={() => openCreate('.empty-state .primary')}>
              <Icon icon={Plus} />
              New workspace
            </button>
          </section>
        );
      default:
        return (
          <section class="empty-state" aria-labelledby="empty-title">
            <h1 id="empty-title">This workspace was deleted</h1>
            <button class="primary" disabled={busy} onClick={() => openCreate('.empty-state .primary')}>
              <Icon icon={Plus} />
              New workspace
            </button>
            <p class="muted">Or pick a workspace on the left. You can also close this tab.</p>
          </section>
        );
    }
  };

  /** The header, the selection bar and the tab list of the workspace of this page. */
  const workspaceMain = (ws: Workspace) => (
    <>
      <header class="header">
        <WorkspaceDot ws={ws} />
        <h1 title={ws.name}>{ws.name}</h1>
        <span class="muted tab-count">
          {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
        </span>
        <input
          type="search"
          aria-label="Search workspaces and tabs"
          placeholder="Search workspaces and tabs"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </header>

      {selected.size > 0 && (
        <div class="selection">
          <span aria-hidden="true">
            {selected.size} {selected.size === 1 ? 'tab' : 'tabs'} selected
          </span>
          <div class="move-to">
            <WorkspacePicker
              workspaces={state.workspaces}
              bound={state.bound}
              currentId={wsId}
              showCurrent={false}
              label=""
              ariaLabel="Move selected tabs to"
              disabled={busy}
              placeholder="Move to…"
              onPick={(row) => void moveSelected(row)}
            />
          </div>
          <button class="plain" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <ul class="tabs">
        {tabs.map((tab) => (
          <li
            key={tab.id}
            class={`tab-row${tab.active ? ' active' : ''}`}
            draggable
            onDragStart={(event) => event.dataTransfer?.setData(DRAG_TYPE, String(tab.id))}
          >
            <input type="checkbox" checked={selected.has(tab.id)} onChange={() => toggle(tab.id)} aria-label={`Select ${tabLabel(tab)}`} />
            <Favicon src={tab.favIconUrl} />
            <button class="tab-title plain" title={tab.url} onClick={() => void browser.tabs.update(tab.id, { active: true })}>
              {tabLabel(tab)}
            </button>
            {tab.discarded && <SuspendedIcon />}
          </li>
        ))}
      </ul>
      {tabs.length === 0 && <p class="muted">{query ? 'No tab matches the search.' : 'This window has no other tabs.'}</p>}
    </>
  );

  return (
    <div class="layout">
      <nav class="sidebar" aria-label="Workspaces">
        <div class="brand">Doca</div>
        {groups.open.length > 0 && (
          <>
            <div class="group-label" id="group-open">
              Open
            </div>
            <ul aria-labelledby="group-open">{groups.open.map(row)}</ul>
          </>
        )}
        {groups.closed.length > 0 && (
          <>
            <div class="group-label" id="group-closed">
              Closed
            </div>
            <ul aria-labelledby="group-closed">{groups.closed.map(row)}</ul>
          </>
        )}
        {query.trim() !== '' && groups.open.length === 0 && groups.closed.length === 0 && <p class="side-empty">No workspace matches.</p>}
        <button class="plain side-action" disabled={busy} onClick={() => openCreate('.side-action')}>
          <Icon icon={Plus} />
          New workspace
        </button>
        <button
          class="plain side-action side-settings"
          onClick={() => {
            settingsDirty.current = false;
            setSettingsOpen(true);
          }}
        >
          <Icon icon={SettingsIcon} />
          Settings
        </button>
      </nav>

      <main class="main">
        <div role="alert">{error && <p class="error">{error}</p>}</div>
        <div class="visually-hidden" role="status">
          {selected.size > 0 && `${selected.size} ${selected.size === 1 ? 'tab' : 'tabs'} selected`}
        </div>
        {renderMain()}
      </main>

      {settingsOpen && (
        <Modal
          title="Settings"
          wide
          onClose={requestCloseSettings}
          footer={
            <button type="button" class="primary" onClick={requestCloseSettings}>
              Done
            </button>
          }
        >
          <Settings headingLevel={3} saveRef={saveSettings} onDirtyChange={(dirty) => (settingsDirty.current = dirty)} />
        </Modal>
      )}

      {askSaveSettings && (
        <ConfirmDialog
          title="Save changes?"
          confirmLabel="Save"
          confirmTone="primary"
          alternativeLabel="Discard"
          busy={savingSettings}
          onConfirm={() => void saveAndCloseSettings()}
          onAlternative={closeSettings}
          onCancel={backToSettings}
        >
          Your settings have changes that are not saved.
        </ConfirmDialog>
      )}

      {renaming && (
        <NameDialog
          title="Edit workspace"
          initial={renaming.name}
          initialColor={workspaceColor(renaming)}
          submitLabel="Save"
          busy={busy}
          error={dialogError}
          onSubmit={(name, color) => void submitName({ type: 'rename', wsId: renaming.id, name, color }, closeRename)}
          onCancel={closeRename}
        />
      )}

      {creating && (
        <NameDialog
          title="New workspace"
          initial=""
          initialColor={nextColor(state.workspaces)}
          submitLabel="Create"
          busy={busy}
          error={dialogError}
          onSubmit={(name, color) =>
            void submitName({ type: 'create-empty', name, windowId: state.windowId ?? undefined, color }, closeCreate)
          }
          onCancel={closeCreate}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete workspace"
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void confirmDelete(deleting)}
          onCancel={() => {
            pendingFocus.current = triggerOf(deleting.id);
            setDeleting(null);
          }}
        >
          {state.bound.has(deleting.id)
            ? `Delete "${deleting.name}"? Its window stays open with its tabs.`
            : `Delete "${deleting.name}"? Its saved tabs are removed.`}
        </ConfirmDialog>
      )}

      <Toast toast={toast} busy={busy} onClose={closeToast} />
    </div>
  );
}
