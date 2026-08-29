import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comparePropose, passesContestGates } from "./pick";
import type { Decision, HoldMap, Package } from "./types";

function map(partial: Partial<HoldMap> & Pick<HoldMap, "popAtManageBy" | "meanPnlAtManageBy">): HoldMap {
  return {
    popAtExpiration: 80,
    meanPnl: 40,
    cells: { 1: { 25: 50, 50: 40, 75: 20, 100: 5 }, 4: { 25: 50, 50: 40, 75: 20, 100: 5 } },
    ...partial,
  };
}

describe("contest gates", () => {
  it("uses Friday mark POP and mean P&L, not expiry", () => {
    assert.equal(
      passesContestGates(map({ popAtExpiration: 90, meanPnl: 80, popAtManageBy: 20, meanPnlAtManageBy: -10 }), 4),
      false,
    );
    assert.equal(
      passesContestGates(map({ popAtExpiration: 20, meanPnl: -5, popAtManageBy: 40, meanPnlAtManageBy: 12 }), 4),
      true,
    );
  });
  it("still requires the Friday 25% cell", () => {
    assert.equal(
      passesContestGates(
        map({
          popAtManageBy: 50,
          meanPnlAtManageBy: 10,
          cells: { 4: { 25: 10, 50: 5, 75: 0, 100: 0 } },
        }),
        4,
      ),
      false,
    );
  });
});

function propose(dte: number, friday50: number, pop: number): Extract<Decision, { action: "propose" }> {
  const pkg = { dte, legs: [{}, {}] } as Package;
  return {
    action: "propose",
    package: pkg,
    qty: 1,
    limit: 0.5,
    manageByDays: 4,
    map: map({
      popAtManageBy: pop,
      meanPnlAtManageBy: 10,
      cells: { 4: { 25: 40, 50: friday50, 75: 10, 100: 0 } },
    }),
  };
}

describe("comparePropose", () => {
  it("prefers the better Friday 50% cell, then Friday POP, then shorter DTE", () => {
    const short = propose(0, 40, 45);
    const long = propose(14, 40, 45);
    assert.ok(comparePropose(short, long) < 0);
    const hotter = propose(14, 55, 40);
    const cooler = propose(0, 40, 60);
    assert.ok(comparePropose(hotter, cooler) < 0);
  });
});
