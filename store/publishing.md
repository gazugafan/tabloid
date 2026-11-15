# Publishing checklist

Packages: `npm run zip` (Chrome and Edge) and `npm run zip:firefox` (Firefox, plus the source archive). Both land in `.output/`. Listing text, permission answers and screenshot notes are in `store/listing.md`. The privacy policy is `PRIVACY.md`; the stores need it at a public URL (for example the file on GitHub, if the repository is public, or a GitHub Pages page).

Store dashboards change their wording from time to time; the steps below are the shape of it.

## Firefox Add-ons (AMO): free

1. **Account.** Sign in at https://addons.mozilla.org/developers/ with a Mozilla account. Turn on two-step authentication for the account (AMO requires it to submit).
2. **Agreement.** Accept the Firefox Add-on Distribution Agreement and review policies the first time you submit.
3. **Submit a New Add-on → On this site** (listed). Upload `.output/tabloid-<version>-firefox.zip`.
   - The add-on ID `tabloid@kencation.com` is permanent once uploaded.
   - Compatibility: tick **Firefox** only, not **Firefox for Android**. Firefox for Android doesn't let extensions replace the new tab or home page, so Tabloid would install there with no way to open it.
4. **Source code.** Answer yes (the code is bundled), and upload `.output/tabloid-<version>-sources.zip`. In the notes to reviewers, give the build steps:
   > Node 25 (see .nvmrc), then `npm ci` and `npm run zip:firefox`. Output: `.output/firefox-mv3/` and `.output/tabloid-<version>-firefox.zip`.
5. **Listing.** Name "Tabloid: RSS & Widget Dashboard", summary and description from `store/listing.md`, categories, support link (GitHub issues), privacy policy (paste `PRIVACY.md`), and a license (AMO asks you to pick one; "All Rights Reserved" is an option).
6. **Screenshots** from `store/screenshots/`. The icon comes from the package.
7. Submit. Listed add-ons are reviewed; automated approval is often quick, a human review can follow later.

## Chrome Web Store: one-time US$5 fee

1. **Account.** Use (or create) the Google account that should own the listing, and turn on 2-Step Verification (required to publish).
2. **Register** at https://chrome.google.com/webstore/devconsole: accept the developer agreement and pay the one-time registration fee.
3. **Account tab.** Publisher name, a contact email (it must be verified), and the trader / non-trader declaration (for the EU). If you declare as a trader, your address and phone are shown to EU users.
4. **New item.** Upload `.output/tabloid-<version>-chrome.zip`. It's a draft until you submit.
5. **Package tab: copy the public key** and give it to Claude. It goes into the manifest `key` for development builds, so the unpacked extension has the same ID as the store one (Dropbox sign-in depends on it).
6. **Store listing tab.** Description from `store/listing.md`, category, language, the 128px icon (in the package), screenshots (1280×800), small promo tile 440×280 (`store/banner.png` if that's its size), homepage and support links.
7. **Privacy tab.** Single purpose, a justification per permission, remote code "No", and the data usage section: copy from `store/listing.md`. Tabloid handles authentication details for sync (kept on the device) and website content; tick what the form asks for honestly and certify the three statements. Add the privacy policy URL.
8. **Distribution tab.** Public, all regions (or as you like).
9. **Submit for review.** Typically a few days; broad host permissions can make it slower.

## Microsoft Edge Add-ons: free (optional)

1. Register at https://partner.microsoft.com/dashboard/microsoftedge/ with a Microsoft account (individual account).
2. Create a new extension and upload the same Chrome zip. Listing text and screenshots are the same; it also asks for the privacy policy URL.

## Before each release

- Bump `version` in `package.json`.
- `npm run compile`, `npm test`, then `npm run zip` and `npm run zip:firefox`.
- Load both packages unpacked and try them in Chrome and Firefox.
- Optional: `npx addons-linter .output/tabloid-<version>-firefox.zip` runs the same checks AMO runs on upload.
