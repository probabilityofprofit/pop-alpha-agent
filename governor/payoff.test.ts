import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dummyLeg } from "../lib/closer";
import { closeJoinLimit, closeQuotesLive } from "./payoff";
import type { Package } from "./types";

function bearCall(bidAsk: Array<[number, number]>): Package {
  return {
    underlying: "SOXS",
    expiration: "2026-09-04",
    dte: 3,
    template: "bear_call",
    credit: true,
    netPoints: 1.19,
    maxProfit: 119,
    maxLoss: 381,
    legs: [
      dummyLeg({
        occ: "SOXS260904C00055000",
        side: "sell",
        right: "call",
        strike: 55,
        bid: bidAsk[0]![0],
        ask: bidAsk[0]![1],
      }),
      dummyLeg({
        occ: "SOXS260904C00060000",
        side: "buy",
        right: "call",
        strike: 60,
        bid: bidAsk[1]![0],
        ask: bidAsk[1]![1],
      }),
    ],
  };
}

describe("closeJoinLimit", () => {
  it("pays the short ask and sells the long bid", () => {
    assert.equal(closeJoinLimit(bearCall([[1.44, 1.46], [0.29, 0.34]])), 1.17);
  });
  it("needs a live short ask", () => {
    assert.equal(closeQuotesLive(bearCall([[1.44, 1.46], [0.29, 0.34]])), true);
    assert.equal(closeQuotesLive(bearCall([[1.44, 0], [0.29, 0.34]])), false);
  });
});
