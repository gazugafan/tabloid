export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoConfig {
  items: TodoItem[];
  /** Move finished items to the bottom of the list. */
  doneLast: boolean;
}

export const MAX_TODOS = 200;
export const MAX_TODO_LENGTH = 200;

export const DEFAULT_TODO_CONFIG: TodoConfig = { items: [], doneLast: true };

export function sanitizeTodoConfig(raw: unknown): TodoConfig {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const items: TodoItem[] = [];
  const ids = new Set<string>();
  for (const entry of Array.isArray(r.items) ? r.items : []) {
    if (typeof entry !== 'object' || entry === null || items.length >= MAX_TODOS) continue;
    const item = entry as Record<string, unknown>;
    const text = typeof item.text === 'string' ? item.text.trim().slice(0, MAX_TODO_LENGTH) : '';
    if (!text) continue;
    let id = typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    items.push({ id, text, done: item.done === true });
  }
  return { items, doneLast: typeof r.doneLast === 'boolean' ? r.doneLast : DEFAULT_TODO_CONFIG.doneLast };
}

/** Items in the order shown: open ones first when `doneLast` is on (the stored order is otherwise kept). */
export function orderedTodos(config: TodoConfig): TodoItem[] {
  return config.doneLast ? [...config.items.filter((i) => !i.done), ...config.items.filter((i) => i.done)] : config.items;
}
