/** Describes the WMO weather codes Open-Meteo reports, with an emoji for each. */
export function describeWeather(code: number, isDay = true): { label: string; icon: string } {
  if (code === 0) return isDay ? { label: 'Clear sky', icon: '☀️' } : { label: 'Clear night', icon: '🌙' };
  if (code === 1) return isDay ? { label: 'Mostly clear', icon: '🌤️' } : { label: 'Mostly clear', icon: '🌙' };
  if (code === 2) return { label: 'Partly cloudy', icon: '⛅' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: '🌦️' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: '🌨️' };
  if (code === 95) return { label: 'Thunderstorm', icon: '⛈️' };
  if (code === 96 || code === 99) return { label: 'Thunderstorm with hail', icon: '⛈️' };
  return { label: 'Unknown', icon: '🌡️' };
}
