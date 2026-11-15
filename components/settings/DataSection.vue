<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { notifyError, notifySuccess, notifyUndoable } from '../../composables/useNotify';
import { getWidgetDefinition } from '../widgets/registry';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import type { StoredState } from '../../types/layout';
import { buildSetupExport, parseSetupImport, replaceWithImport } from '../../utils/data/exportImport';
import { exportFeedGroups, importFeedsIntoState, type OpmlDestination } from '../../utils/data/stateEdits';
import { dateStamp, downloadText } from '../../utils/download';
import { decodeFeedBytes } from '../../utils/rss/fetch';
import { buildOpml, parseOpml, type OpmlFolder } from '../../utils/rss/opml';
import { requestFeedAccess } from '../../utils/rss/permissions';
import { sanitizeRssConfig } from '../../utils/rss/config';
import { readActiveDashboardId } from '../../utils/storage/activeDashboard';
import { emptyState, migrateState } from '../../utils/storage/migrations';
import type { StateRepository } from '../../utils/storage/repository';
import { createConfiguredRepository } from '../../utils/sync/manager';

const MAX_OPML_BYTES = 5 * 1024 * 1024;

const busy = ref(false);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function current(): Promise<{ repo: StateRepository; state: StoredState }> {
  const repo = await createConfiguredRepository();
  const raw = await repo.load();
  return { repo, state: raw === undefined ? emptyState() : migrateState(raw) };
}

async function run(task: () => Promise<void>) {
  busy.value = true;
  try {
    await task();
  } catch (error) {
    notifyError(message(error));
  } finally {
    busy.value = false;
  }
}

// ---- Setup export / import ----

const setupInput = ref<HTMLInputElement | null>(null);
const pendingSetup = shallowRef<{ imported: StoredState; now: StoredState } | null>(null);

const exportSetup = () =>
  run(async () => {
    const { state } = await current();
    downloadText(`tabloid-setup-${dateStamp()}.json`, buildSetupExport(state), 'application/json');
  });

async function pickSetup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await run(async () => {
    const imported = parseSetupImport(await file.text());
    pendingSetup.value = { imported, now: (await current()).state };
  });
}

async function confirmSetup() {
  const pending = pendingSetup.value;
  pendingSetup.value = null;
  if (!pending) return;
  await run(async () => {
    const { repo, state: previous } = await current();
    await repo.save(replaceWithImport(previous, pending.imported));
    notifyUndoable('Setup imported', () => void repo.save(previous).then(() => notifySuccess('Restored your previous setup.')));
  });
}

// ---- OPML export / import ----

const opmlInput = ref<HTMLInputElement | null>(null);
const folders = ref<OpmlFolder[] | null>(null);
const rssWidgets = ref<Array<{ id: string; label: string }>>([]);
const destinationKind = ref<'per-folder' | 'single' | 'existing'>('per-folder');
const existingWidgetId = ref('');

const exportOpml = () =>
  run(async () => {
    const groups = exportFeedGroups((await current()).state);
    if (groups.every((g) => g.feeds.length === 0)) throw new Error("There are no RSS feeds to export yet. Add an RSS feeds widget first.");
    downloadText(`tabloid-feeds-${dateStamp()}.opml`, buildOpml(groups), 'text/x-opml');
  });

async function pickOpml(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await run(async () => {
    if (file.size > MAX_OPML_BYTES) throw new Error('That file is too large to be a feed list.');
    folders.value = parseOpml(decodeFeedBytes(new Uint8Array(await file.arrayBuffer()), null));
    const { state } = await current();
    // Offer every RSS widget, labeled with its dashboard when there are several.
    rssWidgets.value = state.widgets
      .filter((w) => w.type === 'rss')
      .map((w, i) => {
        const dashboard = state.dashboards.length > 1 ? `${state.dashboards.find((d) => d.id === w.dashboard)?.name}: ` : '';
        return { id: w.id, label: `${dashboard}RSS feeds ${i + 1} (${sanitizeRssConfig(w.config).feeds.length} feeds)` };
      });
    destinationKind.value = 'per-folder';
    existingWidgetId.value = rssWidgets.value[0]?.id ?? '';
  });
}

const totalFeeds = computed(() => folders.value?.reduce((sum, f) => sum + f.feeds.length, 0) ?? 0);

function confirmOpml() {
  const chosen = folders.value;
  if (!chosen) return;
  // Reading feeds needs access to websites. Ask right here, inside the click (Firefox insists), and
  // carry on either way: widgets offer an Allow button if it was declined.
  const access = requestFeedAccess().catch(() => undefined);
  folders.value = null;
  void run(async () => {
    const destination: OpmlDestination =
      destinationKind.value === 'existing' ? { kind: 'existing', widgetId: existingWidgetId.value } : { kind: destinationKind.value };
    const { repo, state: previous } = await current();
    const size = getWidgetDefinition('rss')?.defaultSize ?? { w: 4, h: 9 };
    // New widgets go on the dashboard this device is showing.
    const dashboard = await readActiveDashboardId(previous);
    const result = importFeedsIntoState(previous, chosen, destination, { size, dashboard });
    await repo.save(result.state);
    await access;
    const skipped = result.feedsSkipped ? ` (${result.feedsSkipped} skipped: already there or no room)` : '';
    notifyUndoable(`Added ${result.feedsAdded} feeds${skipped}`, () => void repo.save(previous).then(() => notifySuccess('Import undone.')));
  });
}
</script>

<template>
  <fieldset id="data" class="data-section" :disabled="busy">
    <legend>Your data</legend>

    <div class="block">
      <h3>Full setup</h3>
      <p class="hint">Your dashboards and widgets with their settings (including each RSS widget's feeds and display options, and the text in Notes), their layout, appearance and background settings, as a JSON file. Handy for backups or moving to another computer. Passwords, tokens, sync settings, read history, downloaded articles and uploaded images are not included.</p>
      <div class="buttons">
        <button type="button" @click="exportSetup">Export setup…</button>
        <button type="button" @click="setupInput?.click()">Import setup…</button>
        <input ref="setupInput" type="file" accept=".json,application/json" hidden @change="pickSetup" />
      </div>
    </div>

    <div class="block">
      <h3>Feeds (OPML)</h3>
      <p class="hint">The standard format for moving subscriptions between feed readers. Export gives one folder per RSS widget, named after its dashboard. Import adds new widgets to the dashboard you were last viewing.</p>
      <div class="buttons">
        <button type="button" @click="exportOpml">Export feeds…</button>
        <button type="button" @click="opmlInput?.click()">Import feeds…</button>
        <input ref="opmlInput" type="file" accept=".opml,.xml,text/xml,text/x-opml,application/xml" hidden @change="pickOpml" />
      </div>
    </div>
  </fieldset>

  <ConfirmDialog :open="!!pendingSetup" title="Replace your setup?" confirm-label="Replace" @cancel="pendingSetup = null" @confirm="confirmSetup">
    <template v-if="pendingSetup">
      <p>Your current setup has {{ pendingSetup.now.widgets.length }} widgets. This file has {{ pendingSetup.imported.widgets.length }}. Importing replaces what you have now.</p>
      <p class="hint">You can undo this for a few seconds afterwards.</p>
    </template>
  </ConfirmDialog>

  <ConfirmDialog :open="!!folders" title="Import feeds" confirm-label="Import" @cancel="folders = null" @confirm="confirmOpml">
    <template v-if="folders">
      <p>Found {{ totalFeeds }} {{ totalFeeds === 1 ? 'feed' : 'feeds' }} in {{ folders.length }} {{ folders.length === 1 ? 'group' : 'groups' }}:</p>
      <ul class="folders">
        <li v-for="folder in folders" :key="folder.name">{{ folder.name || 'Not in a folder' }} <small>({{ folder.feeds.length }})</small></li>
      </ul>
      <label class="radio"><input v-model="destinationKind" type="radio" value="per-folder" /> A new widget for each folder</label>
      <label class="radio"><input v-model="destinationKind" type="radio" value="single" /> One new widget with everything</label>
      <label v-if="rssWidgets.length" class="radio">
        <input v-model="destinationKind" type="radio" value="existing" /> Add to
        <select v-model="existingWidgetId" :disabled="destinationKind !== 'existing'" aria-label="RSS widget to add to">
          <option v-for="widget in rssWidgets" :key="widget.id" :value="widget.id">{{ widget.label }}</option>
        </select>
      </label>
      <p class="hint">Tabloid will ask for permission to read feeds from websites if it doesn't have it yet.</p>
    </template>
  </ConfirmDialog>
</template>

<style scoped>
.data-section { display: flex; flex-direction: column; gap: 1rem; }
h3 { margin: 0 0 0.25rem; font-size: 1rem; }
.hint { margin: 0; color: var(--text-muted); font-size: 0.9em; }
.buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
button { font: inherit; padding: 0.4rem 0.9rem; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
button:hover { background: var(--surface-raised); }
.folders { margin: 0; padding-left: 1.25rem; max-height: 8rem; overflow-y: auto; }
.radio { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
select { font: inherit; padding: 0.3rem 0.5rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
</style>
