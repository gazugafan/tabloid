import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ClockWidget from '../components/widgets/clock/ClockWidget.vue';
import { displayText, layoutTime, segmentsFor } from '../components/widgets/clock/segments';
import { DEFAULT_CLOCK_CONFIG, handAngles, readClockConfig } from '../components/widgets/clock/config';

describe('clock config', () => {
  it('fills in defaults and rejects bad values', () => {
    expect(readClockConfig({ hour12: true })).toEqual({ ...DEFAULT_CLOCK_CONFIG, hour12: true });
    expect(readClockConfig({ style: 'weird', font: 'comic', size: 500 })).toMatchObject({ style: 'digital', font: 'default', size: 100 });
    expect(readClockConfig({ size: 1 }).size).toBe(40);
    expect(readClockConfig(null)).toEqual(DEFAULT_CLOCK_CONFIG);
  });

  it('computes hand angles, with the hour hand moving between hours', () => {
    expect(handAngles(new Date(2026, 0, 1, 3, 0, 0))).toEqual({ hour: 90, minute: 0, second: 0 });
    expect(handAngles(new Date(2026, 0, 1, 15, 30, 30))).toEqual({ hour: 105 + 0.25, minute: 183, second: 180 });
  });
});

describe('ClockWidget', () => {
  it('shows digits by default and an analog face on request', () => {
    expect(mount(ClockWidget, { props: { config: {} } }).find('.clock-time').exists()).toBe(true);
    const analog = mount(ClockWidget, { props: { config: { style: 'analog', showSeconds: true } } });
    expect(analog.find('svg').exists()).toBe(true);
    expect(analog.find('.clock-time').exists()).toBe(false);
    expect(analog.findAll('.numeral')).toHaveLength(12);
    expect(analog.find('.hand.second').exists()).toBe(true);
  });

  it('hides the date, the numbers and the second hand when asked', () => {
    const wrapper = mount(ClockWidget, { props: { config: { style: 'analog', showDate: false, numbers: false } } });
    expect(wrapper.find('.clock-date').exists()).toBe(false);
    expect(wrapper.findAll('.numeral')).toHaveLength(0);
    expect(wrapper.find('.hand.second').exists()).toBe(false);
  });
});

describe('LCD display', () => {
  it('lights the right segments for each digit', () => {
    expect(segmentsFor('8')).toHaveLength(7);
    expect(segmentsFor('1')).toEqual(['b', 'c']);
    expect(segmentsFor(' ')).toEqual([]);
  });

  it('formats the time as the display shows it', () => {
    expect(displayText(new Date(2026, 0, 1, 5, 7, 9), false, true)).toEqual({ text: '05:07:09', pm: false });
    expect(displayText(new Date(2026, 0, 1, 17, 7, 9), true, false)).toEqual({ text: ' 5:07', pm: true });
    expect(displayText(new Date(2026, 0, 1, 0, 7, 9), true, false).text).toBe('12:07');
  });

  it('places the digits left to right', () => {
    const { cells, width } = layoutTime('12:34');
    expect(cells.map((c) => c.kind)).toEqual(['digit', 'digit', 'colon', 'digit', 'digit']);
    expect(cells.map((c) => c.x)).toEqual([...cells.map((c) => c.x)].sort((a, b) => a - b));
    expect(width).toBeGreaterThan(40);
  });

  it('is drawn instead of text when that font is chosen, but not for analog', () => {
    const lcd = mount(ClockWidget, { props: { config: { font: 'lcd', hour12: true } } });
    expect(lcd.find('svg.segments').exists()).toBe(true);
    expect(lcd.find('.clock-time').exists()).toBe(false);
    expect(lcd.findAll('.label')).toHaveLength(2);
    expect(mount(ClockWidget, { props: { config: { font: 'lcd', style: 'analog' } } }).find('svg.segments').exists()).toBe(false);
  });
});
