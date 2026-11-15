<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch, watchEffect } from 'vue';
import { notifyError } from '../../../composables/useNotify';
import { useFeedData } from '../../../composables/useFeedData';
import { useLayoutStore } from '../../../stores/layout';
import type { WidgetConfig } from '../../../types/layout';
import { feedItems, mergeFeeds } from '../../../utils/rss/items';
import type { WidgetAction } from '../registry';
import { requestFeedAccess } from '../../../utils/rss/permissions';
import { sanitizeReadState, READ_STATE_KEY } from '../../../utils/rss/readState';
import FeedItemView from './FeedItemView.vue';
import FeedMark from './FeedMark.vue';
import FeedPicker from './FeedPicker.vue';
import { useRssConfig } from './useRssConfig';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{
  'update:config': [config: WidgetConfig];
  'update:loading': [loading: boolean];
  'update:actions': [actions: WidgetAction[]];
}>();

const { config, addFeeds } = useRssConfig(toRef(props, 'config'), (next) => emit('update:config', next));
const urls = computed(() => config.value.feeds.map((f) => f.url));
const refreshMinutes = computed(() => config.value.refreshMinutes);
const refreshOnOpen = computed(() => config.value.refreshOnOpen);
const { feeds, refreshing, needsAccess, refreshFailure, refresh } = useFeedData(urls, { refreshMinutes, refreshOnOpen });
watch(refreshing, (value) => emit('update:loading', value));

// The refresh button lives in the widget frame's hover controls.
watchEffect(() =>
  emit('update:actions', [
    {
      id: 'refresh',
      label: 'Refresh feeds',
      icon: 'refresh',
      disabled: config.value.feeds.length === 0 || refreshing.value || needsAccess.value,
      busy: refreshing.value,
      run: () => void refresh(true),
    },
  ]),
);

const store = useLayoutStore();
const { preferences } = storeToRefs(store);
const readIds = computed(() => new Set(sanitizeReadState(preferences.value[READ_STATE_KEY]).ids));

// Re-render relative times ("5 min ago") every minute.
const now = ref(Date.now());
const clock = setInterval(() => (now.value = Date.now()), 60_000);
onBeforeUnmount(() => clearInterval(clock));

/** The "All" tab's key. Feed tabs use the feed's address. */
const ALL = '\0all';
const tabs = computed(() => {
  const feedTabs = config.value.feeds.map((f) => ({ key: f.url, label: f.title, color: f.color as string | undefined, icon: feeds.value.get(f.url)?.iconUrl }));
  return config.value.mode === 'all-tabs' ? [{ key: ALL, label: 'All', color: undefined, icon: undefined }, ...feedTabs] : feedTabs;
});
const tabbed = computed(() => config.value.mode !== 'merged');

const activeKey = ref('');
// Keep the selected tab valid as feeds or the mode change.
watch(
  () => tabs.value.map((t) => t.key).join('\n'),
  () => {
    if (!tabs.value.some((t) => t.key === activeKey.value)) activeKey.value = tabs.value[0]?.key ?? '';
  },
  { immediate: true },
);
const activeFeed = computed(() => config.value.feeds.find((f) => f.url === activeKey.value));
/** Whether the list shows every feed (merged mode, or the All tab). */
const showingAll = computed(() => !tabbed.value || activeKey.value === ALL);

/** Every cached item for the current view; the list below shows a growing slice of it. */
const allItems = computed(() => {
  const everything = Number.MAX_SAFE_INTEGER;
  if (showingAll.value) return mergeFeeds(config.value.feeds, feeds.value, everything);
  return activeFeed.value ? feedItems(activeFeed.value, feeds.value.get(activeFeed.value.url), everything) : [];
});

/** How many items are shown. Starts at the widget's setting and grows as the list is scrolled to its end. */
const shown = ref(config.value.maxItems);
watch(
  () => [config.value.maxItems, config.value.mode, activeKey.value] as const,
  ([maxItems]) => {
    shown.value = maxItems;
    list.value?.scrollTo({ top: 0 });
  },
);
const items = computed(() => allItems.value.slice(0, shown.value));
const hasMore = computed(() => shown.value < allItems.value.length);

const list = ref<HTMLElement | null>(null);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

function showMore() {
  shown.value += config.value.maxItems;
}

/** After each step, look again: if the end of the list is still in view, keep going. */
function watchSentinel() {
  observer?.disconnect();
  if (sentinel.value && observer) observer.observe(sentinel.value);
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return; // The "Show more" button still works.
  observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && showMore(), { root: list.value, rootMargin: '0px 0px 200px 0px' });
  watchSentinel();
});
watch([sentinel, shown], async () => {
  await nextTick();
  watchSentinel();
});
onBeforeUnmount(() => observer?.disconnect());

/** Feeds whose latest attempt failed, for a short note under the list. */
const problems = computed(() =>
  config.value.feeds
    .map((ref) => ({ ref, error: feeds.value.get(ref.url)?.error }))
    .filter((p): p is { ref: (typeof config.value.feeds)[number]; error: NonNullable<typeof p.error> } => !!p.error)
    .filter((p) => showingAll.value || p.ref.url === activeKey.value),
);
const hasLoaded = computed(() => config.value.feeds.some((f) => feeds.value.get(f.url)?.fetchedAt));

const pickerOpen = ref(false);
function onAdd(additions: Array<{ url: string; title: string }>) {
  addFeeds(additions);
}

async function allowAccess() {
  try {
    await requestFeedAccess();
    void refresh();
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error));
  }
}

function onTabKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  const list = tabs.value;
  const next = list[(list.findIndex((t) => t.key === activeKey.value) + step + list.length) % list.length];
  if (!next) return;
  activeKey.value = next.key;
  event.preventDefault();
  void Promise.resolve().then(() => document.getElementById(tabId(next.key))?.focus());
}

const tabId = (key: string) => (key === ALL ? 'rss-tab-all' : `rss-tab-${key}`);
</script>

<template>
  <div class="rss">
    <h2 v-if="config.title" class="heading">{{ config.title }}</h2>
    <div v-if="config.feeds.length === 0" class="empty">
      <p>Follow your favorite sites right here.</p>
      <button type="button" class="primary" @click="pickerOpen = true">Add feeds</button>
    </div>

    <template v-else>
      <div v-if="tabbed" class="tabs" role="tablist" @keydown="onTabKeydown">
        <button
          v-for="tab in tabs"
          :id="tabId(tab.key)"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="tab.key === activeKey"
          :tabindex="tab.key === activeKey ? 0 : -1"
          @click="activeKey = tab.key"
        >
          <FeedMark v-if="tab.color" :color="tab.color" :icon="tab.icon" :mode="config.feedMarker" />{{ tab.label }}
        </button>
      </div>

      <div v-if="needsAccess" class="notice" role="note">
        <p>Tabloid needs your permission to read these feeds on this device.</p>
        <button type="button" class="primary" @click="allowAccess">Allow</button>
      </div>

      <div ref="list" class="list" :class="`list-${config.layout}`" :role="tabbed ? 'tabpanel' : undefined" aria-live="polite">
        <FeedItemView
          v-for="item in items"
          :key="item.id"
          :item="item"
          :config="config"
          :read="readIds.has(item.id)"
          :now="now"
          @open="store.markItemsRead([item.id])"
        />
        <div v-if="hasMore" ref="sentinel" class="more">
          <button type="button" @click="showMore">Show more</button>
        </div>
        <p v-if="!items.length && hasLoaded && !problems.length" class="quiet">Nothing here yet.</p>
        <p v-else-if="!items.length && !hasLoaded && refreshing" class="quiet">Loading feeds…</p>
      </div>

      <ul v-if="problems.length || refreshFailure" class="problems">
        <li v-if="refreshFailure">{{ refreshFailure }}</li>
        <li v-for="p in problems" :key="p.ref.url"><strong>{{ p.ref.title }}:</strong> {{ p.error.message }}</li>
      </ul>
    </template>

    <FeedPicker :open="pickerOpen" :existing="urls" @close="pickerOpen = false" @add="onAdd" />
  </div>
</template>

<style scoped>
.rss { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 0.5rem; }
.heading { margin: 0; padding-right: 7.5rem; font-size: 1.2em; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
.empty { display: grid; place-content: center; justify-items: center; gap: 0.75rem; height: 100%; color: var(--text-muted); text-align: center; }
.empty p { margin: 0; }
.tabs { display: flex; gap: 0.25rem; min-width: 0; overflow-x: auto; scrollbar-width: thin; padding-right: 7.5rem; }
.tabs button {
  display: inline-flex; align-items: center; gap: 0.4rem; flex: none; font: inherit; font-size: 0.9em; padding: 0.3rem 0.7rem;
  color: var(--text-muted); background: none; border: 1px solid transparent; border-radius: calc(var(--radius) / 1.5); cursor: pointer; white-space: nowrap;
}
.tabs button:hover { color: var(--text); }
.tabs button[aria-selected='true'] { color: var(--text); background: var(--surface-raised); border-color: var(--border); }
.list { flex: 1; min-height: 0; padding-right: 0.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem; scrollbar-width: thin; }
.list-compact { gap: 0.45rem; }
.list-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); align-content: start; gap: 1.1rem 0.9rem; }
.more { display: flex; justify-content: center; grid-column: 1 / -1; padding: 0.25rem 0 0.5rem; }
.more button { font: inherit; font-size: 0.9em; padding: 0.3rem 0.9rem; color: var(--text-muted); background: none; border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); cursor: pointer; }
.more button:hover { color: var(--text); background: var(--surface-raised); }
.quiet { margin: 0; color: var(--text-muted); text-align: center; }
.notice { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.6rem 0.8rem; background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.notice p { margin: 0; }
.problems { margin: 0; padding: 0.5rem 0.2rem 0; list-style: none; color: var(--text-muted); font-size: 0.8em; border-top: 1px solid var(--border); }
.problems li + li { margin-top: 0.2rem; }
button.primary { font: inherit; padding: 0.4rem 1rem; color: var(--on-accent); background: var(--accent); border: 0; border-radius: calc(var(--radius) / 1.5); cursor: pointer; font-weight: 600; }
button.primary:hover { filter: brightness(1.1); }
</style>
