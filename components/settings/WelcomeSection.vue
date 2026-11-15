<script setup lang="ts">
import { newTabUrl, openPage } from '../../utils/onboarding/links';
</script>

<template>
  <fieldset id="welcome" class="welcome-section">
    <legend>Welcome &amp; tour</legend>
    <p class="hint">New here, or want a fresh start? Run the welcome again to add a few things to your page. Nothing you already have is removed.</p>
    <div class="buttons">
      <button type="button" @click="openPage(newTabUrl('welcome'))">Run the welcome setup again</button>
      <button type="button" @click="openPage(newTabUrl('tour'))">Take the quick tour</button>
    </div>
  </fieldset>
</template>

<style scoped>
.hint { margin: 0 0 0.6rem; color: var(--text-muted); }
.buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
button { font: inherit; padding: 0.4rem 0.9rem; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); cursor: pointer; }
button:hover { background: var(--border); }
</style>
