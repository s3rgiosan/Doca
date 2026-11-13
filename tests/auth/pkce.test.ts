import { describe, expect, it } from 'vitest';
import { challengeFromVerifier, createVerifier } from '@/lib/auth/pkce';

describe('pkce', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    expect(await challengeFromVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes a 64-character verifier from the unreserved set', () => {
    expect(createVerifier()).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
  });

  it('makes a different verifier each time', () => {
    expect(createVerifier()).not.toBe(createVerifier());
  });
});
