<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getWidgetDefinition, type WidgetAction } from '../widgets/registry';
import type { WidgetConfig, WidgetInstance } from '../../types/layout';
import type { Direction } from '../../utils/arrange';
import Icon from './Icon.vue';
import SettingsDialog from './SettingsDialog.vue';

const props = defineProps<{ widget: WidgetInstance; locked: boolean }>();
const emit = defineEmits<{
  'update:config': [config: WidgetConfig];
  'update:transparent': [transparent: boolean];
  remove: [];
  arrange: [kind: 'move' | 'resize', direction: Direction];
}>();

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
/** The move handle works from the keyboard too: arrow keys move the widget, Shift + arrow keys resize it. */
function onHandleKey(event: KeyboardEvent) {
  const direction = ARROWS[event.key];
  if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  emit('arrange', event.shiftKey ? 'resize' : 'move', direction);
}

const definition = getWidgetDefinition(props.widget.type);
const showSettings = ref(false);
/** Reported by the widget while it loads data; drives the rainbow border. */
const loading = ref(false);
/** Buttons the widget itself asked for (e.g. Refresh). */
const actions = ref<WidgetAction[]>([]);
/** Every widget has settings (at least the look), but a locked layout only offers them for widgets with their own. */
const hasSettingsButton = computed(() => !props.locked || !!definition?.settings);
/** On touch screens there is no hover: the widget's own buttons are always there, the rest appear after tapping it. */
const root = ref<HTMLElement | null>(null);
const tapped = ref(false);
const onPointerDown = (event: PointerEvent) => (tapped.value = !!root.value?.contains(event.target as Node));
onMounted(() => document.addEventListener('pointerdown', onPointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true));
const hasControls = computed(() => hasSettingsButton.value || actions.value.length > 0);
</script>

<template>
  <section ref="root" class="frame" :class="{ transparent: widget.transparent, editable: !locked, tapped }" :aria-label="definition?.name ?? 'Unknown widget'" :aria-busy="loading">
    <Transition name="loading-ring">
      <div v-if="loading" class="loading-ring" aria-hidden="true" />
    </Transition>
    <div v-if="hasControls" class="controls" :class="{ 'only-chrome': actions.length === 0 }">
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="action"
        :class="{ busy: action.busy }"
        :aria-label="action.label"
        :title="action.label"
        :disabled="action.disabled"
        @click="action.run()"
      >
        <Icon :name="action.icon" />
      </button>
      <span class="chrome">
      <!-- Not a <button>: the grid ignores drags that start on buttons. -->
      <span
        v-if="!locked"
        class="drag-handle"
        role="button"
        tabindex="0"
        title="Drag to move. Keyboard: arrow keys move, Shift + arrow keys resize."
        :aria-label="`Move or resize ${definition?.name ?? 'widget'}`"
        aria-roledescription="move handle"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
        @keydown="onHandleKey"
      ><Icon name="grip" /></span>
      <button v-if="hasSettingsButton" type="button" title="Widget settings" :aria-label="`${definition?.name ?? 'Widget'} settings`" aria-haspopup="dialog" @click="showSettings = true">
        <Icon name="settings" />
      </button>
      <button v-if="!locked" type="button" title="Remove Widget" :aria-label="`Remove ${definition?.name ?? 'widget'}`" @click="emit('remove')">
        <Icon name="close" />
      </button>
      </span>
    </div>
    <SettingsDialog v-if="showSettings && hasSettingsButton" :title="`${definition?.name ?? 'Widget'} settings`" @close="showSettings = false">
      <label class="general">
        <input type="checkbox" :checked="!!widget.transparent" @change="emit('update:transparent', ($event.target as HTMLInputElement).checked)" />
        Transparent background and border
      </label>
      <component :is="definition.settings" v-if="definition?.settings" :config="widget.config" @update:config="emit('update:config', $event)" />
    </SettingsDialog>
    <div class="body">
      <component
        :is="definition.component"
        v-if="definition"
        :config="widget.config"
        @update:config="emit('update:config', $event)"
        @update:loading="loading = $event"
        @update:actions="actions = $event"
      />
      <p v-else class="unknown">Unknown widget type “{{ widget.type }}”. Its data is kept.</p>
    </div>
  </section>
</template>

<style scoped>
.frame {
  position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden;
  padding: var(--widget-padding); background: color-mix(in srgb, var(--surface) calc(var(--surface-opacity, 1) * 100%), transparent); color: var(--text);
  backdrop-filter: blur(var(--surface-blur, 0px));
  border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow);
}
/* A rainbow ring that circles the widget's edge. The ring is a conic gradient whose angle is animated,
   cut down to a 2px border with a mask. It fades in and out with the loading state. */
@property --loading-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.loading-ring {
  position: absolute; inset: 0; z-index: 3; padding: 2px; border-radius: inherit; pointer-events: none;
  background: conic-gradient(from var(--loading-angle), #ff3b5c, #ff9d2e, #ffe14a, #4ade80, #38bdf8, #8b5cf6, #ff3b5c);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  animation: loading-spin 2.4s linear infinite;
}
@keyframes loading-spin { to { --loading-angle: 360deg; } }
.loading-ring-enter-active, .loading-ring-leave-active { transition: opacity 0.4s ease; }
.loading-ring-enter-from, .loading-ring-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .loading-ring { animation: none; } }
/* No card: the widget's content sits directly on the page (or the background image). */
/* A faint shadow in the page color keeps text readable over a busy background image. */
.frame.transparent {
  background: none; border-width:2px; border-color: transparent; box-shadow: none; backdrop-filter: none;
  text-shadow: 0 1px 2px color-mix(in srgb, var(--bg) 70%, transparent);
  /* Grey text gets darker (or lighter in the dark theme), since a halo around thin grey letters just blurs them. */
  --text-muted: color-mix(in srgb, var(--text-muted) 45%, var(--text));
}
/* While arranging, a transparent widget still needs to show where it is. */
.frame.transparent.editable:hover, .frame.transparent.editable:focus-within { border-color: var(--border); border-style: dashed; }
.general { display: flex; align-items: center; gap: 0.5rem; }
.general:not(:last-child) { padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
.body { flex: 1; min-height: 0; }
.controls {
  position: absolute; top: 0.4rem; right: 0.4rem; z-index: 2; display: flex; align-items: center; gap: 0.2rem;
  padding: 0.15rem; background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5);
  opacity: 0; transition: opacity 0.15s;
}
/* Reachable by keyboard focus and on touch screens, where there is no hover. */
.frame:hover .controls, .frame:focus-within .controls, .frame[data-tour-reveal] .controls { opacity: 1; }
.chrome { display: contents; }
/* Touch screens: unlocked, every button is shown. Locked, only the widget's own buttons (like Refresh) are, and settings appears once the widget is tapped. */
@media (hover: none) {
  .controls { opacity: 1; }
  .frame:not(.editable):not(.tapped):not([data-tour-reveal]) .chrome { display: none; }
  .frame:not(.editable):not(.tapped):not([data-tour-reveal]) .controls.only-chrome { display: none; }
}
.controls button, .drag-handle {
  display: grid; place-items: center; width: 1.6rem; height: 1.6rem; padding: 0; color: var(--text-muted);
  background: none; border: 0; border-radius: calc(var(--radius) / 2); cursor: pointer;
}
.controls button:hover:not(:disabled) { color: var(--text); background: var(--border); }
.controls button:disabled { opacity: 0.45; cursor: default; }
.action.busy svg { animation: action-spin 0.9s linear infinite; }
@keyframes action-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .action.busy svg { animation: none; } }
.drag-handle { cursor: grab; }
.drag-handle:hover { color: var(--text); background: var(--border); }
.unknown { color: var(--text-muted); }
</style>
