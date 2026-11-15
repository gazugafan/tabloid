<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useSyncSettings } from '../../composables/useSyncSettings';
import { connectWebDav, createWebDavConfigStore, isInsecureWebDavUrl } from '../../utils/sync/webdav/config';

const sync = useSyncSettings();
const connected = computed(() => sync.connected.webdav);
const host = ref('');
const form = ref({ url: '', username: '', password: '' });

watchEffect(async () => {
  const config = connected.value ? await createWebDavConfigStore().get() : undefined;
  host.value = config ? new URL(config.url).host : '';
});

function connect() {
  // Called straight from the submit so the browser accepts the permission prompt.
  void sync.run(async () => {
    await connectWebDav(form.value);
    form.value.password = '';
    await sync.markConnected('webdav');
  });
}
</script>

<template>
  <div class="settings-notice" role="note">
    <p>Your layout and all widget content are stored as one file, <code>tabloid.json</code>, in a folder on your WebDAV server. The extension talks to the server directly.</p>
    <p v-if="connected">Connected to {{ host }}. <button type="button" @click="sync.disconnect('webdav')">Disconnect</button></p>
    <form v-else class="settings-form" @submit.prevent="connect">
      <label class="settings-field">Folder address
        <input v-model="form.url" type="url" required placeholder="https://cloud.example.com/remote.php/dav/files/me/Tabloid/" autocomplete="off" />
      </label>
      <label class="settings-field">Username
        <input v-model="form.username" type="text" required autocomplete="username" />
      </label>
      <label class="settings-field">Password
        <input v-model="form.password" type="password" required autocomplete="current-password" />
      </label>
      <p class="settings-hint">Use an app password if your server offers them. It's stored on this device only and never synced.</p>
      <p v-if="isInsecureWebDavUrl(form.url)" class="settings-warning" role="alert">This address isn't encrypted (http://), so your password will be sent in the clear.</p>
      <button type="submit">Connect</button>
    </form>
  </div>
</template>
