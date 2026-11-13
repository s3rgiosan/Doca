import { describe, expect, it } from 'vitest';
import { managerUrl, parseManagerUrl } from '@/lib/model/manager-url';

const base = 'chrome-extension://abc/manager.html';

describe('manager URL', () => {
  it('round-trips the workspace ID', () => {
    expect(parseManagerUrl(base, managerUrl(base, 'w1'))).toBe('w1');
  });

  it('ignores other pages', () => {
    expect(parseManagerUrl(base, 'https://x.test/?ws=w1')).toBeNull();
    expect(parseManagerUrl(base, 'chrome-extension://abc/other.html?ws=w1')).toBeNull();
  });

  it('returns null for no URL or no ws parameter', () => {
    expect(parseManagerUrl(base, undefined)).toBeNull();
    expect(parseManagerUrl(base, base)).toBeNull();
  });
});
