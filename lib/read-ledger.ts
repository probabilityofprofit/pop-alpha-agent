import { readFileSync } from "node:fs";
import { LEDGER_PATH, TEST_BOOK_PATH } from "./paths";
import type { LedgerRow } from "./desk-types";

export function readLedger(limit = 80): LedgerRow[] {
  const rows = readLedgerAll();
  return rows.slice(-limit).reverse();
}

export function readLedgerAll(): LedgerRow[] {
  try {
    const text = readFileSync(LEDGER_PATH, "utf8");
    const rows: LedgerRow[] = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        rows.push(JSON.parse(t) as LedgerRow);
      } catch {
        /* skip a broken line */
      }
    }
    return rows;
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
