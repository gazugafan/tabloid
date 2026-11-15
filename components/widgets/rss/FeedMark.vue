<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ color: string; icon?: string; mode: 'dot' | 'icon' }>();

/** An icon that fails to load (or doesn't exist) quietly falls back to the colored dot. */
const failed = ref(false);
watch(() => props.icon, () => (failed.value = false));
</script>

<template>
  <img v-if="mode === 'icon' && icon && !failed" class="mark icon" :src="icon" alt="" referrerpolicy="no-referrer" draggable="false" @error="failed = true" />
  <i v-else class="mark dot" :style="{ background: color }" aria-hidden="true" />
</template>

<style scoped>
.mark { flex: none; }
.dot { width: 0.55rem; height: 0.55rem; border-radius: 50%; }
.icon { width: 0.95rem; height: 0.95rem; border-radius: 3px; object-fit: contain; }
</style>
