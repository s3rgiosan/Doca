import { describe, expect, it } from 'vitest';
import { exportWorkspaces, ImportError, MAX_IMPORT_TABS, MAX_IMPORT_TEXT_LENGTH, MAX_IMPORT_WORKSPACES, parseImport, planImport } from '@/lib/io/transfer';
import { newWorkspace, tombstone } from '@/lib/model/workspace';

const tab = { id: 't1', url: 'https://a.test/', finalUrl: 'https://a.test/', title: 'A', pinned: false, index: 0 };
const ws = (id: string) => ({ ...newWorkspace({ id, name: `WS ${id}`, deviceId: 'd', now: 1, tabs: [tab] }), rev: 4 });

describe('export and parse', () => {
  it('round-trips live workspaces and leaves tombstones out', () => {
    const text = exportWorkspaces([ws('a'), tombstone(ws('b'), 2)], 9);
    expect(JSON.parse(text).format).toBe('doca-export');
    expect(parseImport(text)).toEqual([ws('a')]);
  });

  it.each([
    ['not json', 'not json'],
    ['wrong format', JSON.stringify({ format: 'other', version: 1, exportedAt: 1, workspaces: [] })],
    ['newer version', JSON.stringify({ format: 'doca-export', version: 2, exportedAt: 1, workspaces: [] })],
    ['tab with no url', JSON.stringify({ format: 'doca-export', version: 1, exportedAt: 1, workspaces: [{ ...ws('a'), tabs: [{ id: 'x' }] }] })],
    ['workspace with no name', JSON.stringify({ format: 'doca-export', version: 1, exportedAt: 1, workspaces: [{ id: 'a', tabs: [] }] })],
  ])('rejects %s', (_label, text) => {
    expect(() => parseImport(text)).toThrow(ImportError);
  });
});

describe('colour', () => {
  const file = (workspace: unknown) => JSON.stringify({ format: 'doca-export', version: 1, exportedAt: 1, workspaces: [workspace] });

  it('round-trips a valid colour', () => {
    const colored = { ...ws('a'), color: 'teal' as const };
    expect(parseImport(exportWorkspaces([colored], 9))).toEqual([colored]);
  });

  it('drops an unknown colour key without an error', () => {
    const [parsed] = parseImport(file({ ...ws('a'), color: 'plaid' }));
    expect(parsed).toEqual(ws('a'));
    expect('color' in parsed!).toBe(false);
  });

  it('drops a colour of the wrong type', () => {
    const [parsed] = parseImport(file({ ...ws('a'), color: 7 }));
    expect('color' in parsed!).toBe(false);
  });

  it('reads a file that has no colour', () => {
    expect(parseImport(file(ws('a')))).toEqual([ws('a')]);
  });
});

describe('old suspend field', () => {
  const legacy = { ...ws('a'), suspendAfterMinutes: 5 };
  const file = JSON.stringify({ format: 'doca-export', version: 1, exportedAt: 1, workspaces: [legacy] });

  it('imports a workspace that still has suspendAfterMinutes and drops the field', () => {
    const [parsed] = parseImport(file);
    expect(parsed).toEqual(ws('a'));
    expect('suspendAfterMinutes' in parsed!).toBe(false);
  });

  it('does not export the field', () => {
    expect(exportWorkspaces([legacy], 9)).not.toContain('suspendAfterMinutes');
  });
});

describe('planImport', () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const wsU = (n: number, tabId = uuid(100 + n)) => ({ ...ws(uuid(n)), tabs: [{ ...tab, id: tabId }] });
  const counter = () => {
    let n = 0;
    return () => uuid(900 + ++n);
  };

  it('passes a new workspace with UUID ids through with rev 0', () => {
    const [planned] = planImport([wsU(1)], new Set(), counter());
    expect(planned).toEqual({ ...wsU(1), rev: 0 });
  });

  it('copies a workspace whose ID exists, with new IDs and a suffix', () => {
    const [planned] = planImport([wsU(1)], new Set([uuid(1)]), counter());
    expect(planned!.id).toBe(uuid(901));
    expect(planned!.tabs[0]!.id).toBe(uuid(902));
    expect(planned!.name).toBe(`WS ${uuid(1)} (imported)`);
    expect(planned!.rev).toBe(0);
  });

  it('gives a new ID to a workspace and tab whose IDs are not UUIDs', () => {
    const [planned] = planImport([{ ...ws('index'), tabs: [{ ...tab, id: 'a"b' }] }], new Set(), counter());
    expect(planned!.id).toBe(uuid(901));
    expect(planned!.tabs[0]!.id).toBe(uuid(902));
    expect(planned!.name).toBe('WS index');
  });

  it('copies the second workspace when two workspaces in one file share an ID', () => {
    const planned = planImport([wsU(1), wsU(1)], new Set(), counter());
    expect(planned[0]!.id).toBe(uuid(1));
    expect(planned[1]!.id).not.toBe(uuid(1));
    expect(planned[1]!.name).toMatch(/ \(imported\)$/);
    expect(new Set(planned.map((w) => w.id)).size).toBe(2);
  });

  it('gives a new ID to a repeated tab ID in one workspace', () => {
    const dup = { ...wsU(1), tabs: [{ ...tab, id: uuid(5) }, { ...tab, id: uuid(5), index: 1 }] };
    const [planned] = planImport([dup], new Set(), counter());
    expect(planned!.tabs[0]!.id).toBe(uuid(5));
    expect(planned!.tabs[1]!.id).toBe(uuid(901));
  });
});

describe('import validation', () => {
  const file = (workspaces: unknown[]) => JSON.stringify({ format: 'doca-export', version: 1, exportedAt: 1, workspaces });
  const withTabs = (tabs: unknown[]) => file([{ ...ws('a'), tabs }]);

  it('drops tabs whose URL scheme cannot be reopened and renumbers the rest', () => {
    const tabs = [
      { ...tab, id: 'a', url: 'javascript:alert(1)' },
      { ...tab, id: 'b', url: 'data:text/html,hi' },
      { ...tab, id: 'c', url: 'not a url' },
      { ...tab, id: 'd', url: 'https://example.com/' },
    ];
    const [parsed] = parseImport(withTabs(tabs));
    expect(parsed!.tabs.map((t) => [t.id, t.index])).toEqual([['d', 0]]);
  });

  it('keeps chrome and file tabs', () => {
    const tabs = [
      { ...tab, id: 'a', url: 'chrome://settings/' },
      { ...tab, id: 'b', url: 'file:///tmp/example.txt' },
    ];
    const [parsed] = parseImport(withTabs(tabs));
    expect(parsed!.tabs.map((t) => t.url)).toEqual(['chrome://settings/', 'file:///tmp/example.txt']);
  });

  it('falls back to the URL when finalUrl has a scheme that cannot be reopened', () => {
    const [parsed] = parseImport(withTabs([{ ...tab, url: 'https://example.com/', finalUrl: 'javascript:alert(1)' }]));
    expect(parsed!.tabs[0]!.finalUrl).toBe('https://example.com/');
  });

  it('keeps an http finalUrl', () => {
    const [parsed] = parseImport(withTabs([{ ...tab, url: 'https://example.com/', finalUrl: 'http://example.com/x' }]));
    expect(parsed!.tabs[0]!.finalUrl).toBe('http://example.com/x');
  });

  it('rejects a file with too many workspaces', () => {
    const many = Array.from({ length: MAX_IMPORT_WORKSPACES + 1 }, (_v, i) => ws(`w${i}`));
    expect(() => parseImport(file(many))).toThrow(/more than 500 workspaces/);
  });

  it('rejects a workspace with too many tabs', () => {
    const many = Array.from({ length: MAX_IMPORT_TABS + 1 }, (_v, i) => ({ ...tab, id: `t${i}` }));
    expect(() => parseImport(withTabs(many))).toThrow(/more than 1000 tabs/);
  });

  it('truncates long workspace names and tab titles', () => {
    const long = 'x'.repeat(MAX_IMPORT_TEXT_LENGTH + 50);
    const [parsed] = parseImport(file([{ ...ws('a'), name: long, tabs: [{ ...tab, title: long }] }]));
    expect(parsed!.name).toHaveLength(MAX_IMPORT_TEXT_LENGTH);
    expect(parsed!.tabs[0]!.title).toHaveLength(MAX_IMPORT_TEXT_LENGTH);
  });
});
