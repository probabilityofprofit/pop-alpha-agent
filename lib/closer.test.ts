import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dummyLeg, markBook } from "./closer";
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
});
