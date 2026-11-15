import { toast } from 'vue-sonner';

const ERROR_DURATION_MS = 8000;

/** Thin wrapper so the rest of the app doesn't depend on the toast library. */
export function notifySuccess(message: string): void {
  toast.success(message);
}

/** A transient error, e.g. the result of something the user just did. */
export function notifyError(message: string): void {
  toast.error(message, { duration: ERROR_DURATION_MS, closeButton: true });
}

/**
 * An error that stays until it's resolved or dismissed. Reusing an `id` updates the same toast
 * instead of stacking a new one; call `dismissNotification(id)` when the problem goes away.
 */
export function notifyPersistentError(id: string, message: string, description?: string): void {
  toast.error(message, { id, description, duration: Infinity, closeButton: true });
}

const UNDO_DURATION_MS = 10_000;

/** A confirmation of something the user just did, with a button to take it back. */
export function notifyUndoable(message: string, onUndo: () => void): void {
  toast(message, { duration: UNDO_DURATION_MS, action: { label: 'Undo', onClick: onUndo } });
}

export function dismissNotification(id: string): void {
  toast.dismiss(id);
}
