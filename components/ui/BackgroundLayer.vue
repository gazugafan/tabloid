<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ url: string | null; dim: number; blur?: number; credit?: { text: string; href?: string } | null }>();
const style = computed(() => {
  if (!props.url) return undefined;
  const blur = props.blur ?? 0;
  // Extend the layer past the screen edges so the blur doesn't fade to transparent at the borders.
  return { backgroundImage: `url("${props.url}")`, filter: blur ? `blur(${blur}px)` : undefined, inset: blur ? `${-blur * 2}px` : undefined };
});
</script>

<template>
  <template v-if="url">
    <div class="background" :style="style" aria-hidden="true">
      <div class="dim" :style="{ opacity: dim / 100 }" />
    </div>
    <p v-if="credit" class="credit">
      <a v-if="credit.href" :href="credit.href" target="_blank" rel="noopener noreferrer">{{ credit.text }}</a>
      <template v-else>{{ credit.text }}</template>
    </p>
  </template>
</template>

<style scoped>
.background { position: fixed; inset: 0; z-index: -1; transition: filter 0.2s; background-size: cover; background-position: center; background-repeat: no-repeat; }
.credit { position: fixed; left: 0.75rem; bottom: 0.5rem; max-width: min(40rem, 70vw); margin: 0; font-size: 0.75rem; color: #fff; text-shadow: 0 1px 3px rgb(0 0 0 / 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8; }
.credit a { color: inherit; }
.dim { position: absolute; inset: 0; background: #000; }
</style>
