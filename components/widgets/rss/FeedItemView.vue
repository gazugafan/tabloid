<script setup lang="ts">
import { computed } from 'vue';
import type { RssConfig } from '../../../utils/rss/config';
import FeedMark from './FeedMark.vue';
import ThumbImage from './ThumbImage.vue';
import { timeAgo, type DisplayItem } from '../../../utils/rss/items';

const props = defineProps<{ item: DisplayItem; config: RssConfig; read: boolean; now: number }>();
const emit = defineEmits<{ open: [] }>();

const showImage = computed(() => props.config.showImage && props.config.layout !== 'compact' && !!props.item.image);
const showSummary = computed(() => props.config.showSummary && props.config.layout !== 'compact' && !!props.item.summary);
const when = computed(() => timeAgo(props.item.published, props.now));
const exactTime = computed(() => new Date(props.item.published).toLocaleString());
</script>

<template>
  <article class="item" :class="[`layout-${config.layout}`, { read }]">
    <ThumbImage v-if="showImage" class="image" :src="item.image!" :kind="config.layout === 'cards' ? 'card' : 'thumbnail'" />
    <div class="text">
      <a
        class="title"
        :href="item.link"
        :target="config.newTab ? '_blank' : undefined"
        rel="noopener noreferrer"
        @click="emit('open')"
        @auxclick="emit('open')"
      >{{ item.title }}</a>
      <p v-if="showSummary" class="summary">{{ item.summary }}</p>
      <p v-if="config.showSource || config.showTime" class="meta">
        <span v-if="config.showSource" class="source"><FeedMark :color="item.feed.color" :icon="item.icon" :mode="config.feedMarker" />{{ item.feed.title }}</span>
        <time v-if="config.showTime" :datetime="new Date(item.published).toISOString()" :title="exactTime">{{ when }}</time>
      </p>
    </div>
  </article>
</template>

<style scoped>
.item { display: flex; gap: 0.75rem; min-width: 0; transition: opacity 0.2s; }
.item.read { opacity: 0.55; }
.item:hover { opacity: 1; }
.text { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; flex: 1; }
.title { color: var(--text); font-weight: 600; line-height: 1.3; text-decoration: none; overflow-wrap: anywhere; font-size: 1.1em; }
.title:hover { color: var(--accent); text-decoration: underline; }
.summary { display: -webkit-box; margin: 0; overflow: hidden; color: var(--text-muted); -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
.meta { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; margin: 0; color: var(--text-muted); font-size: 0.9em; }
.source { display: inline-flex; align-items: center; gap: 0.35rem; min-width: 0; }
.image { flex: none; }

.layout-compact .title { font-weight: 500; }
.layout-compact .text { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.layout-compact .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layout-compact .meta { flex: none; flex-wrap: nowrap; }

.layout-thumbnails .image { width: 4.5rem; height: 4.5rem; flex: none; border-radius: min(var(--radius) / 2, 1.5rem); box-shadow: 0 0 3px rgba(0, 0, 0, 0.5); }

.layout-cards { flex-direction: column; gap: 0.5rem; }
.layout-cards .image { width: 100%; aspect-ratio: 16 / 9; border-radius: min(var(--radius) / 2, 1.5rem); }
</style>
