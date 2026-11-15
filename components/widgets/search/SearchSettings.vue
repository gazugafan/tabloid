<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import { ENGINES, sanitizeSearchConfig, type EngineId, type SearchConfig } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:config': [config: WidgetConfig] }>();

const config = computed(() => sanitizeSearchConfig(props.config));
const update = (patch: Partial<SearchConfig>) => emit('update:config', { ...config.value, ...patch });
const text = (event: Event) => (event.target as HTMLInputElement).value;
</script>

<template>
  <div class="settings">
    <label>Search with
      <select :value="config.engine" @change="update({ engine: text($event) as EngineId })">
        <option v-for="engine in ENGINES" :key="engine.id" :value="engine.id">{{ engine.name }}</option>
        <option value="custom">Another site…</option>
      </select>
    </label>
    <label v-if="config.engine === 'custom'" class="stack">Search address
      <input type="text" :value="config.customUrl" placeholder="https://example.com/search?q=%s" inputmode="url" @change="update({ customUrl: text($event) })" />
      <small>Use %s where the search words go.</small>
    </label>
    <label class="stack">Placeholder text
      <input type="text" :value="config.placeholder" maxlength="60" placeholder="Search…" @change="update({ placeholder: text($event) })" />
    </label>
    <label class="check">
      <input type="checkbox" :checked="config.newTab" @change="update({ newTab: ($event.target as HTMLInputElement).checked })" />
      Open results in a new tab
    </label>
    <label class="check">
      <input type="checkbox" :checked="config.autofocus" @change="update({ autofocus: ($event.target as HTMLInputElement).checked })" />
      Start typing as soon as the page opens
    </label>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 0.6rem; }
label { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.stack { flex-direction: column; align-items: stretch; gap: 0.25rem; }
.check { gap: 0.4rem; flex-wrap: nowrap; }
input[type='text'], select { font: inherit; min-width: 0; padding: 0.3rem 0.5rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
small { color: var(--text-muted); }
</style>
