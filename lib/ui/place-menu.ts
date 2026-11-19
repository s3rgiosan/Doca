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
export const VIEWPORT_MARGIN = 8;

/**
 * Places a menu in viewport coordinates. The menu opens below the anchor with its right edge
 * on the right edge of the anchor. It opens above the anchor when it would overflow the bottom,
 * and it stays within the viewport margin on every side.
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
    Math.min(anchor.left + anchor.width - menu.width, maxLeft),
  );

  return {
    top: Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, viewport.height - VIEWPORT_MARGIN - menu.height),
    ),
    left,
  };
}

export const BESIDE_GAP = 12;

/**
 * Places a card in viewport coordinates to the right of the anchor, with the tops aligned. The card
 * moves left when it would overflow the right edge, and up when it would overflow the bottom.
 */
export function placeBeside(anchor: Box, card: Size, viewport: Size): { top: number; left: number } {
  const maxLeft = viewport.width - VIEWPORT_MARGIN - card.width;
  const maxTop = viewport.height - VIEWPORT_MARGIN - card.height;
  return {
    top: Math.max(VIEWPORT_MARGIN, Math.min(anchor.top, maxTop)),
    left: Math.max(VIEWPORT_MARGIN, Math.min(anchor.left + anchor.width + BESIDE_GAP, maxLeft)),
  };
}
