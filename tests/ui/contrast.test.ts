import { describe, expect, it } from 'vitest';
import { contrastRatio, parseTokens } from '@/lib/ui/contrast';
// @ts-expect-error The project has no Node type definitions. Vitest runs in Node.
import { readFileSync } from 'node:fs';

const css: string = readFileSync('lib/ui/theme.css', 'utf8');

const lightBlock = /:root\s*\{([^}]*)\}/.exec(css)![1]!;
const darkBlock = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)![1]!;
const light = parseTokens(lightBlock);
const dark = { ...light, ...parseTokens(darkBlock) };

/** Text pairs need 4.5:1. */
const textPairs: Array<[string, string]> = [
  ['--text', '--bg'],
  ['--text', '--surface'],
  ['--text', '--accent-soft'],
  ['--muted', '--bg'],
  ['--muted', '--surface'],
  ['--muted', '--accent-soft'],
  ['--text', '--secondary-bg'],
  ['--muted', '--secondary-bg'],
  ['--on-accent', '--accent'],
  ['--on-danger', '--danger'],
  ['--accent', '--surface'],
  ['--accent', '--bg'],
  ['--accent', '--accent-soft'],
  // The Undo button of the toast on hover.
  ['--accent', '--secondary-bg'],
  ['--danger', '--surface'],
  ['--danger', '--bg'],
  ['--danger', '--accent-soft'],
  ['--danger', '--secondary-bg'],
];

/** Control boundaries and focus rings need 3:1. */
const boundaryPairs: Array<[string, string]> = [
  ['--border-strong', '--surface'],
  ['--border-strong', '--bg'],
  ['--border-strong', '--secondary-bg'],
  ['--focus', '--surface'],
  ['--focus', '--bg'],
  ['--focus', '--accent-soft'],
  ['--focus', '--secondary-bg'],
  ['--accent', '--bg'],
  ['--accent', '--accent-soft'],
];

const WS_COLORS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'];

/** Workspace dots are graphics and need 3:1 on every surface that shows them. */
const dotPairs: Array<[string, string]> = WS_COLORS.flatMap((key) =>
  ['--bg', '--surface', '--accent-soft'].map((bg): [string, string] => [`--ws-${key}`, bg]),
);

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_name, tokens) => {
  it.each(textPairs)('%s on %s has at least 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(boundaryPairs)('%s on %s has at least 3:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(dotPairs)('%s on %s has at least 3:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});
