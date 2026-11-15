<script setup lang="ts">
import { computed } from 'vue';
import { useSyncSettings } from '../../composables/useSyncSettings';
import { connectDropbox } from '../../utils/sync/dropbox/auth';

const sync = useSyncSettings();
const connected = computed(() => sync.connected.dropbox);

function connect() {
  // Called straight from the click so the browser accepts the permission prompt.
  void sync.run(async () => {
    await connectDropbox();
    await sync.markConnected('dropbox');
  });
}
</script>

<template>
  <div class="settings-notice" role="note">
    <p>Your layout and all widget content are stored as one file, <code>tabloid.json</code>, in Tabloid's folder in your Dropbox. The extension talks to Dropbox directly; nothing passes through any other server.</p>
    <p v-if="connected">Connected to Dropbox. <button type="button" @click="sync.disconnect('dropbox')">Disconnect</button></p>
    <button v-else type="button" @click="connect">Connect Dropbox</button>
  </div>
</template>
