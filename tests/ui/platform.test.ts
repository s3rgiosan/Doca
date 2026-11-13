import { describe, expect, it } from 'vitest';
import { isMacPlatform, newWindowClick, newWindowHint } from '@/lib/ui/platform';

describe('isMacPlatform', () => {
  it('reads userAgentData first', () => {
    expect(isMacPlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe(true);
    expect(isMacPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false);
  });

  it('falls back to the platform string', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false);
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false);
  });

  it('returns false when no platform is known', () => {
    expect(isMacPlatform({})).toBe(false);
    expect(isMacPlatform({ userAgentData: { platform: '' } })).toBe(false);
  });
});

describe('newWindowHint', () => {
  it('names the modifier key of the platform', () => {
    expect(newWindowHint(true)).toBe('⌘ Click');
    expect(newWindowHint(false)).toBe('Ctrl Click');
  });
});

describe('newWindowClick', () => {
  it('needs Cmd on macOS', () => {
    expect(newWindowClick({ metaKey: true, ctrlKey: false }, true)).toBe(true);
    expect(newWindowClick({ metaKey: false, ctrlKey: true }, true)).toBe(false);
    expect(newWindowClick({ metaKey: false, ctrlKey: false }, true)).toBe(false);
  });

  it('needs Ctrl on other platforms', () => {
    expect(newWindowClick({ metaKey: false, ctrlKey: true }, false)).toBe(true);
    expect(newWindowClick({ metaKey: true, ctrlKey: false }, false)).toBe(false);
  });
});
