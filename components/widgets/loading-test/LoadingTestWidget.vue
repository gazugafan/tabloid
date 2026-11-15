<script setup lang="ts">
import { ref, watch } from 'vue';

defineProps<{ config: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:config': [config: Record<string, unknown>]; 'update:loading': [loading: boolean] }>();

const loading = ref(false);
watch(loading, (value) => emit('update:loading', value));
</script>

<template>
  <div class="loading-test">
    <button type="button" :aria-pressed="loading" @click="loading = !loading">
      {{ loading ? 'Stop loading' : 'Start loading' }}
    </button>
  </div>
</template>

<style scoped>
.loading-test { height: 100%; display: grid; place-items: center; }
button {
  font: inherit; padding: 0.5rem 1rem; cursor: pointer; color: var(--text); background: var(--surface-raised);
  border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5);
}
button:hover { background: var(--border); }
</style>
