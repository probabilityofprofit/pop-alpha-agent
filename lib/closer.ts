/** Mark vs 50/50 closer. Authored 28 Aug 2026. Marks only — no Monte Carlo. */

import { netPoints } from "../governor/payoff";
import type { Leg, Package } from "../governor/types";

export type MarkedBook = {
  markNet: number;
  pnl: number;
  take: boolean;
  stop: boolean;
};

/** Join-NBBO vs mid looks like a loss on the first prints. Do not stop through that. */
export const STOP_HOLD_MS = 3 * 60 * 1000;

export function markBook(pkg: Package, qty: number, entryNet: number): MarkedBook {
  const markNet = netPoints(pkg.legs);
  const unsigned = Math.abs(markNet);
  const pnl = pkg.credit
    ? (entryNet - unsigned) * 100 * qty
    : (unsigned - entryNet) * 100 * qty;
  return {
    markNet,
    pnl,
    take: pnl >= 0.5 * pkg.maxProfit * qty,
    stop: pnl <= -0.5 * pkg.maxLoss * qty,
  };
}

export function heldMs(asOf: Date, openedAt: Date | null | undefined): number {
  if (!openedAt || !Number.isFinite(openedAt.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, asOf.getTime() - openedAt.getTime());
}

export function applyStopHold(mark: MarkedBook, openMs: number, holdMs = STOP_HOLD_MS): MarkedBook {
  if (!mark.stop || openMs >= holdMs) return mark;
  return { ...mark, stop: false };
}

export function shouldExit(mark: MarkedBook): boolean {
  return mark.take || mark.stop;
}

export function dummyLeg(partial: Partial<Leg> & Pick<Leg, "occ" | "side" | "right" | "strike" | "bid" | "ask">): Leg {
  return {
    oi: 500,
    iv: 0.2,
    delta: null,
    volume: 0,
    ...partial,
  };
}
