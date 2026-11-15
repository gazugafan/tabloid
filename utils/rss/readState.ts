/** Which articles the user has opened. Stored as the "rssRead" preference. */
export const READ_STATE_KEY = 'rssRead';
/** Oldest entries drop off beyond this, which also bounds how big the synced document grows. */
export const MAX_READ_IDS = 3000;

export interface ReadState {
  /** Item ids, oldest first. */
  ids: string[];
}

export function sanitizeReadState(raw: unknown): ReadState {
  const ids = typeof raw === 'object' && raw !== null && Array.isArray((raw as ReadState).ids) ? (raw as ReadState).ids : [];
  return { ids: ids.filter((id): id is string => typeof id === 'string').slice(-MAX_READ_IDS) };
}

/** Returns a new state with `ids` added (newest last). Unchanged state is returned as is. */
export function markRead(state: ReadState, ids: readonly string[]): ReadState {
  const have = new Set(state.ids);
  const added = ids.filter((id) => !have.has(id));
  if (added.length === 0) return state;
  return { ids: [...state.ids, ...new Set(added)].slice(-MAX_READ_IDS) };
}
