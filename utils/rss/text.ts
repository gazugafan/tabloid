/** Text helpers for feed content. Output is always plain text or a vetted URL, so it is safe to render. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£',
  laquo: '«', raquo: '»', bull: '•', middot: '·', times: '×', deg: '°',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function stripTagsOnce(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?(p|div|br|li|tr|h[1-6]|blockquote)\b[^>]*>/gi, ' ')
      .replace(/<\/?[a-z!][^>]*>/gi, ''), // Real tags only, so "2 < 3" survives.
  );
}

const LEFTOVER_TAG = /<\/?[a-z][^>]*>/i;

/**
 * Strips HTML down to readable plain text: no tags, entities decoded, whitespace collapsed.
 * Some feeds escape their HTML twice, so tags can reappear after the first pass; those go too.
 */
export function htmlToText(html: string): string {
  let text = stripTagsOnce(html);
  for (let pass = 0; pass < 2 && LEFTOVER_TAG.test(text); pass++) text = stripTagsOnce(text);
  return text.replace(/\s+/g, ' ').trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6))}…`;
}

/** Resolves `href` against `base` and returns it only if it is an http(s) URL; otherwise undefined. */
export function safeUrl(href: string | undefined, base?: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(decodeEntities(href.trim()), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Small, fast, non-cryptographic hash (FNV-1a) as 8 hex characters. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
