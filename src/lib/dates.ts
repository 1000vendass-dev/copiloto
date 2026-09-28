/** Datas no fuso de São Paulo (UTC-3, sem horário de verão desde 2019). */
const OFFSET_MS = 3 * 3600 * 1000;

/** "YYYY-MM-DD" de hoje em São Paulo. */
export function todaySP(now = new Date()): string {
  return new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Início e fim (ISO UTC) do dia `ymd` em São Paulo. */
export function dayRangeSP(ymd: string): { start: string; end: string } {
  const start = new Date(`${ymd}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana de `ymd`. */
export function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(ymd, -dow);
}

export function isValidYmd(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
export function labelDay(ymd: string) {
  return weekday.format(new Date(`${ymd}T12:00:00Z`));
}
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
export function formatTime(iso: string) {
  return time.format(new Date(iso));
}
/** ISO → "YYYY-MM-DD" em São Paulo */
export function ymdOf(iso: string) {
  return todaySP(new Date(iso));
}
