import type { SavedTab } from '../model/workspace';
import { tabLabel } from './short-url';

/** The most tabs that the preview card lists. */
export const PREVIEW_LIMIT = 10;

export interface TabPreview {
  /** The labels of the first tabs, in window order. */
  labels: string[];
  /** The number of tabs that the card leaves out. */
  more: number;
  total: number;
}

export const tabCount = (count: number) => `${count} ${count === 1 ? 'tab' : 'tabs'}`;

/** Returns the labels of the first saved tabs in window order, and the number of tabs left out. */
export function tabPreview(tabs: SavedTab[], limit = PREVIEW_LIMIT): TabPreview {
  const ordered = [...tabs].sort((a, b) => a.index - b.index);
  const labels = ordered.slice(0, limit).map((tab) => tabLabel(tab.title, tab.finalUrl || tab.url).title);
  return { labels, more: Math.max(0, ordered.length - limit), total: ordered.length };
}
