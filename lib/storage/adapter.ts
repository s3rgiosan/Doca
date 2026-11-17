export interface StoredDoc {
  id: string;
  rev: number;
  [key: string]: unknown;
}

export interface RemoteEntry {
  name: string;
  fileId: string;
  /** Drive gives the time. GitHub trees do not. */
  modifiedTime?: string;
}

export interface ChangeSet {
  /** Names of changed files. Drive gives a removed file by its backend ID, because its name is not known. */
  changed: string[];
  cursor: string;
}

/**
 * Remote storage for workspace files. Drive and GitHub implement it.
 */
export interface StorageAdapter {
  list(): Promise<RemoteEntry[]>;
  get(name: string): Promise<StoredDoc | null>;
  /**
   * Writes `doc` only when the remote `rev` equals `baseRev`. Use `null` for a file that must not exist yet.
   *
   * @throws RevConflictError when the remote `rev` is different.
   */
  putIfRev(name: string, doc: StoredDoc, baseRev: number | null): Promise<void>;
  delete(name: string): Promise<void>;
  /** With `null`, returns a start cursor and no changes. */
  changes(cursor: string | null): Promise<ChangeSet>;
}

export class RevConflictError extends Error {
  constructor(public remoteRev: number | null) {
    super(`Remote rev is ${remoteRev ?? 'missing'}`);
    this.name = 'RevConflictError';
  }
}

export class DriveError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Drive request failed with HTTP ${status}`);
    this.name = 'DriveError';
  }
}

export type GitHubErrorKind = 'auth' | 'rate_limit' | 'other';

export class GitHubError extends Error {
  /**
   * @param kind `auth` for HTTP 401, `rate_limit` for a primary or secondary rate limit.
   * @param retryAfterSeconds Seconds to wait before a retry, when GitHub gave the time.
   */
  constructor(
    public status: number,
    public body: string,
    public kind: GitHubErrorKind = 'other',
    public retryAfterSeconds: number | null = null,
  ) {
    super(`GitHub request failed with HTTP ${status}`);
    this.name = 'GitHubError';
  }
}

/** Checks that a parsed remote value is a document with a finite numeric `rev`. */
export function isStoredDoc(value: unknown): value is StoredDoc {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rev = (value as { rev?: unknown }).rev;
  return typeof rev === 'number' && Number.isFinite(rev);
}
