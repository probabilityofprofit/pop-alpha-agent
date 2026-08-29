import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LastTape, LedgerRow } from "./desk-types";
import { LAST_TAPE_PATH } from "./paths";
import { readLedger } from "./read-ledger";

export function loadLastTape(): LastTape | null {
  try {
    return JSON.parse(readFileSync(LAST_TAPE_PATH, "utf8")) as LastTape;
  } catch {
    return lastTapeFromLedger(readLedger(500));
  }
}

export function saveLastTape(row: LastTape): void {
  mkdirSync(dirname(LAST_TAPE_PATH), { recursive: true });
  writeFileSync(LAST_TAPE_PATH, `${JSON.stringify(row, null, 2)}\n`, "utf8");
}

export function lastTapeFromLedger(rows: LedgerRow[]): LastTape | null {
  const cycle = rows.find((row) => row.kind === "cycle" && Array.isArray(row.tape) && row.tape.length);
  if (!cycle) return null;
  const kept = (cycle.tape as unknown[]).filter((s): s is string => typeof s === "string");
  return {
    at: typeof cycle.ts === "string" ? cycle.ts : "",
    kept,
    alreadyOpen: [],
    rows: kept.map((symbol) => ({
      symbol,
      last: 0,
      optionVolume: 0,
      kept: true,
      reason: "On tape (ledger).",
    })),
  };
}
