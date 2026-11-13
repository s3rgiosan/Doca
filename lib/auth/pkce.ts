const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const VERIFIER_LENGTH = 64;

/**
 * Encodes bytes as base64url without padding (RFC 4648, section 5).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Makes a random PKCE code verifier from the unreserved character set (RFC 7636, section 4.1).
 */
export function createVerifier(): string {
  const random = crypto.getRandomValues(new Uint8Array(VERIFIER_LENGTH));
  let verifier = '';
  for (const value of random) {
    // 256 is not a multiple of 66, so the modulo gives a small bias. A verifier needs only high entropy.
    verifier += UNRESERVED[value % UNRESERVED.length];
  }
  return verifier;
}

/**
 * Makes the S256 code challenge for a verifier: BASE64URL(SHA256(ASCII(verifier))).
 */
export async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}
