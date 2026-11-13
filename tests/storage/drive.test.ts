import { describe, expect, it } from 'vitest';
import { RevConflictError, DriveError } from '@/lib/storage/adapter';
import { DriveAdapter } from '@/lib/storage/drive';
import { fakeFetch, type FakeResponse } from '../helpers/fake-fetch';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const CHANGES = 'https://www.googleapis.com/drive/v3/changes';

function adapter(...responses: FakeResponse[]) {
  const fetchFn = fakeFetch(...responses);
  return { drive: new DriveAdapter(async () => 'tok-1', fetchFn), fetchFn };
}

const found = (id: string, name: string): FakeResponse => ({
  status: 200,
  body: { files: [{ id, name, modifiedTime: '2026-01-01T00:00:00.000Z' }] },
});
const none: FakeResponse = { status: 200, body: { files: [] } };

describe('DriveAdapter.list', () => {
  it('lists every page', async () => {
    const { drive, fetchFn } = adapter(
      {
        status: 200,
        body: {
          nextPageToken: 'p2',
          files: [
            { id: 'f1', name: 'a.json', modifiedTime: 't1' },
            { id: 'f2', name: 'b.json', modifiedTime: 't2' },
          ],
        },
      },
      { status: 200, body: { files: [{ id: 'f3', name: 'c.json', modifiedTime: 't3' }] } },
    );
    expect(await drive.list()).toEqual([
      { name: 'a.json', fileId: 'f1', modifiedTime: 't1' },
      { name: 'b.json', fileId: 'f2', modifiedTime: 't2' },
      { name: 'c.json', fileId: 'f3', modifiedTime: 't3' },
    ]);
    const first = new URL(fetchFn.calls[0]!.url);
    expect(first.origin + first.pathname).toBe(FILES);
    expect(first.searchParams.get('spaces')).toBe('appDataFolder');
    expect(first.searchParams.get('fields')).toBe('nextPageToken,files(id,name,modifiedTime)');
    expect(first.searchParams.get('pageSize')).toBe('1000');
    expect(first.searchParams.has('pageToken')).toBe(false);
    expect(new URL(fetchFn.calls[1]!.url).searchParams.get('pageToken')).toBe('p2');
  });

  it('sends the bearer token', async () => {
    const { drive, fetchFn } = adapter(none);
    await drive.list();
    expect(fetchFn.calls[0]!.headers['authorization']).toBe('Bearer tok-1');
  });
});

describe('DriveAdapter.get', () => {
  it('returns null for a missing file', async () => {
    const { drive, fetchFn } = adapter(none);
    expect(await drive.get('w1.json')).toBeNull();
    expect(new URL(fetchFn.calls[0]!.url).searchParams.get('q')).toBe("name = 'w1.json'");
  });

  it('reads the file content', async () => {
    const { drive, fetchFn } = adapter(found('f1', 'w1.json'), { status: 200, body: { id: 'w1', rev: 3 } });
    expect(await drive.get('w1.json')).toEqual({ id: 'w1', rev: 3 });
    expect(fetchFn.calls[1]!.url).toBe(`${FILES}/f1?alt=media`);
  });

  it('escapes quotes and backslashes in the name query', async () => {
    const { drive, fetchFn } = adapter(none);
    await drive.get("a'b\\c");
    expect(new URL(fetchFn.calls[0]!.url).searchParams.get('q')).toBe("name = 'a\\'b\\\\c'");
  });
});

describe('DriveAdapter.putIfRev', () => {
  it('creates a file in appDataFolder when baseRev is null', async () => {
    const { drive, fetchFn } = adapter(none, { status: 200, body: { id: 'f9' } });
    await drive.putIfRev('w1.json', { id: 'w1', rev: 1 }, null);
    const call = fetchFn.calls[1]!;
    expect(call.method).toBe('POST');
    expect(call.url).toBe(`${UPLOAD}?uploadType=multipart`);
    expect(call.headers['content-type']).toMatch(/^multipart\/related; boundary=/);
    expect(call.body).toContain('{"name":"w1.json","parents":["appDataFolder"],"mimeType":"application/json"}');
    expect(call.body).toContain('{"id":"w1","rev":1}');
  });

  it('updates with PATCH when the remote rev matches', async () => {
    const { drive, fetchFn } = adapter(
      found('f1', 'w1.json'),
      { status: 200, body: { id: 'w1', rev: 4 } },
      { status: 200, body: { id: 'f1' } },
    );
    await drive.putIfRev('w1.json', { id: 'w1', rev: 5 }, 4);
    const call = fetchFn.calls[2]!;
    expect(call.method).toBe('PATCH');
    expect(call.url).toBe(`${UPLOAD}/f1?uploadType=media`);
    expect(call.headers['content-type']).toBe('application/json');
    expect(JSON.parse(call.body)).toEqual({ id: 'w1', rev: 5 });
  });

  it('throws RevConflictError when the remote rev differs', async () => {
    const { drive, fetchFn } = adapter(found('f1', 'w1.json'), { status: 200, body: { id: 'w1', rev: 5 } });
    const result = drive.putIfRev('w1.json', { id: 'w1', rev: 5 }, 4);
    await expect(result).rejects.toBeInstanceOf(RevConflictError);
    await expect(result).rejects.toMatchObject({ remoteRev: 5 });
    expect(fetchFn.calls).toHaveLength(2);
  });

  it('throws RevConflictError when the file is missing and baseRev is set', async () => {
    const { drive, fetchFn } = adapter(none);
    await expect(drive.putIfRev('w1.json', { id: 'w1', rev: 5 }, 4)).rejects.toMatchObject({
      name: 'RevConflictError',
      remoteRev: null,
    });
    expect(fetchFn.calls).toHaveLength(1);
  });

  it('throws RevConflictError when the file exists and baseRev is null', async () => {
    const { drive } = adapter(found('f1', 'w1.json'), { status: 200, body: { id: 'w1', rev: 2 } });
    await expect(drive.putIfRev('w1.json', { id: 'w1', rev: 1 }, null)).rejects.toMatchObject({
      name: 'RevConflictError',
      remoteRev: 2,
    });
  });
});

describe('DriveAdapter.delete', () => {
  it('deletes the file by ID', async () => {
    const { drive, fetchFn } = adapter(found('f1', 'w1.json'), { status: 204, body: '' });
    await drive.delete('w1.json');
    expect(fetchFn.calls[1]!.method).toBe('DELETE');
    expect(fetchFn.calls[1]!.url).toBe(`${FILES}/f1`);
  });

  it('does nothing when the file is missing', async () => {
    const { drive, fetchFn } = adapter(none);
    await drive.delete('w1.json');
    expect(fetchFn.calls).toHaveLength(1);
  });
});

describe('DriveAdapter.changes', () => {
  it('returns the start cursor for changes(null)', async () => {
    const { drive, fetchFn } = adapter({ status: 200, body: { startPageToken: 's1' } });
    expect(await drive.changes(null)).toEqual({ changed: [], cursor: 's1' });
    expect(fetchFn.calls[0]!.url).toBe(`${CHANGES}/startPageToken`);
  });

  it('follows changes pages to newStartPageToken', async () => {
    const { drive, fetchFn } = adapter(
      { status: 200, body: { nextPageToken: 'c2', changes: [{ fileId: 'f1', removed: false, file: { name: 'a.json' } }] } },
      { status: 200, body: { newStartPageToken: 's2', changes: [{ fileId: 'f2', removed: true }] } },
    );
    expect(await drive.changes('c1')).toEqual({ changed: ['a.json', 'f2'], cursor: 's2' });
    const first = new URL(fetchFn.calls[0]!.url);
    expect(first.origin + first.pathname).toBe(CHANGES);
    expect(first.searchParams.get('pageToken')).toBe('c1');
    expect(first.searchParams.get('spaces')).toBe('appDataFolder');
    expect(first.searchParams.get('fields')).toBe(
      'nextPageToken,newStartPageToken,changes(fileId,removed,file(name))',
    );
    expect(new URL(fetchFn.calls[1]!.url).searchParams.get('pageToken')).toBe('c2');
  });
});

describe('DriveAdapter errors', () => {
  it('throws DriveError with the status', async () => {
    const { drive } = adapter({ status: 403, body: { error: { message: 'User rate limit exceeded.' } } });
    const result = drive.list();
    await expect(result).rejects.toBeInstanceOf(DriveError);
    await expect(result).rejects.toMatchObject({ status: 403 });
  });
});
