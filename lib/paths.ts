/** Repo-relative paths for the Alpha Desk. Authored 28 Aug 2026. */

import path from "node:path";

export function repoRoot(): string {
  return process.cwd();
}

export const LEDGER_PATH = path.join(repoRoot(), "hackathon", "ledger.jsonl");
export const HALT_PATH = path.join(repoRoot(), "hackathon", "HALT");
export const LAST_SCAN_PATH = path.join(repoRoot(), "hackathon", "last-scan.json");
export const LAST_TAPE_PATH = path.join(repoRoot(), "hackathon", "last-tape.json");
export const TEST_BOOK_PATH = path.join(repoRoot(), "hackathon", "TEST_BOOK.md");
export const THURSDAY_BOOK_PATH = path.join(repoRoot(), "hackathon", "thursday-book.json");
export const LOOP_STATUS_PATH = path.join(repoRoot(), "hackathon", "loop-status.json");
