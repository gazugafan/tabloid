import type { StoredState } from '../../../types/layout';

/** The remote file changed since we last read it (a conditional write was rejected). */
export class RemoteConflictError extends Error {
  constructor() {
    super('The remote file changed since it was last read');
  }
}

export interface RemoteState {
  state: unknown;
  /** Opaque revision identifier (Dropbox rev, WebDAV ETag, ...). */
  rev: string;
}

/** Everything a remote provider must do: read and conditionally write one JSON file. */
export interface RemoteFileClient {
  /** Null when the file doesn't exist yet. */
  download(): Promise<RemoteState | null>;
  /** Writes the state; with a rev, throws RemoteConflictError if the file changed. Returns the new rev. */
  upload(state: StoredState, rev?: string): Promise<string>;
}
