<script setup lang="ts">
import { ACCENT_CHOICES, type BackgroundChoice, type OnboardingChoices } from '../../utils/onboarding/choices';
import type { ThemeMode } from '../../utils/appearance';
import ChoiceCard from './ChoiceCard.vue';

const choices = defineModel<OnboardingChoices>({ required: true });

const modes: Array<{ value: ThemeMode; emoji: string; title: string; about: string }> = [
  { value: 'light', emoji: '☀️', title: 'Light', about: 'Bright and clean' },
  { value: 'dark', emoji: '🌙', title: 'Dark', about: 'Easy on the eyes' },
  { value: 'system', emoji: '🖥️', title: 'Match my computer', about: 'Switches with your system' },
];
const backgrounds: Array<{ value: BackgroundChoice; emoji: string; title: string; about: string }> = [
  { value: 'bing', emoji: '🏞️', title: 'A beautiful photo every day', about: 'From Bing’s daily collection' },
  { value: 'wikimedia', emoji: '🌄', title: 'Picture of the day', about: 'A featured image from Wikimedia' },
  { value: 'plain', emoji: '⬜', title: 'Just a plain color', about: 'Simple and calm' },
];

const set = (patch: Partial<OnboardingChoices>) => (choices.value = { ...choices.value, ...patch });
</script>

<template>
  <div class="step">
    <p class="lead">Your page changes as you choose, so go ahead and try things out.</p>

    <fieldset>
      <legend>Light or dark?</legend>
      <div class="grid three">
        <ChoiceCard v-for="m in modes" :key="m.value" type="radio" name="mode" :checked="choices.mode === m.value" :emoji="m.emoji" :title="m.title" :about="m.about" @change="set({ mode: m.value })" />
      </div>
    </fieldset>

    <fieldset>
      <legend>Pick a favorite color</legend>
      <div class="swatches" role="radiogroup" aria-label="Accent color">
        <label class="swatch plain" :class="{ on: choices.accent === null }" title="Use the standard color">
          <input type="radio" name="accent" :checked="choices.accent === null" @change="set({ accent: null })" />
          <span>Standard</span>
        </label>
        <label v-for="c in ACCENT_CHOICES" :key="c.color" class="swatch" :class="{ on: choices.accent === c.color }" :title="c.name">
          <input type="radio" name="accent" :checked="choices.accent === c.color" :aria-label="c.name" @change="set({ accent: c.color })" />
          <i :style="{ background: c.color }" />
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>What goes behind your widgets?</legend>
      <div class="grid">
        <ChoiceCard v-for="b in backgrounds" :key="b.value" type="radio" name="background" :checked="choices.background === b.value" :emoji="b.emoji" :title="b.title" :about="b.about" @change="set({ background: b.value })" />
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.step { display: flex; flex-direction: column; gap: 1.2rem; }
.lead { margin: 0; color: var(--text-muted); }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
legend { padding: 0; margin-bottom: 0.5rem; font-weight: 700; font-size: 1.05em; }
.grid { display: grid; gap: 0.6rem; }
.three { grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
.swatches { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
.swatch { position: relative; display: grid; place-items: center; cursor: pointer; border-radius: 999px; }
.swatch input { position: absolute; opacity: 0; pointer-events: none; }
.swatch i { width: 2.4rem; height: 2.4rem; border-radius: 50%; border: 3px solid transparent; box-shadow: 0 0 0 2px var(--border); transition: transform 0.15s; }
.swatch:hover i { transform: scale(1.08); }
.swatch.on i { box-shadow: 0 0 0 3px var(--text); }
.swatch:focus-within { outline: 2px solid var(--accent); outline-offset: 3px; }
.swatch.plain span { padding: 0.5rem 0.9rem; border-radius: 999px; border: 2px solid var(--border); background: var(--surface-raised); }
.swatch.plain.on span { border-color: var(--text); }
@media (prefers-reduced-motion: reduce) { .swatch i { transition: none; } .swatch:hover i { transform: none; } }
</style>
