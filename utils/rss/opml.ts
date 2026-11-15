import { XMLParser } from 'fast-xml-parser';
import { decodeEntities, safeUrl } from './text';

/** OPML is the standard way feed readers exchange their subscriptions. */

export interface OpmlFeed {
  title: string;
  url: string;
  siteUrl?: string;
}

export interface OpmlFolder {
  /** The folder's name; empty for feeds that sit at the top level. */
  name: string;
  feeds: OpmlFeed[];
}

/** More than this in one file is almost certainly a mistake (or an attack), not a real subscription list. */
export const MAX_OPML_FEEDS = 1000;

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) => name === 'outline',
});

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);
const attr = (node: Node, ...names: string[]): string | undefined => {
  for (const name of names) {
    const value = node[`@_${name}`];
    if (typeof value === 'string' && value.trim()) return decodeEntities(value).trim();
  }
  return undefined;
};

/** Reads an OPML file into folders of feeds. Throws a readable error if it isn't OPML. */
export function parseOpml(xml: string): OpmlFolder[] {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new Error("This isn't a valid OPML file.");
  }
  const body = isNode(doc.opml) && isNode(doc.opml.body) ? doc.opml.body : undefined;
  if (!body) throw new Error("This doesn't look like an OPML feed list.");

  const folders = new Map<string, OpmlFeed[]>();
  const seen = new Set<string>();
  let count = 0;

  const walk = (outlines: unknown, path: string[]) => {
    for (const outline of Array.isArray(outlines) ? outlines : []) {
      if (!isNode(outline)) continue;
      const url = safeUrl(attr(outline, 'xmlUrl', 'xmlurl'));
      if (url && !seen.has(url)) {
        if (++count > MAX_OPML_FEEDS) throw new Error(`This file lists more than ${MAX_OPML_FEEDS} feeds, which is too many to import at once.`);
        seen.add(url);
        const group = path.join(' / ');
        const feed: OpmlFeed = { title: attr(outline, 'title', 'text') ?? new URL(url).hostname, url, siteUrl: safeUrl(attr(outline, 'htmlUrl', 'htmlurl')) };
        folders.set(group, [...(folders.get(group) ?? []), feed]);
      }
      // Outlines without a feed address are folders; nested folders are named "Outer / Inner".
      const name = attr(outline, 'title', 'text');
      walk(outline.outline, url || !name ? path : [...path, name]);
    }
  };
  walk(body.outline, []);

  const result = [...folders].map(([name, feeds]) => ({ name, feeds }));
  if (result.length === 0) throw new Error('No feeds were found in this file.');
  // Ungrouped feeds first, then folders in file order.
  return result.sort((a, b) => Number(b.name === '') - Number(a.name === ''));
}

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Writes feeds as OPML 2.0: one folder per group, or no folder for a single unnamed group. */
export function buildOpml(groups: ReadonlyArray<{ name: string; feeds: ReadonlyArray<{ title: string; url: string }> }>, now: Date = new Date()): string {
  const outline = (feed: { title: string; url: string }, indent: string) =>
    `${indent}<outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"/>`;
  const body = groups
    .filter((g) => g.feeds.length > 0)
    .map((g) =>
      g.name
        ? `    <outline text="${escapeXml(g.name)}" title="${escapeXml(g.name)}">\n${g.feeds.map((f) => outline(f, '      ')).join('\n')}\n    </outline>`
        : g.feeds.map((f) => outline(f, '    ')).join('\n'),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Tabloid feeds</title>\n    <dateCreated>${now.toUTCString()}</dateCreated>\n  </head>\n  <body>\n${body}\n  </body>\n</opml>\n`;
}

