import type { FetchFn } from '../auth/google-oauth';
import {
  DriveError,
  RevConflictError,
  type ChangeSet,
  type RemoteEntry,
  type StorageAdapter,
  type StoredDoc,
} from './adapter';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const CHANGES_URL = 'https://www.googleapis.com/drive/v3/changes';
const LIST_FIELDS = 'nextPageToken,files(id,name,modifiedTime)';
const CHANGES_FIELDS = 'nextPageToken,newStartPageToken,changes(fileId,removed,file(name))';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

interface FileListResponse {
  nextPageToken?: string;
  files: DriveFile[];
}

interface ChangeListResponse {
  nextPageToken?: string;
  newStartPageToken?: string;
  changes: Array<{ fileId: string; removed?: boolean; file?: { name: string } }>;
}

/**
 * Stores workspace files in the Drive `appDataFolder`.
 */
export class DriveAdapter implements StorageAdapter {
  constructor(
    private getToken: () => Promise<string>,
    private fetchFn: FetchFn,
  ) {}

  async list(): Promise<RemoteEntry[]> {
    const files = await this.listFiles();
    return files.map((file) => ({ name: file.name, fileId: file.id, modifiedTime: file.modifiedTime }));
  }

  async get(name: string): Promise<StoredDoc | null> {
    const remote = await this.read(name);
    return remote ? remote.doc : null;
  }

  async putIfRev(name: string, doc: StoredDoc, baseRev: number | null): Promise<void> {
    // Drive does not document If-Match on files.update, so this read-then-write check is not atomic.
    // Another device can write between the read and the write.
    const remote = await this.read(name);
    const remoteRev = remote ? remote.doc.rev : null;
    if (remoteRev !== baseRev) {
      throw new RevConflictError(remoteRev);
    }
    const content = JSON.stringify(doc);
    if (remote) {
      await this.request(`${UPLOAD_URL}/${remote.fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      });
      return;
    }
    const boundary = `doca-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');
    await this.request(`${UPLOAD_URL}?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async delete(name: string): Promise<void> {
    const file = await this.findFile(name);
    if (!file) {
      return;
    }
    await this.request(`${FILES_URL}/${file.id}`, { method: 'DELETE' });
  }

  async changes(cursor: string | null): Promise<ChangeSet> {
    if (cursor === null) {
      const start = (await this.requestJson(`${CHANGES_URL}/startPageToken`)) as { startPageToken: string };
      return { changed: [], cursor: start.startPageToken };
    }
    const changed: string[] = [];
    let pageToken = cursor;
    for (;;) {
      const params = new URLSearchParams({ pageToken, spaces: 'appDataFolder', fields: CHANGES_FIELDS });
      const page = (await this.requestJson(`${CHANGES_URL}?${params.toString()}`)) as ChangeListResponse;
      for (const change of page.changes) {
        changed.push(change.file?.name ?? change.fileId);
      }
      if (page.newStartPageToken) {
        return { changed, cursor: page.newStartPageToken };
      }
      if (!page.nextPageToken) {
        throw new DriveError(200, 'Changes page has no nextPageToken and no newStartPageToken');
      }
      pageToken = page.nextPageToken;
    }
  }

  private async read(name: string): Promise<{ fileId: string; doc: StoredDoc } | null> {
    const file = await this.findFile(name);
    if (!file) {
      return null;
    }
    const doc = (await this.requestJson(`${FILES_URL}/${file.id}?alt=media`)) as StoredDoc;
    return { fileId: file.id, doc };
  }

  private async findFile(name: string): Promise<DriveFile | null> {
    const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const files = await this.listFiles(`name = '${escaped}'`);
    return files[0] ?? null;
  }

  private async listFiles(q?: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ spaces: 'appDataFolder', fields: LIST_FIELDS, pageSize: '1000' });
      if (q) {
        params.set('q', q);
      }
      if (pageToken) {
        params.set('pageToken', pageToken);
      }
      const page = (await this.requestJson(`${FILES_URL}?${params.toString()}`)) as FileListResponse;
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  private async requestJson(url: string): Promise<unknown> {
    const response = await this.request(url, { method: 'GET' });
    return response.json();
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const token = await this.getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await this.fetchFn(url, { ...init, headers });
    if (!response.ok) {
      throw new DriveError(response.status, await response.text());
    }
    return response;
  }
}
