<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { notifyError, notifyUndoable } from '../../composables/useNotify';
import { useLayoutStore } from '../../stores/layout';
import { MAX_DASHBOARD_NAME_LENGTH, MAX_DASHBOARDS, type Dashboard } from '../../types/layout';
import Icon from './Icon.vue';

const props = defineProps<{ locked: boolean }>();

const store = useLayoutStore();
const renamingId = ref<string | null>(null);
const renameText = ref('');
const renameInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
const menuFor = ref<string | null>(null);
const menuPosition = ref({ top: 0, left: 0 });
const dragging = ref<string | null>(null);

const canAdd = computed(() => store.dashboards.length < MAX_DASHBOARDS);
const canEdit = computed(() => !props.locked);

function select(dashboard: Dashboard) {
  store.setActive(dashboard.id);
}

// ---- Renaming ----

async function startRename(dashboard: Dashboard) {
  if (!canEdit.value) return;
  menuFor.value = null;
  renamingId.value = dashboard.id;
  renameText.value = dashboard.name;
  await nextTick();
  const input = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
  input?.focus();
  input?.select();
}

function commitRename() {
  if (renamingId.value) store.renameDashboard(renamingId.value, renameText.value);
  renamingId.value = null;
}

function cancelRename() {
  renamingId.value = null;
}

// ---- Adding, moving, deleting ----

async function add() {
  const dashboard = store.addDashboard();
  if (!dashboard) return notifyError(`You can have up to ${MAX_DASHBOARDS} dashboards.`);
  await startRename(dashboard);
}

function move(dashboard: Dashboard, by: number) {
  const index = store.dashboards.findIndex((d) => d.id === dashboard.id);
  store.moveDashboard(dashboard.id, index + by);
  menuFor.value = null;
}

function remove(dashboard: Dashboard) {
  menuFor.value = null;
  const removed = store.removeDashboard(dashboard.id);
  if (!removed) return;
  const count = removed.widgets.length;
  const detail = count ? ` (${count} ${count === 1 ? 'widget' : 'widgets'})` : '';
  notifyUndoable(`“${removed.dashboard.name}” deleted${detail}`, () => store.restoreDashboard(removed));
}

// ---- Menu ----

function toggleMenu(dashboard: Dashboard, event: MouseEvent) {
  if (menuFor.value === dashboard.id) {
    menuFor.value = null;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  menuPosition.value = { top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 190)) };
  menuFor.value = dashboard.id;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (menuFor.value && !(event.target as HTMLElement).closest('.tab-menu, .menu-button')) menuFor.value = null;
}
document.addEventListener('pointerdown', onDocumentPointerDown);
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));

// ---- Keyboard ----

function onKeydown(event: KeyboardEvent) {
  if (renamingId.value) return;
  const list = store.dashboards;
  const current = list.findIndex((d) => d.id === store.activeId);
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const next = list[(current + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    if (!next) return;
    event.preventDefault();
    select(next);
    void nextTick(() => document.getElementById(`dashboard-tab-${next.id}`)?.focus());
  } else if (event.key === 'F2' && list[current]) {
    event.preventDefault();
    void startRename(list[current]!);
  } else if (event.key === 'Escape') {
    menuFor.value = null;
  }
}

// ---- Drag and drop reordering ----

function onDrop(target: Dashboard) {
  const source = dragging.value;
  dragging.value = null;
  if (!source || source === target.id) return;
  store.moveDashboard(source, store.dashboards.findIndex((d) => d.id === target.id));
}
</script>

<template>
  <nav class="tabs" role="tablist" aria-label="Dashboards" @keydown="onKeydown">
    <template v-for="(dashboard, index) in store.dashboards" :key="dashboard.id">
      <div class="tab" :class="{ active: dashboard.id === store.activeId, dragging: dragging === dashboard.id }">
        <input
          v-if="renamingId === dashboard.id"
          ref="renameInput"
          v-model="renameText"
          class="rename"
          type="text"
          :maxlength="MAX_DASHBOARD_NAME_LENGTH"
          aria-label="Dashboard name"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent.stop="cancelRename"
          @blur="commitRename"
        />
        <button
          v-else
          :id="`dashboard-tab-${dashboard.id}`"
          type="button"
          role="tab"
          class="tab-button"
          :aria-selected="dashboard.id === store.activeId"
          :tabindex="dashboard.id === store.activeId ? 0 : -1"
          :draggable="canEdit && store.dashboards.length > 1"
          :title="canEdit ? 'Double-click to rename' : undefined"
          @click="select(dashboard)"
          @dblclick="startRename(dashboard)"
          @dragstart="dragging = dashboard.id"
          @dragend="dragging = null"
          @dragover.prevent
          @drop.prevent="onDrop(dashboard)"
        >{{ dashboard.name }}</button>
        <button
          v-if="canEdit && dashboard.id === store.activeId && renamingId !== dashboard.id"
          type="button"
          class="menu-button"
          aria-haspopup="menu"
          :aria-expanded="menuFor === dashboard.id"
          :aria-label="`Options for ${dashboard.name}`"
          @click="toggleMenu(dashboard, $event)"
        ><Icon name="more" /></button>
        <Teleport to="body">
          <Transition name="tab-menu">
            <ul v-if="menuFor === dashboard.id" class="tab-menu" role="menu" :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }">
              <li role="none"><button type="button" role="menuitem" @click="startRename(dashboard)">Rename</button></li>
              <li role="none"><button type="button" role="menuitem" :disabled="index === 0" @click="move(dashboard, -1)">Move left</button></li>
              <li role="none"><button type="button" role="menuitem" :disabled="index === store.dashboards.length - 1" @click="move(dashboard, 1)">Move right</button></li>
              <li role="none"><button type="button" role="menuitem" class="danger" :disabled="store.dashboards.length <= 1" @click="remove(dashboard)">Delete dashboard</button></li>
            </ul>
          </Transition>
        </Teleport>
      </div>
    </template>
    <button type="button" class="add" aria-label="Add dashboard" title="Add dashboard" :disabled="!canAdd" @click="add"><Icon name="plus" /></button>
  </nav>
</template>

<style scoped>
.tabs { display: flex; align-items: center; gap: 0.35rem; min-width: 0; overflow-x: auto; scrollbar-width: none; padding: 0.15rem; }
.tabs::-webkit-scrollbar { display: none; }
.tab {
  display: flex; align-items: center; flex: none; max-width: 14rem; border: 1px solid transparent; border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 55%, transparent); backdrop-filter: blur(6px); transition: background-color 0.15s, border-color 0.15s;
}
.tab:hover { background: color-mix(in srgb, var(--surface) 80%, transparent); }
.tab.active { background: var(--surface); border-color: var(--border); box-shadow: var(--shadow); }
.tab.dragging { opacity: 0.4; }
.tab-button, .rename { font: inherit; color: var(--text); background: none; border: 0; padding: 0.4rem 0.8rem; min-width: 0; }
.tab-button { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; color: var(--text-muted); border-radius: var(--radius); }
.tab.active .tab-button { color: var(--text); font-weight: 600; }
.rename { width: 9rem; outline: 2px solid var(--accent); outline-offset: -2px; border-radius: var(--radius); }
.menu-button {
  display: grid; place-items: center; width: 1.6rem; height: 1.6rem; margin-right: 0.3rem; padding: 0; color: var(--text-muted);
  background: none; border: 0; border-radius: calc(var(--radius) / 2); cursor: pointer;
}
.menu-button:hover { color: var(--text); background: var(--surface-raised); }
.add {
  display: grid; place-items: center; flex: none; width: 2rem; height: 2rem; padding: 0; cursor: pointer; color: var(--text-muted);
  background: color-mix(in srgb, var(--surface) 55%, transparent); backdrop-filter: blur(6px); border: 1px dashed var(--border); border-radius: 50%;
}
.add:hover:not(:disabled) { color: var(--text); background: var(--surface); }
.add:disabled { opacity: 0.5; cursor: default; }
</style>

<style>
/* The menu is teleported to the page, so it can't be styled with scoped rules. */
.tab-menu {
  position: fixed; z-index: 30; min-width: 11rem; margin: 0; padding: 0.3rem; list-style: none; color: var(--text);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
}
.tab-menu button {
  width: 100%; text-align: left; font: inherit; padding: 0.4rem 0.7rem; cursor: pointer; color: inherit; background: none; border: 0; border-radius: calc(var(--radius) / 1.5);
}
.tab-menu button:hover:not(:disabled), .tab-menu button:focus-visible { background: var(--surface-raised); }
.tab-menu button:disabled { opacity: 0.45; cursor: default; }
.tab-menu .danger:not(:disabled) { color: var(--danger); }
.tab-menu-enter-active, .tab-menu-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.tab-menu-enter-from, .tab-menu-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
