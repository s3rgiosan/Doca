import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getValidAccessToken, loadTokens, saveTokens } from '@/lib/auth/token-store';
import { fakeFetchOnce } from '../helpers/fake-fetch';

const cfg = { clientId: 'client-1', redirectUri: 'https://abc.chromiumapp.org/' };
const NOW = 1_000_000;
const now = () => NOW;

describe('getValidAccessToken', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('throws not_signed_in with no tokens', async () => {
    await expect(getValidAccessToken(cfg, fakeFetchOnce(500, ''), now)).rejects.toMatchObject({
      code: 'not_signed_in',
    });
  });

  it('returns the stored token when more than 60 s remain', async () => {
    await saveTokens({ accessToken: 'a1', expiresAt: NOW + 61_000, refreshToken: 'r1', scope: 's' });
    const fetchFn = fakeFetchOnce(500, '');
    expect(await getValidAccessToken(cfg, fetchFn, now)).toBe('a1');
    expect(fetchFn.calls).toHaveLength(0);
  });

  it('refreshes and saves when 60 s or less remain', async () => {
    await saveTokens({ accessToken: 'a1', expiresAt: NOW + 60_000, refreshToken: 'r1', scope: 's' });
    const fetchFn = fakeFetchOnce(200, { access_token: 'a2', expires_in: 3600, scope: 's' });
    expect(await getValidAccessToken(cfg, fetchFn, now)).toBe('a2');
    expect(await loadTokens()).toEqual({
      accessToken: 'a2',
      expiresAt: NOW + 3_600_000,
      refreshToken: 'r1',
      scope: 's',
    });
  });

  it('clears tokens and throws needs_interaction on invalid_grant', async () => {
    await saveTokens({ accessToken: 'a1', expiresAt: NOW, refreshToken: 'r1', scope: 's' });
    await expect(
      getValidAccessToken(cfg, fakeFetchOnce(400, { error: 'invalid_grant' }), now),
    ).rejects.toMatchObject({ code: 'needs_interaction' });
    expect(await loadTokens()).toBeNull();
  });

  it('keeps tokens and passes on other refresh errors', async () => {
    await saveTokens({ accessToken: 'a1', expiresAt: NOW, refreshToken: 'r1', scope: 's' });
    await expect(getValidAccessToken(cfg, fakeFetchOnce(503, ''), now)).rejects.toMatchObject({
      code: 'http_503',
    });
    expect(await loadTokens()).not.toBeNull();
  });

  it('throws needs_interaction with no refresh token', async () => {
    await saveTokens({ accessToken: 'a1', expiresAt: NOW, scope: 's' });
    await expect(getValidAccessToken(cfg, fakeFetchOnce(500, ''), now)).rejects.toMatchObject({
      code: 'needs_interaction',
    });
  });
});
