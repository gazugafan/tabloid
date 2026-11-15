import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFeed } from '../utils/rss/parse';
import { decodeEntities, htmlToText, safeUrl, truncate } from '../utils/rss/text';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const fixture = (name: string, encoding = 'utf-8') => new TextDecoder(encoding).decode(readFileSync(`tests/fixtures/rss/${name}`));
const parse = (name: string, url: string, encoding?: string) => parseFeed(fixture(name, encoding), url, NOW);

describe('real-world feeds', () => {
  it.each([
    ['bbc.xml', 'https://feeds.bbci.co.uk/news/rss.xml'],
    ['hn.xml', 'https://news.ycombinator.com/rss'],
    ['npr.xml', 'https://feeds.npr.org/1001/rss.xml'],
    ['guardian.xml', 'https://www.theguardian.com/world/rss'],
    ['arstechnica.xml', 'https://feeds.arstechnica.com/arstechnica/index'],
    ['github-blog.xml', 'https://github.blog/feed/'],
    ['xkcd-atom.xml', 'https://xkcd.com/atom.xml'],
    ['verge-atom.xml', 'https://www.theverge.com/rss/index.xml'],
    ['reddit.xml', 'https://www.reddit.com/r/programming/.rss'],
  ])('%s parses into clean items', (file, url) => {
    const feed = parse(file, url);
    expect(feed.title.length).toBeGreaterThan(0);
    expect(feed.items.length).toBeGreaterThan(0);
    for (const item of feed.items) {
      expect(item.title).not.toMatch(/[<>]|&(amp|lt|gt|#\d+);/);
      expect(item.summary).not.toMatch(/<[a-z/]/i);
      expect(item.link).toMatch(/^https?:\/\//);
      if (item.image) expect(item.image).toMatch(/^https?:\/\//);
      expect(Number.isFinite(item.published)).toBe(true);
      expect(item.id).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(new Set(feed.items.map((i) => i.id)).size).toBe(feed.items.length);
  });

  it('reads RDF (Slashdot) including its ISO-8859-1 encoding and dc:date', () => {
    const feed = parse('slashdot-rdf.xml', 'http://rss.slashdot.org/Slashdot/slashdotMain', 'iso-8859-1');
    expect(feed.title).toBe('Slashdot');
    expect(feed.items.length).toBeGreaterThan(1);
    expect(feed.items[0]?.published).toBe(Date.parse('2026-11-05T23:00:00+00:00'));
  });

  it('takes thumbnails from media:thumbnail (BBC) and media:content (Guardian)', () => {
    expect(parse('bbc.xml', 'https://feeds.bbci.co.uk/news/rss.xml').items[0]?.image).toMatch(/ichef\.bbci\.co\.uk/);
    expect(parse('guardian.xml', 'https://www.theguardian.com/world/rss').items.some((i) => i.image?.includes('i.guim.co.uk'))).toBe(true);
  });

  it('decodes Atom html titles and double-escaped Reddit content', () => {
    const verge = parse('verge-atom.xml', 'https://www.theverge.com/rss/index.xml');
    expect(verge.items[0]?.title).toContain('‘Welcome to the party’');
    expect(verge.siteUrl).toBe('https://www.theverge.com/');
    const reddit = parse('reddit.xml', 'https://www.reddit.com/r/programming/.rss');
    expect(reddit.items[0]?.summary).toMatch(/^submitted by/);
    expect(reddit.items[0]?.author).toMatch(/^\/u\//);
  });

  it('uses the item link as the target for Hacker News and keeps dates', () => {
    const hn = parse('hn.xml', 'https://news.ycombinator.com/rss');
    expect(hn.items[0]?.published).toBe(Date.parse(/<pubDate>([^<]*)/.exec(fixture('hn.xml'))![1]!));
  });
});

describe('edge cases', () => {
  const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://s.test/</link>${items}</channel></rss>`;

  it('handles missing dates, relative links and CDATA', () => {
    const feed = parseFeed(rss('<item><title><![CDATA[Hello & <b>bye</b>]]></title><link>/post/1</link></item>'), 'https://s.test/feed', NOW);
    expect(feed.items[0]).toMatchObject({ title: 'Hello & bye', link: 'https://s.test/post/1', published: NOW });
  });

  it('never lets a javascript: or data: link through', () => {
    const feed = parseFeed(rss('<item><title>Bad</title><link>javascript:alert(1)</link></item><item><title>Good</title><link>https://ok.test/a</link><enclosure url="javascript:x" type="image/png"/></item>'), 'https://s.test/feed', NOW);
    expect(feed.items.map((i) => i.link)).toEqual(['https://s.test/feed', 'https://ok.test/a']);
    expect(feed.items[1]?.image).toBeUndefined();
  });

  it('strips script and tags from descriptions, and skips tracking pixels when picking an image', () => {
    const description = '&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src="https://t.test/p.gif" width="1" height="1"&gt;&lt;img src="/real.jpg"&gt;&lt;p&gt;Body &amp;amp; more words here&lt;/p&gt;';
    const feed = parseFeed(rss(`<item><title>X</title><link>https://s.test/x</link><description>${description}</description></item>`), 'https://s.test/feed', NOW);
    expect(feed.items[0]?.summary).toBe('Body & more words here');
    expect(feed.items[0]?.image).toBe('https://s.test/real.jpg');
  });

  it('keeps items with only a title or only a link, drops empty ones', () => {
    const feed = parseFeed(rss('<item><title>Only title</title></item><item><link>https://s.test/only-link</link></item><item></item>'), 'https://s.test/feed', NOW);
    expect(feed.items).toHaveLength(2);
  });

  it('rejects HTML pages and garbage', () => {
    expect(() => parseFeed('<html><body>Not a feed</body></html>', 'https://s.test/')).toThrow(/doesn't look like/);
    expect(() => parseFeed('', 'https://s.test/')).toThrow();
  });

  it('gives different ids to the same guid in different feeds', () => {
    const body = rss('<item><title>A</title><guid>g1</guid><link>https://s.test/a</link></item>');
    const a = parseFeed(body, 'https://one.test/feed', NOW).items[0]!;
    const b = parseFeed(body, 'https://two.test/feed', NOW).items[0]!;
    expect(a.id).not.toBe(b.id);
  });
});

describe('uninformative summaries', () => {
  it('drops ones that only say "Comments" or repeat the title', () => {
    const hn = parse('hn.xml', 'https://news.ycombinator.com/rss');
    expect(hn.items.every((i) => i.summary === '')).toBe(true);
    const feed = parseFeed('<rss version="2.0"><channel><title>T</title><item><title>Same words</title><link>https://s.test/a</link><description>Same words</description></item></channel></rss>', 'https://s.test/f', NOW);
    expect(feed.items[0]?.summary).toBe('');
  });
});

describe('escaped markup in descriptions', () => {
  const rss = (description: string, title = 'X') => `<rss version="2.0"><channel><title>T</title><item><title>${title}</title><link>https://s.test/x</link><description>${description}</description></item></channel></rss>`;

  it('removes tags that were escaped twice instead of showing them as text', () => {
    // &amp;lt;p&amp;gt; in the XML decodes to &lt;p&gt;, which decodes to <p> a second time.
    const feed = parseFeed(rss('&amp;lt;p&amp;gt;A &amp;lt;b&amp;gt;bold&amp;lt;/b&amp;gt; claim about &amp;amp;quot;things&amp;amp;quot; here&amp;lt;/p&amp;gt;'), 'https://s.test/f', NOW);
    expect(feed.items[0]?.summary).toBe('A bold claim about "things" here');
  });

  it('handles escaped tags inside CDATA and in titles, and keeps ordinary angle-bracket text', () => {
    const feed = parseFeed(rss('<![CDATA[&lt;div class="x"&gt;Escaped &lt;a href="https://e.test"&gt;link&lt;/a&gt; text goes on&lt;/div&gt;]]>', 'Big &amp;lt;em&amp;gt;news&amp;lt;/em&amp;gt;'), 'https://s.test/f', NOW);
    expect(feed.items[0]?.summary).toBe('Escaped link text goes on');
    expect(feed.items[0]?.title).toBe('Big news');
    expect(htmlToText('2 < 3 and 5 > 4, so say we all')).toBe('2 < 3 and 5 > 4, so say we all');
  });
});

describe('text helpers', () => {
  it('decodes numeric, hex and named entities and ignores unknown ones', () => {
    expect(decodeEntities('&#8217;&#x2019;&rsquo;&amp;&bogus;&#0;&#xD800;')).toBe('’’’&&bogus;');
  });
  it('turns HTML into plain text', () => {
    expect(htmlToText('<p>One</p><p>Two<br>three</p><style>x{}</style>')).toBe('One Two three');
  });
  it('truncates at a word boundary', () => {
    expect(truncate('aaa bbb ccc ddd', 9)).toBe('aaa bbb…');
    expect(truncate('short', 9)).toBe('short');
  });
  it('only allows http(s) urls', () => {
    expect(safeUrl('/x', 'https://a.test/b')).toBe('https://a.test/x');
    expect(safeUrl('ftp://a.test/x')).toBeUndefined();
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});
