<script setup lang="ts">
import { computed } from 'vue';
import { CLOCK_FONTS, CLOCK_STYLES, SIZE_RANGE, readClockConfig, type ClockConfig } from './config';

const props = defineProps<{ config: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:config': [config: Record<string, unknown>] }>();

const current = computed(() => readClockConfig(props.config));
function set(patch: Partial<ClockConfig>) {
  emit('update:config', { ...props.config, ...patch });
}
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
</script>

<template>
  <div class="settings">
    <label class="field">Style
      <select :value="current.style" @change="set({ style: ($event.target as HTMLSelectElement).value as ClockConfig['style'] })">
        <option v-for="s in CLOCK_STYLES" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>
    </label>
    <label v-if="current.style === 'digital'" class="field">Font
      <select :value="current.font" @change="set({ font: ($event.target as HTMLSelectElement).value as ClockConfig['font'] })">
        <option v-for="f in CLOCK_FONTS" :key="f.id" :value="f.id">{{ f.label }}</option>
      </select>
    </label>
    <label v-if="current.style === 'digital'"><input type="checkbox" :checked="current.hour12" @change="set({ hour12: checked($event) })" /> 12-hour clock</label>
    <label v-else><input type="checkbox" :checked="current.numbers" @change="set({ numbers: checked($event) })" /> Show numbers</label>
    <label><input type="checkbox" :checked="current.showSeconds" @change="set({ showSeconds: checked($event) })" /> Show seconds</label>
    <label><input type="checkbox" :checked="current.showDate" @change="set({ showDate: checked($event) })" /> Show the date</label>
    <label class="field">Size
      <input type="range" :min="SIZE_RANGE.min" :max="SIZE_RANGE.max" :step="SIZE_RANGE.step" :value="current.size" @input="set({ size: Number(($event.target as HTMLInputElement).value) })" />
      <output>{{ current.size }}%</output>
      <small>The clock always grows and shrinks with its widget; this makes it smaller still.</small>
    </label>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 0.6rem; }
label { display: flex; gap: 0.5rem; align-items: center; }
.field { flex-wrap: wrap; }
.field select { margin-left: auto; }
small { flex-basis: 100%; color: var(--text-muted); }
</style>
