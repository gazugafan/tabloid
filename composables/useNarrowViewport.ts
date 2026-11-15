import { onBeforeUnmount, ref, type Ref } from 'vue';

export const NARROW_QUERY = '(max-width: 640px)';

/** True while the viewport is narrow enough that the grid collapses to one column. */
export function useNarrowViewport(query: string = NARROW_QUERY): Ref<boolean> {
  const mql = window.matchMedia(query);
  const narrow = ref(mql.matches);
  const onChange = (event: MediaQueryListEvent) => {
    narrow.value = event.matches;
  };
  mql.addEventListener('change', onChange);
  onBeforeUnmount(() => mql.removeEventListener('change', onChange));
  return narrow;
}
