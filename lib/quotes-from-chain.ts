/** Map Alpaca option snapshots into governor quotes. Authored 28 Aug 2026. */

import type { OccQuote } from "../governor/types";
import { parseOcc } from "./occ";

type Snap = {
  impliedVolatility?: number;
  greeks?: { delta?: number };
  latestQuote?: { bp?: number; ap?: number };
  latestTrade?: { s?: number };
  dailyBar?: { v?: number };
};

export function quotesFromSnapshots(
  snapshots: Record<string, Snap>,
  expiration: string,
): OccQuote[] {
  const out: OccQuote[] = [];
  for (const [occ, snap] of Object.entries(snapshots)) {
    const parsed = parseOcc(occ);
    if (!parsed || parsed.expiration !== expiration) continue;
    const bid = snap.latestQuote?.bp ?? 0;
    const ask = snap.latestQuote?.ap ?? 0;
    out.push({
      occ,
      right: parsed.right,
      strike: parsed.strike,
      bid,
      ask,
      // Chain snapshots do not include open interest. Liquidity still requires a
      // two-sided quote; OI is filled so the listed-strike builder can run.
      oi: 500,
      iv: snap.impliedVolatility ?? null,
      delta: snap.greeks?.delta ?? null,
      volume: snap.latestTrade?.s ?? snap.dailyBar?.v ?? 0,
    });
  }
  return out;
}

export function expirationsInSnapshots(snapshots: Record<string, Snap>): string[] {
  const set = new Set<string>();
  for (const occ of Object.keys(snapshots)) {
    const parsed = parseOcc(occ);
    if (parsed) set.add(parsed.expiration);
  }
  return [...set].sort();
}
