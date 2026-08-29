/** Pass/fail and rank. Authored 28 Aug 2026. */

import { manageByDays } from "./calendar";
import { cell, simulateHoldMap } from "./map";
import { sizeQty } from "./paper";
import { joinLimit } from "./payoff";
import type { Decision, HoldMap, Package } from "./types";

export type Scored = {
  pkg: Package;
  map: NonNullable<ReturnType<typeof simulateHoldMap>>;
  manageByDays: number;
  qty: number;
  limit: number;
  contest50: number;
};

export function passesContestGates(map: HoldMap, manageBy: number): boolean {
  if (map.popAtManageBy < 35 || map.meanPnlAtManageBy < 0) return false;
  if (cell(map, manageBy, 25) < 25) return false;
  return true;
}

export function scorePackage(pkg: Package, spot: number, equity: number, asOf: Date, rand?: () => number): Scored | null {
  const mb = manageByDays(pkg.dte, asOf);
  const map = simulateHoldMap(pkg, spot, rand, mb);
  if (!map) return null;
  if (!passesContestGates(map, mb)) return null;
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
  };
}

export function rank(a: Scored, b: Scored): number {
  return (
    b.contest50 - a.contest50 ||
    b.map.popAtManageBy - a.map.popAtManageBy ||
    b.map.meanPnlAtManageBy - a.map.meanPnlAtManageBy ||
    a.pkg.dte - b.pkg.dte ||
    a.pkg.legs.length - b.pkg.legs.length
  );
}

export function comparePropose(
  a: Extract<Decision, { action: "propose" }>,
  b: Extract<Decision, { action: "propose" }>,
): number {
  const a50 = cell(a.map, a.manageByDays, 50);
  const b50 = cell(b.map, b.manageByDays, 50);
  return (
    b50 - a50 ||
    b.map.popAtManageBy - a.map.popAtManageBy ||
    b.map.meanPnlAtManageBy - a.map.meanPnlAtManageBy ||
    a.package.dte - b.package.dte ||
    a.package.legs.length - b.package.legs.length
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
