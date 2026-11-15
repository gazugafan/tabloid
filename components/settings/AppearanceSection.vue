<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Collapse from '../ui/Collapse.vue';
import { APPEARANCE_KEY } from '../../composables/useAppearance';
import { notifyError } from '../../composables/useNotify';
import {
  applyAppearance,
  cleanFontName,
  DEFAULT_APPEARANCE,
  FONT_PRESETS,
  FONT_SCALE_RANGE,
  RADIUS_RANGE,
  SURFACE_BLUR_RANGE,
  SURFACE_OPACITY_RANGE,
  sanitizeAppearance,
  themeDefaultColors,
  type Appearance,
} from '../../utils/appearance';
import { effectiveBackground, seedSharedBackground, uploadsVersion } from '../../composables/useSharedBackground';
import { useBackgroundPreview } from '../../composables/useBackgroundPreview';
import { readActiveDashboardId } from '../../utils/storage/activeDashboard';
import { loadState, savePreference } from '../../utils/sync/preferences';

const appearance = ref<Appearance>({ ...DEFAULT_APPEARANCE });
const ready = ref(false);
/** The background of the dashboard this device shows, so the sample widget sits on the real picture. */
const activeDashboard = ref<string>();
const background = computed(() => effectiveBackground(activeDashboard.value));
const preview = useBackgroundPreview(background, activeDashboard, uploadsVersion);
/** The photo with the background's blur and darkness, as it appears behind the widgets. */
const pictureStyle = computed(() => {
  if (!preview.url.value) return undefined;
  const { blur, dim } = background.value ?? { blur: 0, dim: 0 };
  return { backgroundImage: `url("${preview.url.value}")`, filter: `blur(${blur / 4}px) brightness(${1 - dim / 100})` };
});
/** What the theme itself uses for each color, shown in the pickers while no override is set. */
const themeColors = ref(themeDefaultColors());
const refreshThemeColors = () => (themeColors.value = themeDefaultColors());
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

onMounted(async () => {
  try {
    const state = await loadState();
    appearance.value = sanitizeAppearance(state.preferences[APPEARANCE_KEY]);
    activeDashboard.value = await readActiveDashboardId(state);
    seedSharedBackground(state);
  } catch (error) {
    notifyError(error instanceof Error ? error.message : String(error));
  }
  ready.value = true;
  refreshThemeColors();
  systemDark.addEventListener('change', refreshThemeColors);
});
onBeforeUnmount(() => systemDark.removeEventListener('change', refreshThemeColors));

let saveTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  appearance,
  (value) => {
    if (!ready.value) return;
    const clean = sanitizeAppearance(value);
    applyAppearance(clean);
    refreshThemeColors();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      savePreference(APPEARANCE_KEY, clean).catch((error) => notifyError(error instanceof Error ? error.message : String(error)));
    }, 400);
  },
  { deep: true },
);

type ColorKey = 'accent' | 'background' | 'surface';
const colorLabels: Record<ColorKey, string> = { accent: 'Accent color', background: 'Page background', surface: 'Widget background' };

function setColor(key: ColorKey, event: Event) {
  appearance.value[key] = (event.target as HTMLInputElement).value;
}

function reset() {
  appearance.value = { ...DEFAULT_APPEARANCE };
}
</script>

<template>
  <fieldset id="appearance" class="appearance-section" :disabled="!ready">
    <legend>Appearance</legend>

    <div class="sample" aria-hidden="true">
      <div class="picture" :style="pictureStyle"></div>
      <div class="card"><strong>Sample widget</strong><span>This is how your widgets will look.</span></div>
    </div>

    <h3>Colors</h3>
    <label class="row">Theme
      <select v-model="appearance.mode">
        <option value="system">Match my system</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>

    <div v-for="(label, key) in colorLabels" :key="key" class="row">
      <label :for="`color-${key}`">{{ label }}</label>
      <input :id="`color-${key}`" type="color" :value="appearance[key] ?? themeColors[key]" @input="setColor(key, $event)" />
      <button v-if="appearance[key]" type="button" class="link" @click="appearance[key] = null">Use theme color</button>
      <small v-else>Theme default</small>
    </div>

    <h3>Widgets</h3>
    <label class="row">Widget opacity
      <input v-model.number="appearance.surfaceOpacity" type="range" :min="SURFACE_OPACITY_RANGE.min" :max="SURFACE_OPACITY_RANGE.max" />
      <output>{{ appearance.surfaceOpacity }}%</output>
    </label>

    <Collapse gap="0.75rem">
      <label v-if="appearance.surfaceOpacity < 100" class="row">Widget background blur
        <input v-model.number="appearance.surfaceBlur" type="range" :min="SURFACE_BLUR_RANGE.min" :max="SURFACE_BLUR_RANGE.max" />
        <output>{{ appearance.surfaceBlur }}px</output>
      </label>
    </Collapse>

    <label class="row">Corner roundness
      <input v-model.number="appearance.radius" type="range" :min="RADIUS_RANGE.min" :max="RADIUS_RANGE.max" />
      <output>{{ appearance.radius }}px</output>
    </label>

    <h3>Text</h3>
    <label class="row">Text size
      <input v-model.number="appearance.fontScale" type="range" :min="FONT_SCALE_RANGE.min" :max="FONT_SCALE_RANGE.max" :step="FONT_SCALE_RANGE.step" />
      <output>{{ appearance.fontScale }}%</output>
    </label>

    <label class="row">Font
      <select v-model="appearance.font">
        <option v-for="(preset, id) in FONT_PRESETS" :key="id" :value="id">{{ preset.label }}</option>
        <option value="custom">A font installed on my computer…</option>
      </select>
    </label>
    <Collapse gap="0.75rem">
      <label v-if="appearance.font === 'custom'" class="row">Font name
        <input
          :value="appearance.customFont"
          type="text"
          placeholder="e.g. Inter"
          autocomplete="off"
          @input="appearance.customFont = cleanFontName(($event.target as HTMLInputElement).value)"
        />
      </label>
    </Collapse>

    <p class="settings-hint">Fonts come from your device, so nothing is downloaded. These choices sync with your layout.</p>
    <button type="button" class="reset" @click="reset">Reset to defaults</button>
  </fieldset>
</template>

<style scoped>
.appearance-section { display: flex; flex-direction: column; gap: 0.75rem; }
.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.appearance-section .row > :first-child { min-width: 9rem; }
@media (max-width: 480px) { .appearance-section .row > :first-child { min-width: 0; } }
select, input[type='text'] { font: inherit; padding: 0.35rem 0.6rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
button:not(.link) { font: inherit; padding: 0.35rem 0.8rem; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
button.link { font: inherit; font-size: 0.85em; padding: 0; cursor: pointer; color: var(--accent); background: none; border: none; text-decoration: underline; }
small, button.link { font-size: 0.85em; line-height: 1.5; }
.reset { align-self: flex-start; }
.sample { position: relative; overflow: hidden; padding: 1.25rem; border-radius: var(--radius); background: linear-gradient(135deg, #5b86e5, #36d1dc 55%, #f6d365); }
.picture { position: absolute; inset: -12px; background: center / cover; }
.sample .card { position: relative; display: flex; flex-direction: column; gap: 0.2rem; max-width: 16rem; padding: 0.75rem 1rem; color: var(--text); background: color-mix(in srgb, var(--surface) calc(var(--surface-opacity, 1) * 100%), transparent); backdrop-filter: blur(var(--surface-blur, 0px)); border: 1px solid var(--border); border-radius: var(--radius); }
.sample span { color: var(--text-muted); font-size: 0.9em; }
small { color: var(--text-muted); }
</style>
