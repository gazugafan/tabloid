export const CLOCK_STYLES = [
  { id: 'digital', label: 'Digital' },
  { id: 'analog', label: 'Analog' },
] as const;
export type ClockStyle = (typeof CLOCK_STYLES)[number]['id'];

/** System fonts only (nothing is downloaded); each falls back to the normal font where it isn't installed. */
export const CLOCK_FONTS = [
  { id: 'default', label: 'Standard', family: 'var(--font)', weight: 600 },
  { id: 'light', label: 'Light', family: 'var(--font)', weight: 200 },
  { id: 'bold', label: 'Bold', family: 'var(--font)', weight: 800 },
  { id: 'mono', label: 'Monospace', family: "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace", weight: 500 },
  { id: 'serif', label: 'Serif', family: "Georgia, 'Times New Roman', Times, serif", weight: 500 },
  { id: 'lcd', label: 'LCD display', family: 'var(--font)', weight: 600 },
  { id: 'rounded', label: 'Rounded', family: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', 'Varela Round', var(--font)", weight: 700 },
] as const;
export type ClockFont = (typeof CLOCK_FONTS)[number]['id'];

export const SIZE_RANGE = { min: 40, max: 100, step: 5 } as const;

export interface ClockConfig {
  style: ClockStyle;
  hour12: boolean;
  showSeconds: boolean;
  showDate: boolean;
  font: ClockFont;
  /** Analog only: draw the numbers 1 to 12. */
  numbers: boolean;
  /** Percent of the size that fits the widget (it always scales with the widget; this only shrinks it). */
  size: number;
}

export const DEFAULT_CLOCK_CONFIG: ClockConfig = { style: 'digital', hour12: true, showSeconds: false, showDate: true, font: 'default', numbers: true, size: 100 };

/** Reads a stored config, falling back to the defaults for anything missing or invalid. */
export function readClockConfig(raw: unknown): ClockConfig {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CLOCK_CONFIG;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const size = typeof r.size === 'number' && Number.isFinite(r.size) ? Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, r.size)) : d.size;
  return {
    style: CLOCK_STYLES.some((s) => s.id === r.style) ? (r.style as ClockStyle) : d.style,
    hour12: bool(r.hour12, d.hour12),
    showSeconds: bool(r.showSeconds, d.showSeconds),
    showDate: bool(r.showDate, d.showDate),
    font: CLOCK_FONTS.some((f) => f.id === r.font) ? (r.font as ClockFont) : d.font,
    numbers: bool(r.numbers, d.numbers),
    size,
  };
}

/** Degrees clockwise from 12 o'clock for each hand. The hour hand creeps along with the minutes. */
export function handAngles(date: Date): { hour: number; minute: number; second: number } {
  const s = date.getSeconds();
  const m = date.getMinutes() + s / 60;
  const h = (date.getHours() % 12) + m / 60;
  return { hour: h * 30, minute: m * 6, second: s * 6 };
}
