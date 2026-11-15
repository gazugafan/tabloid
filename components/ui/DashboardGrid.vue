<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { GridItem, GridLayout } from 'grid-layout-plus';
import { notifyUndoable } from '../../composables/useNotify';
import { useNarrowViewport } from '../../composables/useNarrowViewport';
import { useLayoutStore } from '../../stores/layout';
import { getWidgetDefinition } from '../widgets/registry';
import { GRID_COLS, GRID_MARGIN, ROW_HEIGHT, sortForStack } from '../../utils/layout';
import { gridSteps, moveWidget, resizeFromLeft, resizeWidget, type ArrangeItem, type Direction } from '../../utils/arrange';
import WidgetFrame from './WidgetFrame.vue';

defineProps<{ locked: boolean }>();

const store = useLayoutStore();
const narrow = useNarrowViewport();

interface GridEntry { i: string; x: number; y: number; w: number; h: number; minW: number; minH: number }

const gridLayout = ref<GridEntry[]>([]);

function minSize(type: string) {
  return getWidgetDefinition(type)?.minSize ?? { w: 1, h: 1 };
}

/** Desktop: the stored geometry. Narrow: one column in shared reading order, keeping each widget's height. */
function buildGrid(): GridEntry[] {
  if (!narrow.value) {
    return store.activeWidgets.map((w) => ({
      i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: minSize(w.type).w, minH: minSize(w.type).h,
    }));
  }
  let y = 0;
  return sortForStack(store.activeWidgets).map((w) => {
    const entry = { i: w.id, x: 0, y, w: 1, h: w.h, minW: 1, minH: minSize(w.type).h };
    y += w.h;
    return entry;
  });
}

// Rebuild when widgets are added/removed, the viewport mode changes, or the store replaced
// widgets (other tab/device, reorder). Ordinary drags flow grid -> store and never back.
watch(
  () => [store.activeWidgets.map((w) => w.id).join(','), narrow.value, store.revision, store.activeId] as const,
  () => (gridLayout.value = buildGrid()),
  { immediate: true },
);

/** Removing is easy to do by accident, so it comes with an Undo button instead of a confirmation step. */
function remove(id: string) {
  const removed = store.removeWidget(id);
  if (!removed) return;
  const name = getWidgetDefinition(removed.widget.type)?.name ?? 'Widget';
  notifyUndoable(`${name} removed`, () => store.restoreWidget(removed.widget, removed.index));
}

const grid = ref<InstanceType<typeof GridLayout> | null>(null);
const columns = () => (narrow.value ? 1 : GRID_COLS);

/** Copies new positions and sizes into the grid's entries, which the grid draws from. */
function apply(items: readonly ArrangeItem[]) {
  for (const { i, x, y, w, h } of items) {
    const entry = gridLayout.value.find((e) => e.i === i);
    if (entry) Object.assign(entry, { x, y, w, h });
  }
}

/** Lets the grid settle (and size itself) and reports the result, which saves it. */
const commit = () => grid.value?.layoutUpdate();

/** Read out after a keyboard move or resize, for screen readers. */
const announcement = ref('');
function announce(id: string, kind: 'move' | 'resize') {
  const entry = gridLayout.value.find((e) => e.i === id);
  const widget = store.widgets.find((w) => w.id === id);
  if (!entry || !widget) return;
  const name = getWidgetDefinition(widget.type)?.name ?? 'Widget';
  if (kind === 'resize') announcement.value = narrow.value ? `${name}: ${entry.h} rows tall` : `${name}: ${entry.w} columns wide, ${entry.h} rows tall`;
  else if (narrow.value) {
    const order = [...gridLayout.value].sort((a, b) => a.y - b.y);
    announcement.value = `${name}: position ${order.indexOf(entry) + 1} of ${order.length}`;
  } else announcement.value = `${name}: column ${entry.x + 1}, row ${entry.y + 1}`;
}

/** Arrow keys on a widget's move handle: move it, or resize it with Shift. */
function arrange(id: string, kind: 'move' | 'resize', direction: Direction) {
  const step = kind === 'move' ? moveWidget : resizeWidget;
  apply(step(gridLayout.value, id, direction, columns()));
  commit();
  announce(id, kind);
}

/**
 * The lower-left resize handle. The grid library only resizes from the lower right, so this one is ours, made to
 * feel the same: the widget follows the pointer, and the grid's outline shows where it will snap on release.
 */
interface LeftResize {
  pointerId: number;
  startX: number;
  startY: number;
  start: ArrangeItem;
  items: ArrangeItem[];
  columnWidth: number;
  snapped: string;
}
let leftResize: LeftResize | null = null;
/** The widget's box in pixels while it follows the pointer, keyed by widget id. */
const followStyle = ref<Record<string, Record<string, string>>>({});

// The grid library's own geometry: columns and rows with GRID_MARGIN between them and around the edge.
const pxLeft = (x: number, columnWidth: number) => Math.round(columnWidth * x + (x + 1) * GRID_MARGIN);
const pxTop = (y: number) => Math.round(ROW_HEIGHT * y + (y + 1) * GRID_MARGIN);
const pxWidth = (w: number, columnWidth: number) => Math.round(columnWidth * w + Math.max(0, w - 1) * GRID_MARGIN);
const pxHeight = (h: number) => ROW_HEIGHT * h + Math.max(0, h - 1) * GRID_MARGIN;

/** Shows the grid's snap outline at the entry's current (snapped) place. */
function showSnap(id: string, phase: 'resizemove' | 'resizeend') {
  const entry = gridLayout.value.find((e) => e.i === id);
  if (entry) grid.value?.resizeEvent(phase, id, entry.x, entry.y, entry.h, entry.w);
}

function startLeftResize(event: PointerEvent, id: string) {
  const start = gridLayout.value.find((e) => e.i === id);
  const container = (event.currentTarget as HTMLElement).closest('.vgl-layout');
  if (event.button !== 0 || !start || !container) return;
  event.preventDefault();
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    // Not a live pointer (a synthetic event): the drag still works while the pointer stays over the handle.
  }
  leftResize = {
    pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
    start: { ...start }, items: gridLayout.value.map((e) => ({ ...e })),
    columnWidth: (container.clientWidth - GRID_MARGIN * (GRID_COLS + 1)) / GRID_COLS,
    snapped: '',
  };
  document.documentElement.classList.add('resizing-left');
  moveLeftResize(event);
}

function moveLeftResize(event: PointerEvent) {
  if (!leftResize || event.pointerId !== leftResize.pointerId) return;
  const { startX, startY, start, items, columnWidth } = leftResize;
  const dx = event.clientX - startX;
  const dy = event.clientY - startY;

  // Snap: whole columns and rows, which also settles the other widgets around it.
  const columns = gridSteps(dx, columnWidth + GRID_MARGIN);
  const rows = gridSteps(dy, ROW_HEIGHT + GRID_MARGIN);
  apply(resizeFromLeft(items, start, columns, rows, GRID_COLS));
  const entry = gridLayout.value.find((e) => e.i === start.i);
  if (!entry) return;
  const snapped = `${entry.x},${entry.y},${entry.w},${entry.h}`;
  if (snapped !== leftResize.snapped) {
    leftResize.snapped = snapped;
    showSnap(start.i, 'resizemove');
  }

  // Follow: the pointer's exact position, kept within the grid's left edge and the widget's minimum size.
  const right = pxLeft(start.x, columnWidth) + pxWidth(start.w, columnWidth);
  const left = Math.min(Math.max(pxLeft(start.x, columnWidth) + dx, GRID_MARGIN), right - pxWidth(start.minW, columnWidth));
  const height = Math.max(pxHeight(start.h) + dy, pxHeight(start.minH));
  // The library sets the transform under every prefix too, and whichever the browser applies last wins (-webkit- in
  // Chrome, -moz- in Firefox), so set the same ones.
  const transform = `translate3d(${left}px, ${pxTop(entry.y)}px, 0)`;
  followStyle.value = {
    [start.i]: { transform, WebkitTransform: transform, MozTransform: transform, msTransform: transform, OTransform: transform, width: `${right - left}px`, height: `${height}px` },
  };
}

function endLeftResize(event: PointerEvent) {
  if (!leftResize || event.pointerId !== leftResize.pointerId) return;
  const id = leftResize.start.i;
  leftResize = null;
  followStyle.value = {};
  document.documentElement.classList.remove('resizing-left');
  // Hides the outline, lets the grid settle and size itself, and reports the result, which saves it.
  showSnap(id, 'resizeend');
}
onBeforeUnmount(() => document.documentElement.classList.remove('resizing-left'));

function onLayoutUpdated(layout: GridEntry[]) {
  if (narrow.value) {
    // One column: dragging changes the order, and the lower-right handle changes only the height.
    store.reorder([...layout].sort((a, b) => a.y - b.y).map((entry) => entry.i));
    store.setHeights(layout.map(({ i, h }) => ({ id: i, h })));
  } else {
    store.updateGeometry(layout.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h })));
  }
}
</script>

<template>
  <GridLayout
    ref="grid"
    :key="`${store.activeId}-${narrow ? 'narrow' : 'wide'}`"
    v-model:layout="gridLayout"
    :col-num="narrow ? 1 : GRID_COLS"
    :row-height="ROW_HEIGHT"
    :margin="[GRID_MARGIN, GRID_MARGIN]"
    :is-draggable="!locked"
    :is-resizable="!locked"
    vertical-compact
    @layout-updated="onLayoutUpdated"
  >
    <GridItem
      v-for="entry in gridLayout"
      :key="entry.i"
      v-bind="entry"
      :class="{ 'vgl-transparent': store.widgets.find((w) => w.id === entry.i)?.transparent, 'following-pointer': !!followStyle[entry.i] }"
      :style="followStyle[entry.i]"
      drag-allow-from=".drag-handle"
    >
      <WidgetFrame
        v-if="store.widgets.find((w) => w.id === entry.i)"
        :widget="store.widgets.find((w) => w.id === entry.i)!"
        :locked="locked"
        @update:config="store.updateConfig(entry.i, $event)"
        @update:transparent="store.setTransparent(entry.i, $event)"
        @remove="remove(entry.i)"
        @arrange="(kind, direction) => arrange(entry.i, kind, direction)"
      />
      <span
        v-if="!locked && !narrow"
        class="resizer-left"
        title="Drag to resize"
        aria-hidden="true"
        @pointerdown="startLeftResize($event, entry.i)"
        @pointermove="moveLeftResize"
        @pointerup="endLeftResize"
        @pointercancel="endLeftResize"
      />
    </GridItem>
  </GridLayout>
  <p class="visually-hidden" aria-live="polite">{{ announcement }}</p>
</template>

<style>
/* Resize handles only appear on hover (or keyboard focus within the widget). */
/* Keep the handle inside the widget even when the corners are very round: the inset follows the
   radius (a corner curve cuts in by about 0.3 x radius) plus a little breathing room. */
.vgl-item {
  --vgl-resizer-size: 18px;
  --vgl-resizer-border-color: var(--text-muted);
  --vgl-resizer-border-width: 2px;
}
.vgl-item > .vgl-item__resizer { touch-action: none; right: calc(var(--radius) * 0.3 + 3px); bottom: calc(var(--radius) * 0.3 + 3px); opacity: 0; transition: opacity 0.15s; }
.vgl-item:hover > .vgl-item__resizer, .vgl-item:has([data-tour-reveal]) > .vgl-item__resizer { opacity: 1; }
/* The lower-left handle mirrors the library's lower-right one. */
.vgl-item > .resizer-left {
  position: absolute; z-index: 2; left: calc(var(--radius) * 0.3 + 3px); bottom: calc(var(--radius) * 0.3 + 3px);
  width: var(--vgl-resizer-size); height: var(--vgl-resizer-size); cursor: sw-resize; touch-action: none; opacity: 0; transition: opacity 0.15s;
}
.vgl-item > .resizer-left::before {
  content: ''; position: absolute; inset: 0 0 3px 3px;
  border: 0 solid var(--vgl-resizer-border-color); border-left-width: var(--vgl-resizer-border-width); border-bottom-width: var(--vgl-resizer-border-width);
}
.vgl-item:hover > .resizer-left, .vgl-item:has([data-tour-reveal]) > .resizer-left { opacity: 1; }
.vgl-item.vgl-transparent > .resizer-left { filter: drop-shadow(1px 1px 2px rgb(0 0 0 / 0.8)); }
@media (hover: none) { .vgl-item > .resizer-left { opacity: 1; } }
/* Matches the library's look for a widget being resized from the lower right. */
.vgl-item.following-pointer { z-index: 3; opacity: 0.6; transition: none; user-select: none; }
html.resizing-left, html.resizing-left * { cursor: sw-resize !important; user-select: none; }
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
/* With no card behind it, the handle is white with a faint shadow so it can't get lost in the background. */
.vgl-item.vgl-transparent { --vgl-resizer-border-color: #fff; }
.vgl-item.vgl-transparent > .vgl-item__resizer { filter: drop-shadow(1px 1px 2px rgb(0 0 0 / 0.8)); }
@media (hover: none) { .vgl-item__resizer { opacity: 1; } }
.vgl-item--placeholder { background: var(--accent) !important; border-radius: var(--radius); }
</style>
