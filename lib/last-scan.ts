/** Last scan + frozen exhibit propose for the Alpha Desk. Authored 3 Sep 2026. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LastScan } from "./desk-types";
import { LAST_PROPOSE_PATH, LAST_SCAN_PATH } from "./paths";

export function loadLastScan(path = LAST_SCAN_PATH): LastScan | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LastScan;
  } catch {
    return null;
  }
}

export function loadLastPropose(path = LAST_PROPOSE_PATH): LastScan | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LastScan;
  } catch {
    return null;
  }
}

/** A desk exhibit needs propose + hold map + MCP door payload. */
export function isExhibitScan(row: LastScan | null | undefined): row is LastScan & {
  decision: Extract<LastScan["decision"], { action: "propose" }>;
  mcp: NonNullable<LastScan["mcp"]>;
} {
  return Boolean(row && row.decision?.action === "propose" && row.mcp && row.decision.map);
}

export function saveLastPropose(row: LastScan, path = LAST_PROPOSE_PATH): void {
  if (!isExhibitScan(row)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(row, null, 2)}\n`, "utf8");
}

export function saveLastScan(row: LastScan, scanPath = LAST_SCAN_PATH, proposePath = LAST_PROPOSE_PATH): void {
  mkdirSync(dirname(scanPath), { recursive: true });
  writeFileSync(scanPath, `${JSON.stringify(row, null, 2)}\n`, "utf8");
  if (isExhibitScan(row)) saveLastPropose(row, proposePath);
}

/**
 * Prefer the live scan when it is a full propose; otherwise freeze the last cleared propose
 * so Proposal / Hold map / MCP door stay populated for judges.
 */
export function exhibitScan(
  lastScan: LastScan | null,
  lastPropose: LastScan | null = loadLastPropose(),
): { scan: LastScan | null; frozen: boolean } {
  if (isExhibitScan(lastScan)) return { scan: lastScan, frozen: false };
  if (isExhibitScan(lastPropose)) return { scan: lastPropose, frozen: true };
  return { scan: lastScan, frozen: false };
}
