<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Collapse from '../ui/Collapse.vue';
import { BACKGROUND_KEY } from '../../composables/useBackground';
import { notifyError } from '../../composables/useNotify';
import { createIndexedDbImageStore, downscaleImage, type StoredImage } from '../../utils/background/imageStore';
import { BING_MARKETS, BLUR_RANGE, DEFAULT_BACKGROUND, DIM_RANGE, ROTATE_OPTIONS, UNSPLASH_TOPICS, WIKIMEDIA_CATEGORIES, sanitizeBackground, type BackgroundSettings } from '../../utils/background/settings';
import { cleanApiKey, createApiKeyStore, type ApiKeys } from '../../utils/background/keys';
import { REMOTE_BACKGROUND_SOURCES, WIKIMEDIA_SOURCE, type RemoteBackgroundSource } from '../../utils/background/sources';
import { requestHostPermission } from '../../utils/sync/shared';
import type { Dashboard } from '../../types/layout';
import { loadState, saveDashboardBackground, savePreference } from '../../utils/sync/preferences';
import { publishBackground, seedSharedBackground, uploadsVersion } from '../../composables/useSharedBackground';
import { useBackgroundPreview } from '../../composables/useBackgroundPreview';
import { readActiveDashboardId } from '../../utils/storage/activeDashboard';

/** The settings being edited: the general ones, or one dashboard's own. */
const settings = ref<BackgroundSettings>({ ...DEFAULT_BACKGROUND });
/** The general settings every dashboard uses unless it has its own. */
const general = ref<BackgroundSettings>({ ...DEFAULT_BACKGROUND });
const dashboards = ref<Dashboard[]>([]);
/** '' edits the general settings; otherwise the id of the dashboard whose own settings are edited. */
const scope = ref('');
/** Whether the chosen dashboard has its own settings (otherwise it follows the general ones). */
const customized = ref(false);
const inheriting = computed(() => scope.value !== '' && !customized.value);
const ready = ref(false);
const images = createIndexedDbImageStore();
const uploads = ref<Array<StoredImage & { url: string }>>([]);

/** The dashboard this device shows, whose current image the preview follows. */
const activeDashboard = ref<string>();
const previewSettings = computed(() => (ready.value ? settings.value : null));
const preview = useBackgroundPreview(previewSettings, computed(() => (scope.value || activeDashboard.value)), computed(() => uploads.value.map((u) => u.id).join()));

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function refreshUploads() {
  uploads.value.forEach((u) => URL.revokeObjectURL(u.url));
  uploads.value = (await images.list()).map((image) => ({ ...image, url: URL.createObjectURL(image.blob) }));
  uploadsVersion.value++;
}

onMounted(async () => {
  try {
    const state = await loadState();
    dashboards.value = state.dashboards;
    activeDashboard.value = await readActiveDashboardId(state);
    seedSharedBackground(state);
    general.value = sanitizeBackground(state.preferences[BACKGROUND_KEY]);
    settings.value = { ...general.value };
    await refreshUploads();
    keys.value = (await keyStore.get()) ?? {};
  } catch (error) {
    notifyError(message(error));
  }
  ready.value = true;
});
onBeforeUnmount(() => uploads.value.forEach((u) => URL.revokeObjectURL(u.url)));

let saveTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  settings,
  (value) => {
    if (!ready.value) return;
    clearTimeout(saveTimer);
    const clean = sanitizeBackground(value);
    const target = scope.value;
    publishBackground(target, clean);
    saveTimer = setTimeout(() => {
      const saving = target === '' ? savePreference(BACKGROUND_KEY, clean) : saveDashboardBackground(target, clean);
      saving.catch((error) => notifyError(message(error)));
      if (target === '') general.value = clean;
    }, 400);
  },
  { deep: true },
);

/** Loads the settings of the chosen scope into the form without saving anything. */
async function showScope() {
  ready.value = false;
  clearTimeout(saveTimer);
  const dashboard = dashboards.value.find((d) => d.id === scope.value);
  customized.value = !!dashboard?.background;
  settings.value = { ...(dashboard?.background ?? general.value) };
  await nextTick();
  ready.value = true;
}
watch(scope, showScope);

/** Gives the chosen dashboard its own settings (starting from the general ones), or takes them away again. */
async function toggleCustom(event: Event) {
  const on = (event.target as HTMLInputElement).checked;
  const id = scope.value;
  try {
    await saveDashboardBackground(id, on ? { ...general.value } : undefined);
    publishBackground(id, on ? { ...general.value } : undefined);
    const dashboard = dashboards.value.find((d) => d.id === id);
    if (dashboard) {
      if (on) dashboard.background = { ...general.value };
      else delete dashboard.background;
    }
    await showScope();
  } catch (error) {
    notifyError(message(error));
    (event.target as HTMLInputElement).checked = !on;
  }
}

const keyStore = createApiKeyStore();
const keys = ref<ApiKeys>({});
const keyInputs = ref({ unsplash: '' });

async function saveKey(name: keyof ApiKeys) {
  try {
    const key = cleanApiKey(keyInputs.value[name]);
    keys.value = { ...keys.value, [name]: key || undefined };
    await keyStore.set(keys.value);
    keyInputs.value[name] = '';
    // Without its key, Unsplash can't be used.
    if (name === 'unsplash' && !key) settings.value.unsplash = false;
  } catch (error) {
    notifyError(message(error));
  }
}

const busy = ref(false);

async function addFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  busy.value = true;
  try {
    for (const file of files) await images.add(await downscaleImage(file), file.name);
  } catch (error) {
    notifyError(message(error));
  } finally {
    busy.value = false;
    await refreshUploads();
  }
}

async function removeImage(id: string) {
  try {
    await images.remove(id);
  } catch (error) {
    notifyError(message(error));
  }
  await refreshUploads();
}

/** Wikimedia pictures by subject come from a different Wikimedia site, so choosing one asks for access to it. */
function chooseWikimediaCategory(event: Event) {
  const select = event.target as HTMLSelectElement;
  const previous = settings.value.wikimediaCategory;
  const value = select.value;
  if (value === '') {
    settings.value.wikimediaCategory = '';
    return;
  }
  // Called straight from the change event so the browser accepts the permission prompt.
  requestHostPermission(WIKIMEDIA_SOURCE.optionOrigins ?? [], 'Wikimedia Commons').then(
    () => (settings.value.wikimediaCategory = value),
    (error) => {
      select.value = previous;
      notifyError(message(error));
    },
  );
}

/** Unsplash: a ready-made topic, or "custom" which shows a text box. */
const customTopic = ref(false);
const topicChoice = computed(() => {
  if (customTopic.value) return '__custom';
  const query = settings.value.unsplashQuery;
  return query === '' || UNSPLASH_TOPICS.some((t) => t.query === query) ? query : '__custom';
});
function chooseTopic(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  customTopic.value = value === '__custom';
  if (!customTopic.value) settings.value.unsplashQuery = value;
}

function toggleSource(source: RemoteBackgroundSource, event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.checked) {
    settings.value[source.id] = false;
    return;
  }
  // Called straight from the click so the browser accepts the permission prompt.
  requestHostPermission(source.origins, source.label).then(
    () => (settings.value[source.id] = true),
    (error) => {
      input.checked = false;
      notifyError(message(error));
    },
  );
}

const DESCRIPTIONS: Record<RemoteBackgroundSource['id'], string> = {
  bing: "Bing's daily photos of landscapes, cities and wildlife.",
  wikimedia: 'Free-licensed photos from Wikimedia Commons.',
  unsplash: 'Random photos from Unsplash. Needs a free key from you.',
};

/** What the preview shows: the image the new tab would show, or a sample scene when there is none. */
const previewStyle = computed(() => {
  const filter = `blur(${settings.value.blur / 4}px) brightness(${1 - settings.value.dim / 100})`;
  return preview.url.value ? { backgroundImage: `url("${preview.url.value}")`, filter } : { filter };
});

/** A source's options show while it is on. Unsplash also shows its key setup until it has a key. */
const sourceOpen = (source: RemoteBackgroundSource) => settings.value[source.id] || (source.id === 'unsplash' && !keys.value.unsplash);
</script>

<template>
  <fieldset id="background" class="background-section" :disabled="!ready">
    <legend>Background</legend>

    <div class="scope">
      <label class="row">Editing
        <select v-model="scope" aria-label="Which dashboard these settings apply to">
          <option value="">All dashboards (default)</option>
          <option v-for="dashboard in dashboards" :key="dashboard.id" :value="dashboard.id">{{ dashboard.name }}{{ dashboard.background ? ' (custom)' : '' }}</option>
        </select>
      </label>
      <label v-if="scope" class="row">
        <input type="checkbox" :checked="customized" @change="toggleCustom" /> Use different background settings on this dashboard
      </label>
      <p v-if="inheriting" class="settings-hint">This dashboard follows the default settings. Turn the option above on to change them for this dashboard only.</p>
    </div>

    <div class="scoped" :class="{ inactive: inheriting }" :inert="inheriting">
      <h3>How it looks</h3>
      <div class="preview" role="img" aria-label="Preview of the background with the current blur and darkness">
        <div class="picture" :class="{ sample: !preview.url.value }" :style="previewStyle"></div>
        <span v-if="!preview.url.value" class="caption">Sample</span>
      </div>
      <label class="row"><span>Blur</span>
        <input v-model.number="settings.blur" type="range" :min="BLUR_RANGE.min" :max="BLUR_RANGE.max" />
        <output>{{ settings.blur }}px</output>
      </label>
      <label class="row"><span>Darken</span>
        <input v-model.number="settings.dim" type="range" :min="DIM_RANGE.min" :max="DIM_RANGE.max" />
        <output>{{ settings.dim }}%</output>
      </label>

      <h3>Where images come from</h3>
      <p class="settings-hint">Turn on as many as you like. Tabloid mixes them.</p>

      <div class="card" :class="{ on: settings.uploads }">
        <label class="head">
          <input v-model="settings.uploads" type="checkbox" />
          <span class="title">My images</span>
          <span class="desc">Pictures from this computer. They are shrunk and kept on this device only, never synced.</span>
        </label>
        <Collapse gap="0.75rem">
          <div v-if="settings.uploads" class="body">
            <div class="uploads">
              <figure v-for="image in uploads" :key="image.id">
                <img :src="image.url" :alt="image.name" />
                <button type="button" class="remove" :aria-label="`Remove ${image.name}`" @click="removeImage(image.id)">×</button>
              </figure>
              <label class="add" :aria-busy="busy">
                <input type="file" accept="image/*" multiple @change="addFiles" />
                <span>{{ busy ? 'Adding…' : '+ Add images' }}</span>
              </label>
            </div>
          </div>
        </Collapse>
      </div>

      <div v-for="source in REMOTE_BACKGROUND_SOURCES" :key="source.id" class="card" :class="{ on: settings[source.id] }">
        <label class="head">
          <input
            :checked="settings[source.id]"
            :disabled="source.requiresKey && !keys[source.requiresKey]"
            type="checkbox"
            @change="toggleSource(source, $event)"
          />
          <span class="title">{{ source.label }}</span>
          <span class="desc">{{ DESCRIPTIONS[source.id] }}<template v-if="!settings[source.id] && !(source.requiresKey && !keys[source.requiresKey])"> Turning it on asks permission to contact it.</template></span>
        </label>
        <Collapse gap="0.75rem">
          <div v-if="sourceOpen(source)" class="body">
            <template v-if="source.id === 'unsplash'">
              <details v-if="!keys.unsplash" class="steps" open>
                <summary>How do I get a key?</summary>
                <ol>
                  <li>Create a free account at <a href="https://unsplash.com/join" target="_blank" rel="noopener noreferrer">unsplash.com</a> and open <a href="https://unsplash.com/oauth/applications" target="_blank" rel="noopener noreferrer">your developer apps</a>.</li>
                  <li>Choose <em>New Application</em>, accept the terms, and name it anything (for example "My start page").</li>
                  <li>Copy the <em>Access Key</em> (not the Secret Key) from the app's page and paste it below.</li>
                </ol>
                <p class="settings-hint">A new Unsplash app allows 50 requests an hour, far more than Tabloid needs.</p>
              </details>
              <form class="key-row" @submit.prevent="saveKey('unsplash')">
                <input v-model="keyInputs.unsplash" type="text" :placeholder="keys.unsplash ? 'Key saved. Paste a new one to replace it' : 'Access Key'" autocomplete="off" aria-label="Unsplash access key" />
                <button type="submit" :disabled="!keyInputs.unsplash">Save</button>
                <button v-if="keys.unsplash" type="button" @click="keyInputs.unsplash = ''; saveKey('unsplash')">Remove key</button>
              </form>
              <p class="settings-hint">The key stays on this device and is never synced.</p>
              <template v-if="keys.unsplash">
                <label class="row">Topic
                  <select :value="topicChoice" @change="chooseTopic">
                    <option value="">Anything</option>
                    <option v-for="topic in UNSPLASH_TOPICS" :key="topic.query" :value="topic.query">{{ topic.label }}</option>
                    <option value="__custom">Custom…</option>
                  </select>
                </label>
                <label v-if="topicChoice === '__custom'" class="row">Your topic
                  <input v-model="settings.unsplashQuery" type="text" placeholder="e.g. northern lights, old libraries" maxlength="50" autocomplete="off" />
                </label>
              </template>
            </template>

            <label v-else-if="source.id === 'bing'" class="row">Region
              <select v-model="settings.bingMarket">
                <option value="all">All regions</option>
                <option v-for="market in BING_MARKETS" :key="market.id" :value="market.id">{{ market.label }}</option>
              </select>
              <small>Each region shows different photos.</small>
            </label>
            <label v-else-if="source.id === 'wikimedia'" class="row">Pictures
              <select :value="settings.wikimediaCategory" @change="chooseWikimediaCategory">
                <option value="all">All of these</option>
                <option value="">Picture of the day (last week)</option>
                <option v-for="category in WIKIMEDIA_CATEGORIES" :key="category.id" :value="category.id">Featured: {{ category.label }}</option>
              </select>
            </label>
          </div>
        </Collapse>
      </div>

      <h3>Changing the image</h3>
      <label class="row">Change image
        <select v-model="settings.rotate">
          <option v-for="option in ROTATE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.background-section { display: flex; flex-direction: column; gap: 0.75rem; }
.scope { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.scope .settings-hint { margin: 0; }
.scoped { display: flex; flex-direction: column; gap: 0.75rem; transition: opacity 0.2s; }
.scoped.inactive { opacity: 0.45; }
.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.scoped > .row > :first-child { min-width: 6rem; }

.preview { position: relative; overflow: hidden; width: 100%; max-width: 24rem; aspect-ratio: 16 / 9; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.picture { position: absolute; inset: -12px; background: center / cover; }
.picture.sample { background-image: linear-gradient(160deg, #f6d365 0%, #fda085 35%, #5b86e5 36%, #36d1dc 100%); }
.caption { position: absolute; left: 0.5rem; bottom: 0.4rem; padding: 0.1rem 0.45rem; font-size: 0.8em; color: #fff; background: rgb(0 0 0 / 0.55); border-radius: 999px; }

.card { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); }
.card.on { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
.head { display: grid; grid-template-columns: auto 1fr; column-gap: 0.75rem; row-gap: 0.1rem; align-items: center; cursor: pointer; }
.head input { grid-row: 1 / span 2; margin: 0; width: 1.1rem; height: 1.1rem; accent-color: var(--accent); }
.head input:disabled { cursor: not-allowed; }
.title { font-weight: 600; }
.desc { grid-column: 2; color: var(--text-muted); font-size: 0.9em; }
.body { display: flex; flex-direction: column; gap: 0.6rem; padding-left: 1.85rem; }
.body .settings-hint { margin: 0; }
.uploads { display: flex; flex-wrap: wrap; gap: 0.5rem; }
figure { position: relative; margin: 0; width: 6rem; height: 4rem; }
figure img { width: 100%; height: 100%; object-fit: cover; border-radius: calc(var(--radius) / 1.5); border: 1px solid var(--border); }
.remove { position: absolute; top: 0.2rem; right: 0.2rem; width: 1.4rem; height: 1.4rem; padding: 0; line-height: 1; cursor: pointer; color: #fff; background: rgb(0 0 0 / 0.65); border: none; border-radius: 50%; }
.add { position: relative; text-align: center; display: grid; place-items: center; width: 6rem; height: 4rem; cursor: pointer; color: var(--text-muted); border: 1px dashed var(--border); border-radius: calc(var(--radius) / 1.5); }
.add:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.add input { position: absolute; width: 1px; height: 1px; opacity: 0; }
input[type='text'] { font: inherit; padding: 0.35rem 0.6rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.steps summary { cursor: pointer; color: var(--accent); }
.steps ol { margin: 0.5rem 0; padding-left: 1.25rem; color: var(--text-muted); font-size: 0.9em; }
.key-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.key-row input { flex: 1 1 12rem; min-width: 0; }
.key-row button { font: inherit; padding: 0.35rem 0.8rem; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.key-row button:disabled { opacity: 0.5; cursor: default; }
select { font: inherit; padding: 0.35rem 0.6rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
small { color: var(--text-muted); }
@media (max-width: 480px) { .body { padding-left: 0; } }
</style>
