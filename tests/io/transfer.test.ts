import { describe, expect, it } from 'vitest';
import { exportWorkspaces, ImportError, parseImport, planImport } from '@/lib/io/transfer';
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
  it('passes a new workspace through with rev 0', () => {
    const [planned] = planImport([ws('a')], new Set(), () => 'n');
    expect(planned).toEqual({ ...ws('a'), rev: 0 });
  });

  it('copies a workspace whose ID exists, with new IDs and a suffix', () => {
    let n = 0;
    const [planned] = planImport([ws('a')], new Set(['a']), () => `n${++n}`);
    expect(planned!.id).toBe('n1');
    expect(planned!.tabs[0]!.id).toBe('n2');
    expect(planned!.name).toBe('WS a (imported)');
    expect(planned!.rev).toBe(0);
  });
});
