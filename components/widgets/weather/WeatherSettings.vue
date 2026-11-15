<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import PlacePicker from './PlacePicker.vue';
import { FORECAST_DAYS, sanitizeWeatherConfig, type WeatherConfig, type WeatherPlace, type WeatherUnits } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:config': [config: WidgetConfig] }>();

const config = computed(() => sanitizeWeatherConfig(props.config));
const update = (patch: Partial<WeatherConfig>) => emit('update:config', { ...config.value, ...patch });
const pick = (place: WeatherPlace) => update({ place });
</script>

<template>
  <div class="settings">
    <section>
      <h3>Place</h3>
      <p v-if="config.place" class="current">{{ config.place.name }}<small v-if="config.place.detail">, {{ config.place.detail }}</small></p>
      <PlacePicker @pick="pick" />
    </section>
    <label>Units
      <select :value="config.units" @change="update({ units: ($event.target as HTMLSelectElement).value as WeatherUnits })">
        <option value="auto">Automatic</option>
        <option value="metric">°C, km/h</option>
        <option value="imperial">°F, mph</option>
      </select>
    </label>
    <label>Forecast days
      <input type="range" :min="FORECAST_DAYS.min" :max="FORECAST_DAYS.max" :value="config.forecastDays" @input="update({ forecastDays: Number(($event.target as HTMLInputElement).value) })" />
      <output>{{ config.forecastDays || 'None' }}</output>
    </label>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 0.8rem; }
h3 { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.current { margin: 0 0 0.5rem; font-weight: 600; }
small { color: var(--text-muted); font-weight: 400; }
label { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
select { font: inherit; padding: 0.3rem 0.5rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
</style>
