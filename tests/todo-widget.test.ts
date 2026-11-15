import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TodoWidget from '../components/widgets/todo/TodoWidget.vue';
import { MAX_TODOS, orderedTodos, sanitizeTodoConfig } from '../components/widgets/todo/config';

const items = [
  { id: 'a', text: 'Done one', done: true },
  { id: 'b', text: 'Open one', done: false },
];

describe('todo config', () => {
  it('drops blank tasks, repairs ids and caps the list', () => {
    const config = sanitizeTodoConfig({ items: [{ id: 'x', text: ' hi ' }, { id: 'x', text: 'again' }, { text: '  ' }, 5] });
    expect(config.items.map((i) => i.text)).toEqual(['hi', 'again']);
    expect(new Set(config.items.map((i) => i.id)).size).toBe(2);
    const many = Array.from({ length: MAX_TODOS + 3 }, (_, i) => ({ text: `t${i}` }));
    expect(sanitizeTodoConfig({ items: many }).items).toHaveLength(MAX_TODOS);
  });

  it('puts finished tasks last only when asked', () => {
    expect(orderedTodos({ items, doneLast: true }).map((i) => i.id)).toEqual(['b', 'a']);
    expect(orderedTodos({ items, doneLast: false }).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('TodoWidget', () => {
  it('adds a task at the top and ignores blanks', async () => {
    const wrapper = mount(TodoWidget, { props: { config: { items } } });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('update:config')).toBeUndefined();
    await wrapper.find('input[type="text"]').setValue('  Buy milk ');
    await wrapper.find('form').trigger('submit');
    const next = wrapper.emitted('update:config')![0]![0] as { items: Array<{ text: string }> };
    expect(next.items.map((i) => i.text)).toEqual(['Buy milk', 'Done one', 'Open one']);
  });

  it('ticks, deletes and clears completed tasks', async () => {
    const wrapper = mount(TodoWidget, { props: { config: { items } } });
    expect(wrapper.text()).toContain('1 left');
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(true); // "Open one" is listed first
    expect((wrapper.emitted('update:config')![0]![0] as { items: Array<{ done: boolean }> }).items.map((i) => i.done)).toEqual([true, true]);
    const clear = wrapper.findAll('button').find((b) => b.text() === 'Clear completed')!;
    await clear.trigger('click');
    expect((wrapper.emitted('update:config')![1]![0] as { items: unknown[] }).items).toHaveLength(1);
    await wrapper.find('button.remove').trigger('click');
    expect((wrapper.emitted('update:config')![2]![0] as { items: unknown[] }).items).toHaveLength(1);
  });
});
