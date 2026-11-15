<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { notifyError } from '../../../composables/useNotify';
import type { WidgetConfig } from '../../../types/layout';
import { hasFeedAccess, hasScreenshotAccess, requestFeedAccess, requestScreenshotAccess } from '../../../utils/rss/permissions';
import LinkTile from './LinkTile.vue';
import { sanitizeBookmarksConfig } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const config = computed(() => sanitizeBookmarksConfig(props.config));

// Preview images come from visiting the pages, which needs permission to read websites.
const wantsPreview = computed(() => config.value.display !== 'icon' && config.value.layout !== 'list');
const screenshots = computed(() => config.value.display === 'screenshot');
const allowed = ref(true);
const check = () => (screenshots.value ? hasScreenshotAccess() : hasFeedAccess());
onMounted(async () => (allowed.value = await check()));
watch(() => config.value.display, async () => (allowed.value = await check()));
const needsAccess = computed(() => wantsPreview.value && !allowed.value && config.value.links.length > 0);
/** Without permission every tile just shows its icon. */
const mode = computed(() => (wantsPreview.value && allowed.value ? config.value.display : 'icon'));

async function allow() {
  try {
    await (screenshots.value ? requestScreenshotAccess() : requestFeedAccess());
    allowed.value = await check();
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error));
  }
}
</script>

<template>
  <div class="bookmarks">
  <p v-if="!config.links.length" class="empty">No links yet. Open this widget's settings to add some.</p>
  <template v-else>
  <div v-if="needsAccess" class="notice" role="note">
    <p>{{ screenshots ? 'Tabloid needs your permission to take screenshots of these pages.' : 'Tabloid needs your permission to find preview images on these sites.' }}</p>
    <button type="button" @click="allow">Allow</button>
  </div>
  <ul class="links" :class="`layout-${config.layout}`">
    <li v-for="link in config.links" :key="link.id">
      <a :href="link.url" :target="config.newTab ? '_blank' : undefined" rel="noopener noreferrer" :title="link.url">
        <LinkTile :link="link" :site-icons="config.siteIcons" :mode="mode" />
        <span class="name">{{ link.title }}</span>
      </a>
    </li>
  </ul>
  </template>
  </div>
</template>

<style scoped>
.bookmarks { display: flex; flex-direction: column; gap: 0.5rem; height: 100%; min-height: 0; }
.empty { margin: 0; height: 100%; display: grid; place-content: center; color: var(--text-muted); text-align: center; }
.notice { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.7rem; background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.notice p { margin: 0; }
.notice button { font: inherit; padding: 0.3rem 0.9rem; color: var(--on-accent); background: var(--accent); border: 0; border-radius: calc(var(--radius) / 1.5); cursor: pointer; font-weight: 600; }
.links { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; overflow-y: auto; scrollbar-width: thin; display: grid; align-content: start; }
a { display: flex; align-items: center; gap: 0.6rem; min-width: 0; color: var(--text); text-decoration: none; border-radius: calc(var(--radius) / 1.5); }
a:hover .name { color: var(--accent); }
.layout-small, .layout-medium, .layout-large { gap: 0.5rem; }
.layout-small { --icon-size: 2.5rem; grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr)); }
.layout-medium { --icon-size: 3.75rem; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); }
.layout-large { --icon-size: 5.5rem; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.75rem; }
:is(.layout-small, .layout-medium, .layout-large) a { flex-direction: column; padding: 0.4rem 0.2rem; text-align: center; }
:is(.layout-small, .layout-medium, .layout-large) a:hover { background: var(--surface-raised); }
:is(.layout-small, .layout-medium, .layout-large) .name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layout-large .name { font-size: 1.1em; }
.layout-list { gap: 0.15rem; --icon-size: 1.6rem; }
.layout-list a { padding: 0.25rem 0.3rem; }
.layout-list a:hover { background: var(--surface-raised); }
.layout-list .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
