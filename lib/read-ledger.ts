import { readFileSync } from "node:fs";
import { LEDGER_PATH, TEST_BOOK_PATH } from "./paths";
import type { LedgerRow } from "./desk-types";

export function readLedger(limit = 80): LedgerRow[] {
  try {
    const text = readFileSync(LEDGER_PATH, "utf8");
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const slice = lines.slice(-limit);
    const rows: LedgerRow[] = [];
    for (const line of slice) {
      try {
        rows.push(JSON.parse(line) as LedgerRow);
      } catch {
        /* skip a broken line */
      }
    }
    return rows.reverse();
  } catch {
    return [];
  }
}

export function readTestBook(): string {
  try {
    return readFileSync(TEST_BOOK_PATH, "utf8");
  } catch {
    return "";
  }
}
