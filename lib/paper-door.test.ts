import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { assertSendablePlace, closeMleg, openMleg } from "../governor/door";
import { dummyLeg } from "./closer";
import { writeHalt } from "./paper-door";
import type { Package } from "../governor/types";

function pkg(): Package {
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
      dummyLeg({ occ: "SPY260911P00773000", side: "sell", right: "put", strike: 773, bid: 5.65, ask: 5.67 }),
      dummyLeg({ occ: "SPY260911P00771000", side: "buy", right: "put", strike: 771, bid: 4.9, ask: 4.91 }),
    ],
  };
}

describe("assertSendablePlace", () => {
  it("accepts a governor mleg DAY limit", () => {
    assert.doesNotThrow(() => assertSendablePlace(openMleg(pkg(), 1, 0.74, "pop-alpha-test")));
    assert.doesNotThrow(() => assertSendablePlace(closeMleg(pkg(), 1, 0.91, "pop-alpha-x-test")));
  });
  it("rejects market, live-shaped ids, and single legs", () => {
    const ok = openMleg(pkg(), 1, 0.74, "pop-alpha-test");
    assert.throws(() => assertSendablePlace({ ...ok, type: "market" as "limit" }));
    assert.throws(() => assertSendablePlace({ ...ok, time_in_force: "gtc" as "day" }));
    assert.throws(() => assertSendablePlace({ ...ok, client_order_id: "manual-1" }));
    assert.throws(() => assertSendablePlace({ ...ok, legs: ok.legs.slice(0, 1) }));
  });
});

describe("writeHalt", () => {
  it("writes a reason with no secrets", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pop-halt-"));
    try {
      const file = path.join(dir, "HALT");
      writeHalt("equity floor", file);
      const text = readFileSync(file, "utf8");
      assert.match(text, /equity floor/);
      assert.doesNotMatch(text, /AK/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
