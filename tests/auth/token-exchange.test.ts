import { describe, expect, it } from 'vitest';
import { DRIVE_APPDATA_SCOPE, exchangeCode, refreshAccessToken } from '@/lib/auth/google-oauth';
import { fakeFetchOnce } from '../helpers/fake-fetch';

const cfg = { clientId: 'client-1', redirectUri: 'https://abc.chromiumapp.org/' };
const now = () => 1_000_000;

describe('exchangeCode', () => {
  it('exchanges the code and computes expiresAt from expires_in', async () => {
    const fetchFn = fakeFetchOnce(200, {
      access_token: 'a1',
      expires_in: 3920,
      refresh_token: 'r1',
      scope: DRIVE_APPDATA_SCOPE,
    });
    const t = await exchangeCode(cfg, 'c1', 'v1', fetchFn, now);
    expect(t).toEqual({
      accessToken: 'a1',
      expiresAt: 1_000_000 + 3_920_000,
      refreshToken: 'r1',
      scope: DRIVE_APPDATA_SCOPE,
    });
    const call = fetchFn.calls[0]!;
    expect(call.url).toBe('https://oauth2.googleapis.com/token');
    expect(call.method).toBe('POST');
    expect(call.headers['content-type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(call.body);
    expect(Object.fromEntries(body)).toEqual({
      client_id: 'client-1',
      code: 'c1',
      code_verifier: 'v1',
      redirect_uri: 'https://abc.chromiumapp.org/',
      grant_type: 'authorization_code',
    });
  });

  it('sends client_secret when the config has one', async () => {
    const fetchFn = fakeFetchOnce(200, { access_token: 'a1', expires_in: 3600, scope: 's' });
    await exchangeCode({ ...cfg, clientSecret: 's1' }, 'c1', 'v1', fetchFn, now);
    expect(new URLSearchParams(fetchFn.calls[0]!.body).get('client_secret')).toBe('s1');
  });

  it('throws the Google error code', async () => {
    const fetchFn = fakeFetchOnce(400, { error: 'invalid_grant' });
    await expect(exchangeCode(cfg, 'c1', 'v1', fetchFn, now)).rejects.toMatchObject({
      code: 'invalid_grant',
    });
  });

  it('throws http_<status> when the body has no error', async () => {
    const fetchFn = fakeFetchOnce(503, '');
    await expect(exchangeCode(cfg, 'c1', 'v1', fetchFn, now)).rejects.toMatchObject({
      code: 'http_503',
    });
  });
});

describe('refreshAccessToken', () => {
  it('sends the refresh grant', async () => {
    const fetchFn = fakeFetchOnce(200, { access_token: 'a2', expires_in: 3600, scope: 's' });
    await refreshAccessToken(cfg, 'r1', fetchFn, now);
    expect(Object.fromEntries(new URLSearchParams(fetchFn.calls[0]!.body))).toEqual({
      client_id: 'client-1',
      refresh_token: 'r1',
      grant_type: 'refresh_token',
    });
  });

  it('keeps the old refresh token when the refresh response has none', async () => {
    const fetchFn = fakeFetchOnce(200, { access_token: 'a2', expires_in: 3600, scope: 's' });
    const t = await refreshAccessToken(cfg, 'r1', fetchFn, now);
    expect(t).toEqual({ accessToken: 'a2', expiresAt: 1_000_000 + 3_600_000, refreshToken: 'r1', scope: 's' });
  });

  it('uses a new refresh token when the response has one', async () => {
    const fetchFn = fakeFetchOnce(200, { access_token: 'a2', expires_in: 3600, refresh_token: 'r2', scope: 's' });
    const t = await refreshAccessToken(cfg, 'r1', fetchFn, now);
    expect(t.refreshToken).toBe('r2');
  });
});
