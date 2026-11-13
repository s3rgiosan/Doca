import { describe, expect, it } from 'vitest';
import { activeOptionId, optionId } from '@/lib/ui/picker';
import { tabLabel } from '@/lib/ui/sidebar';

describe('optionId', () => {
  it('builds a stable id for each option of a list', () => {
    expect(optionId('list', 2)).toBe('list-option-2');
  });
});

describe('activeOptionId', () => {
  it('names the highlighted option while the list is open', () => {
    expect(activeOptionId(true, 1, 3, 'list')).toBe('list-option-1');
  });

  it('is undefined when the list is closed, nothing is highlighted, or the index is out of range', () => {
    expect(activeOptionId(false, 1, 3, 'list')).toBeUndefined();
    expect(activeOptionId(true, -1, 3, 'list')).toBeUndefined();
    expect(activeOptionId(true, 3, 3, 'list')).toBeUndefined();
  });
});

describe('tabLabel', () => {
  it('uses the title', () => {
    expect(tabLabel({ title: 'Docs', url: 'https://example.com/' })).toBe('Docs');
  });

  it('falls back to the URL for an empty title', () => {
    expect(tabLabel({ title: '  ', url: 'https://example.com/?a1' })).toBe('https://example.com/?a1');
  });
});
