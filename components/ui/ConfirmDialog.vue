<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title: string; confirmLabel: string }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open && !dialog.value?.open) {
      dialog.value?.showModal();
      // When the page is shown inside a taller frame (Firefox's add-ons page), make sure the dialog is in view.
      dialog.value?.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    if (!open && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="confirm" aria-labelledby="confirm-title" @cancel.prevent="emit('cancel')" @click.self="emit('cancel')">
      <h2 id="confirm-title">{{ title }}</h2>
      <div class="body"><slot /></div>
      <footer>
        <button type="button" @click="emit('cancel')">Cancel</button>
        <button type="button" class="primary" @click="emit('confirm')">{{ confirmLabel }}</button>
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.confirm {
  width: min(30rem, calc(100vw - 2rem)); padding: 1.1rem 1.25rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 12px 48px rgb(0 0 0 / 0.35);
}
.confirm::backdrop { background: rgb(0 0 0 / 0.5); }
h2 { margin: 0 0 0.6rem; font-size: 1.1rem; }
.body { display: flex; flex-direction: column; gap: 0.6rem; }
footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
button { font: inherit; padding: 0.4rem 1rem; cursor: pointer; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5); }
button:hover { background: var(--border); }
button.primary { color: var(--on-accent); background: var(--accent); border-color: transparent; font-weight: 600; }
button.primary:hover { filter: brightness(1.1); background: var(--accent); }
</style>
