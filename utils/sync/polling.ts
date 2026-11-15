import type { RemoteRepository } from '../storage/repository';

/** While a page stays open, check a remote provider this often (and whenever the tab regains focus). */
export const REMOTE_POLL_MS = 5 * 60 * 1000;

/**
 * Pulls now, on tab focus, and periodically. Rendering never waits for the network.
 * `onStatus` receives the repository's last error (null on success) after every attempt.
 * Returns a function that stops polling.
 */
export function startRemotePolling(repo: RemoteRepository, onStatus: (error: string | null) => void): () => void {
  const pull = async () => {
    await repo.pull();
    onStatus(repo.getError());
  };
  void pull();
  const timer = setInterval(() => void pull(), REMOTE_POLL_MS);
  const onVisible = () => document.visibilityState === 'visible' && void pull();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
