import type { StoredState } from '../../../types/layout';
import { migrateState } from '../../storage/migrations';
import type { RemoteRepository } from '../../storage/repository';
import type { KeyValueStore } from '../../storage/store';
import { RemoteConflictError, type RemoteFileClient } from './types';


interface Meta {
  /** Revision of the remote file our cache was last in sync with. */
  rev?: string;
  /** The cache has changes that haven't been uploaded. */
  dirty: boolean;
}

/**
 * Repository for any remote file provider. The whole document lives in one file; a local cache
 * (keys namespaced by `provider`) makes loading instant and offline-safe. Conflicts are
 * last-write-wins: if this device has unsent changes they replace the remote file, otherwise the
 * remote file replaces the cache.
 */
export function createRemoteRepository(client: RemoteFileClient, cache: KeyValueStore, provider: string): RemoteRepository {
  const STATE_KEY = `${provider}:state`;
  const META_KEY = `${provider}:meta`;
  let error: string | null = null;
  // Syncs run one at a time so a pull can't interleave with a push.
  let queue: Promise<unknown> = Promise.resolve();

  const getMeta = async (): Promise<Meta> => (await cache.get<Meta>(META_KEY)) ?? { dirty: false };

  async function upload(state: StoredState, meta: Meta) {
    let rev: string;
    try {
      rev = await client.upload(state, meta.rev);
    } catch (e) {
      if (!(e instanceof RemoteConflictError)) throw e;
      // Remote changed since we last looked; our pending changes win, so overwrite the newer revision.
      const remote = await client.download();
      rev = await client.upload(state, remote?.rev);
    }
    await cache.set(META_KEY, { rev, dirty: false } satisfies Meta);
  }

  async function doPush() {
    const state = await cache.get<StoredState>(STATE_KEY);
    if (state) await upload(state, await getMeta());
  }

  async function doPull() {
    const meta = await getMeta();
    const remote = await client.download();
    if (!remote) {
      await doPush(); // Nothing on the remote yet: seed it from this device.
      return;
    }
    if (remote.rev === meta.rev) {
      if (meta.dirty) await doPush();
      return;
    }
    if (meta.dirty) {
      await cache.set(META_KEY, { ...meta, rev: remote.rev } satisfies Meta);
      await doPush();
      return;
    }
    // Validate before caching: a newer-version or corrupt remote file must not replace good local data.
    await cache.set(STATE_KEY, migrateState(remote.state));
    await cache.set(META_KEY, { rev: remote.rev, dirty: false } satisfies Meta);
  }

  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = queue.then(async () => {
      try {
        await task();
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    });
    queue = run;
    return run;
  }

  return {
    load: () => cache.get<StoredState>(STATE_KEY),

    async save(state) {
      await cache.setMany({ [STATE_KEY]: state, [META_KEY]: { ...(await getMeta()), dirty: true } satisfies Meta });
      await enqueue(doPush);
    },

    subscribe: (onChange) => cache.subscribe((keys) => keys.includes(STATE_KEY) && onChange()),
    pull: () => enqueue(doPull),
    push: () => enqueue(doPush),
    getError: () => error,
  };
}
