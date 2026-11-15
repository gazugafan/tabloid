<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { linkHue, linkInitial, siteIconUrl, type BookmarkLink } from './config';

const props = defineProps<{ link: BookmarkLink; siteIcons: boolean }>();

const failed = ref(false);
watch(() => props.link.url, () => (failed.value = false));
const showImage = computed(() => props.siteIcons && !failed.value);
</script>

<template>
  <span class="icon" :style="{ '--hue': linkHue(link.url) }" aria-hidden="true">
    <img v-if="showImage" :src="siteIconUrl(link.url)" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failed = true" />
    <template v-else>{{ linkInitial(link) }}</template>
  </span>
</template>

<style scoped>
.icon {
  display: grid; place-items: center; flex: none; width: var(--icon-size, 2.5rem); height: var(--icon-size, 2.5rem); overflow: hidden; font-weight: 700; font-size: calc(var(--icon-size, 2.5rem) * 0.44);
  color: color-mix(in srgb, hsl(var(--hue) 70% 50%) 65%, var(--text)); background: color-mix(in srgb, hsl(var(--hue) 70% 50%) 22%, var(--surface-raised)); border-radius: min(var(--radius) / 2, 0.9rem);
}
.icon img { width: 60%; height: 60%; object-fit: contain; }
</style>
