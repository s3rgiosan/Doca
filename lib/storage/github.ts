import type { FetchFn } from '../auth/google-oauth';
import {
  GitHubError,
  RevConflictError,
  type ChangeSet,
  type RemoteEntry,
  type StorageAdapter,
  type StoredDoc,
} from './adapter';

const API = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const FOLDER = 'doca';

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export type HeadResult = { notModified: true } | { notModified: false; sha: string | null; etag: string | null };

interface ContentsFile {
  sha: string;
  content: string;
}

interface TreeResponse {
  truncated: boolean;
  tree: Array<{ path: string; type: string; sha: string }>;
}

/** Encodes a document as UTF-8 JSON in base64, as the contents API expects. */
export function encodeContent(doc: StoredDoc): string {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decodes base64 content from the contents API. GitHub breaks the base64 into lines. */
export function decodeContent(content: string): StoredDoc {
  const binary = atob(content.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as StoredDoc;
}

/**
 * Stores workspace files in the `doca` folder of a GitHub repository, on its default branch.
 */
export class GitHubAdapter implements StorageAdapter {
  private defaultBranch: string | undefined;

  constructor(
    private repo: GitHubRepo,
    private getToken: () => Promise<string>,
    private fetchFn: FetchFn,
  ) {}

  async list(): Promise<RemoteEntry[]> {
    const head = await this.head(null);
    if (head.notModified || head.sha === null) {
      return [];
    }
    const files = await this.folderTree(head.sha);
    return [...files].map(([name, sha]) => ({ name, fileId: sha }));
  }

  async get(name: string): Promise<StoredDoc | null> {
    const remote = await this.read(name);
    return remote ? remote.doc : null;
  }

  async putIfRev(name: string, doc: StoredDoc, baseRev: number | null): Promise<void> {
    const remote = await this.read(name);
    const remoteRev = remote ? remote.doc.rev : null;
    if (remoteRev !== baseRev) {
      throw new RevConflictError(remoteRev);
    }
    const body: Record<string, string> = { message: `Doca: update ${name}`, content: encodeContent(doc) };
    if (remote) {
      body.sha = remote.sha;
    }
    try {
      await this.send(this.contentsUrl(name), { method: 'PUT', body: JSON.stringify(body) });
    } catch (error) {
      // GitHub rejects a write with a stale sha, so another device wrote first.
      if (error instanceof GitHubError && error.status === 409) {
        const current = await this.read(name);
        throw new RevConflictError(current ? current.doc.rev : null);
      }
      throw error;
    }
  }

  async delete(name: string): Promise<void> {
    const remote = await this.read(name);
    if (!remote) {
      return;
    }
    const body = { message: `Doca: delete ${name}`, sha: remote.sha };
    await this.send(this.contentsUrl(name), { method: 'DELETE', body: JSON.stringify(body) });
  }

  /** An empty cursor stands for an empty repository. */
  async changes(cursor: string | null): Promise<ChangeSet> {
    const head = await this.head(null);
    const headSha = head.notModified || head.sha === null ? '' : head.sha;
    if (cursor === null || cursor === headSha) {
      return { changed: [], cursor: headSha };
    }
    const before = cursor === '' ? new Map<string, string>() : await this.folderTree(cursor);
    const after = headSha === '' ? new Map<string, string>() : await this.folderTree(headSha);
    const changed = new Set<string>();
    for (const [name, sha] of after) {
      if (before.get(name) !== sha) {
        changed.add(name);
      }
    }
    for (const name of before.keys()) {
      if (!after.has(name)) {
        changed.add(name);
      }
    }
    return { changed: [...changed], cursor: headSha };
  }

  /**
   * Reads the head commit of the default branch. With an ETag, an unchanged head returns
   * `notModified`, and that request does not count against the primary rate limit.
   */
  async head(etag: string | null): Promise<HeadResult> {
    const branch = await this.branch();
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }
    const response = await this.send(`${this.repoUrl()}/git/ref/heads/${encodeURIComponent(branch)}`, { headers }, [
      304, 404, 409,
    ]);
    switch (response.status) {
      case 304:
        return { notModified: true };
      case 404:
      case 409:
        // A repository with no commits has no branch head yet.
        return { notModified: false, sha: null, etag: null };
      default: {
        const ref = (await response.json()) as { object: { sha: string } };
        return { notModified: false, sha: ref.object.sha, etag: response.headers.get('ETag') };
      }
    }
  }

  private async branch(): Promise<string> {
    if (!this.defaultBranch) {
      const response = await this.send(this.repoUrl(), {});
      const info = (await response.json()) as { default_branch: string };
      this.defaultBranch = info.default_branch;
    }
    return this.defaultBranch;
  }

  /** Maps each file name directly in the `doca` folder to its blob sha. */
  private async folderTree(commitSha: string): Promise<Map<string, string>> {
    const response = await this.send(`${this.repoUrl()}/git/trees/${commitSha}?recursive=1`, {});
    const tree = (await response.json()) as TreeResponse;
    if (tree.truncated) {
      throw new GitHubError(200, 'The repository tree is too large and GitHub truncated it');
    }
    const prefix = `${FOLDER}/`;
    const files = new Map<string, string>();
    for (const entry of tree.tree) {
      const name = entry.path.slice(prefix.length);
      if (entry.type === 'blob' && entry.path.startsWith(prefix) && !name.includes('/')) {
        files.set(name, entry.sha);
      }
    }
    return files;
  }

  private async read(name: string): Promise<{ sha: string; doc: StoredDoc } | null> {
    const response = await this.send(this.contentsUrl(name), {}, [404]);
    if (response.status === 404) {
      return null;
    }
    const file = (await response.json()) as ContentsFile;
    return { sha: file.sha, doc: decodeContent(file.content) };
  }

  private repoUrl(): string {
    return `${API}/repos/${encodeURIComponent(this.repo.owner)}/${encodeURIComponent(this.repo.repo)}`;
  }

  private contentsUrl(name: string): string {
    return `${this.repoUrl()}/contents/${FOLDER}/${encodeURIComponent(name)}`;
  }

  /**
   * Sends an API request and throws GitHubError for a status that is not 2xx and not in `allowed`.
   * The API allows caching for 60 seconds, so every request skips the browser cache.
   */
  private async send(url: string, init: RequestInit, allowed: number[] = []): Promise<Response> {
    const token = await this.getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', API_VERSION);
    const response = await this.fetchFn(url, { ...init, headers, cache: 'no-store' });
    if (!response.ok && !allowed.includes(response.status)) {
      throw new GitHubError(response.status, await response.text());
    }
    return response;
  }
}
