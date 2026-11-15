<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import type { WidgetAction } from '../registry';
import { frameLocation, type FrameAckMessage } from '../../../utils/frames/bridge';
import { canGo, currentAddress, go, startHistory, visit, type FrameHistory } from './history';
import { frameAccessVersion, frameRulesBusy, frameRulesRevision, frameRulesSupported, hasFrameAccess, requestFrameAccess } from './frameRules';
import { pageLabel, sanitizeWebpagesConfig, usablePages } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:actions': [actions: WidgetAction[]] }>();

const pages = computed(() => usablePages(sanitizeWebpagesConfig(props.config)));
const activeId = ref('');
/** Pages are loaded the first time their tab is shown, then kept so switching back is instant. */
const visited = reactive(new Set<string>());
/** Changing a page's key reloads its frame. */
const reloads = reactive<Record<string, number>>({});
/** Where each page's frame has been, for back and forward. Starts over when the page's address is changed in settings. */
const histories = reactive<Record<string, FrameHistory & { start: string }>>({});

watch(
  pages,
  (list) => {
    if (!list.some((p) => p.id === activeId.value)) activeId.value = list[0]?.id ?? '';
    for (const page of list) if (histories[page.id]?.start !== page.address) histories[page.id] = { ...startHistory(page.address), start: page.address };
  },
  { immediate: true },
);
const addressOf = (id: string) => {
  const history = histories[id];
  return history ? currentAddress(history) : '';
};
/** Loads the page's frame again, at the address its history now points to. */
function navigate(id: string, step: -1 | 0 | 1) {
  const history = histories[id];
  if (!history) return;
  histories[id] = { ...go(history, step), start: history.start };
  reloads[id] = (reloads[id] ?? 0) + 1;
}

/** The frames' windows, to tell which page a message came from. */
const frames: Record<string, HTMLIFrameElement | undefined> = {};
const setFrame = (id: string, el: unknown) => (frames[id] = el instanceof HTMLIFrameElement ? el : undefined);

/** The script in each frame (entrypoints/frame-bridge.ts) reports the frame's address. */
function onMessage(event: MessageEvent) {
  const id = Object.keys(frames).find((key) => frames[key]?.contentWindow === event.source);
  const history = id ? histories[id] : undefined;
  const url = frameLocation(event.data, event.origin);
  if (!id || !history || !url) return;
  const ack: FrameAckMessage = { tabloid: 'frame-ack' };
  (event.source as Window).postMessage(ack, event.origin);
  histories[id] = { ...visit(history, url), start: history.start };
}
onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => window.removeEventListener('message', onMessage));
watchEffect(() => activeId.value && visited.add(activeId.value));

/** Whether this device still has to grant the permission the widget's "block embedding" option needs. */
const needsAccess = ref(false);
const wantsBypass = computed(() => sanitizeWebpagesConfig(props.config).bypass);
async function checkAccess() {
  needsAccess.value = wantsBypass.value && !(await hasFrameAccess()) && frameRulesAvailable;
}
const frameRulesAvailable = frameRulesSupported();
watch([wantsBypass, frameAccessVersion], checkAccess);
/** Back and forward need the frame script, which runs only while the bypass is on and allowed. */
const canNavigate = computed(() => wantsBypass.value && frameRulesAvailable && !needsAccess.value);
// Rebuilt frames load again where they were; whatever they report next is that load landing.
watch(frameRulesRevision, () => {
  for (const id of Object.keys(histories)) histories[id] = { ...histories[id]!, loading: true };
});
onMounted(checkAccess);
const allow = () => void requestFrameAccess();

const tabbed = computed(() => pages.value.length > 1);
const tabId = (id: string) => `webpage-tab-${id}`;

function onTabKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  const list = pages.value;
  const next = list[(list.findIndex((p) => p.id === activeId.value) + step + list.length) % list.length];
  if (!next) return;
  activeId.value = next.id;
  event.preventDefault();
  void Promise.resolve().then(() => document.getElementById(tabId(next.id))?.focus());
}

watchEffect(() => {
  const id = activeId.value;
  const history = histories[id];
  const reload: WidgetAction = { id: 'reload', label: 'Reload page', icon: 'refresh', disabled: !id, run: () => navigate(id, 0) };
  if (!canNavigate.value) return emit('update:actions', [reload]);
  emit('update:actions', [
    { id: 'back', label: 'Back', icon: 'back', disabled: !history || !canGo(history, -1), run: () => navigate(id, -1) },
    { id: 'forward', label: 'Forward', icon: 'forward', disabled: !history || !canGo(history, 1), run: () => navigate(id, 1) },
    reload,
  ]);
});
</script>

<template>
  <div class="webpages">
    <p v-if="!pages.length" class="empty">Add a web page in this widget's settings.</p>
    <template v-else>
      <div v-if="needsAccess" class="notice" role="note">
        <span>Showing blocked sites needs your permission on this device.</span>
        <button type="button" @click="allow">Allow</button>
      </div>
      <div v-if="tabbed" class="tabs" role="tablist" @keydown="onTabKeydown">
        <button
          v-for="page in pages"
          :id="tabId(page.id)"
          :key="page.id"
          type="button"
          role="tab"
          :aria-selected="page.id === activeId"
          :tabindex="page.id === activeId ? 0 : -1"
          @click="activeId = page.id"
        >{{ pageLabel(page) }}</button>
      </div>
      <div class="frames" :role="tabbed ? 'tabpanel' : undefined" :aria-labelledby="tabbed ? tabId(activeId) : undefined">
        <template v-for="page in pages" :key="page.id">
          <iframe
            v-if="visited.has(page.id) && !(wantsBypass && frameRulesBusy)"
            v-show="page.id === activeId"
            :key="`${page.id}-${reloads[page.id] ?? 0}-${frameRulesRevision}`"
            :ref="(el) => setFrame(page.id, el)"
            :src="addressOf(page.id)"
            :title="pageLabel(page)"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.webpages { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 0.5rem; }
.empty { margin: 0; display: grid; place-content: center; height: 100%; color: var(--text-muted); text-align: center; }
.tabs { display: flex; gap: 0.25rem; min-width: 0; overflow-x: auto; scrollbar-width: thin; padding-right: 7.5rem; }
.tabs button {
  flex: none; font: inherit; font-size: 0.9em; padding: 0.3rem 0.7rem; max-width: 14rem; overflow: hidden; text-overflow: ellipsis;
  color: var(--text-muted); background: none; border: 1px solid transparent; border-radius: calc(var(--radius) / 1.5); cursor: pointer; white-space: nowrap;
}
.tabs button:hover { color: var(--text); }
.tabs button[aria-selected='true'] { color: var(--text); background: var(--surface-raised); border-color: var(--border); }
.notice { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0.7rem; font-size: 0.9em; background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.notice button { font: inherit; padding: 0.25rem 0.8rem; color: var(--on-accent); background: var(--accent); border: 0; border-radius: calc(var(--radius) / 1.5); cursor: pointer; font-weight: 600; }
.frames { flex: 1; min-height: 0; }
iframe { display: block; width: 100%; height: 100%; border: 0; border-radius: calc(var(--radius) / 1.5); background: #fff; }
</style>
