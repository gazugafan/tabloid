# Store listings

Text for the Chrome Web Store, Firefox Add-ons (AMO) and Edge Add-ons. Keep the three in step.

## Title

**Tabloid: RSS & Widget Dashboard**

(The manifest `name` stays "Tabloid". Other small extensions share that name, so the store title carries a descriptor.)

## Short description

Chrome allows 132 characters; AMO's summary allows 250.

> A beautiful new tab page with your news feeds, favorite sites, weather, notes and more. Private by default, with optional sync.

## Full description

> Tabloid turns your new tab page into a dashboard you'll enjoy opening: your news, favorite sites, weather, to-dos and notes, arranged however you like.
>
> **Your news, together**
> • Group several RSS and Atom feeds in one widget, merged by date or one tab per feed
> • Compact lists, thumbnails or cards; read items are dimmed
> • Start from a list of popular feeds, paste a site's address to find its feed, or import OPML from another reader
>
> **Everything else on one page**
> • Quick links with icons, page previews or screenshots
> • Search, clock, weather, to-do list and notes
> • Webpages: show sites right inside a widget, with back and forward
> • Several dashboards (tabs), each with its own background if you like
>
> **Make it yours**
> • Light, dark or follow your system, with your favorite accent color
> • Backgrounds from your own photos, Bing's photo of the day, Wikimedia or Unsplash
> • See-through widgets with blur, rounded corners, your choice of font and text size
> • A quick welcome guide sets everything up in about two minutes
>
> **Private by default**
> • No ads, no analytics, no tracking
> • Your setup stays in your browser unless you turn on sync
> • Sync through your browser account, Dropbox, your own WebDAV server or a GitHub repository, if you want it
> • Export your whole setup to a file at any time
>
> In Firefox, Tabloid can be your new tab page, your home page, or both (Settings > Home).

## Category

- Chrome: Productivity (Workflow & planning)
- Firefox: Tabs; also News & Reading
- Edge: Productivity

## Chrome privacy practices

**Single purpose:** Replaces the new tab page with a customizable dashboard of widgets, including an RSS feed reader.

**Permission justifications:**

- `storage`: Saves the user's dashboard layout, widget settings and feed cache in the browser.
- `alarms`: Refreshes the user's RSS feeds in the background every 30 minutes, so they're ready when a new tab opens.
- `identity`: Signs the user in to Dropbox with OAuth (`launchWebAuthFlow`), only when they choose Dropbox to sync their setup.
- `declarativeNetRequestWithHostAccess`: The Webpages widget can show a site inside a frame. When the user turns on "show sites that block embedding", Tabloid removes the X-Frame-Options and Content-Security-Policy response headers for frames inside Tabloid's own tabs only. A rule is added per Tabloid tab and removed when that tab closes or leaves Tabloid. Other tabs are never affected.
- `scripting`: Registers a small script, only while that Webpages option is on, that tells the Webpages widget which address its frame is showing, so the widget can offer back and forward buttons. The script sends nothing anywhere except to Tabloid's own page.
- Host permissions (optional, requested at the moment a feature needs them): fetching RSS feeds and site icons the user added, preview images and screenshots for the user's Quick links, and the Webpages option above.
- Remote code: No. All code is in the package.

**Data usage:** Tabloid does not collect or transmit user data. The user's settings are stored locally, or with the sync provider the user chooses (their browser account, Dropbox, WebDAV or GitHub). Nothing is sold or shared, or used for anything but the extension's features.

## Screenshots

Chrome: 1280×800 (or 640×400), up to 5. AMO: any size, 1280×800 works well. Take them in the production build with a pleasant background, light and dark mixed:

1. A full dashboard: RSS cards, quick links, weather, clock, search, on a photo background.
2. The RSS widget in thumbnail or card layout, with tabs per feed.
3. Dark theme with see-through, blurred widgets.
4. The welcome guide's look step (theme and color choices).
5. Settings: Appearance with the live preview, or the sync options.

Chrome also wants a 440×280 promo tile (optional but recommended).
