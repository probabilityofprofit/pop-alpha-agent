/** Frozen Thursday EOD book for the contest desk. Authored 3 Sep 2026. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SNAPSHOT } from "./contest-timeline";
import type { PaperAccount, PaperPosition } from "./paper-broker";
import { THURSDAY_BOOK_PATH } from "./paths";
import { groupPositionsForBlotter } from "./packages-from-positions";
import { ymd } from "../governor/calendar";

export type ThursdayBook = {
  label: string;
  asOf: string;
  accountNumber: string;
  equity: string;
  cash: string;
  packageCount: number;
  positions: PaperPosition[];
};

export const CONTEST_FLATTEN_REASON = "Contest flatten after Friday 9:30 snapshot.";

/** True at/after Fri 4 Sep 2026 9:30 a.m. ET — photograph first, then flatten. */
export function afterContestSnapshot(asOf: Date = new Date()): boolean {
  return asOf.getTime() >= SNAPSHOT;
}

export function loadThursdayBook(path = THURSDAY_BOOK_PATH): ThursdayBook | null {
  try {
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8")) as ThursdayBook;
    if (!raw?.asOf || !Array.isArray(raw.positions)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function buildThursdayBook(input: {
  asOf?: Date;
  account: Pick<PaperAccount, "account_number" | "equity" | "cash">;
  positions: PaperPosition[];
}): ThursdayBook {
  const asOf = input.asOf ?? new Date();
  return {
    label: "Post Thursday close",
    asOf: asOf.toISOString(),
    accountNumber: input.account.account_number,
    equity: String(input.account.equity),
    cash: String(input.account.cash),
    packageCount: groupPositionsForBlotter(input.positions, asOf).length,
    positions: input.positions.filter((p) => p.asset_class === "us_option"),
  };
}

/** Write once. Never overwrite a frozen judging book. */
export function saveThursdayBookOnce(
  book: ThursdayBook,
  path = THURSDAY_BOOK_PATH,
): { wrote: boolean; book: ThursdayBook } {
  if (existsSync(path)) {
    const existing = loadThursdayBook(path);
    return { wrote: false, book: existing ?? book };
  }
  writeFileSync(path, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  return { wrote: true, book };
}

/**
 * Capture live paper positions into the Thursday book if the file is still missing.
 * Eligible from Thu 3 Sep onward so the desk can freeze marks before Friday flatten.
 */
export function maybeCaptureThursdayBook(
  account: PaperAccount | null,
  positions: PaperPosition[],
  asOf: Date = new Date(),
  path = THURSDAY_BOOK_PATH,
): ThursdayBook | null {
  const existing = loadThursdayBook(path);
  if (existing) return existing;
  if (!account || !positions.some((p) => p.asset_class === "us_option")) return null;
  if (ymd(asOf) < "2026-09-03") return null;
  const book = buildThursdayBook({ asOf, account, positions });
  return saveThursdayBookOnce(book, path).book;
}
