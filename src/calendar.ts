/** Contest calendar. Authored 28 Aug 2026. */

export const WINDOW_END = "2026-09-04";
export const MIN_DTE = 7;
export const MAX_DTE = 21;

export function ymd(d: Date, timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function parseYmd(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd).getTime();
  const b = parseYmd(toYmd).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function dteFrom(expiration: string, asOf: Date): number {
  return calendarDaysBetween(ymd(asOf), expiration);
}

export function inTenorWindow(dte: number): boolean {
  return dte >= MIN_DTE && dte <= MAX_DTE;
}

export function manageByDays(dte: number, asOf: Date): number {
  const toEnd = Math.max(1, calendarDaysBetween(ymd(asOf), WINDOW_END));
  return Math.max(1, Math.min(dte, toEnd));
}

/** If more than three expiries in 7–21 DTE, keep those closest to 7, 14, and 21. */
export function pickTenors<T extends { dte: number }>(rows: T[]): T[] {
  const inWin = rows.filter((r) => inTenorWindow(r.dte)).sort((a, b) => a.dte - b.dte);
  if (inWin.length <= 3) return inWin;
  const targets = [7, 14, 21];
  const chosen: T[] = [];
  const used = new Set<number>();
  for (const t of targets) {
    let best: T | null = null;
    let bestDist = Infinity;
    for (const row of inWin) {
      if (used.has(row.dte)) continue;
      const dist = Math.abs(row.dte - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = row;
      }
    }
    if (best) {
      used.add(best.dte);
      chosen.push(best);
    }
  }
  return chosen.sort((a, b) => a.dte - b.dte);
}

export function lastFifteenMinutesPdt(asOf: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(asOf);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;
  return mins >= 12 * 60 + 45;
}
