<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import { sanitizeTodoConfig } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:config': [config: WidgetConfig] }>();
const config = computed(() => sanitizeTodoConfig(props.config));
</script>

<template>
  <label class="check">
    <input type="checkbox" :checked="config.doneLast" @change="emit('update:config', { ...config, doneLast: ($event.target as HTMLInputElement).checked })" />
    Move completed tasks to the bottom
  </label>
</template>

<style scoped>
.check { display: flex; align-items: center; gap: 0.4rem; }
</style>
