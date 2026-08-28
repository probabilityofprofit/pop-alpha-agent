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

export function keepName(n: TapeName, alreadyOpen: Set<string>): boolean {
  if (alreadyOpen.has(n.symbol)) return false;
  if (n.crypto || n.otc || n.halted) return false;
  if (!(n.last >= 10)) return false;
  if (n.corpAction) return false;
  return true;
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
