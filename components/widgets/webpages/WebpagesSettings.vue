<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import { notifyError } from '../../../composables/useNotify';
import { frameRulesSupported, requestFrameAccess } from './frameRules';
import { MAX_PAGES, pageAddress, sanitizeWebpagesConfig, type WebPage } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:config': [config: WidgetConfig] }>();

const config = computed(() => sanitizeWebpagesConfig(props.config));
const save = (pages: WebPage[]) => emit('update:config', { ...config.value, pages });
const canBypass = frameRulesSupported();

/** Called straight from the click so the browser accepts the permission prompt. */
function toggleBypass(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.checked) return emit('update:config', { ...config.value, bypass: false });
  requestFrameAccess().then(
    (granted) => {
      if (granted) emit('update:config', { ...config.value, bypass: true });
      else {
        input.checked = false;
        notifyError('Permission was declined, so Tabloid can’t change how sites are framed.');
      }
    },
    (error) => {
      input.checked = false;
      notifyError(error instanceof Error ? error.message : String(error));
    },
  );
}
const value = (event: Event) => (event.target as HTMLInputElement).value;

const change = (id: string, patch: Partial<WebPage>) => save(config.value.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
const remove = (id: string) => save(config.value.pages.filter((p) => p.id !== id));
const add = () => save([...config.value.pages, { id: crypto.randomUUID(), url: '', title: '' }]);
function move(index: number, step: number) {
  const pages = [...config.value.pages];
  const [page] = pages.splice(index, 1);
  pages.splice(index + step, 0, page!);
  save(pages);
}
</script>

<template>
  <div class="settings">
    <p class="hint">Each address is shown in the widget. With more than one, tabs let you switch between them.</p>
    <ul>
      <li v-for="(page, index) in config.pages" :key="page.id">
        <div class="fields">
          <input type="text" :value="page.url" inputmode="url" placeholder="https://example.com" aria-label="Page address" autocomplete="off" @change="change(page.id, { url: value($event) })" />
          <input type="text" :value="page.title" maxlength="40" placeholder="Tab name (optional)" aria-label="Tab name" autocomplete="off" @change="change(page.id, { title: value($event) })" />
          <small v-if="page.url && !pageAddress(page.url)" class="problem" role="alert">That isn't a web address Tabloid can show.</small>
        </div>
        <div class="buttons">
          <button type="button" :disabled="index === 0" aria-label="Move up" @click="move(index, -1)">↑</button>
          <button type="button" :disabled="index === config.pages.length - 1" aria-label="Move down" @click="move(index, 1)">↓</button>
          <button type="button" aria-label="Remove page" @click="remove(page.id)">×</button>
        </div>
      </li>
    </ul>
    <button type="button" class="add" :disabled="config.pages.length >= MAX_PAGES" @click="add">+ Add a page</button>
    <p class="hint">Some sites, such as Google, banks and many news sites, don't allow being shown inside another page. They appear blank. Use https addresses where you can.</p>
    <template v-if="canBypass">
      <label class="check">
        <input type="checkbox" :checked="config.bypass" @change="toggleBypass" />
        Try to show sites that block embedding
      </label>
      <p class="hint">Tabloid removes the headers sites use to refuse being framed, for pages shown inside Tabloid's tabs, including pages you reach by following links. It also adds back and forward buttons. It needs permission to change how sites are loaded, which the browser asks about on this device. Those sites' protections against being framed are off only inside Tabloid, never in your other tabs. Logins may not work, because browsers block cookies in frames.</p>
    </template>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 0.6rem; }
.hint { margin: 0; color: var(--text-muted); font-size: 0.9em; }
ul { display: flex; flex-direction: column; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }
li { display: flex; gap: 0.5rem; align-items: flex-start; }
.fields { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; min-width: 0; }
.buttons { display: flex; gap: 0.2rem; }
input { font: inherit; min-width: 0; padding: 0.3rem 0.5rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.buttons button, .add { font: inherit; padding: 0.3rem 0.6rem; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.buttons button:disabled, .add:disabled { opacity: 0.4; cursor: default; }
.add { align-self: flex-start; }
.check { display: flex; align-items: center; gap: 0.4rem; }
.problem { color: var(--danger); }
</style>
