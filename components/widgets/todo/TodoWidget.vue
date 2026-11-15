<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WidgetConfig } from '../../../types/layout';
import Icon from '../../ui/Icon.vue';
import { MAX_TODOS, MAX_TODO_LENGTH, orderedTodos, sanitizeTodoConfig } from './config';

const props = defineProps<{ config: WidgetConfig }>();
const emit = defineEmits<{ 'update:config': [config: WidgetConfig] }>();

const config = computed(() => sanitizeTodoConfig(props.config));
const shown = computed(() => orderedTodos(config.value));
const remaining = computed(() => config.value.items.filter((i) => !i.done).length);
const draft = ref('');

const save = (items = config.value.items) => emit('update:config', { ...config.value, items });

function add() {
  const text = draft.value.trim();
  if (!text || config.value.items.length >= MAX_TODOS) return;
  save([{ id: crypto.randomUUID(), text, done: false }, ...config.value.items].slice(0, MAX_TODOS));
  draft.value = '';
}
const toggle = (id: string) => save(config.value.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
const remove = (id: string) => save(config.value.items.filter((i) => i.id !== id));
const clearDone = () => save(config.value.items.filter((i) => !i.done));
</script>

<template>
  <div class="todo">
    <form @submit.prevent="add">
      <input v-model="draft" type="text" placeholder="Add a task…" aria-label="New task" :maxlength="MAX_TODO_LENGTH" autocomplete="off" />
    </form>
    <ul v-if="shown.length" class="items">
      <li v-for="item in shown" :key="item.id" :class="{ done: item.done }">
        <label>
          <input type="checkbox" :checked="item.done" @change="toggle(item.id)" />
          <span class="text">{{ item.text }}</span>
        </label>
        <button type="button" class="remove" :aria-label="`Delete ${item.text}`" @click="remove(item.id)"><Icon name="close" /></button>
      </li>
    </ul>
    <p v-else class="empty">Nothing to do. Enjoy!</p>
    <footer v-if="config.items.length">
      <span>{{ remaining }} left</span>
      <button v-if="remaining < config.items.length" type="button" @click="clearDone">Clear completed</button>
    </footer>
  </div>
</template>

<style scoped>
.todo { display: flex; flex-direction: column; gap: 0.5rem; height: 100%; min-height: 0; }
form input {
  width: 100%; font: inherit; padding: 0.4rem 0.6rem; color: var(--text); background: color-mix(in srgb, var(--bg) calc(var(--surface-opacity, 1) * 100%), transparent); backdrop-filter: blur(var(--surface-blur, 0px));
  border: 1px solid var(--border); border-radius: calc(var(--radius) / 1.5);
}
.items { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; overflow-y: auto; scrollbar-width: thin; }
li { display: flex; align-items: flex-start; gap: 0.4rem; padding: 0.2rem 0; }
li label { display: flex; align-items: flex-start; gap: 0.5rem; flex: 1; min-width: 0; cursor: pointer; }
li input { margin-top: 0.15em; accent-color: var(--accent); }
.text { overflow-wrap: anywhere; }
.done .text { color: var(--text-muted); text-decoration: line-through; }
.remove { display: grid; place-items: center; flex: none; padding: 0.15rem; color: var(--text-muted); background: none; border: 0; border-radius: 50%; cursor: pointer; opacity: 0; }
li:hover .remove, .remove:focus-visible { opacity: 1; }
.remove:hover { color: var(--danger); }
@media (hover: none) { .remove { opacity: 1; } }
.empty { flex: 1; margin: 0; display: grid; place-content: center; color: var(--text-muted); }
footer { display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); font-size: 0.9em; }
footer button { font: inherit; color: var(--text-muted); background: none; border: 0; cursor: pointer; text-decoration: underline; }
footer button:hover { color: var(--text); }
</style>
