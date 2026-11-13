import { describe, expect, it } from 'vitest';
import { isWorkspaceColor, newWorkspace, nextColor, normalizeUrl, tombstone, WORKSPACE_COLORS, workspaceColor } from '@/lib/model/workspace';

describe('newWorkspace', () => {
  it('starts at rev 0 with no tabs and no override', () => {
    const ws = newWorkspace({ id: 'w1', name: 'Client X', deviceId: 'd1', now: 10 });
    expect(ws).toEqual({
      id: 'w1',
      name: 'Client X',
      rev: 0,
      updatedAt: 10,
      deviceId: 'd1',
      deleted: false,
      deletedAt: null,
      tabs: [],
    });
  });
});

describe('tombstone', () => {
  it('marks the workspace deleted and drops its tabs', () => {
    const tab = { id: 't1', url: 'https://a.test/', finalUrl: 'https://a.test/', title: 'A', pinned: false, index: 0 };
    const ws = newWorkspace({ id: 'w1', name: 'X', deviceId: 'd1', now: 1, tabs: [tab] });
    const dead = tombstone(ws, 5);
    expect(dead.deleted).toBe(true);
    expect(dead.deletedAt).toBe(5);
    expect(dead.tabs).toEqual([]);
    expect(dead.name).toBe('X');
  });
});

describe('normalizeUrl', () => {
  it('lowercases scheme and host and drops the fragment', () => {
    expect(normalizeUrl('HTTPS://Example.COM/Path?q=1#frag')).toBe('https://example.com/Path?q=1');
  });

  it('keeps browser URLs', () => {
    expect(normalizeUrl('chrome://newtab/')).toBe('chrome://newtab/');
  });

  it('returns text that is not a URL unchanged', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('workspaceColor', () => {
  it('returns the own colour when it is valid', () => {
    expect(workspaceColor({ id: 'w1', color: 'pink' })).toBe('pink');
  });

  it('derives the same palette colour from the ID on every call', () => {
    const first = workspaceColor({ id: 'w1' });
    expect(WORKSPACE_COLORS).toContain(first);
    expect(workspaceColor({ id: 'w1' })).toBe(first);
  });

  it('falls back for an unknown key', () => {
    const bad = { id: 'w1', color: 'plaid' } as unknown as { id: string; color: 'red' };
    expect(workspaceColor(bad)).toBe(workspaceColor({ id: 'w1' }));
  });

  it('uses more than one colour across IDs', () => {
    const colors = new Set(Array.from({ length: 40 }, (_v, i) => workspaceColor({ id: `id-${i}` })));
    expect(colors.size).toBeGreaterThan(3);
  });
});

describe('isWorkspaceColor', () => {
  it('accepts palette keys only', () => {
    expect(isWorkspaceColor('teal')).toBe(true);
    expect(isWorkspaceColor('Teal')).toBe(false);
    expect(isWorkspaceColor(3)).toBe(false);
  });
});

describe('nextColor', () => {
  const ws = (id: string, color?: (typeof WORKSPACE_COLORS)[number]) => newWorkspace({ id, name: id, deviceId: 'd', now: 1, color });

  it('starts with the first colour', () => {
    expect(nextColor([])).toBe('red');
  });

  it('returns the first colour that no live workspace uses', () => {
    expect(nextColor([ws('a', 'red'), ws('b', 'orange'), ws('c', 'green')])).toBe('amber');
  });

  it('ignores deleted workspaces', () => {
    expect(nextColor([tombstone(ws('a', 'red'), 2)])).toBe('red');
  });

  it('cycles when all colours are used', () => {
    const all = WORKSPACE_COLORS.map((color, i) => ws(`w${i}`, color));
    expect(nextColor(all)).toBe('red');
    expect(nextColor([...all, ws('extra', 'red')])).toBe('orange');
  });
});
