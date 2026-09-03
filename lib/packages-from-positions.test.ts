import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { booksFromPositions, groupPositionsForBlotter, inferTemplate, templateFromWorkingLegs } from "./packages-from-positions";
import { dummyLeg } from "./closer";
import type { PaperPosition } from "./paper-broker";

function pos(
  symbol: string,
  side: "long" | "short",
  entry: string,
  upl = "0",
): PaperPosition {
  return {
    symbol,
    asset_class: "us_option",
    side,
    qty: "1",
    avg_entry_price: entry,
    current_price: entry,
    market_value: "100",
    unrealized_pl: upl,
  };
}

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
  it("groups blotter legs by strategy", () => {
    const groups = groupPositionsForBlotter(
      [
        pos("NVDA260904C00220000", "short", "4", "101"),
        pos("NVDA260904C00225000", "long", "2.17", "-73"),
        pos("SPY260911P00773000", "short", "5.65"),
        pos("SPY260911P00771000", "long", "4.91"),
      ],
      new Date("2026-08-29T16:00:00Z"),
    );
    assert.equal(groups.length, 2);
    const nvda = groups.find((g) => g.key.startsWith("NVDA"));
    const spy = groups.find((g) => g.key.startsWith("SPY"));
    assert.equal(nvda?.template, "bear_call");
    assert.equal(spy?.template, "bull_put");
    assert.equal(nvda?.expiration, "2026-09-04");
    assert.equal(nvda?.dte, 6);
    assert.equal(nvda?.credit, true);
    assert.equal(nvda?.entryNet, 1.83);
    assert.equal(nvda?.maxProfit, 183);
    assert.equal(nvda?.strategyUpl, 28);
    assert.ok(nvda?.pctOfMaxProfit != null);
    assert.ok(Math.abs(nvda!.pctOfMaxProfit! - (100 * 28) / 183) < 0.01);
  });
  it("carries package unrealized P&L", () => {
    const books = booksFromPositions(
      [
        pos("NVDA260904C00220000", "short", "4", "101"),
        pos("NVDA260904C00225000", "long", "2.17", "-73"),
      ],
      {},
      new Date("2026-08-29T16:00:00Z"),
    );
    assert.equal(books.length, 1);
    assert.equal(books[0]?.pnl, 28);
  });
});
