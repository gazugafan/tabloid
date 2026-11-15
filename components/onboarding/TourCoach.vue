<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const emit = defineEmits<{ close: [] }>();

interface TourStep {
  selector: string;
  /** Selectors to try first, in order (e.g. a widget with a card before one without). */
  prefer?: string[];
  /** Show the target's hover-only buttons while this step is up. */
  reveal?: boolean;
  title: string;
  text: string;
}

const ALL_STEPS: TourStep[] = [
  { selector: '[data-tour="add"]', title: 'Add widgets', text: 'Press the + button to add a clock, weather, notes, news headlines and more. Add as many as you like.' },
  { selector: 'section.frame', prefer: ['section.frame:not(.transparent)'], reveal: true, title: 'Move things around', text: 'Hover over a widget to see its buttons. Drag the dotted handle to move it, drag its bottom corner to resize it, and use the sliders button for its settings, like which news you read.' },
  { selector: '[data-tour="tabs"]', title: 'Make more dashboards', text: 'Tabs let you keep separate dashboards, perhaps one for work and one for home. Use the + beside them to add one, and double-click a tab to rename it.' },
  { selector: '[data-tour="lock"]', title: 'Lock it when you like it', text: 'This button locks your layout so nothing moves by accident. You can still click and read everything.' },
  { selector: '[data-tour="settings"]', title: 'Settings live here', text: 'Change colors and backgrounds, keep your pages in sync between computers, or save a backup. You can also replay this welcome from there.' },
];

const steps = ref<TourStep[]>([]);
const index = ref(0);
const rect = ref<DOMRect | null>(null);
const cardPosition = ref({ top: 0, left: 0 });
const card = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);

const step = computed(() => steps.value[index.value]);
const last = computed(() => index.value === steps.value.length - 1);

function find(tourStep: TourStep): HTMLElement | null {
  for (const selector of [...(tourStep.prefer ?? []), tourStep.selector]) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}
const target = () => (step.value ? find(step.value) : null);

/** Marks the shown widget so its buttons and resize handle stay visible, as if hovered. */
const REVEAL = 'data-tour-reveal';
function reveal(el: HTMLElement | null) {
  document.querySelectorAll(`[${REVEAL}]`).forEach((other) => other.removeAttribute(REVEAL));
  if (step.value?.reveal) el?.setAttribute(REVEAL, '');
}

async function place() {
  const el = target();
  reveal(el);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  rect.value = el.getBoundingClientRect();
  await nextTick();
  const width = card.value?.offsetWidth ?? 320;
  const height = card.value?.offsetHeight ?? 180;
  const r = rect.value;
  const below = r.bottom + 14 + height <= window.innerHeight;
  const top = below ? r.bottom + 14 : Math.max(12, r.top - 14 - height);
  const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
  cardPosition.value = { top, left };
}

async function show(to: number) {
  index.value = to;
  await place();
  heading.value?.focus();
}

function next() {
  if (last.value) emit('close');
  else void show(index.value + 1);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'ArrowRight') next();
  else if (event.key === 'ArrowLeft' && index.value > 0) void show(index.value - 1);
}

const refresh = () => void place();
onMounted(() => {
  // Skip stops whose target isn't on the page (for example, no widgets yet).
  steps.value = ALL_STEPS.filter((s) => find(s));
  if (steps.value.length === 0) return emit('close');
  window.addEventListener('resize', refresh);
  void show(0);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', refresh);
  document.querySelectorAll(`[${REVEAL}]`).forEach((el) => el.removeAttribute(REVEAL));
});
</script>

<template>
  <div v-if="step" class="tour" @keydown="onKeydown">
    <div v-if="rect" class="spot" :style="{ top: `${rect.top - 6}px`, left: `${rect.left - 6}px`, width: `${rect.width + 12}px`, height: `${rect.height + 12}px` }" />
    <section ref="card" class="card" role="dialog" aria-label="Quick tour" :style="{ top: `${cardPosition.top}px`, left: `${cardPosition.left}px` }">
      <p class="count">{{ index + 1 }} of {{ steps.length }}</p>
      <h3 ref="heading" tabindex="-1">{{ step.title }}</h3>
      <p>{{ step.text }}</p>
      <div class="buttons">
        <button type="button" class="link" @click="emit('close')">{{ last ? '' : 'Skip tour' }}</button>
        <button v-if="index > 0" type="button" class="ghost" @click="show(index - 1)">Back</button>
        <button type="button" class="primary" @click="next">{{ last ? 'Done' : 'Next' }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 60; }
.spot { position: fixed; border-radius: 12px; pointer-events: none; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55), 0 0 0 3px var(--accent); transition: all 0.25s ease; }
.card {
  position: fixed; width: min(20rem, calc(100vw - 24px)); padding: 1rem 1.1rem; color: var(--text); background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4); font-size: 1rem;
}
.card p { margin: 0 0 0.6rem; line-height: 1.45; }
.card .count { margin: 0 0 0.2rem; color: var(--text-muted); font-size: 0.8em; }
h3 { margin: 0 0 0.4rem; font-size: 1.15em; outline: none; }
.buttons { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 0.8rem; }
.buttons .link { margin-right: auto; }
button { font: inherit; cursor: pointer; }
.primary { padding: 0.45rem 1rem; font-weight: 700; color: var(--on-accent); background: var(--accent); border: 0; border-radius: calc(var(--radius) / 1.5); }
.ghost { padding: 0.4rem 0.9rem; color: var(--text); background: none; border: 2px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.link { padding: 0; color: var(--text-muted); background: none; border: 0; text-decoration: underline; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .spot { transition: none; } }
</style>
