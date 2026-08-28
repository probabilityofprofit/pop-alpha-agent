import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cell, simulateHoldMap } from "./map";
import { buildTemplate } from "./strikes";
import { DEMO_QUOTES, DEMO_SPOT } from "./demo-chain";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("hold map", () => {
  it("returns expiry POP and target cells", () => {
    const pkg = buildTemplate("bull_put", DEMO_QUOTES, DEMO_SPOT, "DEMO", "2026-09-11", 14);
    assert.ok(pkg);
    const map = simulateHoldMap(pkg!, DEMO_SPOT, lcg(7));
    assert.ok(map);
    assert.ok(map!.popAtExpiration >= 0);
    assert.ok(map!.popAtExpiration <= 100);
    assert.ok(cell(map!, 14, 50) >= 0);
    assert.ok(cell(map!, 1, 25) >= 0);
  });
});
