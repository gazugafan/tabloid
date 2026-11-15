<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { APPEARANCE_KEY } from '../../composables/useAppearance';
import { BACKGROUND_KEY } from '../../composables/useBackground';
import { useLayoutStore } from '../../stores/layout';
import { DEFAULT_CHOICES, QUICK_SITES, TOPICS, WIDGET_OPTIONS, type OnboardingChoices } from '../../utils/onboarding/choices';
import { openPage, optionsUrl } from '../../utils/onboarding/links';
import { buildPlan } from '../../utils/onboarding/plan';
import { requestBackgroundAccess } from '../../utils/onboarding/access';
import { requestFeedAccess } from '../../utils/rss/permissions';
import StepLook from './StepLook.vue';
import StepNews from './StepNews.vue';
import StepWidgets from './StepWidgets.vue';

const emit = defineEmits<{ close: [startTour: boolean] }>();

const store = useLayoutStore();
const { preferences } = storeToRefs(store);

type StepId = 'welcome' | 'start' | 'look' | 'news' | 'widgets' | 'review' | 'done';
const steps: StepId[] = ['welcome', 'start', 'look', 'news', 'widgets', 'review', 'done'];
const titles: Record<StepId, string> = {
  welcome: 'Welcome to Tabloid! 👋',
  start: 'Where are you starting from?',
  look: 'Make it look like you',
  news: 'What do you like to read about?',
  widgets: 'What would you like on your page?',
  review: 'Ready to build your page?',
  done: 'Your page is ready! 🎉',
};

const index = ref(0);
const step = computed(() => steps[index.value]!);
/** The numbered steps shown in the progress bar (the welcome, the starting question and the final screen don't count). */
const numbered: StepId[] = ['look', 'news', 'widgets', 'review'];
const position = computed(() => numbered.indexOf(step.value) + 1);

const choices = ref<OnboardingChoices>({ ...DEFAULT_CHOICES, topics: [], widgets: [...DEFAULT_CHOICES.widgets], sites: [...DEFAULT_CHOICES.sites] });
const newsAllowed = ref<boolean | null>(null);
const photoDeclined = ref(false);
const building = ref(false);

// The page itself changes as the look is chosen, so people see what they are getting.
// A photo is only shown once the browser has allowed it (that is asked when Next is pressed), so
// choosing one doesn't try to download anything yet.
const allowedPhotos = ref(new Set<string>());
function applyLook() {
  const { background } = choices.value;
  const shown = background === 'plain' || allowedPhotos.value.has(background) ? background : 'plain';
  const plan = buildPlan({ ...choices.value, background: shown }, { appearance: preferences.value[APPEARANCE_KEY], background: preferences.value[BACKGROUND_KEY] });
  store.setPreference(APPEARANCE_KEY, plan.appearance);
  store.setPreference(BACKGROUND_KEY, plan.background);
}
watch(() => [choices.value.mode, choices.value.accent, choices.value.background] as const, applyLook);

const heading = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);
async function go(by: number) {
  index.value = Math.min(steps.length - 1, Math.max(0, index.value + by));
  await nextTick();
  heading.value?.focus();
  root.value?.querySelector('.body')?.scrollTo({ top: 0 });
}

function next() {
  // The browser only shows its permission prompt in response to a click, so ask first, before anything else.
  // The pre-selected photo background hasn't been asked about yet; ask now, from this click.
  if (step.value === 'look') {
    const { background } = choices.value;
    requestBackgroundAccess(background).then(() => {
      allowedPhotos.value.add(background);
      applyLook();
    }, () => {
      choices.value = { ...choices.value, background: 'plain' };
      photoDeclined.value = true;
    });
  }
  if (step.value === 'news' && choices.value.topics.length > 0) {
    requestFeedAccess().then(
      () => (newsAllowed.value = true),
      () => (newsAllowed.value = false),
    );
  }
  void go(1);
}

function build() {
  building.value = true;
  const plan = buildPlan(choices.value, { appearance: preferences.value[APPEARANCE_KEY], background: preferences.value[BACKGROUND_KEY] });
  store.setPreference(APPEARANCE_KEY, plan.appearance);
  store.setPreference(BACKGROUND_KEY, plan.background);
  store.addWidgets(plan.widgets);
  building.value = false;
  void go(1);
}

function openSettings(section: string) {
  openPage(optionsUrl(section));
}
/** Someone who already has a backup or feeds goes to settings; the welcome can be run again later. */
function restoreInstead() {
  openSettings('data');
  emit('close', false);
}

// Keep Tab inside the welcome while it is open.
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !root.value) return;
  const focusable = [...root.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.value)) {
    last.focus();
    event.preventDefault();
  } else if (!event.shiftKey && document.activeElement === last) {
    first.focus();
    event.preventDefault();
  }
}

const previouslyFocused = document.activeElement as HTMLElement | null;
onMounted(() => heading.value?.focus());
onBeforeUnmount(() => previouslyFocused?.focus?.());

const summary = computed(() => {
  const c = choices.value;
  const widgets = WIDGET_OPTIONS.filter((w) => c.widgets.includes(w.id));
  return {
    widgets: widgets.map((w) => w.name),
    topics: TOPICS.filter((t) => c.topics.includes(t.id)).map((t) => t.id),
    sites: QUICK_SITES.filter((s) => c.sites.includes(s.id) && c.widgets.includes('bookmarks')).length,
    place: c.widgets.includes('weather') ? c.place?.name : undefined,
  };
});
/** A heads-up shown above the buttons (never scrolled out of sight) when Next will make the browser ask for permission. */
const permissionNote = computed(() => {
  if (step.value === 'look' && choices.value.background !== 'plain') {
    return { lead: 'Heads up!', text: 'When you press Next, your browser will ask if Tabloid may download the daily photo from the internet. Please say yes to see it behind your page. If you would rather not, choose a plain color.' };
  }
  if (step.value === 'news' && choices.value.topics.length > 0) {
    return { lead: 'Heads up!', text: 'When you press Next, your browser will ask if Tabloid may read these news websites. Please say yes. It is how the headlines arrive, and nothing about you is sent to anyone.' };
  }
  return null;
});
const empty = computed(() => summary.value.widgets.length === 0 && summary.value.topics.length === 0);
</script>

<template>
  <div class="overlay">
    <div ref="root" class="wizard" role="dialog" aria-modal="true" aria-labelledby="welcome-title" @keydown="trapFocus">
      <header v-if="position" class="progress">
        <span class="count">Step {{ position }} of {{ numbered.length }}</span>
        <ol aria-hidden="true">
          <li v-for="n in numbered.length" :key="n" :class="{ done: n < position, current: n === position }" />
        </ol>
      </header>

      <div class="body">
        <h2 id="welcome-title" ref="heading" tabindex="-1">{{ titles[step] }}</h2>

        <section v-if="step === 'welcome'" class="intro">
          <p class="big">Let's turn your new tab page into something you'll enjoy opening: your news, weather, favorite sites and more, all in one place.</p>
          <ul class="points">
            <li>⏱️ It takes about two minutes.</li>
            <li>✏️ You can change anything later.</li>
            <li>🔒 Your information stays on your computer. Nothing is sent anywhere unless you choose to.</li>
          </ul>
        </section>

        <section v-else-if="step === 'start'" class="start">
          <button type="button" class="option primary-option" @click="go(1)">
            <span class="emoji" aria-hidden="true">✨</span>
            <span><strong>Start fresh</strong><small>Answer a few quick questions and we'll set everything up for you.</small></span>
          </button>
          <button type="button" class="option" @click="restoreInstead">
            <span class="emoji" aria-hidden="true">📦</span>
            <span><strong>I have a backup or a list of feeds</strong><small>Bring in a saved Tabloid setup, or feeds from another news reader. We'll open the settings page for that.</small></span>
          </button>
        </section>

        <StepLook v-else-if="step === 'look'" v-model="choices" />
        <StepNews v-else-if="step === 'news'" v-model="choices" />
        <StepWidgets v-else-if="step === 'widgets'" v-model="choices" />

        <section v-else-if="step === 'review'" class="review">
          <p class="big">Here's what we'll add to your page:</p>
          <ul v-if="!empty" class="summary">
            <li v-if="summary.widgets.length">🧩 <span><strong>Widgets:</strong> {{ summary.widgets.join(', ') }}<template v-if="summary.place"> (weather for {{ summary.place }})</template></span></li>
            <li v-if="summary.topics.length">📰 <span><strong>Headlines:</strong> {{ summary.topics.join(', ') }}</span></li>
          </ul>
          <p v-else class="note">Nothing yet. That's fine: your page will start empty and you can add widgets with the + button.</p>
          <p v-if="summary.topics.length && newsAllowed === false" class="note" role="note">
            Tabloid wasn't allowed to read the news websites, so the headlines will wait. Each news box has an <em>Allow</em> button whenever you change your mind.
          </p>
          <p v-if="photoDeclined" class="note" role="note">
            Tabloid wasn't allowed to download the daily photo, so your page has a plain color for now. You can pick a photo any time in settings.
          </p>
          <p class="hint">Not quite right? Press <em>Back</em> to change anything.</p>
        </section>

        <section v-else class="finish">
          <p class="big">Everything is in place. Take a look around, or let us show you the basics first.</p>
          <ul class="points">
            <li>🔄 <span>Use Tabloid on more than one computer? You can keep them in step with <button type="button" class="link" @click="openSettings('sync')">sync</button>.</span></li>
            <li>⚙️ <span>Find <em>Settings</em> any time with the gear button at the top right.</span></li>
          </ul>
        </section>
      </div>

      <p v-if="permissionNote" class="note permission" role="note"><strong>👉 {{ permissionNote.lead }}</strong> {{ permissionNote.text }}</p>

      <footer class="nav">
        <template v-if="step === 'welcome'">
          <button type="button" class="link" @click="emit('close', false)">Skip for now</button>
          <button type="button" class="primary" @click="go(1)">Let's get started →</button>
        </template>
        <template v-else-if="step === 'start'">
          <button type="button" class="ghost" @click="go(-1)">← Back</button>
        </template>
        <template v-else-if="step === 'review'">
          <button type="button" class="ghost" @click="go(-1)">← Back</button>
          <button type="button" class="primary" :disabled="building" @click="build">{{ empty ? 'Finish' : 'Create my page' }}</button>
        </template>
        <template v-else-if="step === 'done'">
          <button type="button" class="ghost" @click="emit('close', false)">Go to my page</button>
          <button type="button" class="primary" @click="emit('close', true)">Show me around →</button>
        </template>
        <template v-else>
          <button type="button" class="ghost" @click="go(-1)">← Back</button>
          <button type="button" class="link skip" @click="emit('close', false)">Skip setup</button>
          <button type="button" class="primary" @click="next">Next →</button>
        </template>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 1rem; overflow: auto;
  background: color-mix(in srgb, var(--bg) 55%, transparent); backdrop-filter: blur(6px);
}
.wizard {
  display: flex; flex-direction: column; width: min(46rem, 100%); max-height: min(44rem, calc(100dvh - 2rem)); font-size: 1.1rem;
  color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.5); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}
@media (prefers-reduced-motion: no-preference) { .wizard { animation: rise 0.3s ease-out; } }
@keyframes rise { from { opacity: 0; transform: translateY(12px); } }
.progress { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.5rem 0; color: var(--text-muted); font-size: 0.85em; }
.progress ol { display: flex; gap: 0.35rem; margin: 0; padding: 0; list-style: none; }
.progress li { width: 1.6rem; height: 0.35rem; border-radius: 999px; background: var(--border); }
.progress li.done { background: color-mix(in srgb, var(--accent) 55%, var(--border)); }
.progress li.current { background: var(--accent); }
.body { flex: 1; min-height: 0; overflow-y: auto; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
h2 { margin: 0; font-size: 1.7rem; line-height: 1.2; outline: none; }
.big { margin: 0; font-size: 1.15em; line-height: 1.5; }
.points, .summary { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
.points li, .summary li { display: flex; gap: 0.6rem; line-height: 1.4; }
.intro, .finish, .review, .start { display: flex; flex-direction: column; gap: 1rem; }
.start { gap: 0.75rem; }
.option { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.1rem; font: inherit; color: inherit; text-align: left; cursor: pointer; background: var(--surface-raised); border: 2px solid var(--border); border-radius: var(--radius); }
.option:hover, .option:focus-visible { border-color: var(--accent); }
.option span:last-child { display: flex; flex-direction: column; gap: 0.2rem; }
.option small { color: var(--text-muted); font-size: 0.9em; }
.primary-option { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); }
.emoji { font-size: 2rem; }
.note { margin: 0; padding: 0.75rem 1rem; background: color-mix(in srgb, var(--accent) 10%, var(--surface-raised)); border-radius: var(--radius); }
.permission { margin: 1rem 1.5rem 1rem; flex: none; background: color-mix(in srgb, var(--warning) 18%, var(--bg)); border: 1px solid var(--warning); border-left-width: 5px; }
.hint { margin: 0; color: var(--text-muted); font-size: 0.95em; }
.nav { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.5rem; border-top: 1px solid var(--border); }
.nav .primary { margin-left: auto; }
.nav .skip { margin-left: auto; }
.nav .skip + .primary { margin-left: 0; }
button { font: inherit; cursor: pointer; }
.primary { padding: 0.7rem 1.4rem; font-weight: 700; color: var(--on-accent); background: var(--accent); border: 0; border-radius: calc(var(--radius) / 1.2); }
.primary:hover:not(:disabled) { filter: brightness(1.1); }
.primary:disabled { opacity: 0.6; cursor: default; }
.ghost { padding: 0.7rem 1.1rem; color: var(--text); background: none; border: 2px solid var(--border); border-radius: calc(var(--radius) / 1.2); }
.ghost:hover { background: var(--surface-raised); }
.link { padding: 0.3rem 0.2rem; color: var(--text-muted); background: none; border: 0; text-decoration: underline; font-size: 0.95em; }
.link:hover { color: var(--text); }
.finish .link { color: var(--accent); font-size: inherit; padding: 0; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 520px) {
  .wizard { font-size: 1rem; }
  h2 { font-size: 1.4rem; }
  .nav { flex-wrap: wrap; }
  .nav .primary { flex: 1; }
}
</style>
