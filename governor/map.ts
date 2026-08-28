/** Hold map: GBM + BS marks. Authored 28 Aug 2026. */

import { bsPrice } from "./bs";
import type { HoldMap, Package } from "./types";

const RATE = 0.05;
const TRIALS = 1500;
const TARGETS = [25, 50, 75, 100] as const;

function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function markPackage(pkg: Package, spot: number, yearsLeft: number, vol: number): number {
  let value = 0;
  for (const leg of pkg.legs) {
    const px = bsPrice(spot, leg.strike, yearsLeft, RATE, vol, leg.right);
    value += (leg.side === "sell" ? -px : px) * 100;
  }
  return value;
}

function avgIv(pkg: Package): number | null {
  const ivs = pkg.legs.map((l) => l.iv).filter((v): v is number => v != null && v > 0);
  if (ivs.length !== pkg.legs.length) return null;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

/** P&L vs entry: credits sold premium; debits paid premium. */
function pnlFromMark(pkg: Package, mark: number): number {
  const entry = pkg.credit ? -pkg.netPoints * 100 : pkg.netPoints * 100;
  return mark - entry;
}

export function simulateHoldMap(pkg: Package, spot: number, rand: () => number = Math.random): HoldMap | null {
  const vol = avgIv(pkg);
  if (vol == null || !(spot > 0) || pkg.dte < 1) return null;
  const dt = 1 / 365;
  const hits: Record<number, Record<number, number>> = {};
  for (let d = 1; d <= pkg.dte; d += 1) {
    hits[d] = { 25: 0, 50: 0, 75: 0, 100: 0 };
  }
  let pop = 0;
  let sum = 0;
  for (let i = 0; i < TRIALS; i += 1) {
    let s = spot;
    let expiry = 0;
    const seen: Record<number, boolean> = { 25: false, 50: false, 75: false, 100: false };
    for (let day = 1; day <= pkg.dte; day += 1) {
      s *= Math.exp((RATE - 0.5 * vol * vol) * dt + vol * Math.sqrt(dt) * gauss(rand));
      const years = Math.max((pkg.dte - day) / 365, 0);
      const pnl = pnlFromMark(pkg, markPackage(pkg, s, years, vol));
      expiry = pnl;
      for (const t of TARGETS) {
        if (!seen[t] && pnl >= (t / 100) * pkg.maxProfit) seen[t] = true;
      }
      for (const t of TARGETS) {
        if (seen[t]) hits[day]![t] += 1;
      }
    }
    sum += expiry;
    if (expiry > 0) pop += 1;
  }
  const cells: HoldMap["cells"] = {};
  for (let d = 1; d <= pkg.dte; d += 1) {
    cells[d] = {};
    for (const t of TARGETS) {
      cells[d]![t] = (100 * hits[d]![t]!) / TRIALS;
    }
  }
  return {
    popAtExpiration: (100 * pop) / TRIALS,
    meanPnl: sum / TRIALS,
    cells,
  };
}

export function cell(map: HoldMap, day: number, pct: 25 | 50 | 75 | 100): number {
  const days = Object.keys(map.cells).map(Number).sort((a, b) => a - b);
  if (!days.length) return 0;
  const nearest = days.reduce((best, d) => (Math.abs(d - day) < Math.abs(best - day) ? d : best));
  return map.cells[nearest]?.[pct] ?? 0;
}
