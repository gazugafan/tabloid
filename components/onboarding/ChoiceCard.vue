<script setup lang="ts">
/** A big, friendly choice: a native radio or checkbox underneath, so keyboards and screen readers just work. */
defineProps<{ type: 'radio' | 'checkbox'; name?: string; checked: boolean; emoji?: string; title: string; about?: string }>();
const emit = defineEmits<{ change: [checked: boolean] }>();
</script>

<template>
  <label class="card" :class="{ checked }">
    <input :type="type" :name="name" :checked="checked" @change="emit('change', ($event.target as HTMLInputElement).checked)" />
    <span v-if="emoji" class="emoji" aria-hidden="true">{{ emoji }}</span>
    <span class="text">
      <strong>{{ title }}</strong>
      <small v-if="about">{{ about }}</small>
    </span>
    <span class="tick" aria-hidden="true">✓</span>
    <slot />
  </label>
</template>

<style scoped>
.card {
  position: relative; display: flex; align-items: center; gap: 0.75rem; padding: 0.8rem 1rem; cursor: pointer; text-align: left;
  background: var(--surface-raised); border: 2px solid var(--border); border-radius: var(--radius); transition: border-color 0.15s, transform 0.15s;
}
.card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.card.checked { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface-raised)); }
.card:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
input { position: absolute; opacity: 0; pointer-events: none; }
.emoji { font-size: 1.8rem; line-height: 1; flex: none; }
.text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; flex: 1; }
.text strong { font-size: 1.05em; }
.text small { color: var(--text-muted); font-size: 0.9em; }
.tick { flex: none; width: 1.4rem; height: 1.4rem; display: grid; place-items: center; border-radius: 50%; font-size: 0.85em; font-weight: 700; color: transparent; border: 2px solid var(--border); }
.checked .tick { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
@media (prefers-reduced-motion: no-preference) { .card:active { transform: scale(0.99); } }
</style>
