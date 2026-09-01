import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyStopHold, dummyLeg, markBook, STOP_HOLD_MS } from "./closer";
import type { Package } from "../governor/types";

function creditPut(bidShort: number, askShort: number, bidLong: number, askLong: number): Package {
  return {
    underlying: "SPY",
    expiration: "2026-09-11",
    dte: 14,
    template: "bull_put",
    credit: true,
    netPoints: 0.74,
    maxProfit: 74,
    maxLoss: 126,
    legs: [
      dummyLeg({ occ: "SPY260911P00773000", side: "sell", right: "put", strike: 773, bid: bidShort, ask: askShort }),
      dummyLeg({ occ: "SPY260911P00771000", side: "buy", right: "put", strike: 771, bid: bidLong, ask: askLong }),
    ],
  };
}

function snxxBearCall(bidShort: number, askShort: number, bidLong: number, askLong: number): Package {
  return {
    underlying: "SNXX",
    expiration: "2026-09-04",
    dte: 4,
    template: "bear_call",
    credit: true,
    netPoints: 0.3,
    maxProfit: 30,
    maxLoss: 70,
    legs: [
      dummyLeg({ occ: "SNXX260904C00013500", side: "sell", right: "call", strike: 13.5, bid: bidShort, ask: askShort }),
      dummyLeg({ occ: "SNXX260904C00014500", side: "buy", right: "call", strike: 14.5, bid: bidLong, ask: askLong }),
    ],
  };
}

describe("closer", () => {
  it("holds the Friday test-book credit at entry", () => {
    const mark = markBook(creditPut(5.65, 5.65, 4.91, 4.91), 1, 0.74);
    assert.equal(Math.round(mark.pnl), 0);
    assert.equal(mark.take, false);
    assert.equal(mark.stop, false);
  });
  it("takes 50% of max profit on a credit", () => {
    const mark = markBook(creditPut(5.1, 5.12, 4.73, 4.75), 1, 0.74);
    assert.ok(mark.pnl >= 37);
    assert.equal(mark.take, true);
  });
  it("scales take and stop by qty, not one-lot max", () => {
    const early = markBook(creditPut(5.6, 5.62, 4.9, 4.92), 12, 0.74);
    assert.ok(early.pnl > 0);
    assert.ok(early.pnl < 0.5 * 74 * 12);
    assert.equal(early.take, false);
    const pkg = snxxBearCall(0.85, 0.95, 0.48, 0.56);
    const mark = markBook(pkg, 12, 0.3);
    assert.equal(Math.round(mark.pnl), -96);
    assert.equal(mark.stop, false);
    assert.ok(mark.pnl > -0.5 * pkg.maxLoss * 12);
  });
  it("stops a 12-lot when the position has lost 50% of defined risk", () => {
    const pkg = snxxBearCall(1.1, 1.2, 0.15, 0.25);
    const mark = markBook(pkg, 12, 0.3);
    assert.ok(mark.pnl <= -0.5 * 70 * 12);
    assert.equal(mark.stop, true);
  });
  it("does not stop inside the hold window", () => {
    const pkg = snxxBearCall(1.1, 1.2, 0.15, 0.25);
    const raw = markBook(pkg, 12, 0.3);
    assert.equal(raw.stop, true);
    const held = applyStopHold(raw, STOP_HOLD_MS - 1);
    assert.equal(held.stop, false);
    assert.equal(held.take, raw.take);
    assert.equal(applyStopHold(raw, STOP_HOLD_MS).stop, true);
  });
});
