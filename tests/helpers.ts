import type { KeyValueStore } from '../utils/storage/store';

export type MemoryStore = KeyValueStore & { data: Record<string, unknown>; emit(keys: string[]): void };

/** In-memory KeyValueStore. Like extension storage, writes notify subscribers (including the writer). */
export function memoryStore(initial: Record<string, unknown> = {}): MemoryStore {
  const data: Record<string, unknown> = { ...initial };
  const listeners = new Set<(keys: string[]) => void>();
  const emit = (keys: string[]) => listeners.forEach((l) => l(keys));
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    data,
    emit,
    async get<T>(key: string) { return data[key] === undefined ? undefined : (clone(data[key]) as T); },
    async getMany(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, clone(data[k])]));
    },
    async set(key, value) { data[key] = clone(value); emit([key]); },
    async setMany(items) {
      for (const [k, v] of Object.entries(items)) data[k] = clone(v);
      emit(Object.keys(items));
    },
    async remove(key) { delete data[key]; emit([key]); },
    async removeMany(keys) { keys.forEach((k) => delete data[k]); emit(keys); },
    subscribe(onChange) { listeners.add(onChange); return () => listeners.delete(onChange); },
  };
}
