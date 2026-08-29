/** Tape filters (no broker I/O). Authored 28 Aug 2026. */

export type TapeName = {
  symbol: string;
  last: number;
  crypto?: boolean;
  otc?: boolean;
  halted?: boolean;
  optionVolume?: number;
  shortOi?: number;
  eventWeek?: boolean;
  corpAction?: boolean;
};

export function dropReason(n: TapeName, alreadyOpen: Set<string>): string | null {
  if (alreadyOpen.has(n.symbol)) return "Already has a package.";
  if (n.crypto) return "Crypto.";
  if (n.otc) return "OTC.";
  if (n.halted) return "Halted.";
  if (!(n.last >= 10)) return "Last under $10.";
  if (n.corpAction) return "Corp action inside 21 days.";
  return null;
}

export function keepName(n: TapeName, alreadyOpen: Set<string>): boolean {
  return dropReason(n, alreadyOpen) == null;
}

export type TapeClassRow = {
  symbol: string;
  last: number;
  optionVolume: number;
  kept: boolean;
  reason: string;
  backstop?: boolean;
};

/** Same keep/cap/SPY-QQQ backstop as the live loop. Records why a name missed the tape. */
export function classifyTape(
  names: TapeName[],
  alreadyOpen: Set<string>,
  max = 15,
): { kept: string[]; rows: TapeClassRow[] } {
  const seen = new Set<string>();
  const unique: TapeName[] = [];
  for (const n of names) {
    const symbol = n.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push({ ...n, symbol });
  }

  const eligible: TapeName[] = [];
  const bySymbol = new Map<string, TapeClassRow>();
  for (const n of unique) {
    const reason = dropReason(n, alreadyOpen);
    if (reason) {
      bySymbol.set(n.symbol, {
        symbol: n.symbol,
        last: n.last,
        optionVolume: n.optionVolume ?? 0,
        kept: false,
        reason,
      });
    } else {
      eligible.push(n);
    }
  }

  eligible.sort((a, b) => (b.optionVolume ?? 0) - (a.optionVolume ?? 0));
  const kept: string[] = [];
  for (const n of eligible) {
    if (kept.length >= max) {
      bySymbol.set(n.symbol, {
        symbol: n.symbol,
        last: n.last,
        optionVolume: n.optionVolume ?? 0,
        kept: false,
        reason: `Below tape cap (${max}).`,
      });
      continue;
    }
    kept.push(n.symbol);
    bySymbol.set(n.symbol, {
      symbol: n.symbol,
      last: n.last,
      optionVolume: n.optionVolume ?? 0,
      kept: true,
      reason: "On tape.",
    });
  }

  for (const back of ["SPY", "QQQ"]) {
    const row = unique.find((n) => n.symbol === back);
    if (!row || kept.includes(back)) continue;
    if (dropReason(row, alreadyOpen)) continue;
    kept.push(back);
    bySymbol.set(back, {
      symbol: back,
      last: row.last,
      optionVolume: row.optionVolume ?? 0,
      kept: true,
      reason: "Index backstop.",
      backstop: true,
    });
  }

  const rows = [...bySymbol.values()].sort((a, b) => {
    if (a.kept !== b.kept) return a.kept ? -1 : 1;
    return b.optionVolume - a.optionVolume || a.symbol.localeCompare(b.symbol);
  });
  return { kept, rows };
}

export function keepForCredits(n: TapeName): boolean {
  return !n.eventWeek;
}

export function liquidWindow(n: TapeName): boolean {
  return (n.optionVolume ?? 0) >= 1000 && (n.shortOi ?? 0) >= 500;
}

export function rankTape(names: TapeName[], alreadyOpen: Set<string>, max = 15): TapeName[] {
  const kept = names.filter((n) => keepName(n, alreadyOpen) && liquidWindow(n));
  const ranked = [...kept].sort((a, b) => (b.optionVolume ?? 0) - (a.optionVolume ?? 0));
  const top = ranked.slice(0, max);
  const have = new Set(top.map((n) => n.symbol));
  for (const backstop of ["SPY", "QQQ"]) {
    const row = names.find((n) => n.symbol === backstop);
    if (row && keepName(row, alreadyOpen) && !row.eventWeek && !have.has(backstop) && top.length < max + 2) {
      top.push(row);
      have.add(backstop);
    }
  }
  return top;
}
