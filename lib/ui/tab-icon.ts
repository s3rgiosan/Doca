/** Returns up to two initials: the first letter of each of the first two words, in upper case. */
export function workspaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

/** Returns white or near-black, whichever has more contrast on the `#rrggbb` fill. */
export function textColorOn(fill: string): string {
  const luminance = relativeLuminance(fill);
  const onWhite = 1.05 / (luminance + 0.05);
  const onDark = (luminance + 0.05) / (relativeLuminance(DARK_TEXT) + 0.05);
  return onWhite >= onDark ? '#ffffff' : DARK_TEXT;
}

/** Builds an SVG data URL that shows the initials on a square of the fill colour. Returns null when the name has no initials. */
export function workspaceIconUrl(name: string, fill: string): string | null {
  const initials = workspaceInitials(name);
  if (initials === '') {
    return null;
  }
  const size = Array.from(initials).length === 1 ? 20 : 15;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="${fill}"/>` +
    `<text x="16" y="16" dy=".35em" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" ` +
    `font-size="${size}" font-weight="700" fill="${textColorOn(fill)}">${escapeXml(initials)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DARK_TEXT = '#1f1d1a';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
