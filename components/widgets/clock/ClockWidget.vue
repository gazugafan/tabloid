<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import SegmentTime from './SegmentTime.vue';
import { CLOCK_FONTS, handAngles, readClockConfig } from './config';
import { DIGIT_HEIGHT, displayText, layoutTime } from './segments';

const props = defineProps<{ config: Record<string, unknown> }>();
const settings = computed(() => readClockConfig(props.config));

const now = ref(new Date());
const timer = setInterval(() => (now.value = new Date()), 1000);
onBeforeUnmount(() => clearInterval(timer));

const time = computed(() =>
  now.value.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: settings.value.showSeconds ? '2-digit' : undefined,
    hour12: settings.value.hour12,
  }),
);
const date = computed(() => now.value.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));

const font = computed(() => CLOCK_FONTS.find((f) => f.id === settings.value.font) ?? CLOCK_FONTS[0]);
const vars = computed(() => ({
  '--chars': String(Math.max(4, time.value.length)),
  '--lcd-ratio': String(lcdRatio.value),
  '--scale': String(settings.value.size / 100),
  '--clock-font': font.value.family,
  '--clock-weight': String(font.value.weight),
  '--room': settings.value.showDate ? '58cqh' : '78cqh',
}));

/** Width over height of the segment display, so it can be fitted to the widget the same way as text. */
const lcdRatio = computed(() => {
  const { text } = displayText(now.value, settings.value.hour12, settings.value.showSeconds);
  return (layoutTime(text).width + (settings.value.hour12 ? 9 : 0) + 6) / (DIGIT_HEIGHT + 2);
});
const angles = computed(() => handAngles(now.value));
const ticks = Array.from({ length: 60 }, (_, i) => i);
const numerals = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  const a = (n * 30 * Math.PI) / 180;
  return { n, x: Math.sin(a) * 36, y: -Math.cos(a) * 36 };
});
const label = computed(() => `${time.value}, ${date.value}`);
</script>

<template>
  <div class="clock" :style="vars" role="img" :aria-label="label">
    <SegmentTime v-if="settings.style === 'digital' && settings.font === 'lcd'" class="lcd" :now="now" :hour12="settings.hour12" :seconds="settings.showSeconds" />
    <div v-else-if="settings.style === 'digital'" class="clock-time">{{ time }}</div>
    <div v-else class="face">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        <circle class="rim" r="48" />
        <line v-for="t in ticks" :key="t" class="tick" :class="{ major: t % 5 === 0 }" :y1="t % 5 === 0 ? -42 : -45" y2="-47" :transform="`rotate(${t * 6})`" />
        <template v-if="settings.numbers">
          <text v-for="n in numerals" :key="n.n" class="numeral" :x="n.x" :y="n.y" text-anchor="middle" dominant-baseline="central">{{ n.n }}</text>
        </template>
        <line class="hand hour" y1="4" y2="-24" :transform="`rotate(${angles.hour})`" />
        <line class="hand minute" y1="5" y2="-36" :transform="`rotate(${angles.minute})`" />
        <line v-if="settings.showSeconds" class="hand second" y1="8" y2="-40" :transform="`rotate(${angles.second})`" />
        <circle class="pivot" r="2.2" />
      </svg>
    </div>
    <div v-if="settings.showDate" class="clock-date">{{ date }}</div>
  </div>
</template>

<style scoped>
/* The widget's own size is the unit: everything is measured in container units, so it scales as the widget is resized. */
.clock { container-type: size; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2cqh; }
.clock-time {
  --fit: min(calc(150cqw / var(--chars)), var(--room));
  font-family: var(--clock-font); font-weight: var(--clock-weight); font-size: calc(var(--fit) * var(--scale));
  font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap;
}
.lcd {
  /* As wide as fits, but never taller than the room there is. */
  width: min(calc(100cqw * var(--scale)), calc(var(--room) * var(--lcd-ratio) * var(--scale))); height: auto; color: var(--text);
}
.clock-date { color: var(--text-muted); font-size: clamp(0.7rem, min(5.5cqw, 9cqh), 2rem); text-align: center; line-height: 1.2; }
.face { flex: 1 1 0; min-height: 0; width: 100%; display: grid; place-items: center; }
.face svg { width: calc(var(--scale) * 100%); height: calc(var(--scale) * 100%); }
.rim { fill: none; stroke: var(--text-muted); stroke-width: 1; }
.tick { stroke: var(--text-muted); stroke-width: 0.6; }
.tick.major { stroke: var(--text); stroke-width: 1.2; }
.numeral { fill: var(--text); font-family: var(--clock-font); font-weight: var(--clock-weight); font-size: 7px; }
.hand { stroke: var(--text); stroke-linecap: round; }
.hour { stroke-width: 2.6; }
.minute { stroke-width: 1.8; }
.second { stroke: var(--accent); stroke-width: 0.8; }
.pivot { fill: var(--accent); }
</style>
