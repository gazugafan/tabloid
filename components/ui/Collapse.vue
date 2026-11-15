<script setup lang="ts">
/**
 * Animates its single child in and out (use v-if/v-else-if on it) by growing and shrinking its
 * height. Pass `gap` when the parent is a flex/grid container with a gap, so the gap collapses too.
 */
const props = withDefaults(defineProps<{ gap?: string; duration?: number }>(), { gap: '0px', duration: 200 });

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clear(el: HTMLElement) {
  for (const name of ['height', 'opacity', 'overflow', 'transition', 'margin-top', 'margin-bottom']) el.style.removeProperty(name);
}

/** Full height of the element's content plus its borders, whatever height is currently set. */
const fullHeight = (el: HTMLElement) => el.scrollHeight + (el.offsetHeight - el.clientHeight);

function animate(el: Element, from: 'closed' | 'open', done: () => void) {
  const node = el as HTMLElement;
  if (reduceMotion()) {
    done();
    return;
  }
  const collapsedMargin = `calc(-1 * ${props.gap})`;
  const closed = { height: '0px', opacity: '0', marginTop: collapsedMargin };
  const open = { height: `${fullHeight(node)}px`, opacity: '1', marginTop: '0px' };
  const apply = (s: typeof open) => Object.assign(node.style, s);

  node.style.overflow = 'hidden';
  apply(from === 'closed' ? closed : open);
  void node.offsetHeight; // Start the transition from the style above.
  node.style.transition = `height ${props.duration}ms ease, opacity ${props.duration}ms ease, margin-top ${props.duration}ms ease`;
  apply(from === 'closed' ? open : closed);

  // Content can arrive after we measured (lazy-loaded components), so follow it while opening.
  const observer = from === 'closed' ? new MutationObserver(() => (node.style.height = `${fullHeight(node)}px`)) : undefined;
  observer?.observe(node, { childList: true, subtree: true });
  setTimeout(() => {
    observer?.disconnect();
    clear(node);
    done();
  }, props.duration);
}
</script>

<template>
  <Transition :css="false" mode="out-in" @enter="(el, done) => animate(el, 'closed', done)" @leave="(el, done) => animate(el, 'open', done)">
    <slot />
  </Transition>
</template>
