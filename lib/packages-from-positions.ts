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
    if (!template || !(qty >= 1) || !Number.isFinite(qty)) continue;
    const width = widthPoints(legs);
    if (!(width > 0)) continue;
    const signedEntry = Math.round((shorts - longs) * 100) / 100;
    const credit = signedEntry > 0;
    const entryNet = Math.abs(signedEntry);
    if (!(entryNet > 0)) continue;
    const maxProfit = credit ? entryNet * 100 : (width - entryNet) * 100;
    const maxLoss = credit ? (width - entryNet) * 100 : entryNet * 100;
    if (!(maxProfit > 0) || !(maxLoss > 0)) continue;
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
    out.push({ pkg, qty, entryNet });
  }
  return out;
}

export function openUnderlyings(books: OpenBook[]): Set<string> {
  return new Set(books.map((b) => b.pkg.underlying));
}
