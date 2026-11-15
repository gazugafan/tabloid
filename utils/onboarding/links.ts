import { browser } from 'wxt/browser';
import { hasExtensionStorage } from '../storage/store';

/** Where the extension's own pages live: in the extension, or on the dev server's plain web page. */
function pageUrl(page: 'newtab' | 'options', suffix: string): string {
  if (hasExtensionStorage()) return `${browser.runtime.getURL(`/${page}.html` as never)}${suffix}`;
  return `/entrypoints/${page}/index.html${suffix}`;
}

export const newTabUrl = (flag: 'welcome' | 'tour') => pageUrl('newtab', `?${flag}`);
export const optionsUrl = (section?: string) => pageUrl('options', section ? `#${section}` : '');

/** Opens one of the extension's pages in a new tab. */
export function openPage(url: string): void {
  if (hasExtensionStorage()) void browser.tabs.create({ url });
  else window.open(url, '_blank');
}
