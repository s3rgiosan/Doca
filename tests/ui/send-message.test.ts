import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { sendMessage } from '@/lib/messages';

describe('sendMessage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('returns the reply of the service worker', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({ ok: true, value: 3 } as never);
    expect(await sendMessage({ type: 'export' })).toEqual({ ok: true, value: 3 });
  });

  it('returns an error reply when the service worker cannot be reached', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockRejectedValue(new Error('Could not establish connection.'));
    expect(await sendMessage({ type: 'export' })).toEqual({
      ok: false,
      error: 'Doca could not reach its background service. Reload the extension and try again.',
    });
  });

  it('returns an error reply when no reply comes back', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined as never);
    expect(await sendMessage({ type: 'export' })).toMatchObject({ ok: false });
  });
});
