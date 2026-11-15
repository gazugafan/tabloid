<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import { notifyError } from '../../../composables/useNotify';
import { hasFeedAccess, hasScreenshotAccess, requestFeedAccess, requestScreenshotAccess } from '../../../utils/rss/permissions';
import { createScreenshotStore } from '../../../utils/screenshots/store';
import { notifySuccess } from '../../../composables/useNotify';
import { BOOKMARK_LAYOUTS, MAX_LINKS, normalizeLinkUrl, sanitizeBookmarksConfig, type BookmarkDisplay, type BookmarkLayout, type BookmarksConfig } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:config': [config: WidgetConfig] }>();

const config = computed(() => sanitizeBookmarksConfig(props.config));
const update = (patch: Partial<BookmarksConfig>) => emit('update:config', { ...config.value, ...patch });

const newTitle = ref('');
const newUrl = ref('');
const problem = ref('');

function add() {
  const url = normalizeLinkUrl(newUrl.value);
  if (!url) {
    problem.value = 'Enter a web address, like example.com.';
    return;
  }
  problem.value = '';
  update({ links: [...config.value.links, { id: crypto.randomUUID(), title: newTitle.value, url }] });
  newTitle.value = newUrl.value = '';
}

function edit(id: string, patch: { title?: string; url?: string }) {
  const links = config.value.links.map((l) => {
    if (l.id !== id) return l;
    const url = patch.url === undefined ? l.url : (normalizeLinkUrl(patch.url) ?? l.url);
    return { ...l, title: patch.title ?? l.title, url };
  });
  update({ links });
}

function move(index: number, step: number) {
  const links = [...config.value.links];
  const [link] = links.splice(index, 1);
  links.splice(index + step, 0, link!);
  update({ links });
}

const allowed = ref(true);
const check = (display: BookmarkDisplay) => (display === 'screenshot' ? hasScreenshotAccess() : hasFeedAccess());
onMounted(async () => (allowed.value = await check(config.value.display)));

/** Choosing previews asks for permission right away, from the click, so the new tab doesn't have to. */
async function setDisplay(display: BookmarkDisplay) {
  update({ display });
  if (display === 'icon') return;
  try {
    await (display === 'screenshot' ? requestScreenshotAccess() : requestFeedAccess());
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error));
  }
  allowed.value = await check(display);
}

async function deleteScreenshots() {
  try {
    await createScreenshotStore().clear();
    notifySuccess('Saved screenshots deleted.');
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error));
  }
}

const remove = (id: string) => update({ links: config.value.links.filter((l) => l.id !== id) });
</script>

<template>
  <div class="settings">
    <section>
      <h3>Links</h3>
      <ul v-if="config.links.length" class="rows">
        <li v-for="(link, index) in config.links" :key="link.id">
          <input type="text" :value="link.title" :aria-label="`Name for ${link.url}`" maxlength="60" @change="edit(link.id, { title: ($event.target as HTMLInputElement).value })" />
          <input type="text" :value="link.url" :aria-label="`Address for ${link.title}`" @change="edit(link.id, { url: ($event.target as HTMLInputElement).value })" />
          <button type="button" :disabled="index === 0" :aria-label="`Move ${link.title} up`" @click="move(index, -1)">↑</button>
          <button type="button" :disabled="index === config.links.length - 1" :aria-label="`Move ${link.title} down`" @click="move(index, 1)">↓</button>
          <button type="button" :aria-label="`Remove ${link.title}`" @click="remove(link.id)">Remove</button>
        </li>
      </ul>
      <form v-if="config.links.length < MAX_LINKS" class="add" @submit.prevent="add">
        <input v-model="newTitle" type="text" placeholder="Name (optional)" aria-label="New link name" maxlength="60" />
        <input v-model="newUrl" type="text" placeholder="example.com" aria-label="New link address" inputmode="url" />
        <button type="submit">Add link</button>
      </form>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    </section>
    <section class="display">
      <h3>Display</h3>
      <label>Layout
        <select :value="config.layout" @change="update({ layout: ($event.target as HTMLSelectElement).value as BookmarkLayout })">
          <option v-for="layout in BOOKMARK_LAYOUTS" :key="layout.value" :value="layout.value">{{ layout.label }}</option>
        </select>
      </label>
      <label v-if="config.layout !== 'list'">Each link shows
        <select :value="config.display" @change="setDisplay(($event.target as HTMLSelectElement).value as BookmarkDisplay)">
          <option value="icon">The site's icon</option>
          <option value="preview">A preview image of the page</option>
          <option value="screenshot">A screenshot of the page</option>
        </select>
      </label>
      <template v-if="config.layout !== 'list' && config.display === 'preview'">
        <p class="hint">
          Previews use the image each site offers for link sharing, not a screenshot. Tabloid visits each page to find it, so it needs permission to read websites.
          Sites without one show their icon.
        </p>
        <button v-if="!allowed" type="button" class="allow" @click="setDisplay('preview')">Allow access to websites</button>
      </template>
      <template v-if="config.layout !== 'list' && config.display === 'screenshot'">
        <p class="hint">
          Tabloid takes a screenshot of a link's page when you visit it in a tab you are looking at (at most every 6 hours), and keeps it on this device only.
          Until you have visited a page, its shared preview image or icon is shown. This needs permission to read and capture all websites.
        </p>
        <p class="hint">
          Screenshots are taken only for pages you added here, never in private windows. If a link leads to a page showing personal information (an inbox, say),
          its screenshot will show it too, so prefer icons for those.
        </p>
        <button v-if="!allowed" type="button" class="allow" @click="setDisplay('screenshot')">Allow screenshots</button>
        <button type="button" class="allow" @click="deleteScreenshots">Delete saved screenshots</button>
      </template>
      <label class="check">
        <input type="checkbox" :checked="config.siteIcons" @change="update({ siteIcons: ($event.target as HTMLInputElement).checked })" />
        Show each site's own icon
      </label>
      <p class="hint">Loads the icon from the site itself. When off, links get a lettered tile and nothing is requested.</p>
      <label class="check">
        <input type="checkbox" :checked="config.newTab" @change="update({ newTab: ($event.target as HTMLInputElement).checked })" />
        Open links in a new tab
      </label>
    </section>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 1rem; }
h3 { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.rows { margin: 0 0 0.5rem; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
.rows li { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
.rows input:first-child { flex: 1 1 6rem; }
.rows input:nth-child(2) { flex: 2 1 8rem; }
.add { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.add input { flex: 1 1 7rem; }
input[type='text'], select { font: inherit; min-width: 0; padding: 0.3rem 0.5rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
button { font: inherit; font-size: 0.9em; padding: 0.3rem 0.7rem; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); cursor: pointer; }
button:hover:not(:disabled) { background: var(--border); }
button:disabled { opacity: 0.4; cursor: default; }
.display { display: flex; flex-direction: column; gap: 0.5rem; }
.allow { align-self: flex-start; }
.display > label:not(.check) { display: flex; align-items: center; gap: 0.6rem; }
.check { display: flex; align-items: center; gap: 0.4rem; }
.hint { margin: -0.25rem 0 0; color: var(--text-muted); font-size: 0.85em; }
.problem { margin: 0.4rem 0 0; color: var(--danger, #e5484d); }
</style>
