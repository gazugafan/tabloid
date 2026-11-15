<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Icon from './Icon.vue';

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);

// Mount it to show it (use v-if). Closing is always announced, whether by the X, Escape or a click outside.
onMounted(() => {
  const el = dialog.value;
  if (!el) return;
  if (typeof el.showModal === 'function') el.showModal();
  else el.setAttribute('open', '');
});
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="settings-dialog" aria-labelledby="settings-dialog-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
      <header>
        <h2 id="settings-dialog-title">{{ title }}</h2>
        <button type="button" class="close" title="Close" aria-label="Close settings" @click="emit('close')"><Icon name="close" /></button>
      </header>
      <div class="content"><slot /></div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.settings-dialog {
  display: flex; flex-direction: column; width: min(32rem, calc(100vw - 2rem)); max-height: min(44rem, calc(100dvh - 2rem)); padding: 0;
  color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 12px 48px rgb(0 0 0 / 0.35);
}
.settings-dialog:not([open]) { display: none; }
.settings-dialog::backdrop { background: rgb(0 0 0 / 0.5); }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.8rem 1rem 0.8rem 1.25rem; border-bottom: 1px solid var(--border); }
h2 { margin: 0; font-size: 1.1rem; }
.close { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; padding: 0; color: var(--text-muted); background: none; border: 0; border-radius: calc(var(--radius) / 2); cursor: pointer; }
.close:hover { color: var(--text); background: var(--border); }
.close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.content { display: flex; flex-direction: column; gap: 0.75rem; min-height: 0; overflow-y: auto; padding: 1rem 1.25rem 1.25rem; }
</style>
