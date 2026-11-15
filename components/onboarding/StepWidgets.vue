<script setup lang="ts">
import PlacePicker from '../widgets/weather/PlacePicker.vue';
import type { WeatherPlace } from '../widgets/weather/config';
import { QUICK_SITES, WIDGET_OPTIONS, type OnboardingChoices, type StarterWidget } from '../../utils/onboarding/choices';
import ChoiceCard from './ChoiceCard.vue';

const choices = defineModel<OnboardingChoices>({ required: true });

const has = (id: StarterWidget) => choices.value.widgets.includes(id);
function toggle(id: StarterWidget, on: boolean) {
  const rest = choices.value.widgets.filter((w) => w !== id);
  choices.value = { ...choices.value, widgets: on ? [...rest, id] : rest };
}
function toggleSite(id: string, on: boolean) {
  const rest = choices.value.sites.filter((s) => s !== id);
  choices.value = { ...choices.value, sites: on ? [...rest, id] : rest };
}
const pickPlace = (place: WeatherPlace) => (choices.value = { ...choices.value, place });
</script>

<template>
  <div class="step">
    <p class="lead">Widgets are the little boxes on your page. Choose the ones you'd like to start with. You can add, move or remove them whenever you want.</p>
    <div class="grid">
      <div v-for="w in WIDGET_OPTIONS" :key="w.id" class="option" :class="{ wide: has(w.id) && (w.id === 'weather' || w.id === 'bookmarks') }">
        <ChoiceCard type="checkbox" :checked="has(w.id)" :emoji="w.emoji" :title="w.name" :about="w.about" @change="toggle(w.id, $event)" />

        <div v-if="w.id === 'weather' && has('weather')" class="extra">
          <p v-if="choices.place" class="picked">📍 <strong>{{ choices.place.name }}</strong><span v-if="choices.place.detail">, {{ choices.place.detail }}</span></p>
          <p v-else class="hint">Which city should it show?</p>
          <PlacePicker @pick="pickPlace" />
        </div>

        <div v-if="w.id === 'bookmarks' && has('bookmarks')" class="extra">
          <p class="hint">Which of these would you like?</p>
          <div class="chips">
            <label v-for="s in QUICK_SITES" :key="s.id" class="chip" :class="{ on: choices.sites.includes(s.id) }">
              <input type="checkbox" :checked="choices.sites.includes(s.id)" @change="toggleSite(s.id, ($event.target as HTMLInputElement).checked)" />
              {{ s.title }}
            </label>
          </div>
          <p class="hint">You can add your own later.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step { display: flex; flex-direction: column; gap: 1rem; }
.lead { margin: 0; color: var(--text-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.6rem; align-items: start; }
.option { display: flex; flex-direction: column; gap: 0.5rem; }
.option.wide { grid-column: 1 / -1; }
.extra { padding: 0.75rem 1rem; background: var(--surface-raised); border-radius: var(--radius); display: flex; flex-direction: column; gap: 0.5rem; }
.hint { margin: 0; color: var(--text-muted); font-size: 0.95em; }
.picked { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip { position: relative; padding: 0.35rem 0.8rem; cursor: pointer; border: 2px solid var(--border); border-radius: 999px; background: var(--bg); }
.chip.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--bg)); }
.chip input { position: absolute; opacity: 0; pointer-events: none; }
.chip:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
