import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIX_CAP,
  MIX_CAP_EXPANDED,
  MIX_CAP_REASON,
  allowedTemplates,
  mixAllows,
  mixBucket,
  mixCap,
  mixCounts,
} from "./mix";
import { ALL_TEMPLATES } from "./strikes";
import { scanExpiry } from "./cycle";
import { DEMO_QUOTES, DEMO_SPOT } from "./demo-chain";

describe("mix 4/4/4", () => {
  it("buckets verticals and irons", () => {
    assert.equal(mixBucket("bull_put"), "bull");
    assert.equal(mixBucket("bull_call"), "bull");
    assert.equal(mixBucket("bear_call"), "bear");
    assert.equal(mixBucket("bear_put"), "bear");
    assert.equal(mixBucket("iron_condor"), "iron");
    assert.equal(mixBucket("iron_fly"), "iron");
  });

  it("allows a third bull and blocks a fifth on Tuesday", () => {
    const three = mixCounts(["bull_put", "bull_call", "bull_put"]);
    assert.equal(MIX_CAP, 4);
    assert.equal(mixCap(new Date("2026-09-01T20:00:00Z")), 4);
    assert.equal(mixAllows(three, "bull_put"), true);
    const four = mixCounts(["bull_put", "bull_call", "bull_put", "bull_call"]);
    assert.equal(mixAllows(four, "bull_put"), false);
    assert.equal(mixAllows(four, "bear_call"), true);
    assert.equal(mixAllows(four, "iron_condor"), true);
  });

  it("expands to five per bucket from Wednesday", () => {
    assert.equal(MIX_CAP_EXPANDED, 5);
    assert.equal(mixCap(new Date("2026-09-02T13:30:00Z")), 5);
    const four = mixCounts(["bull_put", "bull_call", "bull_put", "bull_call"]);
    assert.equal(mixAllows(four, "bull_put", MIX_CAP_EXPANDED), true);
    const five = mixCounts(["bull_put", "bull_call", "bull_put", "bull_call", "bull_put"]);
    assert.equal(mixAllows(five, "bull_put", MIX_CAP_EXPANDED), false);
  });

  it("clears all templates when every bucket is full", () => {
    const counts = mixCounts([
      "bull_put",
      "bull_call",
      "bull_put",
      "bull_call",
      "bear_put",
      "bear_call",
      "bear_put",
      "bear_call",
      "iron_condor",
      "iron_fly",
      "iron_condor",
      "iron_fly",
    ]);
    assert.deepEqual(allowedTemplates(counts, ALL_TEMPLATES), []);
  });

  it("scanExpiry no-trades when mix allows nothing", () => {
    const decision = scanExpiry({
      underlying: "DEMO",
      expiration: "2026-09-11",
      dte: 14,
      spot: DEMO_SPOT,
      equity: 100_000,
      quotes: DEMO_QUOTES,
      asOf: new Date("2026-08-28T16:00:00Z"),
      isOpen: true,
      halt: false,
      cycleId: "mix",
      allowedTemplates: [],
    });
    assert.equal(decision.action, "no_trade");
    if (decision.action === "no_trade") assert.equal(decision.reason, MIX_CAP_REASON);
  });
});
