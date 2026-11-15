/**
 * A hand-picked directory of well-known feeds, shown when adding feeds. Every address was checked
 * to serve a working RSS or Atom feed when this list was written. Within a category the most
 * widely read feeds come first; `featured` ones are also gathered under "Top picks".
 *
 * There is no free, public feed directory we could query without sending the user's interests to a
 * third party, so this list ships with the extension and is updated with releases.
 */
export interface PopularFeed {
  title: string;
  url: string;
  /** One short line about what the feed covers. */
  about: string;
  featured?: boolean;
}

export interface PopularCategory {
  name: string;
  feeds: PopularFeed[];
}

export const POPULAR_CATEGORIES: readonly PopularCategory[] = [
  {
    name: 'News',
    feeds: [
      { title: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', about: 'Top stories from the BBC', featured: true },
      { title: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', about: 'National Public Radio headlines', featured: true },
      { title: 'The Guardian: World', url: 'https://www.theguardian.com/world/rss', about: 'World news from The Guardian' },
      { title: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', about: 'International news and analysis' },
      { title: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', about: 'The Times home page' },
      { title: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', about: 'Top stories from CNN' },
      { title: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main', about: 'Latest from CBS News' },
      { title: 'ABC News', url: 'https://abcnews.go.com/abcnews/topstories', about: 'ABC News top stories' },
      { title: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/home.xml', about: 'UK and world news' },
      { title: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all', about: 'Germany’s international broadcaster, in English' },
      { title: 'France 24', url: 'https://www.france24.com/en/rss', about: 'International news from France' },
    ],
  },
  {
    name: 'Technology',
    feeds: [
      { title: 'Hacker News', url: 'https://news.ycombinator.com/rss', about: 'The front page of Y Combinator’s community', featured: true },
      { title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', about: 'Tech, science, art and culture', featured: true },
      { title: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', about: 'In-depth tech news and reviews', featured: true },
      { title: 'TechCrunch', url: 'https://techcrunch.com/feed/', about: 'Startups and technology news' },
      { title: 'Wired', url: 'https://www.wired.com/feed/rss', about: 'How technology is changing the world' },
      { title: 'Engadget', url: 'https://www.engadget.com/rss.xml', about: 'Gadgets and consumer tech' },
      { title: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', about: 'Emerging technology, explained' },
      { title: 'Gizmodo', url: 'https://gizmodo.com/rss', about: 'Design, technology and science' },
      { title: 'The Register', url: 'https://www.theregister.com/headlines.atom', about: 'IT news with an attitude' },
      { title: 'Slashdot', url: 'http://rss.slashdot.org/Slashdot/slashdotMain', about: 'News for nerds' },
      { title: 'Lobsters', url: 'https://lobste.rs/rss', about: 'A computing-focused link community' },
      { title: '9to5Mac', url: 'https://9to5mac.com/feed/', about: 'Apple news and rumors' },
      { title: 'Android Police', url: 'https://www.androidpolice.com/feed/', about: 'Android news and reviews' },
      { title: 'OMG! Ubuntu!', url: 'https://www.omgubuntu.co.uk/feed', about: 'Ubuntu and Linux desktop news' },
    ],
  },
  {
    name: 'Science & Space',
    feeds: [
      { title: 'NASA Breaking News', url: 'https://www.nasa.gov/news-release/feed/', about: 'Releases from NASA', featured: true },
      { title: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', about: 'Research news across every field' },
      { title: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', about: 'Math, physics, biology and computer science' },
      { title: 'Nature', url: 'https://www.nature.com/nature.rss', about: 'Latest papers from Nature' },
      { title: 'Space.com', url: 'https://www.space.com/feeds/all', about: 'Space exploration and astronomy' },
      { title: 'Phys.org', url: 'https://phys.org/rss-feed/', about: 'Science and technology research news' },
      { title: 'Science News', url: 'https://www.sciencenews.org/feed', about: 'Independent science journalism' },
    ],
  },
  {
    name: 'Programming',
    feeds: [
      { title: 'GitHub Blog', url: 'https://github.blog/feed/', about: 'Updates and engineering from GitHub', featured: true },
      { title: 'DEV Community', url: 'https://dev.to/feed', about: 'Articles from developers around the world' },
      { title: 'r/programming', url: 'https://www.reddit.com/r/programming/.rss', about: 'Top programming links on Reddit' },
      { title: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/', about: 'Software, developers and community' },
      { title: 'Laravel News', url: 'https://feed.laravel-news.com/', about: 'News for the Laravel PHP framework' },
      { title: 'PHP Releases', url: 'https://www.php.net/releases/feed.php', about: 'New PHP versions' },
      { title: 'Vue.js Blog', url: 'https://blog.vuejs.org/feed.rss', about: 'Official Vue.js news' },
      { title: 'Mozilla Hacks', url: 'https://hacks.mozilla.org/feed/', about: 'Web platform and Firefox developers' },
      { title: 'Chrome for Developers', url: 'https://developer.chrome.com/static/blog/feed.xml', about: 'Web platform news from Chrome' },
      { title: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', about: 'Tips and tricks for front-end developers' },
      { title: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', about: 'Web design and development' },
      { title: 'Martin Fowler', url: 'https://martinfowler.com/feed.atom', about: 'Software design and architecture' },
      { title: 'Julia Evans', url: 'https://jvns.ca/atom.xml', about: 'Friendly explanations of how computers work' },
      { title: 'Coding Horror', url: 'https://blog.codinghorror.com/rss/', about: 'Jeff Atwood on programming and human factors' },
    ],
  },
  {
    name: 'Security',
    feeds: [
      { title: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', about: 'Investigative security journalism' },
      { title: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', about: 'Security news and help' },
    ],
  },
  {
    name: 'Business & Finance',
    feeds: [
      { title: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', about: 'Markets and business news' },
      { title: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', about: 'Top market stories' },
      { title: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', about: 'Financial markets news' },
      { title: 'The Economist: This Week', url: 'https://www.economist.com/the-world-this-week/rss.xml', about: 'A weekly summary of world events' },
    ],
  },
  {
    name: 'Sports',
    feeds: [
      { title: 'ESPN', url: 'https://www.espn.com/espn/rss/news', about: 'Top sports headlines' },
      { title: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', about: 'Sport from the BBC' },
      { title: 'Sky Sports', url: 'https://www.skysports.com/rss/12040', about: 'Sky Sports headlines' },
      { title: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/', about: 'US sports headlines' },
    ],
  },
  {
    name: 'Gaming',
    feeds: [
      { title: 'IGN', url: 'https://feeds.ign.com/ign/all', about: 'Games, movies and TV' },
      { title: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', about: 'Games, culture and reviews' },
      { title: 'Kotaku', url: 'https://kotaku.com/rss', about: 'Gaming culture and news' },
      { title: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', about: 'PC games news and reviews' },
      { title: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', about: 'PC gaming, written by fans' },
      { title: 'Eurogamer', url: 'https://www.eurogamer.net/feed', about: 'Game news and reviews' },
      { title: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', about: 'News and reviews for Nintendo fans' },
      { title: 'EventHubs', url: 'https://www.eventhubs.com/news/feed/frontpage/', about: 'Fighting game news and tournament results' },
    ],
  },
  {
    name: 'Entertainment & Culture',
    feeds: [
      { title: 'Variety', url: 'https://variety.com/feed/', about: 'Film, TV and entertainment business' },
      { title: 'Rolling Stone', url: 'https://www.rollingstone.com/feed/', about: 'Music, film and politics' },
      { title: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss', about: 'Music news and reviews' },
      { title: 'The Onion', url: 'https://www.theonion.com/rss', about: 'America’s finest news source (satire)' },
    ],
  },
  {
    name: 'Design & Lifestyle',
    feeds: [
      { title: 'Dezeen', url: 'https://www.dezeen.com/feed/', about: 'Architecture, interiors and design' },
      { title: 'A List Apart', url: 'https://alistapart.com/main/feed/', about: 'Articles for people who make websites' },
      { title: 'Atlas Obscura', url: 'https://www.atlasobscura.com/feeds/latest', about: 'The world’s hidden wonders' },
      { title: 'Kottke.org', url: 'https://feeds.kottke.org/main', about: 'Interesting links, daily' },
      { title: 'Lifehacker', url: 'https://lifehacker.com/feed/rss', about: 'Tips for getting things done' },
    ],
  },
  {
    name: 'Comics',
    feeds: [
      { title: 'xkcd', url: 'https://xkcd.com/atom.xml', about: 'A webcomic of romance, sarcasm, math and language' },
      { title: 'Penny Arcade', url: 'https://www.penny-arcade.com/feed', about: 'Gaming webcomic and news' },
      { title: 'SMBC', url: 'https://www.smbc-comics.com/comic/rss', about: 'Saturday Morning Breakfast Cereal' },
    ],
  },
];

/** The best-known feeds from every category, in category order. */
export const TOP_PICKS: readonly PopularFeed[] = POPULAR_CATEGORIES.flatMap((c) => c.feeds.filter((f) => f.featured));
