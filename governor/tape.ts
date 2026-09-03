/** Tape filters (no broker I/O). Authored 28 Aug 2026. */

import { ymd } from "./calendar";
import { mixBucket } from "./mix";
import type { Template } from "./types";

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
  /** Session change vs prior close, in percent (1.5 = +1.5%). */
  changePct?: number;
};

export type TapeSide = "up" | "down";

/** Same day the book goes to 20%. One-way cluster tape from here. */
export const ONE_WAY_YMD = "2026-09-03";
/** Name must have moved this far to count as one-way. */
export const ONE_WAY_MIN_ABS_PCT = 0.5;
/** SPY/QQQ (or the one-way sum) must lean this far to call a session side. */
export const SESSION_MIN_ABS_PCT = 0.25;

/** Names that usually print together. No inverse ETFs — those fight the cluster. */
export const TAPE_CLUSTERS: Record<string, readonly string[]> = {
  mega: ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "TSLA", "AVGO", "NFLX"],
  semi: ["NVDA", "AMD", "AVGO", "TSM", "SMH", "INTC", "MU", "QCOM", "ARM", "AMAT"],
  index: ["SPY", "QQQ", "IWM", "DIA"],
  lev_long: ["TQQQ", "SOXL", "UPRO", "TNA"],
  fin: ["JPM", "BAC", "GS", "MS", "WFC", "XLF"],
  fintech: ["SOFI", "HOOD", "PYPL", "AFRM", "UPST"],
  air: ["AAL", "DAL", "UAL", "LUV"],
  utility: ["PCG", "NEE", "DUK", "SO"],
  energy: ["XLE", "XOM", "CVX"],
  crypto: ["IBIT", "COIN", "MSTR", "MARA", "RIOT"],
};

/** Index/levered/inverse names do not vote for the stock-book majority. */
export const TAPE_BETA_SKIP = new Set([
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "TQQQ",
  "SQQQ",
  "SOXL",
  "SOXS",
  "UPRO",
  "TNA",
  "SPXU",
  "TZA",
  "SH",
  "PSQ",
  "SPXS",
  "SDOW",
  "SDS",
]);

export type BookRow = { symbol: string; template: Template; pnl?: number };
export type TapeSideSource = "book" | "session";

export function oneWayTape(asOf: Date = new Date()): boolean {
  return ymd(asOf) >= ONE_WAY_YMD;
}

export function dropReason(
  n: TapeName,
  alreadyOpen: Set<string>,
  stopped: ReadonlySet<string> = new Set(),
): string | null {
  if (stopped.has(n.symbol)) return "Stopped this session.";
  if (alreadyOpen.has(n.symbol)) return "Already has a package.";
  if (n.crypto) return "Crypto.";
  if (n.otc) return "OTC.";
  if (n.halted) return "Halted.";
  if (!(n.last >= 10)) return "Last under $10.";
  if (n.corpAction) return "Corp action inside 21 days.";
  return null;
}

export function keepName(
  n: TapeName,
  alreadyOpen: Set<string>,
  stopped: ReadonlySet<string> = new Set(),
): boolean {
  return dropReason(n, alreadyOpen, stopped) == null;
}

export type TapeClassRow = {
  symbol: string;
  last: number;
  optionVolume: number;
  kept: boolean;
  reason: string;
  backstop?: boolean;
  changePct?: number;
};

export type TapeClass = {
  kept: string[];
  rows: TapeClassRow[];
  side?: TapeSide | null;
  cluster?: string | null;
  sideSource?: TapeSideSource | null;
};

function uniqueNames(names: TapeName[]): TapeName[] {
  const seen = new Set<string>();
  const unique: TapeName[] = [];
  for (const n of names) {
    const symbol = n.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push({ ...n, symbol });
  }
  return unique;
}

function classRow(n: TapeName, extra: Pick<TapeClassRow, "kept" | "reason" | "backstop">): TapeClassRow {
  return {
    symbol: n.symbol,
    last: n.last,
    optionVolume: n.optionVolume ?? 0,
    changePct: n.changePct,
    ...extra,
  };
}

function sortRows(rows: TapeClassRow[]): TapeClassRow[] {
  return [...rows].sort((a, b) => {
    if (a.kept !== b.kept) return a.kept ? -1 : 1;
    const aAbs = Math.abs(a.changePct ?? 0);
    const bAbs = Math.abs(b.changePct ?? 0);
    return bAbs - aAbs || b.optionVolume - a.optionVolume || a.symbol.localeCompare(b.symbol);
  });
}

/** SPY first, then QQQ, then the sum of one-way prints. Null if the session is still two-sided. */
export function sessionSide(names: TapeName[]): TapeSide | null {
  const spy = names.find((n) => n.symbol === "SPY")?.changePct;
  const qqq = names.find((n) => n.symbol === "QQQ")?.changePct;
  if (spy != null && Math.abs(spy) >= SESSION_MIN_ABS_PCT) return spy >= 0 ? "up" : "down";
  if (qqq != null && Math.abs(qqq) >= SESSION_MIN_ABS_PCT) return qqq >= 0 ? "up" : "down";
  let sum = 0;
  for (const n of names) {
    if (n.changePct == null || !Number.isFinite(n.changePct)) continue;
    if (Math.abs(n.changePct) < ONE_WAY_MIN_ABS_PCT) continue;
    sum += n.changePct;
  }
  if (Math.abs(sum) < SESSION_MIN_ABS_PCT) return null;
  return sum >= 0 ? "up" : "down";
}

function verticalSidePnl(rows: BookRow[]): { bull: number; bear: number } {
  let bull = 0;
  let bear = 0;
  for (const row of rows) {
    const pnl = row.pnl ?? 0;
    const bucket = mixBucket(row.template);
    if (bucket === "bull") bull += pnl;
    else if (bucket === "bear") bear += pnl;
  }
  return { bull, bear };
}

function sideFromPnl(bull: number, bear: number): TapeSide | null {
  if (bull > bear && bull > 0) return "up";
  if (bear > bull && bear > 0) return "down";
  return null;
}

/** Side of the open verticals that are actually green. Irons do not vote. */
export function majoritySide(book: BookRow[]): TapeSide | null {
  if (!book.length) return null;
  const spot = book.filter((row) => !TAPE_BETA_SKIP.has(row.symbol.toUpperCase()));
  const spotPnl = verticalSidePnl(spot);
  const fromSpot = sideFromPnl(spotPnl.bull, spotPnl.bear);
  if (fromSpot) return fromSpot;
  const all = verticalSidePnl(book);
  return sideFromPnl(all.bull, all.bear);
}

export function majorityAnchors(book: BookRow[], side: TapeSide): string[] {
  const want = side === "up" ? "bull" : "bear";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of book) {
    const symbol = row.symbol.toUpperCase();
    if (seen.has(symbol) || TAPE_BETA_SKIP.has(symbol)) continue;
    if (mixBucket(row.template) !== want) continue;
    if (!((row.pnl ?? 0) > 0)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out;
}

export function clusterMates(anchors: string[]): string[] {
  const out = new Set<string>();
  for (const members of Object.values(TAPE_CLUSTERS)) {
    if (!anchors.some((a) => members.includes(a))) continue;
    for (const member of members) out.add(member);
  }
  return [...out];
}

export function sameWay(changePct: number | undefined, side: TapeSide): boolean {
  if (changePct == null || !Number.isFinite(changePct)) return false;
  if (Math.abs(changePct) < ONE_WAY_MIN_ABS_PCT) return false;
  return side === "up" ? changePct > 0 : changePct < 0;
}

export function oneWayDrop(n: TapeName, side: TapeSide, source: TapeSideSource = "session"): string | null {
  if (n.changePct == null || !Number.isFinite(n.changePct)) return "No day change.";
  if (Math.abs(n.changePct) < ONE_WAY_MIN_ABS_PCT) {
    return `Not one-way (|Δ| < ${ONE_WAY_MIN_ABS_PCT}%).`;
  }
  if (!sameWay(n.changePct, side)) return `Wrong way (${source} ${side}).`;
  return null;
}

/** Prefer cohorts that already hold the book's majority names. Else the largest same-way cohort. */
export function pickCluster(eligible: TapeName[], anchors: string[] = []): { id: string; symbols: string[] } | null {
  if (anchors.length) {
    const ids = Object.entries(TAPE_CLUSTERS)
      .filter(([, members]) => anchors.some((a) => members.includes(a)))
      .map(([id]) => id)
      .sort();
    if (ids.length) {
      const members = new Set(ids.flatMap((id) => TAPE_CLUSTERS[id] ?? []));
      const hit = eligible.filter((n) => members.has(n.symbol));
      if (hit.length) {
        return { id: ids.length === 1 ? ids[0] : ids.join("+"), symbols: hit.map((n) => n.symbol) };
      }
    }
  }
  let best: { id: string; symbols: string[]; score: number } | null = null;
  for (const [id, members] of Object.entries(TAPE_CLUSTERS)) {
    const hit = eligible.filter((n) => members.includes(n.symbol));
    if (hit.length < 2) continue;
    const score = hit.length * 10 + hit.reduce((s, n) => s + Math.abs(n.changePct ?? 0), 0);
    if (!best || score > best.score) best = { id, symbols: hit.map((n) => n.symbol), score };
  }
  if (best) return { id: best.id, symbols: best.symbols };
  const ranked = [...eligible].sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
  const top = ranked[0];
  if (!top) return null;
  for (const [id, members] of Object.entries(TAPE_CLUSTERS)) {
    if (!members.includes(top.symbol)) continue;
    return { id, symbols: eligible.filter((n) => members.includes(n.symbol)).map((n) => n.symbol) };
  }
  return { id: "single", symbols: [top.symbol] };
}

/** Same keep/cap/SPY-QQQ backstop as the live loop. Records why a name missed the tape. */
export function classifyTape(
  names: TapeName[],
  alreadyOpen: Set<string>,
  max = 15,
  stopped: ReadonlySet<string> = new Set(),
): TapeClass {
  const unique = uniqueNames(names);
  const eligible: TapeName[] = [];
  const bySymbol = new Map<string, TapeClassRow>();
  for (const n of unique) {
    const reason = dropReason(n, alreadyOpen, stopped);
    if (reason) {
      bySymbol.set(n.symbol, classRow(n, { kept: false, reason }));
    } else {
      eligible.push(n);
    }
  }

  eligible.sort((a, b) => (b.optionVolume ?? 0) - (a.optionVolume ?? 0));
  const kept: string[] = [];
  for (const n of eligible) {
    if (kept.length >= max) {
      bySymbol.set(n.symbol, classRow(n, { kept: false, reason: `Below tape cap (${max}).` }));
      continue;
    }
    kept.push(n.symbol);
    bySymbol.set(n.symbol, classRow(n, { kept: true, reason: "On tape." }));
  }

  for (const back of ["SPY", "QQQ"]) {
    const row = unique.find((n) => n.symbol === back);
    if (!row || kept.includes(back)) continue;
    if (dropReason(row, alreadyOpen, stopped)) continue;
    kept.push(back);
    bySymbol.set(back, classRow(row, { kept: true, reason: "Index backstop.", backstop: true }));
  }

  return { kept, rows: sortRows([...bySymbol.values()]) };
}

/** Thursday last-hurrah: follow the open packages that are green, then names that print with them. */
export function classifyOneWayTape(
  names: TapeName[],
  alreadyOpen: Set<string>,
  max = 15,
  stopped: ReadonlySet<string> = new Set(),
  book: BookRow[] = [],
): TapeClass {
  const unique = uniqueNames(names);
  const bySymbol = new Map<string, TapeClassRow>();
  const clean: TapeName[] = [];
  for (const n of unique) {
    const reason = dropReason(n, alreadyOpen, stopped);
    if (reason) {
      bySymbol.set(n.symbol, classRow(n, { kept: false, reason }));
    } else {
      clean.push(n);
    }
  }

  const fromBook = majoritySide(book);
  const side = book.length ? fromBook : sessionSide(unique);
  const sideSource: TapeSideSource | null = fromBook ? "book" : !book.length && side ? "session" : null;
  if (!side) {
    const idle = book.length ? "No profitable side to follow." : "Session is not one-way.";
    for (const n of clean) {
      bySymbol.set(n.symbol, classRow(n, { kept: false, reason: idle }));
    }
    return { kept: [], rows: sortRows([...bySymbol.values()]), side: null, cluster: null, sideSource: null };
  }

  const same: TapeName[] = [];
  for (const n of clean) {
    const reason = oneWayDrop(n, side, sideSource ?? "session");
    if (reason) bySymbol.set(n.symbol, classRow(n, { kept: false, reason }));
    else same.push(n);
  }

  const anchors = fromBook ? majorityAnchors(book, side) : [];
  const cluster = pickCluster(same, anchors);
  if (!cluster) {
    return { kept: [], rows: sortRows([...bySymbol.values()]), side, cluster: null, sideSource };
  }
  const inCluster = new Set(cluster.symbols);
  for (const n of same) {
    if (!inCluster.has(n.symbol)) {
      bySymbol.set(
        n.symbol,
        classRow(n, {
          kept: false,
          reason: fromBook ? "Does not trade with the profitable names." : `Outside the ${cluster.id} cluster.`,
        }),
      );
    }
  }

  const ranked = same
    .filter((n) => inCluster.has(n.symbol))
    .sort(
      (a, b) =>
        Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0) || (b.optionVolume ?? 0) - (a.optionVolume ?? 0),
    );
  const kept: string[] = [];
  for (const n of ranked) {
    if (kept.length >= max) {
      bySymbol.set(n.symbol, classRow(n, { kept: false, reason: `Below tape cap (${max}).` }));
      continue;
    }
    kept.push(n.symbol);
    bySymbol.set(n.symbol, classRow(n, { kept: true, reason: `On tape (${cluster.id}, ${sideSource} ${side}).` }));
  }

  return { kept, rows: sortRows([...bySymbol.values()]), side, cluster: cluster.id, sideSource };
}

export function keepForCredits(n: TapeName): boolean {
  return !n.eventWeek;
}

export function liquidWindow(n: TapeName): boolean {
  return (n.optionVolume ?? 0) >= 1000 && (n.shortOi ?? 0) >= 500;
}

export function rankTape(
  names: TapeName[],
  alreadyOpen: Set<string>,
  max = 15,
  stopped: ReadonlySet<string> = new Set(),
): TapeName[] {
  const kept = names.filter((n) => keepName(n, alreadyOpen, stopped) && liquidWindow(n));
  const ranked = [...kept].sort((a, b) => (b.optionVolume ?? 0) - (a.optionVolume ?? 0));
  const top = ranked.slice(0, max);
  const have = new Set(top.map((n) => n.symbol));
  for (const backstop of ["SPY", "QQQ"]) {
    const row = names.find((n) => n.symbol === backstop);
    if (row && keepName(row, alreadyOpen, stopped) && !row.eventWeek && !have.has(backstop) && top.length < max + 2) {
      top.push(row);
      have.add(backstop);
    }
  }
  return top;
}
