/** Group Alpaca option positions into defined-risk packages. Authored 28 Aug 2026. */

import { dteFrom } from "../governor/calendar";
import { widthPoints } from "../governor/payoff";
import type { Leg, Package, Template } from "../governor/types";
import { parseOcc } from "./occ";
import type { PaperPosition } from "./paper-broker";

export type OpenBook = {
  pkg: Package;
  qty: number;
  entryNet: number;
  /** Sum of Alpaca unrealized_pl on the legs. */
  pnl: number;
};

export function templateFromWorkingLegs(
  legs: Array<{ symbol: string; side: string }> | null | undefined,
): Template | null {
  if (!legs?.length) return null;
  const mapped: Leg[] = [];
  for (const leg of legs) {
    const parsed = parseOcc(leg.symbol);
    if (!parsed) return null;
    const side = leg.side.toLowerCase().includes("sell") ? "sell" : "buy";
    mapped.push({
      occ: leg.symbol,
      right: parsed.right,
      strike: parsed.strike,
      bid: 1,
      ask: 1,
      oi: 0,
      iv: null,
      delta: null,
      volume: 0,
      side,
    });
  }
  return inferTemplate(mapped);
}

export function inferTemplate(legs: Leg[]): Template | null {
  const puts = legs.filter((l) => l.right === "put");
  const calls = legs.filter((l) => l.right === "call");
  if (legs.length === 2 && puts.length === 2) {
    const short = puts.find((l) => l.side === "sell");
    const long = puts.find((l) => l.side === "buy");
    if (!short || !long) return null;
    return short.strike > long.strike ? "bull_put" : "bear_put";
  }
  if (legs.length === 2 && calls.length === 2) {
    const short = calls.find((l) => l.side === "sell");
    const long = calls.find((l) => l.side === "buy");
    if (!short || !long) return null;
    return short.strike < long.strike ? "bear_call" : "bull_call";
  }
  if (legs.length === 4) return "iron_condor";
  return null;
}

function toLeg(pos: PaperPosition, bid: number, ask: number): Leg | null {
  const parsed = parseOcc(pos.symbol);
  if (!parsed) return null;
  return {
    occ: pos.symbol,
    right: parsed.right,
    strike: parsed.strike,
    bid,
    ask,
    oi: 500,
    iv: 0.2,
    delta: null,
    volume: 0,
    side: pos.side === "short" ? "sell" : "buy",
  };
}

function bookFromRows(
  root: string,
  expiration: string,
  rows: PaperPosition[],
  quotes: Record<string, { bid: number; ask: number }>,
  asOf: Date,
): OpenBook | null {
  const legs: Leg[] = [];
  let shorts = 0;
  let longs = 0;
  let qty = Infinity;
  for (const pos of rows) {
    const q = quotes[pos.symbol] ?? {
      bid: Number(pos.current_price) || 0,
      ask: Number(pos.current_price) || 0,
    };
    const leg = toLeg(pos, q.bid, q.ask);
    if (!leg) continue;
    legs.push(leg);
    const n = Math.abs(Number(pos.qty));
    qty = Math.min(qty, n);
    const entry = Number(pos.avg_entry_price);
    if (leg.side === "sell") shorts += entry;
    else longs += entry;
  }
  const template = inferTemplate(legs);
  if (!template || !(qty >= 1) || !Number.isFinite(qty)) return null;
  const width = widthPoints(legs);
  if (!(width > 0)) return null;
  const signedEntry = Math.round((shorts - longs) * 100) / 100;
  const credit = signedEntry > 0;
  const entryNet = Math.abs(signedEntry);
  if (!(entryNet > 0)) return null;
  const maxProfit = credit ? entryNet * 100 : (width - entryNet) * 100;
  const maxLoss = credit ? (width - entryNet) * 100 : entryNet * 100;
  if (!(maxProfit > 0) || !(maxLoss > 0)) return null;
  const pkg: Package = {
    underlying: root,
    expiration,
    dte: dteFrom(expiration, asOf),
    template,
    legs,
    credit,
    netPoints: entryNet,
    maxProfit,
    maxLoss,
  };
  const pnl = rows.reduce((sum, pos) => sum + (Number(pos.unrealized_pl) || 0), 0);
  return { pkg, qty, entryNet, pnl };
}

export function booksFromPositions(
  positions: PaperPosition[],
  quotes: Record<string, { bid: number; ask: number }>,
  asOf: Date,
): OpenBook[] {
  const groups = new Map<string, PaperPosition[]>();
  for (const pos of positions) {
    if (pos.asset_class !== "us_option") continue;
    const parsed = parseOcc(pos.symbol);
    if (!parsed) continue;
    const key = `${parsed.root}|${parsed.expiration}`;
    const list = groups.get(key) ?? [];
    list.push(pos);
    groups.set(key, list);
  }
  const out: OpenBook[] = [];
  for (const [key, rows] of groups) {
    const [root, expiration] = key.split("|") as [string, string];
    const book = bookFromRows(root, expiration, rows, quotes, asOf);
    if (book) out.push(book);
  }
  return out;
}

export function openUnderlyings(books: OpenBook[]): Set<string> {
  return new Set(books.map((b) => b.pkg.underlying));
}

export type BlotterGroup = {
  key: string;
  template: Template | null;
  legs: PaperPosition[];
  expiration: string | null;
  dte: number | null;
  entryNet: number | null;
  credit: boolean | null;
  maxProfit: number | null;
  strategyUpl: number;
  pctOfMaxProfit: number | null;
};

function sumUpl(legs: PaperPosition[]): number {
  return legs.reduce((sum, p) => sum + (Number(p.unrealized_pl) || 0), 0);
}

/** Group option legs by root+expiry for the desk blotter. Stock/unknown stay solo. */
export function groupPositionsForBlotter(positions: PaperPosition[], asOf: Date = new Date()): BlotterGroup[] {
  const optionGroups = new Map<string, PaperPosition[]>();
  const solo: BlotterGroup[] = [];
  for (const pos of positions) {
    if (pos.asset_class !== "us_option") {
      solo.push({
        key: `solo|${pos.symbol}`,
        template: null,
        legs: [pos],
        expiration: null,
        dte: null,
        entryNet: null,
        credit: null,
        maxProfit: null,
        strategyUpl: sumUpl([pos]),
        pctOfMaxProfit: null,
      });
      continue;
    }
    const parsed = parseOcc(pos.symbol);
    if (!parsed) {
      solo.push({
        key: `solo|${pos.symbol}`,
        template: null,
        legs: [pos],
        expiration: null,
        dte: null,
        entryNet: null,
        credit: null,
        maxProfit: null,
        strategyUpl: sumUpl([pos]),
        pctOfMaxProfit: null,
      });
      continue;
    }
    const key = `${parsed.root}|${parsed.expiration}`;
    const list = optionGroups.get(key) ?? [];
    list.push(pos);
    optionGroups.set(key, list);
  }
  const grouped: BlotterGroup[] = [];
  for (const [key, rows] of optionGroups) {
    const [root, expiration] = key.split("|") as [string, string];
    const sorted = [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
    const quotes: Record<string, { bid: number; ask: number }> = {};
    for (const pos of sorted) {
      const px = Number(pos.current_price) || 0;
      quotes[pos.symbol] = { bid: px, ask: px };
    }
    const book = bookFromRows(root, expiration, sorted, quotes, asOf);
    const strategyUpl = sumUpl(sorted);
    const maxProfit = book?.pkg.maxProfit ?? null;
    grouped.push({
      key,
      template: book?.pkg.template ?? inferTemplate(
        sorted
          .map((pos) => {
            const px = Number(pos.current_price) || 0;
            return toLeg(pos, px, px);
          })
          .filter((l): l is Leg => l != null),
      ),
      legs: sorted,
      expiration,
      dte: book?.pkg.dte ?? dteFrom(expiration, asOf),
      entryNet: book?.entryNet ?? null,
      credit: book?.pkg.credit ?? null,
      maxProfit,
      strategyUpl,
      pctOfMaxProfit: maxProfit != null && maxProfit > 0 ? (100 * strategyUpl) / maxProfit : null,
    });
  }
  grouped.sort((a, b) => a.key.localeCompare(b.key));
  return [...grouped, ...solo];
}
