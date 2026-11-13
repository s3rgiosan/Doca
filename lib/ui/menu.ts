/**
 * Returns the index of the menu item that a key moves the focus to, or null when the key does not
 * move it. An index of -1 means that no item has the focus.
 */
export function menuTarget(key: string, index: number, count: number): number | null {
  if (count === 0) {
    return null;
  }
  switch (key) {
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowUp':
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Removes the empty groups, so the menu never shows a divider next to nothing. */
export function menuGroups<T>(groups: T[][]): T[][] {
  return groups.filter((group) => group.length > 0);
}
