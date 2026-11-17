import { describe, expect, it } from 'vitest';
import { textColorOn, workspaceIconUrl, workspaceInitials } from '@/lib/ui/tab-icon';

describe('workspaceInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(workspaceInitials('Client site')).toBe('CS');
    expect(workspaceInitials('side project alpha')).toBe('SP');
  });

  it('takes one letter from a one-word name', () => {
    expect(workspaceInitials('Research')).toBe('R');
  });

  it('ignores extra spaces and keeps a whole emoji', () => {
    expect(workspaceInitials('  Reading   list ')).toBe('RL');
    expect(workspaceInitials('🚀 Launch')).toBe('🚀L');
  });

  it('returns an empty string for a blank name', () => {
    expect(workspaceInitials('   ')).toBe('');
  });
});

describe('textColorOn', () => {
  it('uses white on a dark fill and dark text on a light fill', () => {
    expect(textColorOn('#0f766e')).toBe('#ffffff');
    expect(textColorOn('#e6b422')).toBe('#1f1d1a');
  });
});

describe('workspaceIconUrl', () => {
  it('draws the initials on the fill colour', () => {
    const url = workspaceIconUrl('Client site', '#2563eb');
    expect(url).not.toBeNull();
    const svg = decodeURIComponent(url!.replace('data:image/svg+xml,', ''));
    expect(svg).toContain('fill="#2563eb"');
    expect(svg).toContain('>CS</text>');
  });

  it('escapes characters that would break the SVG', () => {
    const svg = decodeURIComponent(workspaceIconUrl('<b> & co', '#2563eb')!.replace('data:image/svg+xml,', ''));
    expect(svg).toContain('&#60;&#38;</text>');
  });

  it('returns null for a blank name', () => {
    expect(workspaceIconUrl(' ', '#2563eb')).toBeNull();
  });
});
