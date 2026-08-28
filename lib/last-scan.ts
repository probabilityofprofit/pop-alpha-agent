import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LastScan } from "./desk-types";
import { LAST_SCAN_PATH } from "./paths";

export function loadLastScan(): LastScan | null {
  try {
    return JSON.parse(readFileSync(LAST_SCAN_PATH, "utf8")) as LastScan;
  } catch {
    return null;
  }
}

export function saveLastScan(row: LastScan): void {
  mkdirSync(dirname(LAST_SCAN_PATH), { recursive: true });
  writeFileSync(LAST_SCAN_PATH, `${JSON.stringify(row, null, 2)}\n`, "utf8");
}
