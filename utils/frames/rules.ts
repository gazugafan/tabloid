import { browser } from 'wxt/browser';

/**
 * Header rules for Webpages widgets that get around sites refusing to be framed. Kept free of Vue and the widget
 * code, because the background worker uses it too.
 *
 * Each Tabloid tab that needs it gets one session rule (its id is the tab id) that removes the framing headers from
 * every frame loaded in that tab. Matching on the tab rather than on who started the request matters: when someone
 * clicks a link inside a frame, the request comes from the framed site, not from Tabloid. The background worker
 * removes the rule as soon as the tab closes or goes to a page that isn't Tabloid's.
 */

const STRIPPED_HEADERS = ['x-frame-options', 'content-security-policy'] as const;

export interface TabFrameRule {
  id: number;
  priority: number;
  action: { type: 'modifyHeaders'; responseHeaders: Array<{ header: string; operation: 'remove' }> };
  condition: { tabIds: number[]; resourceTypes: ['sub_frame'] };
}

export function buildTabFrameRule(tabId: number): TabFrameRule {
  return {
    id: tabId,
    priority: 1,
    action: { type: 'modifyHeaders', responseHeaders: STRIPPED_HEADERS.map((header) => ({ header, operation: 'remove' as const })) },
    condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
  };
}

/** Whether an address is one of this extension's own pages. */
export const isOwnPage = (url: string) => url.startsWith(browser.runtime.getURL('/'));

/** Stops changing headers in a tab. Quietly does nothing if the tab had no rule or rules aren't available. */
export async function removeTabFrameRule(tabId: number): Promise<void> {
  const dnr = browser.declarativeNetRequest;
  if (!dnr?.updateSessionRules || tabId < 1) return;
  const rules = await dnr.getSessionRules();
  if (rules.some((rule) => rule.id === tabId)) await dnr.updateSessionRules({ removeRuleIds: [tabId] });
}
