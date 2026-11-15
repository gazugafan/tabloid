<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useSyncSettings } from '../../composables/useSyncSettings';
import { connectGitHub, createGitHubConfigStore, DEFAULT_GITHUB_PATH } from '../../utils/sync/github/config';

const sync = useSyncSettings();
const connected = computed(() => sync.connected.github);
const location = ref('');
const form = ref({ repo: '', branch: '', path: DEFAULT_GITHUB_PATH, token: '' });

watchEffect(async () => {
  const config = connected.value ? await createGitHubConfigStore().get() : undefined;
  location.value = config ? `${config.repo}/${config.path}` : '';
});

function connect() {
  // Called straight from the submit so the browser accepts the permission prompt.
  void sync.run(async () => {
    await connectGitHub(form.value);
    form.value.token = '';
    await sync.markConnected('github');
  });
}
</script>

<template>
  <div class="settings-notice" role="note">
    <p>Your layout and all widget content are stored as one JSON file in a GitHub repository, with each change saved as a commit (so you get history). The extension talks to GitHub directly.</p>
    <p v-if="connected">Connected to {{ location }}. <button type="button" @click="sync.disconnect('github')">Disconnect</button></p>
    <form v-else class="settings-form" @submit.prevent="connect">
      <label class="settings-field">Repository
        <input v-model="form.repo" type="text" required placeholder="owner/name" autocomplete="off" />
      </label>
      <label class="settings-field">Branch <small>(optional, defaults to the repository's default)</small>
        <input v-model="form.branch" type="text" autocomplete="off" />
      </label>
      <label class="settings-field">File path
        <input v-model="form.path" type="text" autocomplete="off" />
      </label>
      <label class="settings-field">Access token
        <input v-model="form.token" type="password" required autocomplete="off" />
      </label>
      <p class="settings-hint">Use a private repository and a fine-grained personal access token limited to that repository with <em>Contents: read and write</em>. The token is stored on this device only and never synced.</p>
      <button type="submit">Connect</button>
    </form>
  </div>
</template>
