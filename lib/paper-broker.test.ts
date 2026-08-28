import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertDataUrl, assertPaperTradingUrl, PAPER_TRADING_ORIGIN } from "./paper-broker";

describe("paper broker URL guards", () => {
  it("allows the paper trading origin", () => {
    assert.doesNotThrow(() => assertPaperTradingUrl(`${PAPER_TRADING_ORIGIN}/v2/account`));
  });
  it("refuses the live trading origin", () => {
    assert.throws(() => assertPaperTradingUrl("https://api.alpaca.markets/v2/account"));
  });
  it("allows data.alpaca.markets", () => {
    assert.doesNotThrow(() => assertDataUrl("https://data.alpaca.markets/v2/stocks/SPY/snapshot"));
  });
});
