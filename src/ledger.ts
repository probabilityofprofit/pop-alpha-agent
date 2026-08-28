/** Append-only JSONL. Authored 28 Aug 2026. No secrets. */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function appendLedger(path: string, row: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
}
