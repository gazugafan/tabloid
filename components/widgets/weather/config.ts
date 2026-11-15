export type WeatherUnits = 'auto' | 'metric' | 'imperial';

export interface WeatherPlace {
  name: string;
  /** Region and country, for telling apart places that share a name. */
  detail: string;
  latitude: number;
  longitude: number;
}

export interface WeatherConfig {
  place: WeatherPlace | null;
  units: WeatherUnits;
  /** Days of forecast under today's conditions (0 hides the forecast). */
  forecastDays: number;
}

export const FORECAST_DAYS = { min: 0, max: 7 } as const;

export const DEFAULT_WEATHER_CONFIG: WeatherConfig = { place: null, units: 'auto', forecastDays: 4 };

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const inRange = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

export function sanitizeWeatherConfig(raw: unknown): WeatherConfig {
  const d = DEFAULT_WEATHER_CONFIG;
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const p = typeof r.place === 'object' && r.place !== null ? (r.place as Record<string, unknown>) : undefined;
  const name = p ? text(p.name, 80) : '';
  const place = p && name && inRange(p.latitude, 90) && inRange(p.longitude, 180) ? { name, detail: text(p.detail, 120), latitude: p.latitude, longitude: p.longitude } : null;
  const days = typeof r.forecastDays === 'number' && Number.isFinite(r.forecastDays) ? Math.round(r.forecastDays) : d.forecastDays;
  return {
    place,
    units: r.units === 'metric' || r.units === 'imperial' || r.units === 'auto' ? r.units : d.units,
    forecastDays: Math.min(FORECAST_DAYS.max, Math.max(FORECAST_DAYS.min, days)),
  };
}

/** "Automatic" follows the browser's region: Fahrenheit and miles per hour in the US and a few others. */
export function resolveUnits(units: WeatherUnits, locale: string = typeof navigator === 'undefined' ? 'en' : navigator.language): 'metric' | 'imperial' {
  if (units !== 'auto') return units;
  const region = locale.split('-')[1]?.toUpperCase();
  return region && ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW'].includes(region) ? 'imperial' : 'metric';
}
