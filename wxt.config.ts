import { defineConfig } from 'wxt';

/**
 * The Chrome Web Store's public key for Tabloid (store ID fjfdlpgpignacaphhlgeabgdbimnobkh). Development builds carry
 * it so the unpacked extension gets the same ID, which keeps the Dropbox sign-in redirect
 * (https://fjfdlpgpignacaphhlgeabgdbimnobkh.chromiumapp.org/) the same as in the store version. Store packages leave
 * it out: the store has the key already.
 */
const CHROME_STORE_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5qFNPXGaQgqert5wpNiTgZ6OIqUh+dnsz5g4lNkc1IMxoDGVRhu7aP17mDCohGglCcgJglQn4b4U5LYZp5wqpneSv/+JFiGF+z1PvdJe+a8kHgWekv2cXspghf+1Y1NxUrW6gh2LqoCIh0P537TR+C6/DKZfo3sSzU5p7IQZMkR4vDLUSv92qTieJmXNjbCZd9MdJQNJLqldycDlB4QhL7rz5YM6s4D101B9fTEMEoT1W+tuFljZhwIPgg+xdOk3saLkTM+lrpK9rT1fj+hyI0aEnDyF5ArX9wKPlx79S5kK+N5VtWDOFDFGb+4ev820psX2q4qbNElk67hQhi46LwIDAQAB';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue'],
  // The source archive for Firefox review: leave out local notes and store artwork, which aren't part of the build.
  zip: { excludeSources: ['CLAUDE.md', 'store/**'] },
  manifest: ({ browser, command }) => ({
    name: 'Tabloid',
    ...(browser === 'chrome' && command === 'serve' ? { key: CHROME_STORE_KEY } : {}),
    description: 'A customizable start page with widgets and RSS feeds.',
    // A Webpages widget can get around sites that refuse to be framed: declarativeNetRequestWithHostAccess removes
    // their headers, and scripting registers the small script that reports each frame's address (for back and
    // forward). Neither shows a prompt or does anything until the user grants site access. They aren't optional:
    // Firefox doesn't allow that for declarativeNetRequestWithHostAccess, and Chrome only routes requests through
    // extension rules for extensions that had it when they loaded (granting it later needed a browser restart).
    permissions: ['storage', 'alarms', 'identity', 'declarativeNetRequestWithHostAccess', 'scripting'],
    optional_host_permissions: ['https://*/*', 'http://*/*', '<all_urls>'],
    // Firefox lists Tabloid separately for the home page and for new tabs (Settings > Home), so users can pick either or
    // both. WXT adds the new tab override from the newtab entrypoint.
    ...(browser === 'firefox' ? { chrome_settings_overrides: { homepage: 'newtab.html' } } : {}),
    browser_specific_settings: {
      gecko: {
        id: 'tabloid@kencation.com',
        // Required for new listings on addons.mozilla.org: Tabloid collects no data (sync goes only to the provider
        // the user picks, which isn't the developer).
        data_collection_permissions: { required: ['none'] },
      },
    },
  }),
});
