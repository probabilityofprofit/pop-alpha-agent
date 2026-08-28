/** Mark vs 50/50 closer. Authored 28 Aug 2026. Marks only — no Monte Carlo. */

import { netPoints } from "../governor/payoff";
import type { Leg, Package } from "../governor/types";

export type MarkedBook = {
  markNet: number;
  pnl: number;
  take: boolean;
  stop: boolean;
};

export function markBook(pkg: Package, qty: number, entryNet: number): MarkedBook {
  const markNet = netPoints(pkg.legs);
  const unsigned = Math.abs(markNet);
  const pnl = pkg.credit
    ? (entryNet - unsigned) * 100 * qty
    : (unsigned - entryNet) * 100 * qty;
  return {
    markNet,
    pnl,
    take: pnl >= 0.5 * pkg.maxProfit,
    stop: pnl <= -0.5 * pkg.maxLoss,
  };
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
