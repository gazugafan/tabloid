import type { KeyValueStore } from '../storage/store';
import type { FetchFn } from '../sync/shared';
import type { ImageStore } from './imageStore';
import { readApiKeys } from './keys';
import { pickBackground, type Candidate, type PickState } from './picker';
import type { BackgroundSettings } from './settings';
import { REMOTE_BACKGROUND_SOURCES } from './sources';

/** Each dashboard remembers its own current image, since they may draw from different sources. */
export const backgroundStateKey = (dashboardId?: string) => (dashboardId ? `background:state:${dashboardId}` : 'background:state');
const remoteKey = (id: string) => `background:remote:${id}`;

interface RemoteCache {
  /** Which variant of the source this list is for (e.g. an Unsplash topic). */
  variant?: string;
  fetchedAt: number;
  candidates: Candidate[];
}

export interface BackgroundDeps {
  images: ImageStore;
  /** Device-local key-value storage for the rotation state and fetched image lists. */
  local: KeyValueStore;
  fetchFn?: FetchFn;
  now?: () => number;
  random?: () => number;
}

export interface ResolvedBackground {
  candidate: Candidate;
  /** Set for uploads; the caller turns it into an object URL. */
  blob?: Blob;
}

/** Everything that could be shown now: the uploads, and the cached lists of the enabled remote sources. */
async function gatherCandidates(settings: BackgroundSettings, deps: BackgroundDeps) {
  const uploads = settings.uploads ? await deps.images.list() : [];
  const candidates: Candidate[] = uploads.map((u) => ({ id: `upload:${u.id}`, source: 'upload', title: u.name }));
  for (const source of REMOTE_BACKGROUND_SOURCES) {
    if (!settings[source.id]) continue;
    const cache = await deps.local.get<RemoteCache>(remoteKey(source.id));
    // A list fetched for a different topic is no longer wanted.
    if (cache && cache.variant === source.variant?.(settings)) candidates.push(...cache.candidates);
  }
  return { uploads, candidates };
}

/**
 * The image the page would show right now, for previews in the settings. Unlike resolveBackground it
 * never rotates or remembers anything: it keeps the current choice when there is one, else takes the
 * first image. Fetches a source's list if none is cached yet.
 */
export async function previewBackground(settings: BackgroundSettings, deps: BackgroundDeps, dashboardId?: string): Promise<ResolvedBackground | undefined> {
  let { uploads, candidates } = await gatherCandidates(settings, deps);
  if (candidates.length === 0 && REMOTE_BACKGROUND_SOURCES.some((source) => settings[source.id])) {
    await refreshRemoteSources(settings, deps);
    ({ uploads, candidates } = await gatherCandidates(settings, deps));
  }
  const state = await deps.local.get<PickState>(backgroundStateKey(dashboardId));
  const candidate = candidates.find((c) => c.id === state?.id) ?? candidates[0];
  if (!candidate) return undefined;
  return { candidate, blob: uploads.find((u) => `upload:${u.id}` === candidate.id)?.blob };
}

/**
 * Chooses the image to show from what is already on the device (uploads and cached remote lists),
 * so the new tab never waits for the network. Remembers the choice for the rotation period.
 */
export async function resolveBackground(
  settings: BackgroundSettings,
  deps: BackgroundDeps,
  options: { rotate?: boolean; dashboardId?: string } = {},
): Promise<ResolvedBackground | undefined> {
  const now = deps.now?.() ?? Date.now();
  const { uploads, candidates } = await gatherCandidates(settings, deps);

  const stateKey = backgroundStateKey(options.dashboardId);
  const state = (await deps.local.get<PickState>(stateKey)) ?? { changedAt: 0 };
  // "Every new tab" rotates once per page load, not on every settings change while the page is open.
  const rotate = settings.rotate === 'tab' && options.rotate === false ? 'never' : settings.rotate;
  const pick = pickBackground(candidates, state, rotate, now, deps.random);
  if (pick.state !== state) {
    await deps.local.set(stateKey, pick.state);
    if (pick.candidate?.trackUrl) void trackView(pick.candidate.trackUrl, deps);
  }
  if (!pick.candidate) return undefined;
  const upload = uploads.find((u) => `upload:${u.id}` === pick.candidate!.id);
  return { candidate: pick.candidate, blob: upload?.blob };
}

/** Tells Unsplash a photo was shown (part of their API guidelines). Best effort. */
async function trackView(url: string, deps: BackgroundDeps): Promise<void> {
  try {
    const { unsplash } = await readApiKeys(deps.local);
    if (unsplash) await (deps.fetchFn ?? fetch)(url, { headers: { Authorization: `Client-ID ${unsplash}` } });
  } catch {
    // Not worth interrupting the page for.
  }
}

/**
 * Refreshes the cached image lists of enabled remote sources that are out of date.
 * Never throws: a source that fails just keeps its previous list. Network failures (offline) are
 * silent; other problems (a rejected key, a rate limit) are returned so they can be shown.
 */
export async function refreshRemoteSources(
  settings: BackgroundSettings,
  deps: BackgroundDeps,
): Promise<{ changed: boolean; errors: string[] }> {
  const now = deps.now?.() ?? Date.now();
  let changed = false;
  const errors: string[] = [];
  const keys = await readApiKeys(deps.local);
  for (const source of REMOTE_BACKGROUND_SOURCES) {
    if (!settings[source.id]) continue;
    if (source.requiresKey && !keys[source.requiresKey]) continue;
    const variant = source.variant?.(settings);
    const cache = await deps.local.get<RemoteCache>(remoteKey(source.id));
    if (cache && cache.variant === variant && now - cache.fetchedAt < source.ttlMs) continue;
    try {
      const candidates = await source.load(deps.fetchFn ?? fetch, keys, settings);
      if (candidates.length === 0) {
        errors.push(`${source.label} didn't return any usable pictures right now.`);
        continue;
      }
      await deps.local.set(remoteKey(source.id), { variant, fetchedAt: now, candidates } satisfies RemoteCache);
      changed = true;
    } catch (error) {
      // Keep whatever we had; try again on a later tab.
      if (!(error instanceof TypeError) && error instanceof Error) errors.push(error.message);
    }
  }
  return { changed, errors };
}
