<script setup lang="ts">
import { ref, toRef } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import { ITEMS_RANGE, MAX_TITLE_LENGTH, REFRESH_CHOICES, RSS_LAYOUTS, RSS_MODES, type RssMode } from '../../../utils/rss/config';
import FeedPicker from './FeedPicker.vue';
import { useRssConfig } from './useRssConfig';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:config': [config: WidgetConfig] }>();

const { config, update, addFeeds, updateFeed, removeFeed } = useRssConfig(toRef(props, 'config'), (next) => emit('update:config', next));
const pickerOpen = ref(false);

const toggles = [
  { key: 'showImage', label: 'Images' },
  { key: 'showSummary', label: 'Descriptions' },
  { key: 'showSource', label: 'Source names' },
  { key: 'showTime', label: 'Times' },
  { key: 'newTab', label: 'Open links in a new tab' },
] as const;
</script>

<template>
  <div class="rss-settings">
    <section>
      <h3>Feeds</h3>
      <label class="title-field">Title (optional)
        <input type="text" :value="config.title" :maxlength="MAX_TITLE_LENGTH" placeholder="No title" @change="update({ title: ($event.target as HTMLInputElement).value })" />
      </label>
      <ul v-if="config.feeds.length" class="feeds">
        <li v-for="feed in config.feeds" :key="feed.url">
          <input type="color" :value="feed.color" :aria-label="`Color for ${feed.title}`" @input="updateFeed(feed.url, { color: ($event.target as HTMLInputElement).value })" />
          <input type="text" :value="feed.title" :aria-label="`Name for ${feed.url}`" :title="feed.url" maxlength="100" @change="updateFeed(feed.url, { title: ($event.target as HTMLInputElement).value })" />
          <button type="button" :aria-label="`Remove ${feed.title}`" @click="removeFeed(feed.url)">Remove</button>
        </li>
      </ul>
      <button type="button" class="add" @click="pickerOpen = true">Add feeds…</button>
    </section>

    <section class="display">
      <h3>Display</h3>
      <label>Show feeds
        <select :value="config.mode" @change="update({ mode: ($event.target as HTMLSelectElement).value as RssMode })">
          <option v-for="mode in RSS_MODES" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
        </select>
      </label>
      <label>Layout
        <select :value="config.layout" @change="update({ layout: ($event.target as HTMLSelectElement).value as never })">
          <option v-for="layout in RSS_LAYOUTS" :key="layout.value" :value="layout.value">{{ layout.label }}</option>
        </select>
      </label>
      <label>Mark feeds with
        <select :value="config.feedMarker" @change="update({ feedMarker: ($event.target as HTMLSelectElement).value as never })">
          <option value="dot">A colored dot</option>
          <option value="icon">The site's icon</option>
        </select>
      </label>
      <label>Refresh feeds
        <select :value="config.refreshMinutes" @change="update({ refreshMinutes: Number(($event.target as HTMLSelectElement).value) })">
          <option v-for="choice in REFRESH_CHOICES" :key="choice.minutes" :value="choice.minutes">{{ choice.label }}</option>
        </select>
      </label>
      <label class="check wide">
        <input type="checkbox" :checked="config.refreshOnOpen" @change="update({ refreshOnOpen: ($event.target as HTMLInputElement).checked })" />
        Refresh when a new tab opens
      </label>
      <p class="hint">When off, feeds only update in the background (and with the Refresh button). Opening tabs in quick succession checks at most once every 2 minutes.</p>
      <label>Items at first
        <input type="range" :min="ITEMS_RANGE.min" :max="ITEMS_RANGE.max" :value="config.maxItems" @input="update({ maxItems: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ config.maxItems }}</output>
        <small>More load as you scroll.</small>
      </label>
      <div class="toggles">
        <label v-for="toggle in toggles" :key="toggle.key" class="check">
          <input type="checkbox" :checked="config[toggle.key]" @change="update({ [toggle.key]: ($event.target as HTMLInputElement).checked })" />
          {{ toggle.label }}
        </label>
      </div>
    </section>

    <FeedPicker :open="pickerOpen" :existing="config.feeds.map((f) => f.url)" @close="pickerOpen = false" @add="addFeeds" />
  </div>
</template>

<style scoped>
.rss-settings { display: flex; flex-direction: column; gap: 1rem; }
h3 { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.title-field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
.feeds { margin: 0 0 0.5rem; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
.feeds li { display: flex; align-items: center; gap: 0.5rem; }
.feeds input[type='color'] { width: 1.8rem; height: 1.8rem; flex: none; padding: 0; background: none; border: 0; cursor: pointer; }
.feeds input[type='text'] { flex: 1; min-width: 0; }
input[type='text'], select { font: inherit; padding: 0.3rem 0.5rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
button { font: inherit; font-size: 0.9em; padding: 0.3rem 0.7rem; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); cursor: pointer; }
button:hover { background: var(--border); }
.display { display: flex; flex-direction: column; gap: 0.5rem; }
.display > label { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.toggles { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.35rem; }
.hint { margin: -0.25rem 0 0; color: var(--text-muted); font-size: 0.85em; }
.check { display: flex; align-items: center; gap: 0.4rem; }
</style>
