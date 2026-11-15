export const ENGINES = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { id: 'brave', name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  { id: 'wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=%s' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
] as const;

export type EngineId = (typeof ENGINES)[number]['id'] | 'custom';

export interface SearchConfig {
  engine: EngineId;
  /** For the custom engine: an address containing %s where the search words go. */
  customUrl: string;
  placeholder: string;
  newTab: boolean;
  /** Put the cursor in the box whenever the page opens. */
  autofocus: boolean;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = { engine: 'duckduckgo', customUrl: '', placeholder: '', newTab: false, autofocus: false };

export function sanitizeSearchConfig(raw: unknown): SearchConfig {
  const d = DEFAULT_SEARCH_CONFIG;
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const engine = r.engine === 'custom' || ENGINES.some((e) => e.id === r.engine) ? (r.engine as EngineId) : d.engine;
  return {
    engine,
    customUrl: typeof r.customUrl === 'string' ? r.customUrl.trim().slice(0, 300) : d.customUrl,
    placeholder: typeof r.placeholder === 'string' ? r.placeholder.trim().slice(0, 60) : d.placeholder,
    newTab: typeof r.newTab === 'boolean' ? r.newTab : d.newTab,
    autofocus: typeof r.autofocus === 'boolean' ? r.autofocus : d.autofocus,
  };
}

export function engineName(config: SearchConfig): string {
  return config.engine === 'custom' ? 'the web' : (ENGINES.find((e) => e.id === config.engine)?.name ?? 'the web');
}

/** The address to open for a search, or undefined if the engine isn't usable (e.g. a bad custom address). */
export function searchUrl(config: SearchConfig, query: string): string | undefined {
  const text = query.trim();
  if (!text) return undefined;
  const template = config.engine === 'custom' ? config.customUrl : ENGINES.find((e) => e.id === config.engine)?.url;
  if (!template || !template.includes('%s')) return undefined;
  try {
    const url = new URL(template.replace('%s', encodeURIComponent(text)));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
