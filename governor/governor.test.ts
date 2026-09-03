import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDaysYmd, allowNewRisk, inTenorWindow, manageByDays, pickTenors } from "./calendar";
import {
  classifyOneWayTape,
  classifyTape,
  dropReason,
  keepName,
  majoritySide,
  oneWayTape,
  rankTape,
} from "./tape";
import { sizeQty, spreadOk } from "./paper";
import { buildTemplate } from "./strikes";
import type { OccQuote } from "./types";

describe("calendar", () => {
  it("keeps 0-21 DTE", () => {
    assert.equal(inTenorWindow(-1), false);
    assert.equal(inTenorWindow(0), true);
    assert.equal(inTenorWindow(6), true);
    assert.equal(inTenorWindow(7), true);
    assert.equal(inTenorWindow(21), true);
    assert.equal(inTenorWindow(22), false);
  });
  it("caps manage-by at the 4 Sep window", () => {
    const asOf = new Date("2026-08-31T13:30:00Z");
    assert.equal(manageByDays(21, asOf), 4);
    assert.equal(manageByDays(0, asOf), 1);
  });
  it("adds calendar days on the UTC date", () => {
    assert.equal(addDaysYmd("2026-08-28", 7), "2026-09-04");
  });
  it("blocks new official risk on 4 Sep", () => {
    assert.equal(allowNewRisk(new Date("2026-08-28T16:00:00Z")), true);
    assert.equal(allowNewRisk(new Date("2026-09-04T14:00:00Z")), false);
  });
  it("picks 7/14/21-ish tenors when nothing settles by 4 Sep", () => {
    const rows = [8, 10, 12, 14, 16, 20].map((dte) => ({ dte }));
    assert.deepEqual(
      pickTenors(rows).map((r) => r.dte),
      [8, 14, 20],
    );
  });
  it("keeps 0DTE and other expiries that settle by 4 Sep", () => {
    const rows = [
      { dte: 0, expiration: "2026-08-31" },
      { dte: 3, expiration: "2026-09-03" },
      { dte: 8, expiration: "2026-09-08" },
      { dte: 10, expiration: "2026-09-10" },
      { dte: 14, expiration: "2026-09-14" },
      { dte: 16, expiration: "2026-09-16" },
      { dte: 20, expiration: "2026-09-20" },
    ];
    assert.deepEqual(
      pickTenors(rows).map((r) => r.dte),
      [0, 3, 8, 14, 20],
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
  it("explains drops and still backstops SPY after the cap", () => {
    assert.equal(dropReason({ symbol: "NVDA", last: 180 }, new Set(["NVDA"])), "Already has a package.");
    const classified = classifyTape(
      [
        { symbol: "AAA", last: 20, optionVolume: 9000 },
        { symbol: "BBB", last: 20, optionVolume: 8000 },
        { symbol: "CCC", last: 8, optionVolume: 7000 },
        { symbol: "SPY", last: 400, optionVolume: 10 },
      ],
      new Set(),
      1,
    );
    assert.deepEqual(classified.kept, ["AAA", "SPY"]);
    assert.equal(classified.rows.find((r) => r.symbol === "BBB")?.reason, "Below tape cap (1).");
    assert.equal(classified.rows.find((r) => r.symbol === "CCC")?.reason, "Last under $10.");
    assert.equal(classified.rows.find((r) => r.symbol === "SPY")?.reason, "Index backstop.");
  });
  it("drops a name that was stopped this session", () => {
    assert.equal(
      dropReason({ symbol: "SNXX", last: 13.7 }, new Set(), new Set(["SNXX"])),
      "Stopped this session.",
    );
    const classified = classifyTape(
      [
        { symbol: "SNXX", last: 13.7, optionVolume: 9000 },
        { symbol: "SPY", last: 400, optionVolume: 10 },
      ],
      new Set(),
      15,
      new Set(["SNXX"]),
    );
    assert.equal(classified.rows.find((r) => r.symbol === "SNXX")?.reason, "Stopped this session.");
    assert.ok(!classified.kept.includes("SNXX"));
  });
  it("turns on one-way tape from Thursday", () => {
    assert.equal(oneWayTape(new Date("2026-09-02T20:00:00Z")), false);
    assert.equal(oneWayTape(new Date("2026-09-03T13:30:00Z")), true);
  });
  it("keeps a same-way cluster and drops the other side", () => {
    const classified = classifyOneWayTape(
      [
        { symbol: "SPY", last: 660, changePct: 0.8, optionVolume: 100 },
        { symbol: "NVDA", last: 180, changePct: 2.4, optionVolume: 9000 },
        { symbol: "AMD", last: 160, changePct: 1.9, optionVolume: 8000 },
        { symbol: "AVGO", last: 300, changePct: 1.5, optionVolume: 7000 },
        { symbol: "XOM", last: 110, changePct: 1.2, optionVolume: 6000 },
        { symbol: "JPM", last: 200, changePct: -1.1, optionVolume: 5000 },
      ],
      new Set(),
    );
    assert.equal(classified.side, "up");
    assert.equal(classified.cluster, "semi");
    assert.deepEqual(classified.kept, ["NVDA", "AMD", "AVGO"]);
    assert.equal(classified.rows.find((r) => r.symbol === "JPM")?.reason, "Wrong way (session up).");
    assert.equal(classified.rows.find((r) => r.symbol === "XOM")?.reason, "Outside the semi cluster.");
  });
  it("idles when SPY and the tape are two-sided", () => {
    const classified = classifyOneWayTape(
      [
        { symbol: "SPY", last: 660, changePct: 0.05, optionVolume: 100 },
        { symbol: "QQQ", last: 480, changePct: -0.04, optionVolume: 90 },
        { symbol: "NVDA", last: 180, changePct: 0.2, optionVolume: 9000 },
        { symbol: "JPM", last: 200, changePct: -0.2, optionVolume: 8000 },
      ],
      new Set(),
    );
    assert.equal(classified.side, null);
    assert.deepEqual(classified.kept, []);
    assert.equal(classified.rows.find((r) => r.symbol === "NVDA")?.reason, "Session is not one-way.");
  });
  it("follows the green sleeve, not the larger losing count", () => {
    assert.equal(
      majoritySide([
        { symbol: "AAPL", template: "bull_put", pnl: -6 },
        { symbol: "INTC", template: "bull_put", pnl: 216 },
        { symbol: "IBIT", template: "bull_put", pnl: 72 },
        { symbol: "SOFI", template: "bull_put", pnl: 0 },
        { symbol: "AAL", template: "bear_call", pnl: -84 },
        { symbol: "PCG", template: "bear_call", pnl: -480 },
        { symbol: "SNXX", template: "bear_call", pnl: -240 },
        { symbol: "SQQQ", template: "bull_put", pnl: -180 },
        { symbol: "SOXS", template: "bear_call", pnl: 56 },
        { symbol: "TQQQ", template: "bear_call", pnl: -144 },
        { symbol: "SPY", template: "iron_condor", pnl: -8 },
        { symbol: "QQQ", template: "iron_condor", pnl: 170 },
      ]),
      "up",
    );
    assert.equal(
      majoritySide([
        { symbol: "AAPL", template: "bull_put", pnl: -10 },
        { symbol: "INTC", template: "bull_put", pnl: -10 },
        { symbol: "AAL", template: "bear_call", pnl: 50 },
      ]),
      "down",
    );
    assert.equal(
      majoritySide([
        { symbol: "AAPL", template: "bull_put", pnl: -100 },
        { symbol: "AAL", template: "bear_call", pnl: -80 },
      ]),
      null,
    );
  });
  it("scans names that trade with the profitable packages", () => {
    const classified = classifyOneWayTape(
      [
        { symbol: "SPY", last: 660, changePct: -1.2, optionVolume: 100 },
        { symbol: "MSFT", last: 420, changePct: 1.1, optionVolume: 5000 },
        { symbol: "AMD", last: 160, changePct: 1.4, optionVolume: 4000 },
        { symbol: "HOOD", last: 22, changePct: 0.9, optionVolume: 3000 },
        { symbol: "COIN", last: 250, changePct: 1.2, optionVolume: 3500 },
        { symbol: "XOM", last: 110, changePct: 2.0, optionVolume: 6000 },
        { symbol: "JPM", last: 200, changePct: -1.1, optionVolume: 2000 },
      ],
      new Set(["AAPL", "INTC", "SOFI", "IBIT"]),
      15,
      new Set(),
      [
        { symbol: "AAPL", template: "bull_put", pnl: -6 },
        { symbol: "INTC", template: "bull_put", pnl: 216 },
        { symbol: "SOFI", template: "bull_put", pnl: 0 },
        { symbol: "IBIT", template: "bull_put", pnl: 72 },
        { symbol: "AAL", template: "bear_call", pnl: -84 },
        { symbol: "PCG", template: "bear_call", pnl: -480 },
        { symbol: "SNXX", template: "bear_call", pnl: -240 },
      ],
    );
    assert.equal(classified.side, "up");
    assert.equal(classified.sideSource, "book");
    assert.ok(classified.kept.includes("AMD"));
    assert.ok(classified.kept.includes("COIN"));
    assert.ok(!classified.kept.includes("MSFT"));
    assert.ok(!classified.kept.includes("HOOD"));
    assert.ok(!classified.kept.includes("XOM"));
    assert.equal(classified.rows.find((r) => r.symbol === "JPM")?.reason, "Wrong way (book up).");
    assert.equal(classified.rows.find((r) => r.symbol === "XOM")?.reason, "Does not trade with the profitable names.");
  });
  it("idles when the open book has no green side", () => {
    const classified = classifyOneWayTape(
      [
        { symbol: "SPY", last: 660, changePct: 1.2, optionVolume: 100 },
        { symbol: "NVDA", last: 180, changePct: 2.0, optionVolume: 9000 },
      ],
      new Set(["AAPL"]),
      15,
      new Set(),
      [{ symbol: "AAPL", template: "bull_put", pnl: -50 }],
    );
    assert.equal(classified.side, null);
    assert.deepEqual(classified.kept, []);
    assert.equal(classified.rows.find((r) => r.symbol === "NVDA")?.reason, "No profitable side to follow.");
  });
  it("keeps a lone strong name when no cohort has two members", () => {
    const classified = classifyOneWayTape(
      [
        { symbol: "SPY", last: 660, changePct: -0.9, optionVolume: 100 },
        { symbol: "DELL", last: 120, changePct: -3.2, optionVolume: 4000 },
      ],
      new Set(),
    );
    assert.equal(classified.side, "down");
    assert.equal(classified.cluster, "single");
    assert.deepEqual(classified.kept, ["DELL"]);
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
