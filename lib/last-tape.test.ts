import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastTapeFromLedger } from "./last-tape";

describe("lastTapeFromLedger", () => {
  it("rebuilds kept names from the newest cycle row", () => {
    const tape = lastTapeFromLedger([
      { kind: "mark", ts: "2026-08-31T14:00:00Z" },
      { kind: "cycle", ts: "2026-08-31T13:45:00Z", tape: ["SPY", "QQQ"], decision: "no_trade" },
    ]);
    assert.deepEqual(tape?.kept, ["SPY", "QQQ"]);
    assert.equal(tape?.rows[0]?.reason, "On tape (ledger).");
  });
});
