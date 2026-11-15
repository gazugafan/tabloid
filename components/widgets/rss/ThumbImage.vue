<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadThumbnail, thumbnailsSupported, type ThumbKind } from '../../../utils/rss/thumbnails';

const props = defineProps<{ src: string; kind: ThumbKind }>();

const root = ref<HTMLElement | null>(null);
/** What the <img> shows. Empty until we've tried making a sharp thumbnail (or given up and used the original). */
const shown = ref('');
const failed = ref(false);
let objectUrl: string | undefined;
let observer: IntersectionObserver | undefined;
let gone = false;

function release() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = undefined;
}

async function prepare() {
  release();
  shown.value = '';
  failed.value = false;
  if (!thumbnailsSupported()) {
    shown.value = props.src;
    return;
  }
  try {
    const blob = await loadThumbnail(props.src, props.kind);
    if (gone) return;
    objectUrl = URL.createObjectURL(blob);
    shown.value = objectUrl;
  } catch {
    // Couldn't fetch or decode it here (no permission, odd format): the browser can still show the original.
    if (!gone) shown.value = props.src;
  }
}

onMounted(() => {
  // Only work on images that are close to being seen.
  if (typeof IntersectionObserver === 'undefined') return void prepare();
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer?.disconnect();
      void prepare();
    },
    { rootMargin: '300px' },
  );
  if (root.value) observer.observe(root.value);
});
watch(() => props.src, () => (observer ? (observer.disconnect(), root.value && observer.observe(root.value)) : void prepare()));
onBeforeUnmount(() => {
  gone = true;
  observer?.disconnect();
  release();
});
</script>

<template>
  <span v-show="!failed" ref="root" class="thumb" :class="kind">
    <img v-if="shown" :src="shown" alt="" decoding="async" referrerpolicy="no-referrer" draggable="false" @error="failed = true" />
  </span>
</template>

<style scoped>
.thumb { display: block; overflow: hidden; background: var(--surface-raised); }
.thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
