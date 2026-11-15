<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { listWidgetDefinitions } from '../widgets/registry';
import Icon from './Icon.vue';

const emit = defineEmits<{ add: [type: string] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const definitions = listWidgetDefinitions();

function onDocumentPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false;
}
document.addEventListener('pointerdown', onDocumentPointerDown);
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));

function choose(type: string) {
  emit('add', type);
  open.value = false;
}
</script>

<template>
  <div ref="root" class="add-menu" @keydown="onKeydown">
    <button type="button" class="icon-button" data-tour="add" title="Add widget" aria-label="Add widget" aria-haspopup="menu" :aria-expanded="open" @click="open = !open">
      <Icon name="plus" />
    </button>
    <Transition name="menu">
    <ul v-if="open" class="menu" role="menu">
      <li v-for="def in definitions" :key="def.type" role="none">
        <button type="button" role="menuitem" @click="choose(def.type)">{{ def.name }}</button>
      </li>
    </ul>
    </Transition>
  </div>
</template>

<style scoped>
.add-menu { position: relative; }
.menu {
  position: absolute; right: 0; top: calc(100% + 0.4rem); z-index: 10; min-width: 10rem; margin: 0; padding: 0.3rem;
  list-style: none; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: 0 6px 24px rgb(0 0 0 / 0.2);
}
.menu-enter-active, .menu-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; transform-origin: top right; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-4px) scale(0.97); }
.menu button {
  width: 100%; text-align: left; font: inherit; padding: 0.45rem 0.7rem; cursor: pointer;
  color: var(--text); background: none; border: 0; border-radius: calc(var(--radius) / 1.5);
}
.menu button:hover, .menu button:focus-visible { background: var(--surface-raised); }
</style>
