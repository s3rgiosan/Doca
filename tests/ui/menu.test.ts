import { describe, expect, it } from 'vitest';
import { menuGroups, menuTarget } from '@/lib/ui/menu';

describe('menuTarget', () => {
  it('moves down and wraps to the first item', () => {
    expect(menuTarget('ArrowDown', 0, 3)).toBe(1);
    expect(menuTarget('ArrowDown', 2, 3)).toBe(0);
  });

  it('moves up and wraps to the last item', () => {
    expect(menuTarget('ArrowUp', 2, 3)).toBe(1);
    expect(menuTarget('ArrowUp', 0, 3)).toBe(2);
  });

  it('jumps to the first and last item', () => {
    expect(menuTarget('Home', 2, 3)).toBe(0);
    expect(menuTarget('End', 0, 3)).toBe(2);
  });

  it('starts at the first item when no item has the focus', () => {
    expect(menuTarget('ArrowDown', -1, 3)).toBe(0);
    expect(menuTarget('ArrowUp', -1, 3)).toBe(2);
  });

  it('ignores other keys and an empty menu', () => {
    expect(menuTarget('a', 0, 3)).toBeNull();
    expect(menuTarget('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('menuGroups', () => {
  const item = (label: string) => ({ label });

  it('drops empty groups', () => {
    expect(menuGroups([[], [item('a')], [], [item('b')]])).toEqual([[item('a')], [item('b')]]);
  });

  it('returns no group for an empty menu', () => {
    expect(menuGroups([[], []])).toEqual([]);
  });
});
