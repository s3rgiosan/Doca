import {
  buildAuthUrl,
  exchangeCode,
  OAuthError,
  parseRedirect,
  type FetchFn,
  type OAuthClientConfig,
  type TokenSet,
} from './google-oauth';
import { challengeFromVerifier, createVerifier } from './pkce';
import { loadTokens, saveTokens } from './token-store';

/** Opens the auth URL and returns the redirect URL. In the extension, this wraps `identity.launchWebAuthFlow`. */
export type LaunchFn = (url: string, interactive: boolean) => Promise<string>;

/**
 * Signs in with the consent screen and saves the tokens.
 */
export async function signIn(
  cfg: OAuthClientConfig,
  launch: LaunchFn,
  fetchFn: FetchFn,
  now: () => number,
): Promise<TokenSet> {
  const tokens = await runCodeFlow(cfg, launch, fetchFn, now, 'consent', true);
  await saveTokens(tokens);
  return tokens;
}

/**
 * Signs in with no user interface (`prompt=none`) and saves the tokens.
 *
 * @throws OAuthError `needs_interaction` when Google needs the user.
 */
export async function signInSilently(
  cfg: OAuthClientConfig,
  launch: LaunchFn,
  fetchFn: FetchFn,
  now: () => number,
): Promise<TokenSet> {
  let tokens: TokenSet;
  try {
    tokens = await runCodeFlow(cfg, launch, fetchFn, now, 'none', false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OAuthError('needs_interaction', message);
  }
  if (!tokens.refreshToken) {
    const stored = await loadTokens();
    if (stored?.refreshToken) {
      tokens = { ...tokens, refreshToken: stored.refreshToken };
    }
  }
  await saveTokens(tokens);
  return tokens;
}

async function runCodeFlow(
  cfg: OAuthClientConfig,
  launch: LaunchFn,
  fetchFn: FetchFn,
  now: () => number,
  prompt: 'consent' | 'none',
  interactive: boolean,
): Promise<TokenSet> {
  const verifier = createVerifier();
  const challenge = await challengeFromVerifier(verifier);
  const state = createVerifier();
  const redirect = await launch(buildAuthUrl(cfg, { challenge, state, prompt }), interactive);
  const code = parseRedirect(redirect, state);
  return exchangeCode(cfg, code, verifier, fetchFn, now);
}
