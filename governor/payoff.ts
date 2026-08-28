/** Defined-risk package metrics. Authored 28 Aug 2026. */

import type { Leg, Package, Template } from "./types";

function mid(leg: Leg): number {
  return (leg.bid + leg.ask) / 2;
}

export function netPoints(legs: Leg[]): number {
  let n = 0;
  for (const leg of legs) {
    const m = mid(leg);
    n += leg.side === "sell" ? m : -m;
  }
  return Math.round(n * 100) / 100;
}

export function widthPoints(legs: Leg[]): number {
  const puts = legs.filter((l) => l.right === "put").sort((a, b) => a.strike - b.strike);
  const calls = legs.filter((l) => l.right === "call").sort((a, b) => a.strike - b.strike);
  const putW = puts.length >= 2 ? puts[puts.length - 1]!.strike - puts[0]!.strike : 0;
  const callW = calls.length >= 2 ? calls[calls.length - 1]!.strike - calls[0]!.strike : 0;
  if (putW && callW) return Math.min(putW, callW);
  return putW || callW;
}

export function packageMetrics(
  underlying: string,
  expiration: string,
  dte: number,
  template: Template,
  legs: Leg[],
): Package | null {
  if (legs.length !== 2 && legs.length !== 4) return null;
  const net = netPoints(legs);
  const credit = net > 0;
  const width = widthPoints(legs);
  if (!(width > 0)) return null;
  let maxProfit: number;
  let maxLoss: number;
  if (credit) {
    maxProfit = net * 100;
    maxLoss = (width - net) * 100;
  } else {
    maxProfit = (width + net) * 100;
    maxLoss = -net * 100;
  }
  if (!(maxLoss > 0) || !(maxProfit > 0)) return null;
  return {
    underlying,
    expiration,
    dte,
    template,
    legs,
    credit,
    netPoints: Math.abs(net),
    maxProfit,
    maxLoss,
  };
}

export function joinLimit(pkg: Package): number {
  let netBid = 0;
  let netAsk = 0;
  for (const leg of pkg.legs) {
    if (leg.side === "sell") {
      netBid += leg.bid;
      netAsk += leg.ask;
    } else {
      netBid -= leg.ask;
      netAsk -= leg.bid;
    }
  }
  const raw = pkg.credit ? netBid : netAsk;
  return Math.round(raw * 100) / 100;
}

/** Debit (positive) or credit (negative) to flatten by joining the close side of NBBO. */
export function closeJoinLimit(pkg: Package): number {
  let pay = 0;
  for (const leg of pkg.legs) {
    if (leg.side === "sell") pay += leg.ask;
    else pay -= leg.bid;
  }
  return Math.round(pay * 100) / 100;
}
