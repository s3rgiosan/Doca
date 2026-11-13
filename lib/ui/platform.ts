interface PlatformSource {
  userAgentData?: { platform?: string };
  platform?: string;
}

/** Returns true on macOS. The platform string of the browser is the fallback. */
export function isMacPlatform(source: PlatformSource = navigator as PlatformSource): boolean {
  const name = source.userAgentData?.platform || source.platform || '';
  return /mac/i.test(name);
}

/** The hint that names the click that opens a workspace in a new window. */
export function newWindowHint(mac: boolean): string {
  return mac ? '⌘ Click' : 'Ctrl Click';
}

/** Returns true when the click holds the modifier key of the platform. */
export function newWindowClick(event: { metaKey: boolean; ctrlKey: boolean }, mac: boolean): boolean {
  return mac ? event.metaKey : event.ctrlKey;
}
