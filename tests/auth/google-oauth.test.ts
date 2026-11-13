import { describe, expect, it } from 'vitest';
import {
  AUTH_ENDPOINT,
  DRIVE_APPDATA_SCOPE,
  buildAuthUrl,
  parseRedirect,
} from '@/lib/auth/google-oauth';

const cfg = { clientId: 'client-1', redirectUri: 'https://abc.chromiumapp.org/' };

describe('buildAuthUrl', () => {
  it('builds the auth URL', () => {
    const url = new URL(buildAuthUrl(cfg, { challenge: 'ch', state: 'st', prompt: 'consent' }));
    expect(url.origin + url.pathname).toBe(AUTH_ENDPOINT);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-1',
      redirect_uri: 'https://abc.chromiumapp.org/',
      response_type: 'code',
      scope: DRIVE_APPDATA_SCOPE,
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      state: 'st',
      access_type: 'offline',
      prompt: 'consent',
    });
  });

  it('leaves out prompt when not given', () => {
    const url = new URL(buildAuthUrl(cfg, { challenge: 'ch', state: 'st' }));
    expect(url.searchParams.has('prompt')).toBe(false);
  });
});

describe('parseRedirect', () => {
  it('returns the code', () => {
    expect(parseRedirect('https://abc.chromiumapp.org/?state=st&code=c1', 'st')).toBe('c1');
  });

  it('fails on a state mismatch', () => {
    expect(() => parseRedirect('https://abc.chromiumapp.org/?state=xx&code=c1', 'st')).toThrow(
      expect.objectContaining({ code: 'state_mismatch' }),
    );
  });

  it('fails with the error from Google', () => {
    expect(() =>
      parseRedirect('https://abc.chromiumapp.org/?state=st&error=access_denied', 'st'),
    ).toThrow(expect.objectContaining({ code: 'access_denied' }));
  });

  it('fails when the code is missing', () => {
    expect(() => parseRedirect('https://abc.chromiumapp.org/?state=st', 'st')).toThrow(
      expect.objectContaining({ code: 'missing_code' }),
    );
  });
});
