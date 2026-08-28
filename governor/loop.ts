/**
 * Unattended paper loop. Authored 28 Aug 2026.
 * Prints MCP payloads. Does not call place_option_order.
 */

import { loadEnvLocal } from "../lib/load-env";
loadEnvLocal();

import { assertPaperOnly } from "./paper";
import { EXIT_EVERY_MS, tick } from "../lib/loop";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  assertPaperOnly();
  const once = process.argv.includes("--once");
  const forceScan = process.argv.includes("--scan-now");
  let lastScanAt: number | undefined;
  console.log(JSON.stringify({ note: "POP Alpha loop. Paper reads only. MCP is the door." }));
  do {
    const row = await tick({ forceScan: forceScan && !lastScanAt, lastScanAt });
    if (row.scan) lastScanAt = Date.now();
    console.log(
      JSON.stringify({
        at: row.at,
        open: row.isOpen,
        halt: row.halt,
        lastFifteen: row.lastFifteen,
        opensThisSession: row.opensThisSession,
        thesis: row.thesis.skip ? row.thesis.reason : row.thesis.hint,
        exits: row.exits,
        decision: row.scan?.decision.action ?? null,
        reason: row.scan?.decision.action === "no_trade" ? row.scan.decision.reason : undefined,
        pending: row.pending,
        note: row.note,
      }),
    );
    if (row.pending?.mcp) {
      console.log(JSON.stringify({ mcp: row.pending.mcp }, null, 2));
    }
    if (once) break;
    await sleep(EXIT_EVERY_MS);
  } while (true);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
