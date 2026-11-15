import { ref } from 'vue';
import { browser } from 'wxt/browser';
import type { WidgetInstance } from '../../../types/layout';
import { hasExtensionStorage } from '../../../utils/storage/store';
import { buildTabFrameRule } from '../../../utils/frames/rules';
import { FRAME_BRIDGE_FILE, FRAME_BRIDGE_ID } from '../../../utils/frames/bridge';
import { sanitizeWebpagesConfig } from './config';

/**
 * Many sites send headers (X-Frame-Options, a Content-Security-Policy with frame-ancestors) that stop them
 * being shown inside another page. With the user's permission, Tabloid removes those two response headers from frames
 * in its own tabs, while a Webpages widget asks for it (see utils/frames/rules.ts). Following links inside the frame
 * keeps working, on any site.
 */
/**
 * Firefox refuses these header changes from a webRequest listener in Manifest V3 extensions (x-frame-options is a
 * restricted header there, and the CSP can only be added to), but its declarativeNetRequest rules may change them.
 * `declarativeNetRequestWithHostAccess` and `scripting` are in the manifest's permissions (see wxt.config.ts), so only
 * the sites are asked for.
 */
/** Rewriting a site's headers needs access to that site. Links can lead anywhere, so this asks for all sites once. */
export const FRAME_ORIGINS = ['<all_urls>'];

/** Bumped after the user grants access, so the rules are installed without waiting for a layout change. */
export const frameAccessVersion = ref(0);
/** Bumped whenever the header handling really changed, so frames are rebuilt and load under the new behaviour. */
export const frameRulesRevision = ref(0);
/** True while the browser's rules are being brought up to date; frames that need them wait, so their request can't beat the rule. */
export const frameRulesBusy = ref(false);

/** Whether any Webpages widget asks to get around framing blocks. */
export function wantsFrameRules(widgets: readonly Pick<WidgetInstance, 'type' | 'config'>[]): boolean {
  return widgets.some((widget) => widget.type === 'webpages' && sanitizeWebpagesConfig(widget.config).bypass);
}

/** Whether this can be offered: only in the installed extension (not the dev page served over HTTP). */
export const frameRulesSupported = () => hasExtensionStorage();

export async function hasFrameAccess(): Promise<boolean> {
  if (!frameRulesSupported()) return false;
  return browser.permissions.contains({ origins: FRAME_ORIGINS }).catch(() => false);
}

/**
 * Asks for the permissions. Must be called straight from a click, with nothing awaited first.
 * Resolves to whether they were granted.
 */
export function requestFrameAccess(): Promise<boolean> {
  if (!frameRulesSupported()) return Promise.resolve(false);
  return browser.permissions.request({ origins: FRAME_ORIGINS }).then((granted) => {
    if (granted) frameAccessVersion.value++;
    return granted;
  });
}

/** JSON with object keys sorted: the browser returns rules with their keys in its own order. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

const RULES_TIMEOUT_MS = 4000;

/** Makes this tab's session rule match what's wanted. Returns whether anything changed. */
async function applyTabRule(want: boolean): Promise<boolean> {
  const dnr = browser.declarativeNetRequest;
  if (!dnr?.getSessionRules) return false;
  // Earlier versions kept per-site rules that only matched a frame's first page; they're replaced by the tab rule.
  const old = await dnr.getDynamicRules();
  if (old.length) await dnr.updateDynamicRules({ removeRuleIds: old.map((rule) => rule.id) });
  const tabId = (await browser.tabs.getCurrent())?.id;
  if (!tabId) return false;
  const existing = (await dnr.getSessionRules()).find((rule) => rule.id === tabId);
  const wanted = want ? buildTabFrameRule(tabId) : undefined;
  if (!existing && !wanted) return false;
  const same = existing && wanted && existing.priority === wanted.priority && canonical(existing.action) === canonical(wanted.action) && canonical(existing.condition) === canonical(wanted.condition);
  if (same) return false;
  await dnr.updateSessionRules({ removeRuleIds: existing ? [tabId] : [], addRules: wanted ? [wanted as never] : [] });
  return true;
}

/** Registers the script that tells widgets where their frames are (for back and forward), or removes it. */
async function applyBridge(want: boolean): Promise<void> {
  const scripting = browser.scripting;
  if (!scripting?.getRegisteredContentScripts) return;
  const registered = (await scripting.getRegisteredContentScripts({ ids: [FRAME_BRIDGE_ID] })).length > 0;
  if (want && !registered) {
    await scripting.registerContentScripts([{ id: FRAME_BRIDGE_ID, js: [FRAME_BRIDGE_FILE], matches: ['<all_urls>'], allFrames: true, runAt: 'document_idle', persistAcrossSessions: true }]);
  } else if (!want && registered) {
    await scripting.unregisterContentScripts({ ids: [FRAME_BRIDGE_ID] });
  }
}

/** Makes the browser strip framing headers in this tab's frames, or stop, depending on whether a widget wants it and the user allowed it. */
export async function applyFrameRules(enabled: boolean): Promise<void> {
  frameRulesBusy.value = true;
  // Frames wait for this, so it must never hang them: give up after a few seconds.
  const giveUp = setTimeout(() => (frameRulesBusy.value = false), RULES_TIMEOUT_MS);
  try {
    if (!frameRulesSupported()) return;
    const access = enabled ? await hasFrameAccess() : false;
    const [changed] = await Promise.all([applyTabRule(access), applyBridge(access)]);
    if (changed) frameRulesRevision.value++;
  } finally {
    clearTimeout(giveUp);
    frameRulesBusy.value = false;
  }
}
