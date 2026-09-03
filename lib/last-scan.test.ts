import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { LastScan } from "./desk-types";
import { exhibitScan, isExhibitScan, saveLastScan } from "./last-scan";

const propose: LastScan = {
  at: "2026-09-02T15:30:00.000Z",
  source: "paper",
  underlying: "SPY",
  expiration: "2026-09-11",
  spot: 500,
  equity: 100_000,
  decision: {
    action: "propose",
    package: {
      underlying: "SPY",
      expiration: "2026-09-11",
      dte: 9,
      template: "bull_put",
      legs: [],
      credit: true,
      netPoints: 1,
      maxProfit: 100,
      maxLoss: 100,
    },
    qty: 1,
    limit: 1,
    map: {
      popAtExpiration: 55,
      meanPnl: 10,
      popAtManageBy: 50,
      meanPnlAtManageBy: 10,
      cells: { 1: { 25: 40, 50: 30, 75: 20, 100: 10 } },
    },
    manageByDays: 2,
  },
  mcp: {
    qty: "1",
    type: "limit",
    time_in_force: "day",
    order_class: "mleg",
    limit_price: "-1.00",
    client_order_id: "pop-alpha-test",
    legs: [
      { symbol: "SPY260911P00500000", ratio_qty: "1", side: "sell", position_intent: "sell_to_open" },
      { symbol: "SPY260911P00495000", ratio_qty: "1", side: "buy", position_intent: "buy_to_open" },
    ],
  },
};

const idle: LastScan = {
  at: "2026-09-03T19:00:00.000Z",
  source: "paper",
  underlying: "",
  expiration: "",
  spot: 0,
  equity: 96_000,
  decision: { action: "no_trade", reason: "New risk closed for this clock." },
  mcp: null,
};

describe("last-scan exhibit freeze", () => {
  const dirs: string[] = [];
  after(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it("recognizes a full propose exhibit", () => {
    assert.equal(isExhibitScan(propose), true);
    assert.equal(isExhibitScan(idle), false);
  });

  it("freezes the last propose when the live scan is empty", () => {
    const shown = exhibitScan(idle, propose);
    assert.equal(shown.frozen, true);
    assert.equal(shown.scan?.decision.action, "propose");
    assert.ok(shown.scan?.mcp);
  });

  it("uses a live propose instead of the freeze", () => {
    const live = { ...propose, at: "2026-09-03T14:00:00.000Z", underlying: "QQQ" };
    const shown = exhibitScan(live, propose);
    assert.equal(shown.frozen, false);
    assert.equal(shown.scan?.underlying, "QQQ");
  });

  it("persists last-propose only when saving a full propose", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "last-scan-"));
    dirs.push(dir);
    const scanPath = path.join(dir, "last-scan.json");
    const proposePath = path.join(dir, "last-propose.json");
    saveLastScan(propose, scanPath, proposePath);
    saveLastScan(idle, scanPath, proposePath);
    const frozen = JSON.parse(readFileSync(proposePath, "utf8")) as LastScan;
    const live = JSON.parse(readFileSync(scanPath, "utf8")) as LastScan;
    assert.equal(frozen.decision.action, "propose");
    assert.equal(live.decision.action, "no_trade");
  });
});
