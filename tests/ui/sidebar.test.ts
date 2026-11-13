import { describe, expect, it } from 'vitest';
import { newWorkspace } from '@/lib/model/workspace';
import { filterTabs, mainView, sidebarGroups, withoutManager } from '@/lib/ui/sidebar';

const ws = (id: string, name: string) => newWorkspace({ id, name, deviceId: 'd', now: 0 });

describe('sidebarGroups', () => {
  const all = [ws('1', 'research'), ws('2', 'Client X'), ws('3', 'Personal'), ws('4', 'Client Y')];

  it('splits open and closed workspaces and sorts each by name', () => {
    const groups = sidebarGroups(all, new Set(['1', '4']), '');
    expect(groups.open.map((w) => w.name)).toEqual(['Client Y', 'research']);
    expect(groups.closed.map((w) => w.name)).toEqual(['Client X', 'Personal']);
  });

  it('filters by name in any case', () => {
    const groups = sidebarGroups(all, new Set(['4']), 'CLIENT');
    expect(groups.open.map((w) => w.name)).toEqual(['Client Y']);
    expect(groups.closed.map((w) => w.name)).toEqual(['Client X']);
  });
});

describe('filterTabs', () => {
  const tabs = [
    { title: 'Project board', url: 'https://board.test/' },
    { title: 'Staging', url: 'https://staging.example.test/' },
  ];

  it('returns every tab for an empty query', () => {
    expect(filterTabs(tabs, '  ')).toEqual(tabs);
  });

  it('matches the title or the URL in any case', () => {
    expect(filterTabs(tabs, 'BOARD')).toEqual([tabs[0]]);
    expect(filterTabs(tabs, 'example')).toEqual([tabs[1]]);
  });
});

describe('withoutManager', () => {
  it('leaves out the manager tab and keeps the order of the other tabs', () => {
    const base = 'chrome-extension://example/manager.html';
    const tabs = [
      { url: `${base}?ws=ws1` },
      { url: 'https://a.test/' },
      { url: 'https://b.test/' },
    ];
    expect(withoutManager(tabs, base)).toEqual([tabs[1], tabs[2]]);
  });
});

describe('mainView', () => {
  it('shows the workspace of the page when it exists', () => {
    expect(mainView([ws('1', 'A'), ws('2', 'B')], '2')).toBe('workspace');
  });

  it('says the workspace was deleted when other workspaces exist', () => {
    expect(mainView([ws('1', 'A')], 'gone')).toBe('deleted');
  });

  it('offers a first workspace when there is none, also for a page whose workspace is gone', () => {
    expect(mainView([], 'gone')).toBe('no-workspaces');
    expect(mainView([], '')).toBe('no-workspaces');
  });

  it('counts a tombstone as no workspace', () => {
    const tomb = { ...ws('1', 'A'), deleted: true, deletedAt: 1 };
    expect(mainView([tomb], '1')).toBe('no-workspaces');
    expect(mainView([tomb, ws('2', 'B')], '1')).toBe('deleted');
  });
});
