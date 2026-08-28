/** Demo chain so `npm run scan` works without secrets. Authored 28 Aug 2026. */

import type { OccQuote } from "./types";

function row(right: "call" | "put", strike: number, bid: number, delta: number, iv = 0.2): OccQuote {
  return {
    occ: `DEMO${right[0]!.toUpperCase()}${strike}`,
    right,
    strike,
    bid,
    ask: bid + 0.04,
    oi: 800,
    iv,
    delta,
    volume: 1500,
  };
}

/** Spot 100, 14 DTE-ish quotes. */
export const DEMO_SPOT = 100;
export const DEMO_QUOTES: OccQuote[] = [
  row("put", 102, 3.1, -0.62),
  row("put", 101, 2.55, -0.55),
  row("put", 100, 2.1, -0.48),
  row("put", 99, 1.7, -0.4),
  row("put", 98, 1.35, -0.32),
  row("put", 97, 1.05, -0.25),
  row("put", 96, 0.8, -0.19),
  row("call", 98, 3.2, 0.68),
  row("call", 99, 2.6, 0.58),
  row("call", 100, 2.15, 0.5),
  row("call", 101, 1.75, 0.42),
  row("call", 102, 1.4, 0.34),
  row("call", 103, 1.1, 0.27),
  row("call", 104, 0.85, 0.21),
];
