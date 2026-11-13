export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  cache: RequestCache | undefined;
}

export type FakeResponse = { status: number; body: unknown; headers?: Record<string, string> };

export type FakeFetch = typeof fetch & { calls: RecordedCall[] };

/**
 * Makes a fetch function that records each call and returns the queued responses in order.
 */
export function fakeFetch(...responses: FakeResponse[]): FakeFetch {
  const queue = [...responses];
  const calls: RecordedCall[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : String(init?.body ?? ''),
      cache: init?.cache,
    });
    const next = queue.shift();
    if (!next) {
      throw new Error(`No fake response left for ${String(input)}`);
    }
    // A 204 or 304 response must not have a body.
    if (next.status === 204 || next.status === 304) {
      return new Response(null, { status: next.status, headers: next.headers });
    }
    const text = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return new Response(text, { status: next.status, headers: next.headers });
  }) as FakeFetch;
  fn.calls = calls;
  return fn;
}

/** Shortcut for a single response. */
export function fakeFetchOnce(status: number, body: unknown): FakeFetch {
  return fakeFetch({ status, body });
}
