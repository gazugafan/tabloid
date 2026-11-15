<script setup lang="ts">
import { ref } from 'vue';
import { searchPlaces } from './api';
import type { WeatherPlace } from './config';

const emit = defineEmits<{ pick: [place: WeatherPlace] }>();

const query = ref('');
const results = ref<WeatherPlace[]>([]);
const status = ref<'idle' | 'searching' | 'none' | 'error'>('idle');

async function search() {
  status.value = 'searching';
  try {
    results.value = await searchPlaces(query.value);
    status.value = results.value.length ? 'idle' : 'none';
  } catch {
    results.value = [];
    status.value = 'error';
  }
}

function pick(place: WeatherPlace) {
  results.value = [];
  query.value = '';
  emit('pick', place);
}
</script>

<template>
  <div class="picker">
    <form @submit.prevent="search">
      <input v-model="query" type="search" placeholder="Search for a city…" aria-label="Search for a city" autocomplete="off" />
      <button type="submit" :disabled="query.trim().length < 2 || status === 'searching'">Search</button>
    </form>
    <p v-if="status === 'searching'" class="note">Searching…</p>
    <p v-else-if="status === 'none'" class="note">No places found.</p>
    <p v-else-if="status === 'error'" class="note" role="alert">Couldn't reach the weather service. Check your connection and try again.</p>
    <ul v-if="results.length">
      <li v-for="place in results" :key="`${place.latitude},${place.longitude}`">
        <button type="button" @click="pick(place)">{{ place.name }}<small v-if="place.detail">, {{ place.detail }}</small></button>
      </li>
    </ul>
    <p class="privacy">
      Weather comes from <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>, a third-party service.
      Searching sends it the name you type, and the forecast sends it the coordinates of the place you choose.
    </p>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 0.5rem; }
form { display: flex; gap: 0.35rem; }
input { flex: 1; min-width: 0; font: inherit; padding: 0.35rem 0.6rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
button { font: inherit; font-size: 0.9em; padding: 0.3rem 0.7rem; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); cursor: pointer; }
button:hover:not(:disabled) { background: var(--border); }
button:disabled { opacity: 0.5; cursor: default; }
ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
li button { width: 100%; text-align: left; }
small { color: var(--text-muted); }
.note { margin: 0; color: var(--text-muted); }
.privacy { margin: 0; color: var(--text-muted); font-size: 0.85em; }
.privacy a { color: var(--accent); }
</style>
