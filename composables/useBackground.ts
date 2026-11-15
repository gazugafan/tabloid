import { notifyError } from './useNotify';
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { createIndexedDbImageStore } from '../utils/background/imageStore';
import { refreshRemoteSources, resolveBackground, type BackgroundDeps } from '../utils/background/service';
import { sanitizeBackground } from '../utils/background/settings';
import { createDefaultStore } from '../utils/storage/store';

export const BACKGROUND_KEY = 'background';

/**
 * Resolves the background image for the new tab page. `raw` is the settings in effect for the shown
 * dashboard (its own override, or the general ones). Returns the CSS-ready url (or null for none)
 * and how much to dim it. Renders from what's on the device first, then refreshes remote lists.
 */
export function useBackground(raw: Ref<unknown>, ready: Ref<boolean>, dashboardId: Ref<string>) {
  const url = ref<string | null>(null);
  const dim = ref(0);
  const blur = ref(0);
  /** Attribution for the shown image, when it has one. */
  const credit = ref<{ text: string; href?: string } | null>(null);
  const deps: BackgroundDeps = { images: createIndexedDbImageStore(), local: createDefaultStore() };
  let objectUrl: string | undefined;
  let firstResolve = true;
  let run = 0;

  /** Shows an image; `isObjectUrl` marks blob URLs this composable must release later. */
  function show(next: string | null, isObjectUrl = false) {
    const previous = objectUrl;
    objectUrl = isObjectUrl && next ? next : undefined;
    url.value = next;
    if (previous) URL.revokeObjectURL(previous);
  }

  async function update(rawSettings: unknown, dashboard: string) {
    const settings = sanitizeBackground(rawSettings);
    const mine = ++run;
    dim.value = settings.dim;
    blur.value = settings.blur;
    const apply = async () => {
      const resolved = await resolveBackground(settings, deps, { rotate: firstResolve, dashboardId: dashboard });
      firstResolve = false;
      if (mine !== run) return undefined;
      const info = resolved?.candidate;
      const text = info?.source === 'upload' ? undefined : [info?.title, info?.credit].filter(Boolean).join(' · ');
      credit.value = text ? { text, href: info?.link } : null;
      if (resolved?.blob) show(URL.createObjectURL(resolved.blob), true);
      else show(resolved?.candidate.url ?? null);
      return resolved;
    };
    try {
      const shown = await apply();
      // First use of a remote source has nothing cached yet; fetch, then show it.
      const { changed, errors } = await refreshRemoteSources(settings, deps);
      for (const message of errors) notifyError(message);
      if (changed && mine === run && !shown) await apply();
    } catch {
      show(null); // Image storage unavailable: fall back to the plain background color.
    }
  }

  watch([ready, raw, dashboardId], ([isReady, settings, dashboard]) => isReady && void update(settings, dashboard), { immediate: true });
  onBeforeUnmount(() => show(null));

  return { url, dim, blur, credit };
}
