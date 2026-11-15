import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { createIndexedDbImageStore } from '../utils/background/imageStore';
import { previewBackground, type BackgroundDeps } from '../utils/background/service';
import type { BackgroundSettings } from '../utils/background/settings';
import { createDefaultStore } from '../utils/storage/store';

/**
 * A CSS-ready url of the image the new tab would show for these settings (null when there is none or it
 * can't be loaded), for previews in the settings page. Only the choice of sources matters, not blur or darkness.
 * `reload` can be bumped to look again, e.g. after uploading.
 */
export function useBackgroundPreview(settings: Ref<BackgroundSettings | null>, dashboardId: Ref<string | undefined>, reload?: Ref<unknown>) {
  const url = ref<string | null>(null);
  const deps: BackgroundDeps = { images: createIndexedDbImageStore(), local: createDefaultStore() };
  let objectUrl: string | undefined;
  let run = 0;

  function show(next: string | null, isObjectUrl = false) {
    const previous = objectUrl;
    objectUrl = isObjectUrl && next ? next : undefined;
    url.value = next;
    if (previous) URL.revokeObjectURL(previous);
  }

  async function load(value: BackgroundSettings | null, dashboard: string | undefined) {
    const mine = ++run;
    if (!value) return show(null);
    try {
      const resolved = await previewBackground(value, deps, dashboard);
      if (mine !== run) return;
      if (resolved?.blob) show(URL.createObjectURL(resolved.blob), true);
      else show(resolved?.candidate.url ?? null);
    } catch {
      if (mine === run) show(null);
    }
  }

  const sources = (s: BackgroundSettings | null) =>
    s && JSON.stringify([s.uploads, s.bing, s.bingMarket, s.wikimedia, s.wikimediaCategory, s.unsplash, s.unsplashQuery]);
  watch([() => sources(settings.value), dashboardId, () => reload?.value], () => void load(settings.value, dashboardId.value), { immediate: true });
  onBeforeUnmount(() => {
    run++;
    show(null);
  });

  return { url };
}
