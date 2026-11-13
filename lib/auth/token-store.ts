import { storage } from 'wxt/utils/storage';
import {
  OAuthError,
  refreshAccessToken,
  type FetchFn,
  type OAuthClientConfig,
  type TokenSet,
} from './google-oauth';

/** Renew the access token when it expires in this many milliseconds or less. */
const EXPIRY_MARGIN_MS = 60_000;

const tokensItem = storage.defineItem<TokenSet>('local:auth.tokens');

export async function loadTokens(): Promise<TokenSet | null> {
  return tokensItem.getValue();
}

export async function saveTokens(tokens: TokenSet): Promise<void> {
  await tokensItem.setValue(tokens);
}

export async function clearTokens(): Promise<void> {
  await tokensItem.removeValue();
}

/**
 * Returns an access token that is valid for more than 60 seconds. Renews it with the refresh token when necessary.
 *
 * @throws OAuthError `not_signed_in` when no tokens are stored.
 * @throws OAuthError `needs_interaction` when the user must sign in again.
 */
export async function getValidAccessToken(
  cfg: OAuthClientConfig,
  fetchFn: FetchFn,
  now: () => number,
): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new OAuthError('not_signed_in');
  }
  const remaining = tokens.expiresAt - now();
  if (remaining > EXPIRY_MARGIN_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new OAuthError('needs_interaction');
  }
  try {
    const renewed = await refreshAccessToken(cfg, tokens.refreshToken, fetchFn, now);
    await saveTokens(renewed);
    return renewed.accessToken;
  } catch (error) {
    if (error instanceof OAuthError && error.code === 'invalid_grant') {
      await clearTokens();
      throw new OAuthError('needs_interaction', error.message);
    }
    throw error;
  }
}
