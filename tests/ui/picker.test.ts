import { describe, expect, it } from 'vitest';
import { newWorkspace } from '@/lib/model/workspace';
import { firstPickable, nextHighlight, pickerRows, type PickerRow } from '@/lib/ui/picker';

const ws = (id: string, name: string) => newWorkspace({ id, name, deviceId: 'd', now: 0 });
const all = [ws('1', 'Research'), ws('2', 'Client X'), ws('3', 'Personal'), ws('4', 'Client Y')];
const bound = new Set(['1', '2']);
const labels = (rows: PickerRow[]) =>
  rows.map((row) => (row.kind === 'new' ? `new:${row.name}` : `${row.ws.name}${row.current ? '*' : ''}`));

describe('pickerRows', () => {
  it('puts the new row first, then the current workspace, then open and closed by name', () => {
    const rows = pickerRows(all, { currentId: '2', showCurrent: true, bound, query: '' });
    expect(labels(rows)).toEqual(['new:', 'Client X*', 'Research', 'Client Y', 'Personal']);
  });

  it('leaves out the current workspace when asked', () => {
    const rows = pickerRows(all, { currentId: '2', showCurrent: false, bound, query: '' });
    expect(labels(rows)).toEqual(['new:', 'Research', 'Client Y', 'Personal']);
  });

  it('filters by name and uses the typed text as the new name', () => {
    const rows = pickerRows(all, { currentId: '2', showCurrent: true, bound, query: '  client ' });
    expect(labels(rows)).toEqual(['new:client', 'Client X*', 'Client Y']);
  });

  it('works for a window with no workspace', () => {
    const rows = pickerRows(all, { currentId: undefined, showCurrent: true, bound, query: 'per' });
    expect(labels(rows)).toEqual(['new:per', 'Personal']);
  });
});

describe('firstPickable', () => {
  it('picks the first workspace that matches typed text', () => {
    const rows = pickerRows(all, { currentId: '2', showCurrent: true, bound, query: 'client' });
    expect(firstPickable(rows, 'client')).toBe(2);
  });

  it('picks the new row when the text matches no other workspace', () => {
    const rows = pickerRows(all, { currentId: '2', showCurrent: true, bound, query: 'client x' });
    expect(firstPickable(rows, 'client x')).toBe(0);
  });

  it('picks nothing for empty text, because a new workspace needs a name', () => {
    const rows = pickerRows(all, { currentId: '2', showCurrent: true, bound, query: '' });
    expect(firstPickable(rows, '')).toBe(-1);
  });
});

describe('nextHighlight', () => {
  const rowsFor = (bounded: Set<string>, query = '') => pickerRows(all, { currentId: '2', showCurrent: false, bound: bounded, query });
  const before = { rows: rowsFor(new Set(['1'])), query: '' };

  it('keeps the highlighted workspace when only the rows change', () => {
    // Rows: new, Research, Client Y, Personal. The user highlighted Personal (index 3).
    const after = { rows: rowsFor(new Set(['1', '3'])), query: '' };
    const index = nextHighlight(before, after, 3);
    const row = after.rows[index]!;
    expect(row.kind === 'workspace' && row.ws.name).toBe('Personal');
  });

  it('falls back to firstPickable when the highlighted workspace is gone', () => {
    const after = { rows: pickerRows(all.filter((w) => w.id !== '3'), { currentId: '2', showCurrent: false, bound, query: '' }), query: '' };
    expect(nextHighlight(before, after, 3)).toBe(firstPickable(after.rows, ''));
  });

  it('resets when the query changes', () => {
    const after = { rows: rowsFor(new Set(['1']), 'per'), query: 'per' };
    expect(nextHighlight(before, after, 3)).toBe(firstPickable(after.rows, 'per'));
  });
});
