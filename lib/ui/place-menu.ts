export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MENU_GAP = 4;
export const MENU_INSET = 10;
export const VIEWPORT_MARGIN = 8;

/**
 * Places a menu in viewport coordinates. The menu opens below the anchor with its left edge
 * inset from the anchor. It opens above the anchor when it would overflow the bottom, and
 * it stays within the viewport margin on every side.
 */
export function placeMenu(
  anchor: Box,
  menu: Size,
  viewport: Size,
): { top: number; left: number } {
  const below = anchor.top + anchor.height + MENU_GAP;
  const above = anchor.top - MENU_GAP - menu.height;
  const overflowsBottom =
    below + menu.height > viewport.height - VIEWPORT_MARGIN;
  const top = overflowsBottom && above >= VIEWPORT_MARGIN ? above : below;

  const maxLeft = viewport.width - VIEWPORT_MARGIN - menu.width;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchor.left + MENU_INSET, maxLeft),
  );

  return {
    top: Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, viewport.height - VIEWPORT_MARGIN - menu.height),
    ),
    left,
  };
}
