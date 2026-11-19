import { describe, expect, it } from 'vitest';
import type { SavedTab } from '@/lib/model/workspace';
import { placeBeside } from '@/lib/ui/place-menu';
import { tabCount, tabPreview } from '@/lib/ui/tab-preview';

const tab = (index: number, title: string, url = `https://example.com/${index}`): SavedTab => ({
  id: `t${index}`,
  url,
  finalUrl: url,
  title,
  pinned: false,
  index,
});

describe('tabPreview', () => {
  it('lists the labels in window order', () => {
    const result = tabPreview([tab(1, 'Second'), tab(0, 'First')]);
    expect(result).toEqual({ labels: ['First', 'Second'], more: 0, total: 2 });
  });

  it('counts the tabs past the limit', () => {
    const tabs = Array.from({ length: 13 }, (_, index) => tab(index, `Tab ${index}`));
    const result = tabPreview(tabs, 10);
    expect(result.labels).toHaveLength(10);
    expect(result.labels[9]).toBe('Tab 9');
    expect(result.more).toBe(3);
    expect(result.total).toBe(13);
  });

  it('labels an untitled tab with its short URL', () => {
    expect(tabPreview([tab(0, '', 'https://example.com/docs/')]).labels).toEqual(['example.com/docs']);
  });

  it('prefers the final URL over the opening URL', () => {
    const redirected = { ...tab(0, ''), url: 'https://example.com/old', finalUrl: 'https://example.com/new' };
    expect(tabPreview([redirected]).labels).toEqual(['example.com/new']);
  });

  it('falls back to the opening URL when the final URL is empty', () => {
    const fresh = { ...tab(0, ''), url: 'https://example.com/start', finalUrl: '' };
    expect(tabPreview([fresh]).labels).toEqual(['example.com/start']);
  });

  it('leaves nothing out at exactly the limit', () => {
    const tabs = Array.from({ length: 10 }, (_, index) => tab(index, `Tab ${index}`));
    expect(tabPreview(tabs, 10).more).toBe(0);
  });

  it('does not reorder the input', () => {
    const tabs = [tab(1, 'Second'), tab(0, 'First')];
    tabPreview(tabs);
    expect(tabs.map((item) => item.title)).toEqual(['Second', 'First']);
  });

  it('returns an empty list for a workspace with no tabs', () => {
    expect(tabPreview([])).toEqual({ labels: [], more: 0, total: 0 });
  });
});

describe('tabCount', () => {
  it('uses the singular for one tab', () => {
    expect(tabCount(1)).toBe('1 tab');
    expect(tabCount(0)).toBe('0 tabs');
  });
});

describe('placeBeside', () => {
  const viewport = { width: 1000, height: 800 };
  const card = { width: 280, height: 300 };
  const row = { top: 100, left: 8, width: 248, height: 34 };

  it('opens to the right of the anchor with the tops aligned', () => {
    expect(placeBeside(row, card, viewport)).toEqual({ top: 100, left: 268 });
  });

  it('moves up when the bottom would overflow', () => {
    expect(placeBeside({ ...row, top: 700 }, card, viewport).top).toBe(492);
  });

  it('moves left when the right edge would overflow', () => {
    expect(placeBeside(row, card, { width: 400, height: 800 }).left).toBe(112);
  });

  it('stays inside the top margin when the card is taller than the viewport', () => {
    expect(placeBeside(row, { width: 280, height: 900 }, viewport).top).toBe(8);
  });
});
