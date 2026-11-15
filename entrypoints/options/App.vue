<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppToaster from '../../components/ui/AppToaster.vue';
import AppearanceSection from '../../components/settings/AppearanceSection.vue';
import BackgroundSection from '../../components/settings/BackgroundSection.vue';
import DataSection from '../../components/settings/DataSection.vue';
import SyncSection from '../../components/settings/SyncSection.vue';
import WelcomeSection from '../../components/settings/WelcomeSection.vue';
import { SETTINGS_PANELS, panelForHash } from '../../utils/settingsPanels';

/** One panel is shown at a time; the URL hash (options.html#sync) picks it and keeps links working. */
const active = ref(panelForHash(location.hash).id);

async function scrollToHash() {
  const id = location.hash.slice(1);
  await nextTick();
  const target = id && id !== active.value ? document.getElementById(id) : null;
  if (target) target.scrollIntoView({ block: 'start' });
  else window.scrollTo({ top: 0 });
}

function show(id: string) {
  active.value = id;
  history.replaceState(null, '', `#${id}`);
  window.scrollTo({ top: 0 });
}

function onHashChange() {
  active.value = panelForHash(location.hash).id;
  void scrollToHash();
}

onMounted(() => {
  window.addEventListener('hashchange', onHashChange);
  // Sections load their data first, so give them a moment before scrolling to a section inside a panel.
  if (location.hash) setTimeout(scrollToHash, 100);
});
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange));
</script>

<template>
  <AppToaster />
  <div class="settings-page">
    <header>
      <h1>Tabloid settings</h1>
      <nav aria-label="Settings sections">
        <a
          v-for="panel in SETTINGS_PANELS"
          :key="panel.id"
          :href="`#${panel.id}`"
          :aria-current="active === panel.id ? 'page' : undefined"
          @click.prevent="show(panel.id)"
        >{{ panel.label }}</a>
      </nav>
    </header>
    <main class="settings-panel">
      <div v-show="active === 'appearance'"><AppearanceSection /></div>
      <div v-show="active === 'background'"><BackgroundSection /></div>
      <div v-show="active === 'sync'"><SyncSection /><DataSection /></div>
      <div v-show="active === 'help'"><WelcomeSection /></div>
    </main>
  </div>
</template>

<style scoped>
.settings-page { display: grid; grid-template-columns: 12rem minmax(0, 1fr); column-gap: 2rem; max-width: 58rem; margin: 0 auto; padding: 1.5rem 1rem; }
header { display: contents; }
h1 { grid-column: 1 / -1; margin: 0 0 1rem; font-size: 1.5rem; }
nav { display: flex; flex-direction: column; gap: 0.15rem; align-self: start; position: sticky; top: 1rem; }
nav a { padding: 0.5rem 0.75rem; color: var(--text); text-decoration: none; border-radius: calc(var(--radius) / 1.5); }
nav a:hover { background: var(--surface); }
nav a[aria-current='page'] { font-weight: 600; background: var(--surface-raised); box-shadow: inset 3px 0 0 var(--accent); }
nav a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
main { min-width: 0; }

/* Phones and the small frame some browsers show inside their add-ons page: the list becomes a row of tabs on top. */
@media (max-width: 720px) {
  .settings-page { display: block; padding: 1rem 0.75rem; }
  header { display: block; position: sticky; top: 0; z-index: 5; margin: -1rem -0.75rem 1rem; padding: 0.75rem 0.75rem 0; background: var(--bg); border-bottom: 1px solid var(--border); }
  h1 { margin-bottom: 0.5rem; font-size: 1.25rem; }
  nav { flex-direction: row; position: static; overflow-x: auto; scrollbar-width: none; gap: 0.25rem; }
  nav a { flex: none; white-space: nowrap; border-radius: calc(var(--radius) / 1.5) calc(var(--radius) / 1.5) 0 0; }
  nav a[aria-current='page'] { box-shadow: inset 0 -3px 0 var(--accent); }
}
</style>

<style>
/* Shared look of every settings section: a heading and its controls, no box. */
.settings-panel fieldset { min-width: 0; margin: 0 0 2rem; padding: 0; border: 0; }
.settings-panel legend { padding: 0; margin-bottom: 0.75rem; font-size: 1.2rem; font-weight: 600; }
.settings-panel h3 { margin: 0.5rem 0 0; font-size: 0.95rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.settings-panel select, .settings-panel input[type='text'] { max-width: 100%; }
.settings-panel input[type='range'] { min-width: 0; max-width: 100%; flex: 1 1 8rem; }
</style>
