<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { notifyError } from '../../../composables/useNotify';
import { discoverFeeds, type DiscoveredFeed } from '../../../utils/rss/discover';
import { requestFeedAccess } from '../../../utils/rss/permissions';
import { POPULAR_CATEGORIES, TOP_PICKS, type PopularFeed } from '../../../utils/rss/popular';
import Icon from '../../ui/Icon.vue';

const props = defineProps<{ open: boolean; existing: readonly string[] }>();
const emit = defineEmits<{ close: []; add: [feeds: Array<{ url: string; title: string }>] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const view = ref<'popular' | 'address'>('popular');
const category = ref('Top picks');
const address = ref('');
const searching = ref(false);
const found = ref<Array<DiscoveredFeed & { name: string }>>([]);

const categories = computed(() => [{ name: 'Top picks', feeds: [...TOP_PICKS] }, ...POPULAR_CATEGORIES]);
const visibleFeeds = computed(() => categories.value.find((c) => c.name === category.value)?.feeds ?? []);
const isAdded = (url: string) => props.existing.includes(url);

watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open && !dialog.value?.open) dialog.value?.showModal();
    if (!open && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Reading feeds needs access to websites. Asking happens here, straight from the click. */
async function ensureAccess(): Promise<boolean> {
  try {
    await requestFeedAccess();
    return true;
  } catch (error) {
    notifyError(errorMessage(error));
    return false;
  }
}

async function addPopular(feed: PopularFeed) {
  if (await ensureAccess()) emit('add', [{ url: feed.url, title: feed.title }]);
}

async function find() {
  if (!address.value.trim()) return;
  searching.value = true;
  found.value = [];
  try {
    if (!(await ensureAccess())) return;
    found.value = (await discoverFeeds(address.value)).map((f) => ({ ...f, name: f.title }));
  } catch (error) {
    notifyError(errorMessage(error));
  } finally {
    searching.value = false;
  }
}

function addFound(feed: DiscoveredFeed & { name: string }) {
  emit('add', [{ url: feed.url, title: feed.name.trim() || feed.title }]);
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) emit('close');
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="feed-picker" aria-labelledby="feed-picker-title" @close="emit('close')" @click="onBackdropClick">
      <header>
        <h2 id="feed-picker-title">Add feeds</h2>
        <button type="button" class="close" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
      </header>

      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="view === 'popular'" @click="view = 'popular'">Popular feeds</button>
        <button type="button" role="tab" :aria-selected="view === 'address'" @click="view = 'address'">Paste an address</button>
      </div>

      <div v-if="view === 'popular'" class="popular">
        <nav class="categories" aria-label="Categories">
          <button v-for="c in categories" :key="c.name" type="button" :aria-pressed="category === c.name" @click="category = c.name">{{ c.name }}</button>
        </nav>
        <ul class="feed-list">
          <li v-for="feed in visibleFeeds" :key="feed.url">
            <div class="meta">
              <strong>{{ feed.title }}</strong>
              <span>{{ feed.about }}</span>
            </div>
            <button v-if="isAdded(feed.url)" type="button" class="added" disabled><Icon name="check" /> Added</button>
            <button v-else type="button" @click="addPopular(feed)">Add</button>
          </li>
        </ul>
      </div>

      <div v-else class="address">
        <form @submit.prevent="find">
          <label>
            Feed or website address
            <input v-model="address" type="text" inputmode="url" placeholder="example.com or https://example.com/feed.xml" autocomplete="off" />
          </label>
          <button type="submit" :disabled="searching || !address.trim()">{{ searching ? 'Looking…' : 'Find feed' }}</button>
        </form>
        <p class="hint">Paste a feed link, or just a website's address and Tabloid will look for its feed.</p>
        <ul v-if="found.length" class="feed-list">
          <li v-for="feed in found" :key="feed.url">
            <div class="meta">
              <input v-model="feed.name" type="text" aria-label="Feed name" />
              <span>{{ feed.url }}</span>
            </div>
            <button v-if="isAdded(feed.url)" type="button" class="added" disabled><Icon name="check" /> Added</button>
            <button v-else type="button" @click="addFound(feed)">Add</button>
          </li>
        </ul>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.feed-picker {
  width: min(40rem, calc(100vw - 2rem)); max-height: min(36rem, calc(100vh - 2rem)); padding: 0; overflow: hidden;
  color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 12px 48px rgb(0 0 0 / 0.35);
}
.feed-picker[open] { display: flex; flex-direction: column; }
.feed-picker::backdrop { background: rgb(0 0 0 / 0.5); }
header { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1rem 0.4rem; }
h2 { margin: 0; font-size: 1.1rem; }
.close { display: grid; place-items: center; width: 2rem; height: 2rem; color: var(--text-muted); background: none; border: 0; border-radius: calc(var(--radius) / 2); cursor: pointer; }
.close:hover { color: var(--text); background: var(--surface-raised); }
.tabs { display: flex; gap: 0.25rem; padding: 0 1rem; border-bottom: 1px solid var(--border); }
.tabs button { font: inherit; padding: 0.5rem 0.8rem; color: var(--text-muted); background: none; border: 0; border-bottom: 2px solid transparent; cursor: pointer; }
.tabs button[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent); }
.popular { display: flex; min-height: 0; flex: 1; }
.categories { display: flex; flex-direction: column; gap: 0.15rem; width: 10.5rem; padding: 0.6rem; overflow-y: auto; border-right: 1px solid var(--border); }
.categories button { font: inherit; text-align: left; padding: 0.4rem 0.6rem; color: var(--text); background: none; border: 0; border-radius: calc(var(--radius) / 1.5); cursor: pointer; }
.categories button:hover { background: var(--surface-raised); }
.categories button[aria-pressed='true'] { background: var(--surface-raised); font-weight: 600; }
.feed-list { flex: 1; min-height: 0; margin: 0; padding: 0.4rem 0.8rem; list-style: none; overflow-y: auto; }
.feed-list li { display: flex; align-items: center; gap: 0.75rem; padding: 0.55rem 0.2rem; border-bottom: 1px solid var(--border); }
.feed-list li:last-child { border-bottom: 0; }
.meta { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 0.1rem; }
.meta span { overflow: hidden; color: var(--text-muted); font-size: 0.85em; text-overflow: ellipsis; white-space: nowrap; }
.feed-list button, .address form button {
  font: inherit; padding: 0.35rem 0.9rem; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); cursor: pointer;
}
.feed-list button:hover:not(:disabled), .address form button:hover:not(:disabled) { background: var(--border); }
.feed-list button:disabled, .address form button:disabled { cursor: default; opacity: 0.6; }
.added { display: inline-flex; align-items: center; gap: 0.25rem; }
.address { display: flex; flex-direction: column; min-height: 0; flex: 1; gap: 0.5rem; padding: 0.9rem 1rem; overflow-y: auto; }
.address form { display: flex; align-items: flex-end; gap: 0.5rem; }
.address label { display: flex; flex: 1; flex-direction: column; gap: 0.25rem; }
input[type='text'] { font: inherit; width: 100%; padding: 0.4rem 0.6rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.hint { margin: 0; color: var(--text-muted); font-size: 0.9em; }
@media (max-width: 40rem) {
  .popular { flex-direction: column; }
  .categories { flex-direction: row; width: auto; overflow-x: auto; overflow-y: hidden; border-right: 0; border-bottom: 1px solid var(--border); }
  .categories button { white-space: nowrap; }
}
</style>
