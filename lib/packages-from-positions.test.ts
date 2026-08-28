import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferTemplate, templateFromWorkingLegs } from "./packages-from-positions";
import { dummyLeg } from "./closer";

describe("open packages", () => {
  it("infers the Friday bull put", () => {
    const t = inferTemplate([
      dummyLeg({ occ: "SPY260911P00773000", side: "sell", right: "put", strike: 773, bid: 1, ask: 1 }),
      dummyLeg({ occ: "SPY260911P00771000", side: "buy", right: "put", strike: 771, bid: 1, ask: 1 }),
    ]);
    assert.equal(t, "bull_put");
  });
  it("infers a working DAY mleg as the same bull put", () => {
    const t = templateFromWorkingLegs([
      { symbol: "SPY260911P00773000", side: "sell" },
      { symbol: "SPY260911P00771000", side: "buy" },
    ]);
    assert.equal(t, "bull_put");
  });
});
