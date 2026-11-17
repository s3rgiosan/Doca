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
  // The sidebar and its group labels.
  ['--text', '--sidebar'],
  ['--muted', '--sidebar'],
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
  // The focused field border.
  ['--accent', '--surface'],
];

/**
 * The selection bar uses `--secondary-bg`. Its fields and checkbox keep a 3:1 boundary on that fill,
 * and its text and the muted tab count keep 4.5:1 (see the text pairs above).
 */
const selectionBarBoundaryPairs: Array<[string, string]> = [
  ['--border-strong', '--secondary-bg'],
  ['--accent', '--secondary-bg'],
  ['--focus', '--secondary-bg'],
];

/** A ticked tab row uses `--accent-soft`: its title, its URL (muted) and its checkbox. */
const tickedRowTextPairs: Array<[string, string]> = [
  ['--text', '--accent-soft'],
  ['--muted', '--accent-soft'],
];

/** The dialogs, menus, lists and toast sit on `--surface` and need an edge against the page. */
const layerPairs: Array<[string, string]> = [
  ['--border-strong', '--bg'],
  ['--border-strong', '--sidebar'],
  ['--border-strong', '--surface'],
];

/** Text on a button state that mixes a fill toward the text color. */
const mixedTextPairs: Array<[string, string, string, number]> = [
  ['--on-accent', '--accent', '--text', 0.1],
  ['--on-accent', '--accent', '--text', 0.2],
  ['--on-danger', '--danger', '--text', 0.1],
  ['--on-danger', '--danger', '--text', 0.2],
  ['--text', '--secondary-bg', '--text', 0.12],
];

/** Mixes two `#rrggbb` colors in sRGB, like `color-mix(in srgb, a, b p%)`. */
function mix(a: string, b: string, share: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(channel(a, i) * (1 - share) + channel(b, i) * share).toString(16).padStart(2, '0'))
      .join('')
  );
}

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

  it.each(selectionBarBoundaryPairs)('selection bar: %s on %s has at least 3:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(tickedRowTextPairs)('ticked row: %s on %s has at least 4.5:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(layerPairs)('layer edge: %s on %s has at least 3:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it('muted text on the disabled button fill has at least 4.5:1', () => {
    expect(contrastRatio(tokens['--muted']!, tokens['--secondary-bg']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('the disabled button fill differs from the dialog surface', () => {
    expect(tokens['--secondary-bg']).not.toBe(tokens['--surface']);
  });

  it.each(mixedTextPairs)('%s on %s mixed %s by %s has at least 4.5:1', (fg, bg, toward, share) => {
    expect(contrastRatio(tokens[fg]!, mix(tokens[bg]!, tokens[toward]!, share))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(dotPairs)('%s on %s has at least 3:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('checkbox mark', () => {
  const marks = [...css.matchAll(/stroke='%23([0-9a-fA-F]{6})'/g)];
  const darkStart = css.indexOf("@media (prefers-color-scheme: dark) {\n  input[type='checkbox']");

  it('finds the four marks', () => {
    expect(marks).toHaveLength(4);
    expect(darkStart).toBeGreaterThan(0);
  });

  it.each([0, 1, 2, 3])('mark %s uses --on-accent of its theme', (index) => {
    const match = marks[index]!;
    const isDark = match.index! > darkStart;
    const expected = (isDark ? dark : light)['--on-accent'];
    expect('#' + match[1]!.toLowerCase()).toBe(expected!.toLowerCase());
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});
