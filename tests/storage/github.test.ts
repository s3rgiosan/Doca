import { describe, expect, it } from 'vitest';
import { GitHubError, RevConflictError } from '@/lib/storage/adapter';
import { decodeContent, encodeContent, GitHubAdapter } from '@/lib/storage/github';
import { fakeFetch, type FakeResponse } from '../helpers/fake-fetch';

const REPO = 'https://api.github.com/repos/ana/doca-sync';
const CONTENTS = `${REPO}/contents/doca`;

function adapter(...responses: FakeResponse[]) {
  const fetchFn = fakeFetch(...responses);
  const github = new GitHubAdapter({ owner: 'ana', repo: 'doca-sync' }, async () => 'tok-1', fetchFn);
  return { github, fetchFn };
}

const fileAt = (sha: string, doc: object): FakeResponse => ({
  status: 200,
  body: { type: 'file', sha, encoding: 'base64', content: encodeContent(doc as never) },
});
const missing: FakeResponse = { status: 404, body: { message: 'Not Found' } };
const repoInfo: FakeResponse = { status: 200, body: { default_branch: 'main' } };
const headAt = (sha: string, etag = 'W/"e1"'): FakeResponse => ({
  status: 200,
  body: { object: { sha, type: 'commit' } },
  headers: { ETag: etag },
});
const tree = (entries: Array<{ path: string; sha: string; type?: string }>, truncated = false): FakeResponse => ({
  status: 200,
  body: { truncated, tree: entries.map((entry) => ({ type: 'blob', ...entry })) },
});

describe('content encoding', () => {
  it('round-trips non-ASCII text', () => {
    const doc = { id: 'w1', rev: 1, title: 'Café ☕ 東京' };
    expect(decodeContent(encodeContent(doc))).toEqual(doc);
  });

  it('decodes base64 that has line breaks', () => {
    const encoded = encodeContent({ id: 'w1', rev: 2 });
    const wrapped = `${encoded.slice(0, 8)}\n${encoded.slice(8)}\n`;
    expect(decodeContent(wrapped)).toEqual({ id: 'w1', rev: 2 });
  });
});

describe('GitHubAdapter requests', () => {
  it('sends the token, the API headers and no-store', async () => {
    const { github, fetchFn } = adapter(missing);
    await github.get('w1.json');
    const call = fetchFn.calls[0]!;
    expect(call.headers['authorization']).toBe('Bearer tok-1');
    expect(call.headers['accept']).toBe('application/vnd.github+json');
    expect(call.headers['x-github-api-version']).toBe('2026-03-10');
    expect(call.cache).toBe('no-store');
  });
});

describe('GitHubAdapter.get', () => {
  it('returns null for a missing file', async () => {
    const { github, fetchFn } = adapter(missing);
    expect(await github.get('w1.json')).toBeNull();
    expect(fetchFn.calls[0]!.url).toBe(`${CONTENTS}/w1.json`);
  });

  it('returns the decoded document', async () => {
    const { github } = adapter(fileAt('s1', { id: 'w1', rev: 3 }));
    expect(await github.get('w1.json')).toEqual({ id: 'w1', rev: 3 });
  });
});

describe('GitHubAdapter.putIfRev', () => {
  it('creates a file with no sha when the base rev is null', async () => {
    const doc = { id: 'w1', rev: 1 };
    const { github, fetchFn } = adapter(missing, { status: 201, body: {} });
    await github.putIfRev('w1.json', doc, null);
    const put = fetchFn.calls[1]!;
    expect(put.method).toBe('PUT');
    expect(put.url).toBe(`${CONTENTS}/w1.json`);
    const body = JSON.parse(put.body);
    expect(body.sha).toBeUndefined();
    expect(body.message).toBe('Doca: update w1.json');
    expect(decodeContent(body.content)).toEqual(doc);
  });

  it('updates with the sha of the file it read', async () => {
    const { github, fetchFn } = adapter(fileAt('abc', { id: 'w1', rev: 3 }), { status: 200, body: {} });
    await github.putIfRev('w1.json', { id: 'w1', rev: 4 }, 3);
    expect(JSON.parse(fetchFn.calls[1]!.body).sha).toBe('abc');
  });

  it('throws RevConflictError when the remote rev differs, without writing', async () => {
    const { github, fetchFn } = adapter(fileAt('abc', { id: 'w1', rev: 4 }));
    const error = await github.putIfRev('w1.json', { id: 'w1', rev: 4 }, 3).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RevConflictError);
    expect((error as RevConflictError).remoteRev).toBe(4);
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('turns a 409 into RevConflictError with the rev it reads again', async () => {
    const { github } = adapter(
      fileAt('abc', { id: 'w1', rev: 3 }),
      { status: 409, body: { message: 'is at def but expected abc' } },
      fileAt('def', { id: 'w1', rev: 5 }),
    );
    const error = await github.putIfRev('w1.json', { id: 'w1', rev: 4 }, 3).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RevConflictError);
    expect((error as RevConflictError).remoteRev).toBe(5);
  });

  it('throws GitHubError for other failures', async () => {
    const { github } = adapter(missing, { status: 500, body: 'boom' });
    const error = await github.putIfRev('w1.json', { id: 'w1', rev: 1 }, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).status).toBe(500);
  });
});

describe('GitHubAdapter.delete', () => {
  it('does nothing for a missing file', async () => {
    const { github, fetchFn } = adapter(missing);
    await github.delete('w1.json');
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('deletes with the sha of the file', async () => {
    const { github, fetchFn } = adapter(fileAt('abc', { id: 'w1', rev: 2 }), { status: 200, body: {} });
    await github.delete('w1.json');
    const call = fetchFn.calls[1]!;
    expect(call.method).toBe('DELETE');
    expect(JSON.parse(call.body)).toEqual({ message: 'Doca: delete w1.json', sha: 'abc' });
  });
});

describe('GitHubAdapter.head', () => {
  it('reads the default branch once and returns the head sha and ETag', async () => {
    const { github, fetchFn } = adapter(repoInfo, headAt('c1', 'W/"e1"'), headAt('c2', 'W/"e2"'));
    expect(await github.head(null)).toEqual({ notModified: false, sha: 'c1', etag: 'W/"e1"' });
    expect(await github.head(null)).toEqual({ notModified: false, sha: 'c2', etag: 'W/"e2"' });
    expect(fetchFn.calls.map((call) => call.url)).toEqual([
      REPO,
      `${REPO}/git/ref/heads/main`,
      `${REPO}/git/ref/heads/main`,
    ]);
  });

  it('sends If-None-Match and reports 304 as not modified', async () => {
    const { github, fetchFn } = adapter(repoInfo, { status: 304, body: null });
    expect(await github.head('W/"e1"')).toEqual({ notModified: true });
    expect(fetchFn.calls[1]!.headers['if-none-match']).toBe('W/"e1"');
  });

  it.each([404, 409])('reports an empty repository (HTTP %i) as no head', async (status) => {
    const { github } = adapter(repoInfo, { status, body: { message: 'Git Repository is empty.' } });
    expect(await github.head(null)).toEqual({ notModified: false, sha: null, etag: null });
  });
});

describe('GitHubAdapter.list', () => {
  it('returns nothing for an empty repository', async () => {
    const { github } = adapter(repoInfo, { status: 409, body: {} });
    expect(await github.list()).toEqual([]);
  });

  it('lists only the blobs directly in the doca folder', async () => {
    const { github, fetchFn } = adapter(
      repoInfo,
      headAt('c1'),
      tree([
        { path: 'README.md', sha: 'r' },
        { path: 'doca', sha: 't', type: 'tree' },
        { path: 'doca/w1.json', sha: 'a' },
        { path: 'doca/w1.v3.json', sha: 'b' },
        { path: 'doca/old/w9.json', sha: 'x' },
      ]),
    );
    expect(await github.list()).toEqual([
      { name: 'w1.json', fileId: 'a' },
      { name: 'w1.v3.json', fileId: 'b' },
    ]);
    expect(fetchFn.calls[2]!.url).toBe(`${REPO}/git/trees/c1?recursive=1`);
  });

  it('throws when the tree is truncated', async () => {
    const { github } = adapter(repoInfo, headAt('c1'), tree([], true));
    await expect(github.list()).rejects.toBeInstanceOf(GitHubError);
  });
});

describe('GitHubAdapter.changes', () => {
  it('starts at the head commit', async () => {
    const { github } = adapter(repoInfo, headAt('c1'));
    expect(await github.changes(null)).toEqual({ changed: [], cursor: 'c1' });
  });

  it('starts at an empty cursor for an empty repository', async () => {
    const { github } = adapter(repoInfo, { status: 409, body: {} });
    expect(await github.changes(null)).toEqual({ changed: [], cursor: '' });
  });

  it('reads no trees when the head did not move', async () => {
    const { github, fetchFn } = adapter(repoInfo, headAt('c1'));
    expect(await github.changes('c1')).toEqual({ changed: [], cursor: 'c1' });
    expect(fetchFn.calls).toHaveLength(2);
  });

  it('gives added, changed and removed files in the doca folder', async () => {
    const { github, fetchFn } = adapter(
      repoInfo,
      headAt('c2'),
      tree([
        { path: 'doca/same.json', sha: 's' },
        { path: 'doca/edit.json', sha: 'e1' },
        { path: 'doca/gone.json', sha: 'g' },
        { path: 'notes.md', sha: 'n1' },
      ]),
      tree([
        { path: 'doca/same.json', sha: 's' },
        { path: 'doca/edit.json', sha: 'e2' },
        { path: 'doca/new.json', sha: 'w' },
        { path: 'notes.md', sha: 'n2' },
      ]),
    );
    const result = await github.changes('c1');
    expect(result.cursor).toBe('c2');
    expect([...result.changed].sort()).toEqual(['edit.json', 'gone.json', 'new.json']);
    expect(fetchFn.calls[2]!.url).toBe(`${REPO}/git/trees/c1?recursive=1`);
    expect(fetchFn.calls[3]!.url).toBe(`${REPO}/git/trees/c2?recursive=1`);
  });

  it('treats an empty cursor as an empty tree', async () => {
    const { github, fetchFn } = adapter(repoInfo, headAt('c1'), tree([{ path: 'doca/w1.json', sha: 'a' }]));
    expect(await github.changes('')).toEqual({ changed: ['w1.json'], cursor: 'c1' });
    expect(fetchFn.calls).toHaveLength(3);
  });
});

describe('GitHubAdapter errors', () => {
  const fail = (response: FakeResponse) => adapter(response).github.get('w1.json').catch((e: unknown) => e);

  it('marks HTTP 401 as an auth error', async () => {
    const error = (await fail({ status: 401, body: 'bad' })) as GitHubError;
    expect(error).toMatchObject({ status: 401, kind: 'auth', retryAfterSeconds: null });
  });

  it('marks a 429 with retry-after as a rate limit with the wait', async () => {
    const error = (await fail({ status: 429, body: 'slow', headers: { 'Retry-After': '30' } })) as GitHubError;
    expect(error).toMatchObject({ status: 429, kind: 'rate_limit', retryAfterSeconds: 30 });
  });

  it('marks a 403 with no remaining requests as a rate limit that waits for the reset', async () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    const error = (await fail({
      status: 403,
      body: 'limit',
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
    })) as GitHubError;
    expect(error.kind).toBe('rate_limit');
    expect(error.retryAfterSeconds).toBeGreaterThan(110);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(120);
  });

  it('marks a 429 with no headers as a rate limit with no wait', async () => {
    const error = (await fail({ status: 429, body: 'slow' })) as GitHubError;
    expect(error).toMatchObject({ kind: 'rate_limit', retryAfterSeconds: null });
  });

  it('keeps a plain 403 as another error', async () => {
    const error = (await fail({ status: 403, body: 'forbidden', headers: { 'x-ratelimit-remaining': '10' } })) as GitHubError;
    expect(error).toMatchObject({ status: 403, kind: 'other' });
  });

  it('lets a rate limit on the re-read after a 409 propagate', async () => {
    const { github } = adapter(
      fileAt('abc', { id: 'w1', rev: 3 }),
      { status: 409, body: {} },
      { status: 429, body: 'slow', headers: { 'retry-after': '5' } },
    );
    const error = await github.putIfRev('w1.json', { id: 'w1', rev: 4 }, 3).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'GitHubError', kind: 'rate_limit', retryAfterSeconds: 5 });
  });

  it('does not map a 422 to a conflict', async () => {
    const { github } = adapter(missing, { status: 422, body: 'invalid' });
    const error = await github.putIfRev('w1.json', { id: 'w1', rev: 1 }, null).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'GitHubError', status: 422 });
  });
});

describe('GitHubAdapter response validation', () => {
  const bad = (body: unknown) => adapter({ status: 200, body }).github.get('w1.json');
  const good = encodeContent({ id: 'w1', rev: 1 });

  it('rejects content that is not a string', async () => {
    await expect(bad({ sha: 's', encoding: 'base64', content: null })).rejects.toBeInstanceOf(GitHubError);
  });

  it('rejects an encoding other than base64', async () => {
    await expect(bad({ sha: 's', encoding: 'none', content: good })).rejects.toThrow('HTTP 200');
  });

  it('rejects a directory listing', async () => {
    await expect(bad([{ type: 'file' }])).rejects.toBeInstanceOf(GitHubError);
  });

  it('rejects content that is not base64 JSON', async () => {
    await expect(bad({ sha: 's', encoding: 'base64', content: '!!!' })).rejects.toBeInstanceOf(GitHubError);
  });

  it('rejects a document with no numeric rev', async () => {
    const content = encodeContent({ id: 'w1', rev: 'x' } as never);
    await expect(bad({ sha: 's', encoding: 'base64', content })).rejects.toBeInstanceOf(GitHubError);
  });
});

describe('GitHubAdapter names', () => {
  const make = (owner: string, repo: string) => () =>
    new GitHubAdapter({ owner, repo }, async () => 't', fakeFetch());

  it.each([
    ['', 'r'],
    ['-ana', 'r'],
    ['an/a', 'r'],
    ['..', 'r'],
    ['a'.repeat(40), 'r'],
    ['ana', '.'],
    ['ana', '..'],
    ['ana', ''],
    ['ana', 'a/b'],
    ['ana', 'a'.repeat(101)],
  ])('rejects owner %j with repo %j', (owner, repo) => {
    expect(make(owner, repo)).toThrow(/Invalid GitHub/);
  });

  it('accepts valid names', () => {
    expect(make('ana-1', 'doca.sync_x-1')).not.toThrow();
    expect(make('a'.repeat(39), '..x')).not.toThrow();
  });

  it.each(['.', '..', 'a/b', ''])('rejects the file name %j without a request', async (name) => {
    const { github, fetchFn } = adapter();
    await expect(github.get(name)).rejects.toThrow('Invalid file name');
    expect(fetchFn.calls).toHaveLength(0);
  });
});
