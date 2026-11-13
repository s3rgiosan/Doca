import { browser } from 'wxt/browser';
import { switchToWorkspace } from '@/lib/actions/open';
import { switchWindow } from '@/lib/actions/switch';
import { flushDue } from '@/lib/actions/save';
import { createActionQueue } from '@/lib/background/actions';
import {
  onManagerTabSeen,
  onTabAttached,
  onTabChanged,
  onTabRemoved,
  onWindowRemoved,
  runStartup,
  runSuspend,
} from '@/lib/background/events';
import { createChromePort, toPortTab } from '@/lib/browser/port';
import { createBoot } from '@/lib/background/boot';
import { createMessageListener, handleMessage } from '@/lib/messages';
import { SAVE_DEBOUNCE_MS } from '@/lib/store/dirty';
import { isStartupDone } from '@/lib/store/session';
import { listWorkspaces } from '@/lib/store/workspaces';
import { resolveOmnibox, suggestWorkspaces } from '@/lib/ui/omnibox';

const FLUSH_ALARM = 'doca-flush';
const SUSPEND_ALARM = 'doca-suspend';

export default defineBackground(() => {
  const port = createChromePort();
  // User actions run one at a time, so two actions never change the same window or workspace together.
  const runAction = createActionQueue();

  // The worker can stop at any time. Each start binds windows once per browser session, then saves due work.
  const boot = createBoot(async () => {
    const startupDone = await isStartupDone();
    if (!startupDone) {
      await runStartup(port, Date.now());
    }
    await flushDue(port, Date.now());
  });

  // A timer gives the short debounce while the worker runs. The flush alarm saves the work if the worker stops first.
  const scheduleFlush = () => {
    setTimeout(() => void flushDue(port, Date.now()), SAVE_DEBOUNCE_MS + 50);
  };
  const tabChanged = (windowId: number) => {
    void boot()
      .then(() => onTabChanged(port, windowId, Date.now()))
      .then(scheduleFlush);
  };

  void ensureAlarm(FLUSH_ALARM, 0.5);
  void ensureAlarm(SUSPEND_ALARM, 1);
  void boot();

  browser.runtime.onStartup.addListener(() => void boot());

  browser.alarms.onAlarm.addListener((alarm) => {
    switch (alarm.name) {
      case FLUSH_ALARM:
        void boot().then(() => flushDue(port, Date.now()));
        break;
      case SUSPEND_ALARM:
        void boot().then(() => runSuspend(port, Date.now()));
        break;
      default:
        break;
    }
  });

  browser.tabs.onCreated.addListener((tab) => {
    void boot().then(() => onManagerTabSeen(port, toPortTab(tab)));
    tabChanged(tab.windowId);
  });
  browser.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (change.url !== undefined) {
      void boot().then(() => onManagerTabSeen(port, toPortTab(tab)));
    }
    tabChanged(tab.windowId);
  });
  browser.tabs.onMoved.addListener((_tabId, info) => tabChanged(info.windowId));
  browser.tabs.onDetached.addListener((_tabId, info) => tabChanged(info.oldWindowId));
  browser.tabs.onAttached.addListener((tabId, info) => {
    void boot()
      .then(() => onTabAttached(port, tabId, info.newWindowId, Date.now()))
      .then(scheduleFlush);
  });
  browser.tabs.onRemoved.addListener((tabId, info) => {
    void boot()
      .then(() => onTabRemoved(port, tabId, info, Date.now()))
      .then(scheduleFlush);
  });
  browser.windows.onRemoved.addListener((windowId) => void onWindowRemoved(windowId));

  browser.runtime.onMessage.addListener(
    createMessageListener((msg) => boot().then(() => runAction(() => handleMessage(msg, port, Date.now)))),
  );

  browser.omnibox.onInputChanged.addListener((text, suggest) => {
    void listWorkspaces().then((workspaces) => suggest(suggestWorkspaces(text, workspaces)));
  });
  browser.omnibox.onInputEntered.addListener((text) => {
    void listWorkspaces().then((workspaces) => {
      const wsId = resolveOmnibox(text, workspaces);
      if (wsId === null) {
        return;
      }
      // The address bar belongs to the last focused window, so that window switches.
      void browser.windows
        .getLastFocused({ windowTypes: ['normal'] })
        .then((win) =>
          runAction(() => (win.id === undefined ? switchToWorkspace(port, wsId) : switchWindow(port, win.id, wsId, Date.now()))),
        )
        .catch((error: unknown) => console.warn('Doca could not switch workspace', error));
    });
  });
});

async function ensureAlarm(name: string, periodInMinutes: number): Promise<void> {
  const existing = await browser.alarms.get(name);
  if (!existing) {
    await browser.alarms.create(name, { periodInMinutes });
  }
}
