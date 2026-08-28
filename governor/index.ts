/**
 * Scan CLI. Authored 28 Aug 2026.
 * Default: demo chain through the governor (no broker).
 * Orders still only exist as an MCP payload — this process does not call Alpaca.
 */

import { mcpPayload, scanExpiry } from "./cycle";
import { DEMO_QUOTES, DEMO_SPOT } from "./demo-chain";
import { assertPaperOnly } from "./paper";

function main(): void {
  const live = process.argv.includes("--paper-env");
  if (live) assertPaperOnly();

  const asOf = new Date("2026-08-28T16:00:00Z");
  const cycleId = asOf.toISOString().replace(/[:.]/g, "");
  const decision = scanExpiry({
    underlying: "DEMO",
    expiration: "2026-09-11",
    dte: 14,
    spot: DEMO_SPOT,
    equity: 100_000,
    quotes: DEMO_QUOTES,
    asOf,
    isOpen: true,
    halt: false,
    cycleId,
    ledgerPath: "hackathon/ledger.jsonl",
    preferred: ["bull_put"],
  });
  const door = mcpPayload(decision, cycleId);
  console.log(JSON.stringify({ decision, mcp: door }, null, 2));
}

main();
