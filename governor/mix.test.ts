import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIX_CAP, MIX_CAP_REASON, allowedTemplates, mixAllows, mixBucket, mixCounts } from "./mix";
import { ALL_TEMPLATES } from "./strikes";
import { scanExpiry } from "./cycle";
import { DEMO_QUOTES, DEMO_SPOT } from "./demo-chain";

describe("mix 2/2/2", () => {
  it("buckets verticals and irons", () => {
    assert.equal(mixBucket("bull_put"), "bull");
    assert.equal(mixBucket("bull_call"), "bull");
    assert.equal(mixBucket("bear_call"), "bear");
    assert.equal(mixBucket("bear_put"), "bear");
    assert.equal(mixBucket("iron_condor"), "iron");
    assert.equal(mixBucket("iron_fly"), "iron");
  });

  it("blocks a third bull", () => {
    const counts = mixCounts(["bull_put", "bull_call"]);
    assert.equal(MIX_CAP, 2);
    assert.equal(mixAllows(counts, "bull_put"), false);
    assert.equal(mixAllows(counts, "bear_call"), true);
    assert.equal(mixAllows(counts, "iron_condor"), true);
  });

  it("clears all templates when every bucket is full", () => {
    const counts = mixCounts([
      "bull_put",
      "bull_call",
      "bear_put",
      "bear_call",
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
