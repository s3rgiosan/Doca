export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export interface OAuthClientConfig {
  clientId: string;
  /** Set only for a Web application client. */
  clientSecret?: string;
  redirectUri: string;
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'OAuthError';
  }
}

/**
 * Builds the Google authorization URL for the code flow with PKCE.
 */
export function buildAuthUrl(
  cfg: OAuthClientConfig,
  opts: { challenge: string; state: string; prompt?: 'consent' | 'none' },
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: DRIVE_APPDATA_SCOPE,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
    state: opts.state,
    access_type: 'offline',
  });
  if (opts.prompt) {
    params.set('prompt', opts.prompt);
  }
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Reads the authorization code from the redirect URL.
 *
 * @throws OAuthError with the Google `error` value, `state_mismatch`, or `missing_code`.
 */
export function parseRedirect(url: string, expectedState: string): string {
  const params = new URL(url).searchParams;
  const error = params.get('error');
  if (error) {
    throw new OAuthError(error);
  }
  const state = params.get('state');
  if (state !== expectedState) {
    throw new OAuthError('state_mismatch');
  }
  const code = params.get('code');
  if (!code) {
    throw new OAuthError('missing_code');
  }
  return code;
}

export interface TokenSet {
  accessToken: string;
  /** Time in milliseconds since the epoch. */
  expiresAt: number;
  refreshToken?: string;
  scope: string;
}

export type FetchFn = typeof fetch;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * Exchanges an authorization code for tokens.
 */
export async function exchangeCode(
  cfg: OAuthClientConfig,
  code: string,
  verifier: string,
  fetchFn: FetchFn,
  now: () => number,
): Promise<TokenSet> {
  const data = await postToken(
    cfg,
    {
      code,
      code_verifier: verifier,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    },
    fetchFn,
  );
  return toTokenSet(data, now());
}

/**
 * Gets a new access token with a refresh token.
 * Google can leave out `refresh_token` in the response. The token that was sent is then kept.
 */
export async function refreshAccessToken(
  cfg: OAuthClientConfig,
  refreshToken: string,
  fetchFn: FetchFn,
  now: () => number,
): Promise<TokenSet> {
  const data = await postToken(
    cfg,
    { refresh_token: refreshToken, grant_type: 'refresh_token' },
    fetchFn,
  );
  return toTokenSet({ ...data, refresh_token: data.refresh_token ?? refreshToken }, now());
}

async function postToken(
  cfg: OAuthClientConfig,
  fields: Record<string, string>,
  fetchFn: FetchFn,
): Promise<TokenResponse> {
  const body = new URLSearchParams({ client_id: cfg.clientId, ...fields });
  if (cfg.clientSecret) {
    body.set('client_secret', cfg.clientSecret);
  }
  const response = await fetchFn(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new OAuthError(readErrorCode(text) ?? `http_${response.status}`, text);
  }
  return JSON.parse(text) as TokenResponse;
}

function readErrorCode(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {
    // The body is not JSON.
  }
  return undefined;
}

function toTokenSet(data: TokenResponse, at: number): TokenSet {
  const tokens: TokenSet = {
    accessToken: data.access_token,
    expiresAt: at + data.expires_in * 1000,
    scope: data.scope,
  };
  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  }
  return tokens;
}
