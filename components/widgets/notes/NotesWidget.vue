<script setup lang="ts">
type NotesConfig = { text?: string };

const props = defineProps<{ config: NotesConfig }>();
const emit = defineEmits<{ 'update:config': [config: NotesConfig] }>();

function onInput(event: Event) {
  emit('update:config', { ...props.config, text: (event.target as HTMLTextAreaElement).value });
}
</script>

<template>
  <textarea class="notes" :value="config.text" placeholder="Write a note…" aria-label="Notes" @input="onInput" />
</template>

<style scoped>
.notes {
  width: 100%; height: 100%; resize: none; border: 0; padding: 0; background: transparent;
  color: inherit; font: inherit; outline: none; border-radius: calc(var(--radius) / 2);
}
/* The note has no box of its own, so show keyboard focus just outside the text. */
.notes:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
</style>
