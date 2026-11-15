import { XMLParser } from 'fast-xml-parser';
import type { FeedItem, ParsedFeed } from './types';
import { decodeEntities, htmlToText, safeUrl, shortHash, truncate } from './text';

const SUMMARY_LENGTH = 300;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Tags that may repeat; always arrays so the code below doesn't care how many there were.
  isArray: (name) => ['item', 'entry', 'link', 'enclosure', 'media:content', 'media:thumbnail', 'media:group', 'category'].includes(name),
});

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);
const asArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** Text of an element, whether it parsed as a string or as {#text, attributes}. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isNode(value) && typeof value['#text'] === 'string') return value['#text'];
  if (Array.isArray(value)) return text(value[0]);
  return '';
}

const attr = (node: unknown, name: string): string | undefined => (isNode(node) && typeof node[`@_${name}`] === 'string' ? (node[`@_${name}`] as string) : undefined);

/** Plain-text title from a title element, which may contain markup or entities. */
const plain = (value: unknown): string => htmlToText(text(value));

function parseDate(...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time)) return time;
  }
  return undefined;
}

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

function mediaImage(node: Node, base: string | undefined): string | undefined {
  const candidates: Array<{ url?: string; width: number }> = [];
  const visit = (media: unknown, isContent: boolean) => {
    const url = safeUrl(attr(media, 'url'), base);
    if (!url) return;
    const type = attr(media, 'type') ?? '';
    const medium = attr(media, 'medium');
    if (isContent && !(medium === 'image' || type.startsWith('image/') || (!type && !medium && IMAGE_EXTENSION.test(url)))) return;
    candidates.push({ url, width: Number(attr(media, 'width')) || 0 });
  };
  const groups = asArray(node['media:group'] as unknown);
  for (const source of [node, ...groups.filter(isNode)]) {
    for (const media of asArray(source['media:content'] as unknown)) visit(media, true);
    for (const media of asArray(source['media:thumbnail'] as unknown)) visit(media, false);
  }
  for (const enclosure of asArray(node.enclosure as unknown)) {
    if ((attr(enclosure, 'type') ?? '').startsWith('image/')) visit(enclosure, false);
  }
  for (const link of asArray(node.link as unknown)) {
    if (attr(link, 'rel') === 'enclosure' && (attr(link, 'type') ?? '').startsWith('image/')) {
      const url = safeUrl(attr(link, 'href'), base);
      if (url) candidates.push({ url, width: 0 });
    }
  }
  // Prefer the widest image the feed declares; otherwise the first one.
  return candidates.sort((a, b) => b.width - a.width)[0]?.url;
}

/** First usable <img> in HTML content (skipping 1px tracking pixels). */
function htmlImage(html: string, base: string | undefined): string | undefined {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (/\b(width|height)\s*=\s*["']?1["']?(?!\d)/i.test(tag)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const url = safeUrl(src, base);
    if (url) return url;
  }
  return undefined;
}

function pickLink(node: Node, base: string | undefined): string | undefined {
  const links = asArray(node.link as unknown);
  // Atom: prefer rel=alternate (or no rel); RSS: the link element's text.
  for (const link of links) {
    const rel = attr(link, 'rel');
    const href = attr(link, 'href');
    if (href && (!rel || rel === 'alternate')) return safeUrl(href, base);
  }
  for (const link of links) {
    const url = safeUrl(text(link), base);
    if (url) return url;
  }
  const guid = node.guid;
  if (isNode(guid) && attr(guid, 'isPermaLink') !== 'false') return safeUrl(text(guid), base);
  return undefined;
}

function pickAuthor(node: Node): string | undefined {
  const author = node.author;
  const name = isNode(author) ? text(author.name) : text(author);
  return plain(name || node['dc:creator']) || undefined;
}

function buildItem(node: Node, feedUrl: string, base: string | undefined, now: number): FeedItem | null {
  const link = pickLink(node, base);
  const title = plain(node.title);
  if (!title && !link) return null;

  const contentHtml = text(node['content:encoded']) || text(node.content);
  const summaryHtml = text(node.description) || text(node.summary) || text(node['media:description']) || contentHtml;
  const guidText = text(node.guid) || text(node.id) || link || title;
  // Some feeds only say "Comments" or repeat the title; that adds nothing.
  const rawSummary = htmlToText(summaryHtml);
  const summary = rawSummary.length < 15 || rawSummary === title ? '' : truncate(rawSummary, SUMMARY_LENGTH);
  const published = parseDate(node.pubDate, node.published, node.updated, node['dc:date'], node.date);

  return {
    id: shortHash(`${feedUrl}|${guidText}`),
    feedUrl,
    title: title || link || '(untitled)',
    link: link ?? safeUrl(guidText) ?? feedUrl,
    summary,
    image: mediaImage(node, base) ?? htmlImage(contentHtml || summaryHtml, link ?? base),
    author: pickAuthor(node),
    // Without a date the item can't be placed in time; the caller replaces this with first-seen time.
    published: published ?? now,
  };
}

/**
 * Parses RSS 2.0, Atom or RDF (RSS 1.0) text into plain-text items. Throws if the text isn't a feed.
 * `now` is used for items that have no date.
 */
export function parseFeed(xml: string, feedUrl: string, now: number = Date.now()): ParsedFeed {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new Error("This isn't valid XML.");
  }

  let container: Node | undefined;
  let entries: unknown[];
  if (isNode(doc.rss) && isNode(doc.rss.channel)) {
    container = doc.rss.channel;
    entries = asArray(container.item as unknown);
  } else if (isNode(doc.feed)) {
    container = doc.feed;
    entries = asArray(container.entry as unknown);
  } else if (isNode(doc['rdf:RDF'])) {
    const rdf = doc['rdf:RDF'];
    container = isNode(rdf.channel) ? rdf.channel : (asArray(rdf.channel as unknown).find(isNode) as Node | undefined);
    entries = asArray(rdf.item as unknown); // In RDF the items sit beside the channel.
  } else {
    throw new Error("This doesn't look like an RSS or Atom feed.");
  }

  const channel = container ?? {};
  const siteUrl = pickLink(channel, undefined);
  const base = siteUrl ?? feedUrl;
  const items = entries
    .filter(isNode)
    .map((entry) => buildItem(entry, feedUrl, base, now))
    .filter((item): item is FeedItem => item !== null);

  return { title: plain(channel.title) || decodeEntities(new URL(feedUrl).hostname), siteUrl, items };
}

/** Quick check used when probing URLs: does this text parse as a feed, and what is it called? */
export function tryParseFeed(xml: string, feedUrl: string): ParsedFeed | null {
  try {
    return parseFeed(xml, feedUrl);
  } catch {
    return null;
  }
}
