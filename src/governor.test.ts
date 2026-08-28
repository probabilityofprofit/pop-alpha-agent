import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inTenorWindow, manageByDays, pickTenors } from "./calendar.ts";
import { keepName, rankTape } from "./tape.ts";
import { sizeQty, spreadOk } from "./paper.ts";
import { buildTemplate } from "./strikes.ts";
import type { OccQuote } from "./types.ts";

describe("calendar", () => {
  it("keeps 7-21 DTE", () => {
    assert.equal(inTenorWindow(6), false);
    assert.equal(inTenorWindow(7), true);
    assert.equal(inTenorWindow(21), true);
    assert.equal(inTenorWindow(22), false);
  });
  it("caps manage-by at the 4 Sep window", () => {
    const asOf = new Date("2026-08-31T13:30:00Z");
    assert.equal(manageByDays(21, asOf), 4);
  });
  it("picks 7/14/21-ish tenors", () => {
    const rows = [8, 10, 12, 14, 16, 20].map((dte) => ({ dte }));
    assert.deepEqual(
      pickTenors(rows).map((r) => r.dte),
      [8, 14, 20],
    );
  });
});

describe("tape", () => {
  it("drops cheap, crypto, and open names", () => {
    assert.equal(keepName({ symbol: "X", last: 9 }, new Set()), false);
    assert.equal(keepName({ symbol: "X", last: 11, crypto: true }, new Set()), false);
    assert.equal(keepName({ symbol: "SPY", last: 400 }, new Set(["SPY"])), false);
  });
  it("ranks by option volume and keeps SPY", () => {
    const top = rankTape(
      [
        { symbol: "AAA", last: 20, optionVolume: 2000, shortOi: 600 },
        { symbol: "SPY", last: 400, optionVolume: 100, shortOi: 100 },
      ],
      new Set(),
    );
    assert.ok(top.some((n) => n.symbol === "AAA"));
    assert.ok(top.some((n) => n.symbol === "SPY"));
  });
});

describe("paper", () => {
  it("sizes 1% of equity", () => {
    assert.equal(sizeQty(100_000, 250), 4);
    assert.equal(sizeQty(100_000, 2000), 0);
  });
  it("rejects wide quotes", () => {
    assert.equal(spreadOk(1, 1.05), true);
    assert.equal(spreadOk(1, 1.5), false);
  });
});

function q(occ: string, right: "call" | "put", strike: number, bid: number, extra: Partial<OccQuote> = {}): OccQuote {
  return {
    occ,
    right,
    strike,
    bid,
    ask: bid + 0.05,
    oi: 400,
    iv: 0.22,
    delta: right === "put" ? -0.45 : 0.45,
    volume: 2000,
    ...extra,
  };
}

describe("strikes", () => {
  const puts = [100, 99, 98, 97, 96].map((k, i) => q(`P${k}`, "put", k, 2 - i * 0.3));
  it("builds a bull put two listed strikes wide", () => {
    const pkg = buildTemplate("bull_put", puts, 100, "TEST", "2026-09-11", 14);
    assert.ok(pkg);
    assert.equal(pkg!.credit, true);
    const strikes = pkg!.legs.map((l) => l.strike).sort((a, b) => b - a);
    assert.deepEqual(strikes, [100, 98]);
  });
});
