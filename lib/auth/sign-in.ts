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

/** OAuth error codes that mean the user must act. The others are real failures. */
const INTERACTION_CODES = new Set([
  'needs_interaction',
  'interaction_required',
  'login_required',
  'consent_required',
  'account_selection_required',
]);

/**
 * Signs in with no user interface (`prompt=none`) and saves the tokens.
 *
 * @throws OAuthError `needs_interaction` when the user must act. Other errors propagate unchanged.
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
    if (error instanceof OAuthError && INTERACTION_CODES.has(error.code)) {
      throw new OAuthError('needs_interaction', error.message);
    }
    throw error;
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
  let redirect: string;
  try {
    redirect = await launch(buildAuthUrl(cfg, { challenge, state, prompt }), interactive);
  } catch (error) {
    // A non-interactive launch fails when the flow needs a page the user must see.
    if (!interactive) {
      throw new OAuthError('needs_interaction', error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
  const code = parseRedirect(redirect, state);
  return exchangeCode(cfg, code, verifier, fetchFn, now);
}
