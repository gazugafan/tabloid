import { ROTATE_MS, type RotateEvery } from './settings';

/** One image that can be shown. Uploads have no url (their data is in the image store). */
export interface Candidate {
  id: string;
  source: 'upload' | 'bing' | 'wikimedia' | 'unsplash';
  url?: string;
  title?: string;
  credit?: string;
  /** Page about the image, for the credit link. */
  link?: string;
  /** Unsplash asks to be notified when a photo is shown; a request to this URL does that. */
  trackUrl?: string;
}

/** Remembered per device so the same image stays up until it's time to rotate. */
export interface PickState {
  id?: string;
  /** Epoch ms when `id` was chosen. */
  changedAt: number;
}

export interface Pick {
  candidate: Candidate | undefined;
  state: PickState;
}

/** Keeps the current image until the rotation period has passed, then picks a different random one. */
export function pickBackground(
  candidates: readonly Candidate[],
  state: PickState,
  rotate: RotateEvery,
  now: number,
  random: () => number = Math.random,
): Pick {
  if (candidates.length === 0) return { candidate: undefined, state };
  const current = candidates.find((c) => c.id === state.id);
  const due = rotate === 'tab' || (rotate !== 'never' && now - state.changedAt >= ROTATE_MS[rotate]);
  if (current && !due) return { candidate: current, state };

  const pool = candidates.length > 1 ? candidates.filter((c) => c.id !== state.id) : candidates;
  const next = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
  return { candidate: next, state: { id: next.id, changedAt: now } };
}
