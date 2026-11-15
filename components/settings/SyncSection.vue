<script setup lang="ts">
import { onMounted } from 'vue';
import { listLocalOnlyWidgets } from '../widgets/registry';
import { createSyncSettings, provideSyncSettings } from '../../composables/useSyncSettings';
import { REMOTE_PROVIDERS } from '../../utils/sync/providers';
import { REMOTE_PROVIDER_IDS, type RemoteProviderId } from '../../utils/sync/settings';
import Collapse from '../ui/Collapse.vue';
import DropboxPanel from './DropboxPanel.vue';
import GitHubPanel from './GitHubPanel.vue';
import WebDavPanel from './WebDavPanel.vue';

const sync = createSyncSettings();
provideSyncSettings(sync);
const { selected, current, busy, remoteHasData } = sync;
const localOnly = listLocalOnlyWidgets();
const PROVIDER_HINTS: Record<RemoteProviderId, string> = {
  dropbox: 'Your own Dropbox account.',
  webdav: 'Nextcloud, ownCloud or any WebDAV server.',
  github: 'A repository you choose, with a token.',
};

onMounted(sync.refresh);
</script>

<template>
  <fieldset id="sync" :disabled="busy" class="sync-section">
    <legend>Sync</legend>
    <p class="settings-hint">Where Tabloid keeps your layout and settings. Choose how it is kept.</p>
    <Collapse gap="0.6rem">
      <div v-if="selected !== 'none'" class="settings-notice" role="alert">
        <p>Choose this option on each device you want to keep in sync.</p>
      </div>
    </Collapse>

    <div class="choices" role="radiogroup" aria-label="Where to keep your layout">
      <label class="choice" :class="{ on: selected === 'none' }">
        <input v-model="selected" type="radio" value="none" @change="sync.select" />
        <span class="title">This device only</span>
        <span class="desc">Nothing leaves this computer.</span>
      </label>
      <label class="choice" :class="{ on: selected === 'browser' }">
        <input v-model="selected" type="radio" value="browser" @change="sync.select" />
        <span class="title">Browser account</span>
        <span class="desc">Chrome, Firefox, Edge, Vivaldi… Small and automatic.</span>
      </label>
      <label v-for="id in REMOTE_PROVIDER_IDS" :key="id" class="choice" :class="{ on: selected === id }">
        <input v-model="selected" type="radio" :value="id" @change="sync.select" />
        <span class="title">{{ REMOTE_PROVIDERS[id].label }}</span>
        <span class="desc">{{ PROVIDER_HINTS[id] }}</span>
      </label>
    </div>

    <Collapse gap="0.6rem">
    <div v-if="selected === 'browser'" class="settings-notice" role="note">
      <p>Layout and widget positions sync between devices signed into the same browser account. Sync storage is small (about 100&nbsp;KB), so the following widgets keep their content on this device only...</p>
      <ul><li v-for="def in localOnly" :key="def.type">{{ def.name }}</li></ul>
    </div>
    <DropboxPanel v-else-if="selected === 'dropbox'" />
    <WebDavPanel v-else-if="selected === 'webdav'" />
    <GitHubPanel v-else-if="selected === 'github'" />
    </Collapse>

    <Collapse gap="0.6rem">
    <div v-if="remoteHasData" class="settings-notice" role="group" aria-label="Existing synced layout found">
      <p>A layout is already stored there (probably from another device). Which should be used?</p>
      <button type="button" @click="sync.apply(true)">Use the synced layout</button>
      <button type="button" @click="sync.apply(false)">Replace it with this device's layout</button>
    </div>
    <button v-else-if="selected !== current && !sync.needsConnection(selected)" type="button" @click="sync.apply(false)">Apply</button>
    </Collapse>
  </fieldset>
</template>

<style>
.sync-section { display: flex; flex-direction: column; gap: 0.6rem; }
.choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.5rem; }
.choice { display: grid; grid-template-columns: auto 1fr; column-gap: 0.6rem; align-items: center; padding: 0.6rem 0.8rem; cursor: pointer; border: 1px solid var(--border); border-radius: var(--radius); }
.choice.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.choice:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.choice input { grid-row: 1 / span 2; margin: 0; accent-color: var(--accent); }
.choice .title { font-weight: 600; }
.choice .desc { grid-column: 2; color: var(--text-muted); font-size: 0.85em; }
.settings-notice { padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.settings-notice p { margin: 0 0 0.5rem; }
.sync-section button { align-self: flex-start; font: inherit; padding: 0.4rem 0.9rem; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-right: 0.5rem; }
.settings-form { display: flex; flex-direction: column; gap: 0.6rem; }
.sync-section label.settings-field { display: flex; flex-direction: column; align-items: stretch; gap: 0.25rem; }
.settings-field input { font: inherit; padding: 0.4rem 0.6rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
.settings-hint { margin: 0; color: var(--text-muted); font-size: 0.9em; }
.settings-warning { margin: 0; color: var(--danger); }
</style>
