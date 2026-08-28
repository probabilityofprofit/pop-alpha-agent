/** Append-only JSONL. Authored 28 Aug 2026. No secrets. */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type LedgerKind = "cycle" | "score" | "order" | "fill" | "cancel" | "exit" | "halt" | "mark";

export function appendLedger(path: string, row: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
}

export function cycleDecision(input: {
  ts: string;
  cycleId: string;
  scope: "final" | "idle";
  decision: "propose" | "no_trade";
  reason: string;
  modelSkip?: boolean;
  tape?: string[];
  underlying?: string;
  template?: string;
  qty?: number;
  limit?: number;
}): Record<string, unknown> {
  return { kind: "cycle", ...input };
}
