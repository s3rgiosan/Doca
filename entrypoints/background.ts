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
    setTimeout(() => void flushDue(port, Date.now()).catch(logError('save due workspaces')), SAVE_DEBOUNCE_MS + 50);
  };
  const tabChanged = (windowId: number) => {
    void boot()
      .then(() => onTabChanged(port, windowId, Date.now()))
      .then(scheduleFlush)
      .catch(logError('handle a tab change'));
  };

  void ensureAlarm(FLUSH_ALARM, 0.5);
  void ensureAlarm(SUSPEND_ALARM, 1);
  void boot().catch(logError('start'));

  browser.runtime.onStartup.addListener(() => void boot().catch(logError('start')));

  browser.alarms.onAlarm.addListener((alarm) => {
    switch (alarm.name) {
      case FLUSH_ALARM:
        void boot()
          .then(() => flushDue(port, Date.now()))
          .catch(logError('save due workspaces'));
        break;
      case SUSPEND_ALARM:
        void boot()
          .then(() => runSuspend(port, Date.now()))
          .catch(logError('suspend tabs'));
        break;
      default:
        break;
    }
  });

  browser.tabs.onCreated.addListener((tab) => {
    void boot()
      .then(() => onManagerTabSeen(port, toPortTab(tab)))
      .catch(logError('check the manager tab'));
    tabChanged(tab.windowId);
  });
  browser.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (change.url !== undefined) {
      void boot()
        .then(() => onManagerTabSeen(port, toPortTab(tab)))
        .catch(logError('check the manager tab'));
    }
    tabChanged(tab.windowId);
  });
  browser.tabs.onMoved.addListener((_tabId, info) => tabChanged(info.windowId));
  browser.tabs.onDetached.addListener((_tabId, info) => tabChanged(info.oldWindowId));
  browser.tabs.onAttached.addListener((tabId, info) => {
    void boot()
      .then(() => onTabAttached(port, tabId, info.newWindowId, Date.now()))
      .then(scheduleFlush)
      .catch(logError('handle an attached tab'));
  });
  browser.tabs.onRemoved.addListener((tabId, info) => {
    void boot()
      .then(() => onTabRemoved(port, tabId, info, Date.now()))
      .then(scheduleFlush)
      .catch(logError('handle a removed tab'));
  });
  browser.windows.onRemoved.addListener((windowId) => {
    void boot()
      .then(() => onWindowRemoved(windowId))
      .catch(logError('handle a removed window'));
  });

  browser.runtime.onMessage.addListener(
    createMessageListener((msg) => boot().then(() => runAction(() => handleMessage(msg, port, Date.now)))),
  );

  browser.omnibox.onInputChanged.addListener((text, suggest) => {
    void listWorkspaces()
      .then((workspaces) => suggest(suggestWorkspaces(text, workspaces)))
      .catch(logError('suggest workspaces'));
  });
  browser.omnibox.onInputEntered.addListener((text) => {
    void listWorkspaces()
      .then((workspaces) => {
        const wsId = resolveOmnibox(text, workspaces);
        if (wsId === null) {
          return;
        }
        // The address bar belongs to the last focused window, so that window switches.
        void browser.windows
          .getLastFocused({ windowTypes: ['normal'] })
          .then((win) =>
            boot().then(() =>
              runAction(() => (win.id === undefined ? switchToWorkspace(port, wsId) : switchWindow(port, win.id, wsId, Date.now()))),
            ),
          )
          .catch(logError('switch workspace'));
      })
      .catch(logError('resolve the omnibox input'));
  });
});

/** Returns a handler that logs a rejected background task. */
function logError(context: string): (error: unknown) => void {
  return (error) => console.warn(`Doca could not ${context}`, error);
}

async function ensureAlarm(name: string, periodInMinutes: number): Promise<void> {
  const existing = await browser.alarms.get(name);
  if (!existing) {
    await browser.alarms.create(name, { periodInMinutes });
  }
}
