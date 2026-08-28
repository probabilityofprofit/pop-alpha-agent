import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOK_CAP,
  DEFAULT_MAX_QTY,
  EQUITY_FLOOR,
  SESSION_OPEN_CAP,
  capQty,
  cancelPayload,
  clearCloseAttempts,
  fillsToLog,
  loopSendEnabled,
  recordCloseFailure,
  skippedScanReason,
  uniqueIds,
  workingDayOrders,
} from "./loop-policy";

describe("loopSendEnabled", () => {
  it("is off unless LOOP_SEND is the string true", () => {
    assert.equal(loopSendEnabled(undefined), false);
    assert.equal(loopSendEnabled("1"), false);
    assert.equal(loopSendEnabled("true"), true);
  });
});

describe("official week limits", () => {
  it("pairs a 10% book with a $90k halt and five session opens", () => {
    assert.equal(BOOK_CAP, 0.1);
    assert.equal(EQUITY_FLOOR, 90_000);
    assert.equal(SESSION_OPEN_CAP, 5);
    assert.equal(DEFAULT_MAX_QTY, 12);
  });
});

describe("capQty", () => {
  it("defaults to 12 lots when LOOP_MAX_QTY is unset", () => {
    assert.equal(capQty(45, undefined), 12);
    assert.equal(capQty(45, ""), 12);
    assert.equal(capQty(7, undefined), 7);
  });
  it("clamps to a positive integer cap", () => {
    assert.equal(capQty(45, "1"), 1);
    assert.equal(capQty(1, "5"), 1);
  });
});

describe("workingDayOrders", () => {
  it("keeps open DAY tickets and drops terminal ones", () => {
    const kept = workingDayOrders([
      { id: "a", status: "new" },
      { id: "b", status: "filled" },
      { id: "c", status: "accepted" },
      { id: "d", status: "canceled" },
    ]);
    assert.deepEqual(
      kept.map((o) => o.id),
      ["a", "c"],
    );
  });
});

describe("skippedScanReason", () => {
  const base = {
    isOpen: true,
    allowNewRisk: true,
    lastFifteen: false,
    scanDue: false,
    sessionCapped: false,
    halt: false,
    hasPending: false,
  };
  it("logs idle no-trade when the 15m scan is not due", () => {
    assert.equal(skippedScanReason(base), "Scan not due.");
  });
  it("logs cash closed when the session is shut", () => {
    assert.equal(skippedScanReason({ ...base, isOpen: false }), "Cash session closed.");
  });
  it("logs clock halt in the last 15 minutes", () => {
    assert.equal(
      skippedScanReason({ ...base, lastFifteen: true }),
      "New risk closed for this clock.",
    );
  });
  it("logs session cap when a scan is due", () => {
    assert.equal(
      skippedScanReason({ ...base, scanDue: true, sessionCapped: true }),
      `Session cap: ${SESSION_OPEN_CAP} new opens.`,
    );
  });
  it("yields to an exit or cancel already pending", () => {
    assert.equal(
      skippedScanReason({ ...base, scanDue: true, hasPending: true }),
      "Exit or cancel owns this tick.",
    );
  });
  it("returns null when a scan should run", () => {
    assert.equal(skippedScanReason({ ...base, scanDue: true }), null);
  });
});

describe("fillsToLog", () => {
  it("emits new pop-alpha fills once", () => {
    const rows = fillsToLog(
      [
        { id: "1", client_order_id: "pop-alpha-1", status: "filled", filled_qty: "1" },
        { id: "1", client_order_id: "pop-alpha-1", status: "filled", filled_qty: "1" },
        { id: "2", client_order_id: "other", status: "filled", filled_qty: "1" },
        { id: "3", client_order_id: "pop-alpha-2", status: "new", filled_qty: "0" },
      ],
      ["1"],
    );
    assert.equal(rows.length, 0);
  });
  it("includes a first-time fill", () => {
    const rows = fillsToLog(
      [{ id: "9", client_order_id: "pop-alpha-x", status: "filled", filled_qty: "1" }],
      [],
    );
    assert.equal(rows[0]?.id, "9");
  });
});

describe("close attempts", () => {
  it("switches to legwise after two failures", () => {
    const one = recordCloseFailure({}, "SPY");
    assert.equal(one.legwise, false);
    const two = recordCloseFailure(one.attempts, "SPY");
    assert.equal(two.legwise, true);
    assert.deepEqual(clearCloseAttempts(two.attempts, "SPY"), {});
  });
});

describe("cancel payload", () => {
  it("maps every working id", () => {
    assert.deepEqual(cancelPayload(["a", "b"]), [{ order_id: "a" }, { order_id: "b" }]);
  });
  it("uniqueIds drops empties and repeats", () => {
    assert.deepEqual(uniqueIds(["a", "a", "", "b"], ["b"]), ["a"]);
  });
});
