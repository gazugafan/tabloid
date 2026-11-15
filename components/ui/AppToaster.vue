<script setup lang="ts">
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';

// Small screens: full-width, inset from the edges (and clear of a phone's home indicator).
const mobileOffset = { left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))' };
</script>

<template>
  <!-- Bottom-right on desktop; the library switches to a full-width bottom stack on small screens. -->
  <Toaster position="bottom-right" theme="system" rich-colors :visible-toasts="4" :mobile-offset="mobileOffset" class="app-toaster" />
</template>

<style>
.app-toaster {
  --normal-bg: var(--surface);
  --normal-text: var(--text);
  --normal-border: var(--border);
  --border-radius: var(--radius);
  font-family: var(--font);
}
</style>
