/** Run a governor scan for the desk. Authored 28 Aug 2026. Does not place orders. */

import { dteFrom, pickTenors, tenorBounds } from "../governor/calendar";
import { mcpPayload, scanExpiry } from "../governor/cycle";
import { DEMO_QUOTES, DEMO_SPOT } from "../governor/demo-chain";
import type { Template } from "../governor/types";
import type { LastScan } from "./desk-types";
import { saveLastScan } from "./last-scan";
import { getAccount, getClock, getOptionChain, getStockSpot, haltPresent } from "./paper-broker";
import { LEDGER_PATH } from "./paths";
import { expirationsInSnapshots, quotesFromSnapshots } from "./quotes-from-chain";

function cycleId(asOf: Date): string {
  return asOf.toISOString().replace(/[:.]/g, "");
}

export async function runDeskScan(input: {
  source: "demo" | "paper";
  symbol?: string;
  expiration?: string;
  preferred?: Template[];
}): Promise<LastScan> {
  const asOf = new Date();
  const id = cycleId(asOf);

  if (input.source === "demo") {
    const expiration = input.expiration ?? "2026-09-11";
    const decision = scanExpiry({
      underlying: "DEMO",
      expiration,
      dte: dteFrom(expiration, asOf) || 14,
      spot: DEMO_SPOT,
      equity: 100_000,
      quotes: DEMO_QUOTES,
      asOf,
      isOpen: true,
      halt: haltPresent(),
      cycleId: id,
      ledgerPath: LEDGER_PATH,
      preferred: input.preferred ?? ["bull_put"],
    });
    const row: LastScan = {
      at: asOf.toISOString(),
      source: "demo",
      underlying: "DEMO",
      expiration,
      spot: DEMO_SPOT,
      equity: 100_000,
      decision,
      mcp: mcpPayload(decision, id),
      note: "Demo chain. No broker. MCP JSON is not sent.",
    };
    saveLastScan(row);
    return row;
  }

  const symbol = (input.symbol ?? "SPY").toUpperCase();
  const [clock, account] = await Promise.all([getClock(), getAccount()]);
  const equity = Number(account.equity);
  const halt = haltPresent() || equity <= 95_000;
  const bounds = tenorBounds(asOf);
  const chain = await getOptionChain({
    underlying: symbol,
    expiration: input.expiration,
    expirationGte: input.expiration ? undefined : bounds.gte,
    expirationLte: input.expiration ? undefined : bounds.lte,
  });
  const spot = await getStockSpot(symbol);
  const expiries = input.expiration
    ? [input.expiration]
    : pickTenors(expirationsInSnapshots(chain.snapshots).map((expiration) => ({ expiration, dte: dteFrom(expiration, asOf) }))).map(
        (r) => r.expiration,
      );
  const expiration = expiries.find((e) => dteFrom(e, asOf) >= 7) ?? expiries[0];
  if (!expiration) {
    const decision = { action: "no_trade" as const, reason: "No 7–21 DTE expiry on the paper chain." };
    const row: LastScan = {
      at: asOf.toISOString(),
      source: "paper",
      underlying: symbol,
      expiration: "",
      spot,
      equity,
      decision,
      mcp: null,
    };
    saveLastScan(row);
    return row;
  }

  const quotes = quotesFromSnapshots(chain.snapshots, expiration);
  const decision = scanExpiry({
    underlying: symbol,
    expiration,
    dte: dteFrom(expiration, asOf),
    spot,
    equity: Number.isFinite(equity) ? equity : 100_000,
    quotes,
    asOf,
    isOpen: clock.is_open,
    halt,
    cycleId: id,
    ledgerPath: LEDGER_PATH,
    preferred: input.preferred,
  });
  const row: LastScan = {
    at: asOf.toISOString(),
    source: "paper",
    underlying: symbol,
    expiration,
    spot,
    equity,
    decision,
    mcp: mcpPayload(decision, id),
    note: "Paper tape. Desk does not call place_option_order. Copy the MCP payload into Cursor.",
  };
  saveLastScan(row);
  return row;
}
