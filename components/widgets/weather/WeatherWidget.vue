<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import type { WidgetAction } from '../registry';
import { notifyError } from '../../../composables/useNotify';
import { fetchWeather, OPEN_METEO_URL, WEATHER_TTL_MS, weatherCache, type WeatherData } from './api';
import { describeWeather } from './codes';
import PlacePicker from './PlacePicker.vue';
import { resolveUnits, sanitizeWeatherConfig, type WeatherPlace } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{
  'update:config': [config: WidgetConfig];
  'update:loading': [loading: boolean];
  'update:actions': [actions: WidgetAction[]];
}>();

const config = computed(() => sanitizeWeatherConfig(props.config));
const units = computed(() => resolveUnits(config.value.units));
const cache = weatherCache();

const data = ref<WeatherData>();
const loading = ref(false);
const failed = ref(false);
watch(loading, (value) => emit('update:loading', value));

let run = 0;
async function load(force = false) {
  const place = config.value.place;
  const system = units.value;
  const mine = ++run;
  data.value = undefined;
  failed.value = false;
  if (!place) return;
  const cached = await cache.get(place, system);
  if (mine !== run) return;
  data.value = cached;
  if (!force && cached && Date.now() - cached.fetchedAt < WEATHER_TTL_MS) return;
  loading.value = true;
  try {
    const fresh = await fetchWeather(place, system);
    if (mine !== run) return;
    data.value = fresh;
    await cache.put(place, fresh);
  } catch (error) {
    if (mine !== run) return;
    failed.value = true;
    // The cached forecast stays on screen; only say so loudly when the user asked for a refresh.
    if (force) notifyError(error instanceof Error ? error.message : String(error));
  } finally {
    if (mine === run) loading.value = false;
  }
}

watch(() => [config.value.place?.latitude, config.value.place?.longitude, units.value], () => void load(), { immediate: true });
const timer = setInterval(() => void load(), WEATHER_TTL_MS);
onBeforeUnmount(() => clearInterval(timer));

watchEffect(() =>
  emit('update:actions', [
    { id: 'refresh', label: 'Refresh weather', icon: 'refresh', disabled: !config.value.place || loading.value, busy: loading.value, run: () => void load(true) },
  ]),
);

function choose(place: WeatherPlace) {
  emit('update:config', { ...config.value, place });
}

const degrees = (value: number) => `${Math.round(value)}°`;
const speedUnit = computed(() => (units.value === 'imperial' ? 'mph' : 'km/h'));
const now = computed(() => (data.value ? describeWeather(data.value.current.code, data.value.current.isDay) : undefined));
const forecast = computed(() => (data.value?.days ?? []).slice(1, 1 + config.value.forecastDays));
const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
</script>

<template>
  <div class="weather">
    <div v-if="!config.place" class="setup">
      <p>Where do you want the weather for?</p>
      <PlacePicker @pick="choose" />
    </div>

    <template v-else>
      <div v-if="data && now" class="now">
        <span class="icon" role="img" :aria-label="now.label">{{ now.icon }}</span>
        <div class="main">
          <span class="temp">{{ degrees(data.current.temperature) }}</span>
          <span class="place">{{ config.place.name }}</span>
        </div>
        <div class="details">
          <span>{{ now.label }}</span>
          <span>Feels like {{ degrees(data.current.feelsLike) }}</span>
          <span>Wind {{ Math.round(data.current.wind) }} {{ speedUnit }} · Humidity {{ Math.round(data.current.humidity) }}%</span>
        </div>
      </div>
      <p v-else-if="loading" class="quiet">Loading weather…</p>
      <p v-else-if="failed" class="quiet" role="alert">Couldn't load the weather for {{ config.place.name }}.</p>

      <ul v-if="forecast.length" class="forecast">
        <li v-for="day in forecast" :key="day.date">
          <span class="day">{{ weekday(day.date) }}</span>
          <span role="img" :aria-label="describeWeather(day.code).label">{{ describeWeather(day.code).icon }}</span>
          <span class="range"><strong>{{ degrees(day.high) }}</strong> {{ degrees(day.low) }}</span>
          <span v-if="day.rainChance !== null && day.rainChance >= 20" class="rain">{{ day.rainChance }}%</span>
        </li>
      </ul>

      <p class="credit"><a :href="OPEN_METEO_URL" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo</a></p>
    </template>
  </div>
</template>

<style scoped>
.weather { display: flex; flex-direction: column; gap: 0.75rem; height: 100%; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.setup { display: flex; flex-direction: column; gap: 0.6rem; }
.setup > p { margin: 0; font-weight: 600; }
.now { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem 1rem; }
.icon { font-size: 3rem; line-height: 1; }
.main { display: flex; flex-direction: column; }
.temp { font-size: 2.6rem; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
.place { color: var(--text-muted); }
.details { display: flex; flex-direction: column; color: var(--text-muted); font-size: 0.9em; }
.quiet { margin: 0; color: var(--text-muted); }
.forecast { display: grid; grid-template-columns: repeat(auto-fit, minmax(4.5rem, 1fr)); gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.forecast li { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; padding: 0.4rem 0.2rem; background: color-mix(in srgb, var(--surface-raised) calc(var(--surface-opacity, 1) * 100%), transparent); backdrop-filter: blur(var(--surface-blur, 0px)); border-radius: calc(var(--radius) / 1.5); }
.day { color: var(--text-muted); font-size: 0.9em; }
.range { font-variant-numeric: tabular-nums; color: var(--text-muted); }
.range strong { color: var(--text); font-weight: 600; }
.rain { font-size: 0.8em; color: var(--accent); }
.credit { margin: auto 0 0; font-size: 0.8em; }
.credit a { color: var(--text-muted); }
.credit a:hover { color: var(--text); }
</style>
