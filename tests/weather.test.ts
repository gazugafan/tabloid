import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WeatherWidget from '../components/widgets/weather/WeatherWidget.vue';
import { fetchWeather, parseForecast, searchPlaces } from '../components/widgets/weather/api';
import { resolveUnits, sanitizeWeatherConfig } from '../components/widgets/weather/config';
import { describeWeather } from '../components/widgets/weather/codes';

const forecast = {
  current: { temperature_2m: 18.4, apparent_temperature: 17, weather_code: 2, is_day: 1, wind_speed_10m: 12.2, relative_humidity_2m: 60 },
  daily: {
    time: ['2026-11-06', '2026-11-07', '2026-11-08'],
    weather_code: [2, 61, 0],
    temperature_2m_max: [19, 15, 14],
    temperature_2m_min: [9, 8, 6],
    precipitation_probability_max: [10, 80, null],
  },
};
const reply = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
const place = { name: 'Paris', detail: 'France', latitude: 48.85, longitude: 2.35 };

describe('weather helpers', () => {
  it('parses a forecast and skips incomplete days', () => {
    const data = parseForecast({ ...forecast, daily: { ...forecast.daily, temperature_2m_max: [19, undefined, 14] } }, 'metric');
    expect(data.current).toMatchObject({ temperature: 18.4, code: 2, isDay: true });
    expect(data.days.map((d) => d.date)).toEqual(['2026-11-06', '2026-11-08']);
    expect(data.days[1]!.rainChance).toBeNull();
  });

  it('rejects replies without current conditions', () => {
    expect(() => parseForecast({ error: true }, 'metric')).toThrow();
  });

  it('asks Open-Meteo in the right units', async () => {
    const fetcher = reply(forecast);
    await fetchWeather(place, 'imperial', fetcher as never);
    const url = new URL(fetcher.mock.calls[0]![0] as string);
    expect(url.hostname).toBe('api.open-meteo.com');
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
  });

  it('turns an error status into a readable error', async () => {
    await expect(fetchWeather(place, 'metric', reply({}, false) as never)).rejects.toThrow(/error/);
  });

  it('finds places and ignores short queries', async () => {
    const fetcher = reply({ results: [{ name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.85, longitude: 2.35 }, { name: 'bad' }] });
    expect(await searchPlaces('Paris', fetcher as never)).toEqual([{ name: 'Paris', detail: 'Île-de-France, France', latitude: 48.85, longitude: 2.35 }]);
    expect(await searchPlaces('p', fetcher as never)).toEqual([]);
  });

  it('cleans config and picks units from the region', () => {
    expect(sanitizeWeatherConfig({ place: { name: 'X', latitude: 999, longitude: 0 }, forecastDays: 99 })).toMatchObject({ place: null, forecastDays: 7 });
    expect(resolveUnits('auto', 'en-US')).toBe('imperial');
    expect(resolveUnits('auto', 'fr-FR')).toBe('metric');
    expect(resolveUnits('metric', 'en-US')).toBe('metric');
  });

  it('describes codes, including night', () => {
    expect(describeWeather(0, false).label).toBe('Clear night');
    expect(describeWeather(95).label).toBe('Thunderstorm');
  });
});

describe('WeatherWidget', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('asks for a place first, with the third-party notice', () => {
    const wrapper = mount(WeatherWidget, { props: { config: {} } });
    expect(wrapper.text()).toContain('Open-Meteo');
    expect(wrapper.find('input[type="search"]').exists()).toBe(true);
  });

  it('shows current conditions and the forecast for a chosen place', async () => {
    vi.stubGlobal('fetch', reply(forecast));
    const wrapper = mount(WeatherWidget, { props: { config: { place, units: 'metric', forecastDays: 2 } } });
    await vi.waitFor(() => expect(wrapper.find('.temp').exists()).toBe(true));
    await flushPromises();
    expect(wrapper.find('.temp').text()).toBe('18°');
    expect(wrapper.text()).toContain('Partly cloudy');
    expect(wrapper.findAll('.forecast li')).toHaveLength(2);
    expect(wrapper.find('.rain').text()).toBe('80%');
    vi.unstubAllGlobals();
  });
});
