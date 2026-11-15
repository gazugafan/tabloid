<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import OnboardingWizard from '../../components/onboarding/OnboardingWizard.vue';
import TourCoach from '../../components/onboarding/TourCoach.vue';
import AddWidgetMenu from '../../components/ui/AddWidgetMenu.vue';
import BackgroundLayer from '../../components/ui/BackgroundLayer.vue';
import AppToaster from '../../components/ui/AppToaster.vue';
import DashboardGrid from '../../components/ui/DashboardGrid.vue';
import DashboardTabs from '../../components/ui/DashboardTabs.vue';
import Icon from '../../components/ui/Icon.vue';
import { useAppearance } from '../../composables/useAppearance';
import { BACKGROUND_KEY, useBackground } from '../../composables/useBackground';
import { useErrorToasts } from '../../composables/useErrorToasts';
import { useFrameRules } from '../../composables/useFrameRules';
import { useLayoutLock } from '../../composables/useLayoutLock';
import { useLayoutStore } from '../../stores/layout';
import { openPage, optionsUrl } from '../../utils/onboarding/links';
import { createOnboardingState, shouldWelcome } from '../../utils/onboarding/state';

const store = useLayoutStore();
useErrorToasts();
const { preferences, loaded, activeId, activeDashboard, widgets } = storeToRefs(store);
useFrameRules(widgets, loaded);
useAppearance(preferences, loaded);
// A dashboard can have its own background; otherwise the general settings apply.
const backgroundSettings = computed(() => activeDashboard.value?.background ?? preferences.value[BACKGROUND_KEY]);
const background = useBackground(backgroundSettings, loaded, activeId);
// Unlocked by default: widgets can be moved, resized and removed. Locking freezes the layout, and is remembered on this device.
const locked = useLayoutLock();

// The welcome appears on a device that has never seen it and has an empty dashboard, or when asked for
// (?welcome and ?tour come from the settings page).
const onboarding = createOnboardingState();
const showWelcome = ref(false);
const showTour = ref(false);
const requested = new URLSearchParams(location.search);
const wantsWelcome = requested.has('welcome');
const wantsTour = requested.has('tour');
if (wantsWelcome || wantsTour) history.replaceState(null, '', location.pathname);

watch(loaded, async (ready) => {
  if (!ready) return;
  if (wantsWelcome) showWelcome.value = true;
  else if (wantsTour) showTour.value = true;
  else if (shouldWelcome(await onboarding.isDone(), store.widgets.length)) showWelcome.value = true;
}, { once: true });

function closeWelcome(startTour: boolean) {
  showWelcome.value = false;
  void onboarding.markDone();
  if (startTour) showTour.value = true;
}

const openSettings = () => openPage(optionsUrl());

onMounted(() => store.init());
onBeforeUnmount(() => store.dispose());
</script>

<template>
  <header class="toolbar">
    <DashboardTabs v-if="store.loaded" :locked="locked" class="dashboard-tabs" data-tour="tabs" />
    <span v-else class="spacer" />
    <AddWidgetMenu @add="store.addWidget($event)" />
    <button
      type="button"
      class="icon-button"
      :aria-pressed="locked"
      :aria-label="locked ? 'Unlock layout' : 'Lock layout'"
      :title="locked ? 'Layout locked' : 'Layout unlocked'"
      data-tour="lock"
      @click="locked = !locked"
    >
      <Icon :name="locked ? 'lock' : 'unlock'" />
    </button>
    <button type="button" class="icon-button" data-tour="settings" aria-label="Settings" title="Settings" @click="openSettings">
      <Icon name="cog" />
    </button>
  </header>
  <BackgroundLayer :url="background.url.value" :dim="background.dim.value" :blur="background.blur.value" :credit="background.credit.value" />
  <AppToaster />
  <OnboardingWizard v-if="showWelcome" @close="closeWelcome" />
  <TourCoach v-if="showTour" @close="showTour = false" />
  <main>
    <Transition name="dashboard" mode="out-in">
      <DashboardGrid v-if="store.loaded" :key="store.activeId" :locked="locked" />
    </Transition>
  </main>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem 0; }
.dashboard-enter-active, .dashboard-leave-active { transition: opacity 0.15s ease; }
.dashboard-enter-from, .dashboard-leave-to { opacity: 0; }
.dashboard-tabs, .spacer { flex: 1; min-width: 0; }
main { padding: 0 0 1rem 0; }
</style>

<style>
/* The new tab page is a dashboard, not a document: dragging around or pressing Ctrl+A shouldn't
   highlight text. Things people copy from (text fields, error messages) stay selectable. */
body { -webkit-user-select: none; user-select: none; }
input, textarea, select, [contenteditable], [data-sonner-toast], .selectable { -webkit-user-select: text; user-select: text; }

/* Widgets can briefly be dragged or resized past the right edge; never show a scrollbar for that. */
html, body { overflow-x: clip; }
</style>
