import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadTokens, saveTokens } from '@/lib/auth/token-store';
import { signIn, signInSilently, type LaunchFn } from '@/lib/auth/sign-in';
import { fakeFetchOnce } from '../helpers/fake-fetch';

const cfg = { clientId: 'client-1', redirectUri: 'https://abc.chromiumapp.org/' };
const now = () => 1_000_000;

interface Launch {
  url: URL;
  interactive: boolean;
}

/** Makes a launcher that answers with a code for the state in the auth URL. */
function fakeLaunch(launches: Launch[]): LaunchFn {
  return async (url, interactive) => {
    const parsed = new URL(url);
    launches.push({ url: parsed, interactive });
    return `${cfg.redirectUri}?state=${parsed.searchParams.get('state')}&code=c1`;
  };
}

describe('sign-in', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('signIn launches interactively with prompt=consent and saves tokens', async () => {
    const launches: Launch[] = [];
    const fetchFn = fakeFetchOnce(200, { access_token: 'a1', expires_in: 3600, refresh_token: 'r1', scope: 's' });
    const t = await signIn(cfg, fakeLaunch(launches), fetchFn, now);
    expect(launches[0]!.interactive).toBe(true);
    expect(launches[0]!.url.searchParams.get('prompt')).toBe('consent');
    expect(launches[0]!.url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const body = new URLSearchParams(fetchFn.calls[0]!.body);
    expect(body.get('code')).toBe('c1');
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    expect(await loadTokens()).toEqual(t);
    expect(t.refreshToken).toBe('r1');
  });

  it('signInSilently launches non-interactively with prompt=none', async () => {
    const launches: Launch[] = [];
    const fetchFn = fakeFetchOnce(200, { access_token: 'a1', expires_in: 3600, refresh_token: 'r1', scope: 's' });
    await signInSilently(cfg, fakeLaunch(launches), fetchFn, now);
    expect(launches[0]!.interactive).toBe(false);
    expect(launches[0]!.url.searchParams.get('prompt')).toBe('none');
  });

  it('signInSilently maps a launch failure to needs_interaction', async () => {
    const launch: LaunchFn = async () => {
      throw new Error('User interaction required.');
    };
    await expect(signInSilently(cfg, launch, fakeFetchOnce(500, ''), now)).rejects.toMatchObject({
      code: 'needs_interaction',
    });
  });

  it.each(['interaction_required', 'login_required', 'consent_required', 'account_selection_required'])(
    'signInSilently maps the redirect error %s to needs_interaction',
    async (error) => {
      const launch: LaunchFn = async () => `${cfg.redirectUri}?error=${error}`;
      await expect(signInSilently(cfg, launch, fakeFetchOnce(500, ''), now)).rejects.toMatchObject({
        code: 'needs_interaction',
      });
    },
  );

  it('signInSilently rethrows a state mismatch', async () => {
    const launch: LaunchFn = async () => `${cfg.redirectUri}?state=other&code=c1`;
    await expect(signInSilently(cfg, launch, fakeFetchOnce(500, ''), now)).rejects.toMatchObject({
      code: 'state_mismatch',
    });
  });

  it('signInSilently rethrows other redirect errors', async () => {
    const launch: LaunchFn = async () => `${cfg.redirectUri}?error=access_denied`;
    await expect(signInSilently(cfg, launch, fakeFetchOnce(500, ''), now)).rejects.toMatchObject({
      code: 'access_denied',
    });
  });

  it('signInSilently rethrows a network failure in the token exchange', async () => {
    const fetchFn = (async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    await expect(signInSilently(cfg, fakeLaunch([]), fetchFn, now)).rejects.toBeInstanceOf(TypeError);
  });

  it('signInSilently rethrows a bad token response', async () => {
    const fetchFn = fakeFetchOnce(200, '<html>');
    await expect(signInSilently(cfg, fakeLaunch([]), fetchFn, now)).rejects.toMatchObject({
      code: 'invalid_token_response',
    });
  });

  it('signInSilently keeps the stored refresh token when the response has none', async () => {
    await saveTokens({ accessToken: 'a0', expiresAt: 0, refreshToken: 'r0', scope: 's' });
    const fetchFn = fakeFetchOnce(200, { access_token: 'a1', expires_in: 3600, scope: 's' });
    const t = await signInSilently(cfg, fakeLaunch([]), fetchFn, now);
    expect(t.refreshToken).toBe('r0');
    expect((await loadTokens())?.refreshToken).toBe('r0');
  });

  it('signIn rejects a redirect with a different state and saves nothing', async () => {
    const launch: LaunchFn = async () => `${cfg.redirectUri}?state=other&code=c1`;
    await expect(signIn(cfg, launch, fakeFetchOnce(500, ''), now)).rejects.toMatchObject({
      code: 'state_mismatch',
    });
    expect(await loadTokens()).toBeNull();
  });
});
