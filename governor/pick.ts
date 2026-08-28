/** Pass/fail and rank. Authored 28 Aug 2026. */

import { manageByDays } from "./calendar";
import { cell, simulateHoldMap } from "./map";
import { sizeQty } from "./paper";
import { joinLimit } from "./payoff";
import type { Decision, Package } from "./types";

export type Scored = {
  pkg: Package;
  map: NonNullable<ReturnType<typeof simulateHoldMap>>;
  manageByDays: number;
  qty: number;
  limit: number;
  contest50: number;
  expiry50: number;
};

export function scorePackage(pkg: Package, spot: number, equity: number, asOf: Date, rand?: () => number): Scored | null {
  const map = simulateHoldMap(pkg, spot, rand);
  if (!map) return null;
  const mb = manageByDays(pkg.dte, asOf);
  if (map.popAtExpiration < 35 || map.meanPnl < 0) return null;
  if (cell(map, pkg.dte, 50) < 40) return null;
  if (cell(map, mb, 25) < 25) return null;
  const qty = sizeQty(equity, pkg.maxLoss);
  if (qty < 1) return null;
  const limit = joinLimit(pkg);
  if (pkg.credit && !(limit > 0)) return null;
  if (!pkg.credit && !(limit < 0)) return null;
  return {
    pkg,
    map,
    manageByDays: mb,
    qty,
    limit,
    contest50: cell(map, mb, 50),
    expiry50: cell(map, pkg.dte, 50),
  };
}

export function rank(a: Scored, b: Scored): number {
  return (
    b.contest50 - a.contest50 ||
    b.expiry50 - a.expiry50 ||
    a.pkg.dte - b.pkg.dte ||
    (a.pkg.legs.length - b.pkg.legs.length)
  );
}

export function toDecision(winner: Scored | undefined): Decision {
  if (!winner) return { action: "no_trade", reason: "No tenor/template cleared the hold map." };
  return {
    action: "propose",
    package: winner.pkg,
    qty: winner.qty,
    limit: winner.limit,
    map: winner.map,
    manageByDays: winner.manageByDays,
  };
}
