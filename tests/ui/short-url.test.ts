import { describe, expect, it } from 'vitest';
import { shortUrl, tabLabel } from '@/lib/ui/short-url';

describe('shortUrl', () => {
  it('returns an empty string for an empty string', () => {
    expect(shortUrl('')).toBe('');
  });

  it('removes the scheme and the trailing slash of a bare host', () => {
    expect(shortUrl('https://example.com/')).toBe('example.com');
  });

  it('keeps the host and the path', () => {
    expect(shortUrl('https://example.com/docs/start')).toBe('example.com/docs/start');
  });

  it('removes a trailing slash from a path', () => {
    expect(shortUrl('http://example.com/docs/')).toBe('example.com/docs');
  });

  it('keeps the port and drops the query and the fragment', () => {
    expect(shortUrl('https://example.com:8080/a/?token=abc#frag')).toBe('example.com:8080/a');
  });

  it('never shows credentials', () => {
    expect(shortUrl('https://user:secret@example.org/a')).toBe('example.org/a');
  });

  it('shows a percent-encoded path decoded', () => {
    expect(shortUrl('https://example.com/a%20b/caf%C3%A9')).toBe('example.com/a b/café');
  });

  it('keeps a path that does not decode', () => {
    expect(shortUrl('https://example.com/%E0%A4%A')).toBe('example.com/%E0%A4%A');
  });

  it('shows an IDN host in Unicode', () => {
    expect(shortUrl('https://bücher.example/x')).toBe('bücher.example/x');
    expect(shortUrl('https://xn--mnchen-3ya.example.org/')).toBe('münchen.example.org');
  });

  it('keeps the scheme of browser pages and drops the trailing slash', () => {
    expect(shortUrl('chrome://extensions/')).toBe('chrome://extensions');
    expect(shortUrl('brave://settings/privacy?x=1#y')).toBe('brave://settings/privacy');
    expect(shortUrl('edge://flags/')).toBe('edge://flags');
    expect(shortUrl('about:blank')).toBe('about:blank');
    expect(shortUrl('chrome-extension://abcdefgh/manager.html?ws=1#x')).toBe('chrome-extension://abcdefgh/manager.html');
  });

  it('keeps a file path and drops the query and the fragment', () => {
    expect(shortUrl('file:///Users/x/a.txt')).toBe('file:///Users/x/a.txt');
    expect(shortUrl('file:///Users/x/a.txt?q=1#h')).toBe('file:///Users/x/a.txt');
  });

  it('shows only the scheme for pages that can hold content', () => {
    expect(shortUrl('data:text/plain;base64,QUJD')).toBe('data:…');
    expect(shortUrl('blob:https://example.com/1234')).toBe('blob:…');
    expect(shortUrl('javascript:alert(1)')).toBe('javascript:…');
    expect(shortUrl('view-source:https://example.com/')).toBe('view-source:…');
  });

  it('returns a text that is not a URL unchanged', () => {
    expect(shortUrl('not a url')).toBe('not a url');
  });
});

describe('tabLabel', () => {
  it('shows the URL line for a tab with a title', () => {
    expect(tabLabel('Docs', 'https://example.com/docs')).toEqual({ title: 'Docs', showUrl: true });
  });

  it('hides the URL line when the title is empty and uses the short URL as the title', () => {
    expect(tabLabel('', 'https://example.com/docs?x=1')).toEqual({ title: 'example.com/docs', showUrl: false });
    expect(tabLabel('  ', 'https://example.com/')).toEqual({ title: 'example.com', showUrl: false });
  });

  it('hides the URL line when the title equals the URL or the short URL', () => {
    expect(tabLabel('https://example.com/docs', 'https://example.com/docs')).toEqual({
      title: 'example.com/docs',
      showUrl: false,
    });
    expect(tabLabel('example.com/docs', 'https://example.com/docs')).toEqual({ title: 'example.com/docs', showUrl: false });
  });

  it('treats an address without its scheme as no title and hides the query', () => {
    expect(tabLabel('example.com/page?id=1#top', 'https://example.com/page?id=1#top')).toEqual({
      title: 'example.com/page',
      showUrl: false,
    });
    expect(tabLabel('localhost:3000/?view=a', 'http://localhost:3000/?view=a')).toEqual({ title: 'localhost:3000', showUrl: false });
  });

  it('keeps a short real title that the address starts with', () => {
    expect(tabLabel('example', 'https://example.com/docs')).toEqual({ title: 'example', showUrl: true });
  });
});

describe('shortUrl look-alike hosts', () => {
  // The Cyrillic letter U+0430 looks like the Latin "a".
  const mixed = new URL('https://\u0430pple.example.com/').host;
  const cyrillicOnly = new URL('https://\u043F\u0440\u0438\u043C\u0435\u0440.example.com/').host;

  it('builds an xn-- host for the fixtures', () => {
    expect(mixed.startsWith('xn--')).toBe(true);
    expect(cyrillicOnly.startsWith('xn--')).toBe(true);
  });

  it('keeps the xn-- form of a label that mixes Latin and Cyrillic', () => {
    expect(shortUrl(`https://${mixed}/`)).toBe(mixed);
  });

  it('decodes a label in a single script', () => {
    expect(shortUrl(`https://${cyrillicOnly}/`)).toBe('\u043F\u0440\u0438\u043C\u0435\u0440.example.com');
  });

  it('strips bidi and control characters from a decoded path', () => {
    expect(shortUrl('https://example.com/a%E2%80%AEb%E2%81%A6c%00d%0Ae%C2%85f')).toBe('example.com/abcdef');
  });

  it('strips them from the path of a browser page', () => {
    expect(shortUrl('chrome://settings/a%E2%80%8Eb')).toBe('chrome://settings/ab');
  });
});

describe('tabLabel placeholder', () => {
  it('returns "Untitled tab" for an empty title and an empty URL', () => {
    expect(tabLabel('', '')).toEqual({ title: 'Untitled tab', showUrl: false });
  });
});
