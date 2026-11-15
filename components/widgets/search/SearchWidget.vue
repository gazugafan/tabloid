<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import { engineName, sanitizeSearchConfig, searchUrl } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const config = computed(() => sanitizeSearchConfig(props.config));

const query = ref('');
const input = ref<HTMLInputElement | null>(null);
const label = computed(() => config.value.placeholder || `Search ${engineName(config.value)}`);

onMounted(() => config.value.autofocus && input.value?.focus());

function submit() {
  const url = searchUrl(config.value, query.value);
  if (!url) return;
  if (config.value.newTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.assign(url);
}
</script>

<template>
  <div class="wrap">
  <form class="search" role="search" @submit.prevent="submit">
    <input ref="input" v-model="query" type="search" :placeholder="label" :aria-label="label" autocomplete="off" enterkeyhint="search" />
  </form>
  <p v-if="config.engine === 'custom' && !searchUrl(config, 'x')" class="problem" role="alert">Set a valid search address in this widget's settings.</p>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; justify-content: center; height: 100%; }
.search { display: flex; align-items: center; }
input {
  width: 100%; font: inherit; font-size: 1.1em; padding: 0.55rem 1rem; color: var(--text); background: color-mix(in srgb, var(--bg) calc(var(--surface-opacity, 1) * 100%), transparent); backdrop-filter: blur(var(--surface-blur, 0px));
  border: 1px solid var(--border); border-radius: calc(var(--radius) * 2); outline: none;
}
input:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.problem { margin: 0; color: var(--danger); font-size: 0.85em; }
</style>
