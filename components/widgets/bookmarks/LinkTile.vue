<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { pageKey, screenshotStoreKey } from '../../../utils/screenshots/keys';
import { createScreenshotStore } from '../../../utils/screenshots/store';
import ThumbImage from '../rss/ThumbImage.vue';
import LinkIcon from './LinkIcon.vue';
import type { BookmarkDisplay, BookmarkLink } from './config';
import { loadPreviewImage } from './preview';

const props = defineProps<{ link: BookmarkLink; siteIcons: boolean; mode: BookmarkDisplay }>();

let screenshots: ReturnType<typeof createScreenshotStore> | undefined;

/** A screenshot of the page, if one was taken (shown as is: it is already a small, sharp image). */
const shot = ref<string>();
/** The image the page offers for sharing, once found. */
const image = ref<string>();
let objectUrl: string | undefined;
const release = () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = undefined;
};

watch(
  () => [props.mode, props.link.url] as const,
  async ([mode, url]) => {
    release();
    shot.value = image.value = undefined;
    if (mode === 'icon') return;
    const current = () => props.mode === mode && props.link.url === url;
    const key = pageKey(url);
    if (mode === 'screenshot' && key && typeof indexedDB !== 'undefined') {
      const blob = await (screenshots ??= createScreenshotStore()).get(screenshotStoreKey(key)).catch(() => undefined);
      if (blob && current()) {
        objectUrl = URL.createObjectURL(blob);
        shot.value = objectUrl;
        return;
      }
    }
    const found = await loadPreviewImage(url);
    if (current()) image.value = found;
  },
  { immediate: true },
);
onBeforeUnmount(release);
</script>

<template>
  <span v-if="mode !== 'icon'" class="shot">
    <img v-if="shot" class="fill" :src="shot" alt="" draggable="false" />
    <ThumbImage v-else-if="image" :src="image" kind="card" class="fill" />
    <LinkIcon v-else :link="link" :site-icons="siteIcons" />
  </span>
  <LinkIcon v-else :link="link" :site-icons="siteIcons" />
</template>

<style scoped>
.shot {
  position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 10; overflow: hidden;
  background: var(--surface-raised); border: 1px solid var(--border); border-radius: min(var(--radius) / 2, 0.9rem);
}
.fill { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }
</style>
