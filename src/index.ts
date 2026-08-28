/**
 * POP Alpha Agent — authored 28 Aug 2026 (hackathon window).
 * Paper-only. Strike/size helpers live in this repo. MCP is the only broker door.
 */

import { assertPaperOnly } from "./paper.ts";

function main(): void {
  assertPaperOnly();
  const cycleId = new Date().toISOString();
  console.log(
    JSON.stringify({
      kind: "cycle",
      cycleId,
      decision: "allow_hint",
      thesis:
        "Helpers in src/paper.ts and src/strikes.ts. Orders go through Alpaca MCP place_option_order only.",
    }),
  );
}

main();
