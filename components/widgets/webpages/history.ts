/**
 * Back and forward for one page of a Webpages widget. Tabloid can't use the frame's own history (the browser keeps one
 * history for the whole tab, shared by every frame), so it keeps a list of the addresses the frame reported and
 * goes back or forward by loading the frame again at that address.
 */
export interface FrameHistory {
  entries: string[];
  index: number;
  /** Tabloid just (re)loaded the frame: the next address reported is where that load ended up, after any redirects. */
  loading: boolean;
}

const MAX_ENTRIES = 50;

export const startHistory = (url: string): FrameHistory => ({ entries: [url], index: 0, loading: true });

export const currentAddress = (history: FrameHistory) => history.entries[history.index]!;
export const canGo = (history: FrameHistory, step: -1 | 1) => history.entries[history.index + step] !== undefined;

/** Moves back or forward (or stays, to reload). The frame should then be loaded at `currentAddress`. */
export function go(history: FrameHistory, step: -1 | 0 | 1): FrameHistory {
  if (step && !canGo(history, step)) return history;
  return { ...history, index: history.index + step, loading: true };
}

/** Records the address the frame reported. */
export function visit(history: FrameHistory, url: string): FrameHistory {
  const { entries, index } = history;
  if (history.loading) return { entries: entries.map((e, i) => (i === index ? url : e)), index, loading: false };
  if (url === entries[index]) return history;
  // The browser's own back and forward buttons move the frame too: follow them instead of adding an entry.
  if (url === entries[index - 1]) return { ...history, index: index - 1 };
  if (url === entries[index + 1]) return { ...history, index: index + 1 };
  const kept = [...entries.slice(0, index + 1), url].slice(-MAX_ENTRIES);
  return { entries: kept, index: kept.length - 1, loading: false };
}
