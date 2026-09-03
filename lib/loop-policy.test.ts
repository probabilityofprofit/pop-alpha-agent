import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOK_CAP,
  BOOK_CAP_EXPANDED,
  BOOK_CAP_THURSDAY,
  DEFAULT_MAX_QTY,
  EQUITY_FLOOR,
  EQUITY_FLOOR_EXPANDED,
  EQUITY_FLOOR_THURSDAY,
  OPEN_SCAN_EVERY_MS,
  SCAN_EVERY_MS,
  bookCap,
  capQty,
  equityFloor,
  inOpeningScanWindow,
  scanIntervalMs,
  cancelPayload,
  clearCloseAttempts,
  countSessionOpens,
  fillsToLog,
  isGovernorOpenId,
  isGovernorCloseId,
  isQtyLockedCloseError,
  loopSendEnabled,
  MARK_GONE_CLOSE_CANCEL,
  nextClosePlan,
  packageOpenedAt,
  recordCloseFailure,
  sessionStoppedNames,
  skippedScanReason,
  STALE_CLOSE_CANCEL,
  uniqueIds,
  workingDayOrders,
  workingGovernorOpens,
} from "./loop-policy";

describe("loopSendEnabled", () => {
  it("is off unless LOOP_SEND is the string true", () => {
    assert.equal(loopSendEnabled(undefined), false);
    assert.equal(loopSendEnabled("1"), false);
    assert.equal(loopSendEnabled("true"), true);
  });
});

describe("opening scan cadence", () => {
  it("is 2.5 minutes from 9:30–10:30 ET, then 15 minutes", () => {
    const open = new Date("2026-08-31T13:35:00Z");
    const after = new Date("2026-08-31T14:35:00Z");
    assert.equal(inOpeningScanWindow(open), true);
    assert.equal(inOpeningScanWindow(after), false);
    assert.equal(scanIntervalMs(open), OPEN_SCAN_EVERY_MS);
    assert.equal(scanIntervalMs(after), SCAN_EVERY_MS);
    assert.equal(OPEN_SCAN_EVERY_MS, 150_000);
  });
});

describe("official week limits", () => {
  it("steps 10% / $90k Tue, 15% / $85k Wed, 20% / $80k from Thursday", () => {
    assert.equal(BOOK_CAP, 0.1);
    assert.equal(BOOK_CAP_EXPANDED, 0.15);
    assert.equal(BOOK_CAP_THURSDAY, 0.2);
    assert.equal(EQUITY_FLOOR, 90_000);
    assert.equal(EQUITY_FLOOR_EXPANDED, 85_000);
    assert.equal(EQUITY_FLOOR_THURSDAY, 80_000);
    assert.equal(bookCap(new Date("2026-09-01T20:00:00Z")), 0.1);
    assert.equal(equityFloor(new Date("2026-09-01T20:00:00Z")), 90_000);
    assert.equal(bookCap(new Date("2026-09-02T13:30:00Z")), 0.15);
    assert.equal(equityFloor(new Date("2026-09-02T13:30:00Z")), 85_000);
    assert.equal(bookCap(new Date("2026-09-03T13:30:00Z")), 0.2);
    assert.equal(equityFloor(new Date("2026-09-03T13:30:00Z")), 80_000);
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
  it("splits governor opens from closes", () => {
    const orders = [
      { id: "open", status: "new", client_order_id: "pop-alpha-2026-09-01T150000000Z" },
      { id: "close", status: "new", client_order_id: "pop-alpha-x-2026-09-01T150100000Z" },
    ];
    assert.deepEqual(
      workingGovernorOpens(orders).map((o) => o.id),
      ["open"],
    );
  });
});

describe("nextClosePlan", () => {
  const occs = ["SOXS260904C00055000", "SOXS260904C00060000"];
  const working = {
    id: "stuck",
    status: "new",
    client_order_id: "pop-alpha-x-2026-09-01T154144067Z",
    limit_price: "0.62",
    legs: [{ symbol: "SOXS260904C00055000" }, { symbol: "SOXS260904C00060000" }],
  };
  it("does not restack a marketable working close", () => {
    assert.equal(
      nextClosePlan({ occs, join: 0.6, shouldExit: true, quotesLive: true, orders: [working] }).kind,
      "wait",
    );
  });
  it("cancels when join walks through the working debit (SOXS 0.62 vs 1.15)", () => {
    const plan = nextClosePlan({
      occs,
      join: 1.15,
      shouldExit: true,
      quotesLive: true,
      orders: [working],
    });
    assert.deepEqual(plan, { kind: "cancel", orderId: "stuck", reason: STALE_CLOSE_CANCEL });
  });
  it("cancels a working close after the mark is no longer take/stop", () => {
    const plan = nextClosePlan({
      occs,
      join: 0.5,
      shouldExit: false,
      quotesLive: true,
      orders: [working],
    });
    assert.deepEqual(plan, { kind: "cancel", orderId: "stuck", reason: MARK_GONE_CLOSE_CANCEL });
  });
  it("places when take/stop fires and nothing is working", () => {
    assert.equal(
      nextClosePlan({ occs, join: 1.15, shouldExit: true, quotesLive: true, orders: [] }).kind,
      "place",
    );
  });
  it("does not treat qty-lock rejects as close failures", () => {
    assert.equal(isQtyLockedCloseError("paper POST order 403: insufficient qty available"), true);
    assert.equal(isQtyLockedCloseError("paper POST order 422: unknown symbol"), false);
  });
});

describe("skippedScanReason", () => {
  const base = {
    isOpen: true,
    allowNewRisk: true,
    lastFifteen: false,
    scanDue: false,
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

describe("session opens vs closes", () => {
  it("counts filled opens and ignores close client ids", () => {
    const day = "2026-08-31";
    const n = countSessionOpens(
      [
        {
          order_class: "mleg",
          status: "filled",
          filled_qty: "9",
          client_order_id: "pop-alpha-2026-08-31T133420444Z",
          submitted_at: "2026-08-31T13:34:33Z",
        },
        {
          order_class: "mleg",
          status: "filled",
          filled_qty: "9",
          client_order_id: "pop-alpha-x-2026-08-31T133533082Z",
          submitted_at: "2026-08-31T13:35:34Z",
        },
        {
          order_class: "mleg",
          status: "canceled",
          filled_qty: "0",
          client_order_id: "pop-alpha-2026-08-31T132959982Z",
          submitted_at: "2026-08-31T13:30:19Z",
        },
      ],
      day,
    );
    assert.equal(n, 1);
    assert.equal(isGovernorOpenId("pop-alpha-2026-08-31T133420444Z"), true);
    assert.equal(isGovernorOpenId("pop-alpha-x-2026-08-31T133533082Z"), false);
    assert.equal(isGovernorCloseId("pop-alpha-x-2026-08-31T133533082Z"), true);
    assert.equal(isGovernorCloseId("pop-alpha-2026-08-31T133420444Z"), false);
  });
  it("collects names stopped this session from exit rows", () => {
    assert.deepEqual(
      sessionStoppedNames(
        [
          { ts: "2026-08-31T13:35:33.082Z", kind: "exit", underlying: "SNXX", reason: "Stop 50% of defined risk." },
          { ts: "2026-08-31T13:40:44.413Z", kind: "exit", underlying: "SNXX", reason: "Stop 50% of defined risk." },
          { ts: "2026-08-31T13:50:00.000Z", kind: "exit", underlying: "SPY", reason: "Take 50% of max profit." },
          { ts: "2026-08-30T13:35:33.082Z", kind: "exit", underlying: "NVDA", reason: "Stop 50% of defined risk." },
        ],
        "2026-08-31",
      ),
      ["SNXX"],
    );
  });
  it("uses the open fill time for hold", () => {
    const opened = packageOpenedAt(
      ["SNXX260904C00013500", "SNXX260904C00014500"],
      [
        {
          client_order_id: "pop-alpha-2026-08-31T133734477Z",
          status: "filled",
          filled_qty: "12",
          filled_at: "2026-08-31T13:40:41Z",
          submitted_at: "2026-08-31T13:37:43Z",
          legs: [{ symbol: "SNXX260904C00013500" }, { symbol: "SNXX260904C00014500" }],
        },
        {
          client_order_id: "pop-alpha-x-2026-08-31T134044413Z",
          status: "filled",
          filled_qty: "12",
          filled_at: "2026-08-31T13:42:12Z",
          legs: [{ symbol: "SNXX260904C00013500" }, { symbol: "SNXX260904C00014500" }],
        },
      ],
    );
    assert.equal(opened?.toISOString(), "2026-08-31T13:40:41.000Z");
  });
});
