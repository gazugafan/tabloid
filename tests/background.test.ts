import { describe, expect, it, vi } from 'vitest';
import type { ImageStore, StoredImage } from '../utils/background/imageStore';
import { pickBackground, type Candidate } from '../utils/background/picker';
import { refreshRemoteSources, resolveBackground, type BackgroundDeps } from '../utils/background/service';
import { DEFAULT_BACKGROUND, DIM_RANGE, ROTATE_MS, sanitizeBackground, type BackgroundSettings } from '../utils/background/settings';
import { parseBing, parseCommonsCategory, parseUnsplash, parseWikimedia } from '../utils/background/sources';
import { cleanApiKey } from '../utils/background/keys';
import { memoryStore } from './helpers';

const c = (id: string): Candidate => ({ id, source: 'bing', url: `https://x/${id}` });

describe('sanitizeBackground', () => {
  it('falls back to defaults and clamps', () => {
    expect(sanitizeBackground(null)).toEqual(DEFAULT_BACKGROUND);
    expect(sanitizeBackground({ rotate: 'weekly', dim: 900, bing: 'yes' })).toEqual({ ...DEFAULT_BACKGROUND, dim: DIM_RANGE.max });
    expect(sanitizeBackground({ rotate: 'tab', bing: true, uploads: false, dim: 5, unsplashQuery: ' <b>moun</b>tains! ' })).toEqual({
      ...DEFAULT_BACKGROUND,
      uploads: false,
      bing: true,
      rotate: 'tab',
      dim: 5,
      unsplashQuery: 'bmounbtains',
    });
  });
});

describe('background blur', () => {
  it('is clamped', () => {
    expect(sanitizeBackground({ blur: 500 }).blur).toBe(40);
    expect(sanitizeBackground({ blur: -3 }).blur).toBe(0);
    expect(sanitizeBackground({ blur: 'x' }).blur).toBe(0);
  });
});

describe('pickBackground', () => {
  it('shows nothing without candidates', () => {
    expect(pickBackground([], { changedAt: 0 }, 'day', 1).candidate).toBeUndefined();
  });

  it('keeps the current image until the period passes', () => {
    const list = [c('a'), c('b')];
    const state = { id: 'a', changedAt: 1000 };
    expect(pickBackground(list, state, 'hour', 1000 + ROTATE_MS.hour - 1).candidate?.id).toBe('a');
    const next = pickBackground(list, state, 'hour', 1000 + ROTATE_MS.hour, () => 0);
    expect(next.candidate?.id).toBe('b');
    expect(next.state).toEqual({ id: 'b', changedAt: 1000 + ROTATE_MS.hour });
  });

  it('never rotates on "never", always on "tab", and picks something when the current image is gone', () => {
    const list = [c('a'), c('b')];
    expect(pickBackground(list, { id: 'a', changedAt: 0 }, 'never', 1e12).candidate?.id).toBe('a');
    expect(pickBackground(list, { id: 'a', changedAt: 0 }, 'tab', 1, () => 0).candidate?.id).toBe('b');
    expect(pickBackground(list, { id: 'gone', changedAt: 0 }, 'never', 1, () => 0).candidate?.id).toBe('a');
  });

  it('keeps the only image even when rotation is due', () => {
    expect(pickBackground([c('a')], { id: 'a', changedAt: 0 }, 'tab', 1).candidate?.id).toBe('a');
  });
});

describe('parseBing', () => {
  it('builds full image urls and skips malformed entries', () => {
    const list = parseBing({ images: [{ urlbase: '/th?id=OHR.Foo_EN-US1', title: 'Foo', copyright: 'Someone', hsh: 'h1' }, { title: 'bad' }, { urlbase: 'http://evil/x' }] });
    expect(list).toEqual([{ id: 'bing:h1', source: 'bing', url: 'https://www.bing.com/th?id=OHR.Foo_EN-US1_1920x1080.jpg', title: 'Foo', credit: 'Someone' }]);
    expect(() => parseBing({})).toThrow(/unexpected/);
  });
});

function imageStore(images: StoredImage[] = []): ImageStore {
  return { list: async () => images, add: async () => images[0]!, remove: async () => undefined };
}
const settings = (over: Partial<BackgroundSettings> = {}): BackgroundSettings => ({ ...DEFAULT_BACKGROUND, ...over });

describe('background service', () => {
  it('serves uploads with their blob and remembers the pick', async () => {
    const blob = new Blob(['x']);
    const local = memoryStore();
    const deps: BackgroundDeps = { images: imageStore([{ id: '1', name: 'one', blob }]), local, now: () => 5 };
    const result = await resolveBackground(settings(), deps);
    expect(result?.candidate.id).toBe('upload:1');
    expect(result?.blob).toBe(blob);
    expect(local.data['background:state']).toEqual({ id: 'upload:1', changedAt: 5 });
  });

  it('ignores uploads when switched off, and returns nothing when empty', async () => {
    const deps: BackgroundDeps = { images: imageStore([{ id: '1', name: 'one', blob: new Blob() }]), local: memoryStore() };
    expect(await resolveBackground(settings({ uploads: false }), deps)).toBeUndefined();
  });

  it('fetches Bing once per TTL and survives failures', async () => {
    const local = memoryStore();
    const body = { images: [{ urlbase: '/th?id=A', hsh: 'a' }] };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    const deps: BackgroundDeps = { images: imageStore(), local, fetchFn, now: () => 1000 };
    expect((await refreshRemoteSources(settings({ bing: true, bingMarket: 'en-US' }), deps)).changed).toBe(true);
    expect((await refreshRemoteSources(settings({ bing: true, bingMarket: 'en-US' }), deps)).changed).toBe(false); // still fresh
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await resolveBackground(settings({ bing: true, bingMarket: 'en-US', uploads: false }), deps))?.candidate.id).toBe('bing:a');

    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const later: BackgroundDeps = { ...deps, fetchFn: offline, now: () => 1000 + 1e9 };
    expect(await refreshRemoteSources(settings({ bing: true, bingMarket: 'en-US' }), later)).toEqual({ changed: false, errors: [] });
    expect((await resolveBackground(settings({ bing: true, bingMarket: 'en-US', uploads: false }), later))?.candidate.id).toBe('bing:a');
  });

  it('does not contact sources that are switched off', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    await refreshRemoteSources(settings({ bing: false }), { images: imageStore(), local: memoryStore(), fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('only rotates on "tab" when asked to', async () => {
    const images = imageStore([{ id: '1', name: '', blob: new Blob() }, { id: '2', name: '', blob: new Blob() }]);
    const local = memoryStore({ 'background:state': { id: 'upload:1', changedAt: 0 } });
    const deps: BackgroundDeps = { images, local, random: () => 0, now: () => 1 };
    expect((await resolveBackground(settings({ rotate: 'tab' }), deps, { rotate: false }))?.candidate.id).toBe('upload:1');
    expect((await resolveBackground(settings({ rotate: 'tab' }), deps, { rotate: true }))?.candidate.id).toBe('upload:2');
  });
});

describe('Wikimedia', () => {
  const feed = (width: number) => ({
    image: {
      title: 'File:Foo.jpg',
      thumbnail: { source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo.jpg/640px-Foo.jpg?utm_source=x', width: 640 },
      image: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg', width },
      description: { text: 'A foo' },
      file_page: 'https://commons.wikimedia.org/wiki/File:Foo.jpg',
    },
  });

  it('asks for a screen-sized thumbnail of large originals', () => {
    expect(parseWikimedia(feed(5000))).toMatchObject({
      id: 'wikimedia:File:Foo.jpg',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo.jpg/1920px-Foo.jpg?utm_source=x',
      title: 'A foo',
      link: 'https://commons.wikimedia.org/wiki/File:Foo.jpg',
    });
  });

  it('uses small originals as they are, and skips days without a picture or from other hosts', () => {
    expect(parseWikimedia(feed(1000))?.url).toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg');
    expect(parseWikimedia({})).toBeNull();
    const evil = feed(5000);
    evil.image.thumbnail.source = 'https://evil.test/640px-x.jpg';
    expect(parseWikimedia(evil)).toBeNull();
  });
});

describe('Unsplash', () => {
  it('builds sized urls, credit and the tracking url, and rejects foreign hosts', () => {
    const photo = {
      id: 'p1',
      urls: { raw: 'https://images.unsplash.com/photo-1?ixid=abc' },
      user: { name: 'Ann' },
      links: { html: 'https://unsplash.com/photos/p1', download_location: 'https://api.unsplash.com/photos/p1/download' },
    };
    expect(parseUnsplash([photo, { ...photo, id: 'p2', urls: { raw: 'https://evil.test/x' } }])).toEqual([
      {
        id: 'unsplash:p1',
        source: 'unsplash',
        url: 'https://images.unsplash.com/photo-1?ixid=abc&w=1920&q=80&fit=max&fm=jpg',
        title: undefined,
        credit: 'Photo by Ann on Unsplash',
        link: 'https://unsplash.com/photos/p1',
        trackUrl: 'https://api.unsplash.com/photos/p1/download',
      },
    ]);
  });
});

describe('empty results', () => {
  it('are reported instead of silently showing nothing', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ image: null }))) as unknown as typeof fetch;
    const result = await refreshRemoteSources(settings({ wikimedia: true, uploads: false }), { images: imageStore(), local: memoryStore(), fetchFn });
    expect(result.changed).toBe(false);
    expect(result.errors[0]).toMatch(/Wikimedia.*usable pictures/);
  });
});

describe('sources needing a key', () => {
  it('skips Unsplash without a key, sends the key when present, and reports API problems', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const s = settings({ unsplash: true, uploads: false });
    const noKey = await refreshRemoteSources(s, { images: imageStore(), local: memoryStore(), fetchFn });
    expect(noKey).toEqual({ changed: false, errors: [] });
    expect(fetchFn).not.toHaveBeenCalled();

    const local = memoryStore({ 'background:keys': { unsplash: 'abcdefgh12345' } });
    const withKey = await refreshRemoteSources(s, { images: imageStore(), local, fetchFn });
    expect(withKey.errors).toEqual(['Unsplash rejected the API key.']);
    const [, init] = (fetchFn as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Client-ID abcdefgh12345');
  });

  it('refetches when the Unsplash topic changes', async () => {
    const body = [{ id: 'p', urls: { raw: 'https://images.unsplash.com/p' } }];
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    const local = memoryStore({ 'background:keys': { unsplash: 'abcdefgh12345' } });
    const deps: BackgroundDeps = { images: imageStore(), local, fetchFn, now: () => 1 };
    await refreshRemoteSources(settings({ unsplash: true, unsplashQuery: 'cats' }), deps);
    await refreshRemoteSources(settings({ unsplash: true, unsplashQuery: 'cats' }), deps);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await refreshRemoteSources(settings({ unsplash: true, unsplashQuery: 'dogs' }), deps);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await resolveBackground(settings({ unsplash: true, unsplashQuery: 'cats', uploads: false }), deps)).toBeUndefined();
  });
});

describe('cleanApiKey', () => {
  it('trims, allows empty, and rejects junk', () => {
    expect(cleanApiKey('  abcDEF_123-xyz ')).toBe('abcDEF_123-xyz');
    expect(cleanApiKey('  ')).toBe('');
    expect(() => cleanApiKey('not a key!')).toThrow(/API key/);
  });
});

describe('per-dashboard background state', () => {
  it('remembers a separate current image for each dashboard', async () => {
    const images = imageStore([{ id: '1', name: 'one', blob: new Blob() }, { id: '2', name: 'two', blob: new Blob() }]);
    const local = memoryStore({ 'background:state:a': { id: 'upload:1', changedAt: 0 } });
    const deps: BackgroundDeps = { images, local, random: () => 0, now: () => 1 };
    expect((await resolveBackground(settings({ rotate: 'never' }), deps, { dashboardId: 'a' }))?.candidate.id).toBe('upload:1');
    expect((await resolveBackground(settings({ rotate: 'never' }), deps, { dashboardId: 'b' }))?.candidate.id).toBe('upload:1');
    expect(local.data['background:state:b']).toEqual({ id: 'upload:1', changedAt: 1 });
    local.data['background:state:b'] = { id: 'upload:2', changedAt: 1 };
    expect((await resolveBackground(settings({ rotate: 'never' }), deps, { dashboardId: 'a' }))?.candidate.id).toBe('upload:1');
    expect((await resolveBackground(settings({ rotate: 'never' }), deps, { dashboardId: 'b' }))?.candidate.id).toBe('upload:2');
  });
});

describe('background categories', () => {
  const page = (title: string, width: number, height: number, extra: Record<string, unknown> = {}) => ({
    title,
    imageinfo: [{
      width, height, mime: 'image/jpeg', url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${title.slice(5)}`,
      thumburl: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${title.slice(5)}/1920px-${title.slice(5)}?utm_source=commons`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
      extmetadata: { Artist: { value: '<a href="x">Jane</a> Doe' }, ObjectName: { value: 'Misty peak' } },
      ...extra,
    }],
  });

  it('keeps only screen-shaped, large Commons pictures, and reads their credit', () => {
    const list = parseCommonsCategory({
      query: { pages: [page('File:Big.jpg', 6000, 4000), page('File:Small.jpg', 800, 500), page('File:Tall.jpg', 3000, 4000), page('File:Pano.jpg', 9000, 2000), page('File:Mid.jpg', 1800, 1200)] },
    });
    expect(list.map((x) => x.id)).toEqual(['wikimedia:File:Big.jpg', 'wikimedia:File:Mid.jpg']);
    expect(list[0]).toMatchObject({ title: 'Misty peak', credit: 'Jane Doe via Wikimedia Commons', link: 'https://commons.wikimedia.org/wiki/File:Big.jpg' });
    expect(list[0]!.url).toBe('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Big.jpg/1920px-Big.jpg'); // Resized, tracking removed.
    expect(list[1]!.url).toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/Mid.jpg'); // Already small enough.
    expect(parseCommonsCategory({})).toEqual([]);
  });

  it('ignores pictures from other hosts', () => {
    expect(parseCommonsCategory({ query: { pages: [page('File:Evil.jpg', 6000, 4000, { thumburl: 'https://evil.example/x.jpg' })] } })).toEqual([]);
  });

  it('only accepts known regions and subjects', () => {
    expect(sanitizeBackground({ bingMarket: 'ja-JP', wikimediaCategory: 'mountains' })).toMatchObject({ bingMarket: 'ja-JP', wikimediaCategory: 'mountains' });
    expect(sanitizeBackground({ bingMarket: 'xx', wikimediaCategory: '../etc' })).toMatchObject({ bingMarket: 'all', wikimediaCategory: '' });
    expect(sanitizeBackground({ bingMarket: 'all', wikimediaCategory: 'all' })).toMatchObject({ bingMarket: 'all', wikimediaCategory: 'all' });
  });

  it('asks Bing for the chosen region and refetches when it changes', async () => {
    const body = { images: [{ urlbase: '/th?id=OHR.Foo', hsh: 'h' }] };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    const deps: BackgroundDeps = { images: imageStore(), local: memoryStore(), fetchFn, now: () => 1 };
    await refreshRemoteSources(settings({ bing: true, bingMarket: 'de-DE' }), deps);
    expect((fetchFn as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0]).toContain('mkt=de-DE');
    await refreshRemoteSources(settings({ bing: true, bingMarket: 'de-DE' }), deps);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await refreshRemoteSources(settings({ bing: true, bingMarket: 'ja-JP' }), deps);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('loads a Wikimedia subject from Commons instead of the Picture of the Day', async () => {
    const body = { query: { pages: [page('File:A.jpg', 6000, 4000), page('File:B.jpg', 6000, 4000), page('File:C.jpg', 6000, 4000), page('File:D.jpg', 6000, 4000), page('File:E.jpg', 6000, 4000), page('File:F.jpg', 6000, 4000)] } };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    const deps: BackgroundDeps = { images: imageStore(), local: memoryStore(), fetchFn, now: () => 1 };
    const result = await refreshRemoteSources(settings({ wikimedia: true, wikimediaCategory: 'mountains' }), deps);
    expect(result).toEqual({ changed: true, errors: [] });
    const url = (fetchFn as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0]!;
    expect(url).toContain('commons.wikimedia.org');
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain('Category:Featured pictures of mountains');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('mixes every Bing region, dropping photos several regions share', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const market = new URL(String(url)).searchParams.get('mkt');
      const images = [{ urlbase: '/th?id=OHR.Shared', hsh: 'shared' }, { urlbase: `/th?id=OHR.${market}`, hsh: market }];
      return new Response(JSON.stringify({ images }));
    }) as unknown as typeof fetch;
    const deps: BackgroundDeps = { images: imageStore(), local: memoryStore(), fetchFn, now: () => 1 };
    expect(DEFAULT_BACKGROUND.bingMarket).toBe('all');
    await refreshRemoteSources(settings({ bing: true, bingMarket: 'all' }), deps);
    expect(fetchFn).toHaveBeenCalledTimes(12);
    const resolved = new Set<string>();
    for (let i = 0; i < 40; i++) resolved.add((await resolveBackground(settings({ bing: true, bingMarket: 'all', uploads: false, rotate: 'tab' }), { ...deps, random: () => i / 40 }))!.candidate.id);
    expect(resolved.has('bing:shared')).toBe(true);
    expect(resolved.size).toBe(13); // Twelve regions plus the one shared photo, once.
  });

  it('mixes Wikimedia pictures of the day with a few subjects', async () => {
    const commons = { query: { pages: ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => page(`File:${n}.jpg`, 6000, 4000)) } };
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      new Response(JSON.stringify(String(url).includes('commons.wikimedia.org') ? commons : { image: { title: 'File:Potd.jpg', thumbnail: { source: 'https://upload.wikimedia.org/a/330px-Potd.jpg' }, image: { source: 'https://upload.wikimedia.org/a/Potd.jpg', width: 5000 } } })),
    ) as unknown as typeof fetch;
    const deps: BackgroundDeps = { images: imageStore(), local: memoryStore(), fetchFn, now: () => 1 };
    expect(await refreshRemoteSources(settings({ wikimedia: true, wikimediaCategory: 'all' }), deps)).toEqual({ changed: true, errors: [] });
    const urls = (fetchFn as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]!);
    expect(urls.filter((u) => u.includes('api.wikimedia.org'))).toHaveLength(7);
    expect(urls.filter((u) => u.includes('commons.wikimedia.org'))).toHaveLength(4);
  });
});
