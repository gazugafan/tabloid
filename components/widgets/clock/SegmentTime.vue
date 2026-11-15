<script setup lang="ts">
import { computed } from 'vue';
import { COLON_WIDTH, DIGIT_HEIGHT, SEGMENT_SHAPES, displayText, layoutTime, segmentsFor } from './segments';

const props = defineProps<{ now: Date; hour12: boolean; seconds: boolean }>();

const shown = computed(() => displayText(props.now, props.hour12, props.seconds));
const layout = computed(() => layoutTime(shown.value.text));
const NAMES = Object.keys(SEGMENT_SHAPES);
const LABEL_WIDTH = 7;
const pad = 3; // Room for the slant.
const width = computed(() => layout.value.width + (props.hour12 ? LABEL_WIDTH + 2 : 0) + pad * 2);
</script>

<template>
  <svg class="segments" :viewBox="`${-pad} -1 ${width} ${DIGIT_HEIGHT + 2}`" aria-hidden="true">
    <g transform="skewX(-6)" :style="{ transformOrigin: `0 ${DIGIT_HEIGHT / 2}px` }">
      <g v-for="(cell, i) in layout.cells" :key="i" :transform="`translate(${cell.x} 0)`">
        <template v-if="cell.kind === 'digit'">
          <polygon v-for="name in NAMES" :key="name" :points="SEGMENT_SHAPES[name]" class="seg" :class="{ lit: segmentsFor(cell.char).includes(name) }" />
        </template>
        <template v-else>
          <rect :x="COLON_WIDTH / 2 - 1" y="4.2" width="1.9" height="1.9" class="seg lit" />
          <rect :x="COLON_WIDTH / 2 - 1" y="11.9" width="1.9" height="1.9" class="seg lit" />
        </template>
      </g>
      <g v-if="hour12" :transform="`translate(${layout.width + 2} 0)`" class="meridiem">
        <text x="0" y="6.5" class="label" :class="{ lit: !shown.pm }">AM</text>
        <text x="0" y="16" class="label" :class="{ lit: shown.pm }">PM</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.segments { display: block; overflow: visible; }
/* Unlit segments stay faintly visible, like a real LCD. */
.seg { fill: currentColor; opacity: 0.09; }
.seg.lit { opacity: 1; }
.label { fill: currentColor; opacity: 0.09; font: 700 4.6px var(--font); }
.label.lit { opacity: 1; }
</style>
