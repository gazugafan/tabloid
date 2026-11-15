import { watch } from 'vue';
import { useLayoutStore } from '../stores/layout';
import { dismissNotification, notifyPersistentError } from './useNotify';

/** Ensures a message ends like a sentence so it can be followed by another. */
const sentence = (message: string) => (/[.!?]$/.test(message.trim()) ? message.trim() : `${message.trim()}.`);

/** Shows `message` as a persistent toast while it's set, and removes the toast when it clears. */
function bindToast(source: () => string | null, id: string, title: string, describe: (message: string) => string) {
  watch(source, (message, previous) => {
    if (message) notifyPersistentError(id, title, describe(message));
    else if (previous) dismissNotification(id);
  });
}

/** Shows storage and sync problems as persistent toasts that clear themselves when resolved. */
export function useErrorToasts(): void {
  const store = useLayoutStore();
  bindToast(() => store.loadError, 'load-error', "Couldn't read your saved layout", (m) => `${sentence(m)} Nothing was overwritten.`);
  bindToast(() => store.saveError, 'save-error', "Couldn't save changes", (m) => m);
  bindToast(() => store.syncError, 'sync-error', 'Sync problem', (m) => `${sentence(m)} Changes are kept on this device and will retry.`);
}
