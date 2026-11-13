import { storage } from 'wxt/utils/storage';
import { serial } from './queue';

export interface Settings {
  /** Minutes before an idle tab is suspended. 0 means never. */
  suspendAfterMinutes: number;
  /** Hosts whose tabs are never suspended. A host also covers its subdomains. */
  allowlist: string[];
}

const DEFAULT_SETTINGS: Settings = { suspendAfterMinutes: 20, allowlist: [] };

const deviceIdItem = storage.defineItem<string>('local:device.id');
const settingsItem = storage.defineItem<Settings>('local:device.settings', { fallback: DEFAULT_SETTINGS });
const skipItem = storage.defineItem<string[]>('local:device.skipFallback', { fallback: [] });

export function getDeviceId(): Promise<string> {
  return serial(async () => {
    const existing = await deviceIdItem.getValue();
    if (existing) {
      return existing;
    }
    const id = crypto.randomUUID();
    await deviceIdItem.setValue(id);
    return id;
  });
}

export async function getSettings(): Promise<Settings> {
  return settingsItem.getValue();
}

export function setSettings(settings: Settings): Promise<void> {
  return serial(() => settingsItem.setValue(settings));
}

/** Workspaces that the startup overlap fallback must skip, because the user unbound their window. */
export async function getSkipFallback(): Promise<Set<string>> {
  return new Set(await skipItem.getValue());
}

export function setSkipFallback(wsId: string, skip: boolean): Promise<void> {
  return serial(async () => {
    const ids = new Set(await skipItem.getValue());
    if (skip) {
      ids.add(wsId);
    } else {
      ids.delete(wsId);
    }
    await skipItem.setValue([...ids]);
  });
}
