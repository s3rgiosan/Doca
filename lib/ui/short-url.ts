/** Schemes of browser pages. They keep their scheme in the short form. */
const INTERNAL_SCHEMES = new Set(['chrome:', 'brave:', 'edge:', 'about:', 'chrome-extension:', 'file:']);

const PUNYCODE_BASE = 36;
const PUNYCODE_TMIN = 1;
const PUNYCODE_TMAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;

function adapt(delta: number, count: number, first: boolean): number {
  let value = first ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
  value += Math.floor(value / count);
  let k = 0;
  while (value > ((PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX) >> 1) {
    value = Math.floor(value / (PUNYCODE_BASE - PUNYCODE_TMIN));
    k += PUNYCODE_BASE;
  }
  return k + Math.floor(((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * value) / (value + PUNYCODE_SKEW));
}

/** Decodes the punycode text of one host label (RFC 3492). Returns undefined for invalid input. */
function punycodeDecode(input: string): string | undefined {
  const output: number[] = [];
  const basicEnd = input.lastIndexOf('-');
  for (let i = 0; i < Math.max(basicEnd, 0); i++) {
    output.push(input.charCodeAt(i));
  }
  let n = 128;
  let bias = 72;
  let i = 0;
  let index = basicEnd > 0 ? basicEnd + 1 : 0;
  while (index < input.length) {
    const oldI = i;
    let weight = 1;
    for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
      if (index >= input.length) {
        return undefined;
      }
      const code = input.charCodeAt(index++);
      let digit: number;
      if (code >= 48 && code <= 57) {
        digit = code - 22;
      } else if (code >= 97 && code <= 122) {
        digit = code - 97;
      } else {
        return undefined;
      }
      i += digit * weight;
      const t = k <= bias ? PUNYCODE_TMIN : k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias;
      if (digit < t) {
        break;
      }
      weight *= PUNYCODE_BASE - t;
    }
    const count = output.length + 1;
    bias = adapt(i - oldI, count, oldI === 0);
    n += Math.floor(i / count);
    i %= count;
    output.splice(i++, 0, n);
  }
  try {
    return String.fromCodePoint(...output);
  } catch {
    return undefined;
  }
}

/** Shows the Unicode form of the `xn--` labels of a host. */
function unicodeHost(host: string): string {
  return host
    .split('.')
    .map((label) => (label.startsWith('xn--') ? (punycodeDecode(label.slice(4)) ?? label) : label))
    .join('.');
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Shortens a URL for a list. A web URL shows its host and path only: no scheme, no credentials, no
 * query, no fragment and no trailing slash. Browser pages keep their scheme. Pages that can hold
 * content show the scheme and "…".
 */
export function shortUrl(url: string): string {
  if (url === '') {
    return '';
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const { protocol } = parsed;
  if (protocol === 'http:' || protocol === 'https:') {
    const host = unicodeHost(parsed.host);
    return `${host}${decodePath(parsed.pathname).replace(/\/+$/, '')}`;
  }
  if (!INTERNAL_SCHEMES.has(protocol)) {
    return `${protocol}…`;
  }
  const path = decodePath(parsed.pathname).replace(/\/+$/, '');
  if (url.startsWith(`${protocol}//`)) {
    return `${protocol}//${parsed.host}${path}`;
  }
  return `${protocol}${path}`;
}

/** The title to show for a tab, and whether the URL line adds information. */
export function tabLabel(title: string, url: string): { title: string; showUrl: boolean } {
  const text = title.trim();
  const short = shortUrl(url);
  // An untitled page gets its address, often without the scheme, as its title.
  const bare = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const urlLike =
    text === '' || text === url || text === bare || text === short || (text.length >= short.length && bare.startsWith(text));
  if (urlLike) {
    return { title: short === '' ? url : short, showUrl: false };
  }
  return { title, showUrl: true };
}
