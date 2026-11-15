<script setup lang="ts">
import { TOPICS, type OnboardingChoices } from '../../utils/onboarding/choices';
import ChoiceCard from './ChoiceCard.vue';

const choices = defineModel<OnboardingChoices>({ required: true });

function toggle(id: string, on: boolean) {
  const rest = choices.value.topics.filter((t) => t !== id);
  choices.value = { ...choices.value, topics: on ? [...rest, id] : rest };
}
</script>

<template>
  <div class="step">
    <p class="lead">Pick as many as you like. Each one becomes a box of headlines on your page, from well-known websites we've chosen for you. You can change them any time.</p>
    <div class="grid">
      <ChoiceCard v-for="t in TOPICS" :key="t.id" type="checkbox" :checked="choices.topics.includes(t.id)" :emoji="t.emoji" :title="t.id" :about="t.about" @change="toggle(t.id, $event)" />
    </div>
    <p v-if="!choices.topics.length" class="note">Not into news? No problem. Just press <em>Next</em> to skip this part.</p>
  </div>
</template>

<style scoped>
.step { display: flex; flex-direction: column; gap: 1rem; }
.lead { margin: 0; color: var(--text-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.6rem; }
.note { margin: 0; padding: 0.75rem 1rem; background: color-mix(in srgb, var(--accent) 10%, var(--surface-raised)); border-radius: var(--radius); }
</style>
