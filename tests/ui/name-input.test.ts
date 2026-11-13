import { describe, expect, it } from 'vitest';
import { nameToSubmit } from '@/lib/ui/name';

describe('nameToSubmit', () => {
  it('returns the trimmed name', () => {
    expect(nameToSubmit('  Client X ', '')).toBe('Client X');
  });

  it('returns null for an empty name', () => {
    expect(nameToSubmit('   ', 'Old')).toBeNull();
  });

  it('returns null when the name did not change', () => {
    expect(nameToSubmit(' Old ', 'Old')).toBeNull();
  });
});
