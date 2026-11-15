import { createDefaultStore, type KeyValueStore } from '../../../utils/storage/store';
import type { WeatherPlace } from './config';

/** Open-Meteo is a free, key-less weather service. It allows requests from web pages (CORS). */
export const OPEN_METEO_URL = 'https://open-meteo.com/';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export const WEATHER_TTL_MS = 30 * 60 * 1000;

export interface WeatherData {
  fetchedAt: number;
  units: 'metric' | 'imperial';
  current: { temperature: number; feelsLike: number; code: number; isDay: boolean; wind: number; humidity: number };
  days: Array<{ date: string; code: number; high: number; low: number; rainChance: number | null }>;
}

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`The weather service answered with an error (${response.status}).`);
  return response.json();
}

/** Places matching a name, best match first. */
export async function searchPlaces(query: string, fetcher: typeof fetch = fetch): Promise<WeatherPlace[]> {
  const name = query.trim();
  if (name.length < 2) return [];
  const json = (await getJson(`${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=6&language=en&format=json`, fetcher)) as { results?: unknown };
  const places: WeatherPlace[] = [];
  for (const entry of Array.isArray(json.results) ? json.results : []) {
    const r = entry as Record<string, unknown>;
    const latitude = num(r.latitude);
    const longitude = num(r.longitude);
    if (typeof r.name !== 'string' || latitude === undefined || longitude === undefined) continue;
    const detail = [r.admin1, r.country].filter((p): p is string => typeof p === 'string' && p !== r.name).join(', ');
    places.push({ name: r.name, detail, latitude, longitude });
  }
  return places;
}

/** Reads Open-Meteo's forecast reply; throws if it isn't shaped as expected. */
export function parseForecast(json: unknown, units: 'metric' | 'imperial', now = Date.now()): WeatherData {
  const r = json as { current?: Record<string, unknown>; daily?: Record<string, unknown> };
  const c = r?.current;
  const temperature = num(c?.temperature_2m);
  const code = num(c?.weather_code);
  if (!c || temperature === undefined || code === undefined) throw new Error('The weather service sent something unexpected.');
  const d = r.daily ?? {};
  const list = (key: string): unknown[] => (Array.isArray(d[key]) ? (d[key] as unknown[]) : []);
  const dates = list('time');
  const days: WeatherData['days'] = [];
  dates.forEach((date, i) => {
    const high = num(list('temperature_2m_max')[i]);
    const low = num(list('temperature_2m_min')[i]);
    const dayCode = num(list('weather_code')[i]);
    if (typeof date === 'string' && high !== undefined && low !== undefined && dayCode !== undefined) {
      days.push({ date, code: dayCode, high, low, rainChance: num(list('precipitation_probability_max')[i]) ?? null });
    }
  });
  return {
    fetchedAt: now,
    units,
    current: {
      temperature,
      feelsLike: num(c.apparent_temperature) ?? temperature,
      code,
      isDay: c.is_day !== 0,
      wind: num(c.wind_speed_10m) ?? 0,
      humidity: num(c.relative_humidity_2m) ?? 0,
    },
    days,
  };
}

export async function fetchWeather(place: WeatherPlace, units: 'metric' | 'imperial', fetcher: typeof fetch = fetch): Promise<WeatherData> {
  const query = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '8',
    temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: units === 'imperial' ? 'mph' : 'kmh',
  });
  return parseForecast(await getJson(`${FORECAST_URL}?${query}`, fetcher), units);
}

/** Cached per place and unit system, in device-local storage, so the page shows weather instantly and offline. */
export function weatherCache(store: KeyValueStore = createDefaultStore()) {
  const key = (place: WeatherPlace, units: string) => `weather:${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}:${units}`;
  return {
    get: (place: WeatherPlace, units: 'metric' | 'imperial') => store.get<WeatherData>(key(place, units)),
    put: (place: WeatherPlace, data: WeatherData) => store.set(key(place, data.units), data),
  };
}
