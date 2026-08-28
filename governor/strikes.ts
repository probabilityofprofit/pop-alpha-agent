/**
 * Listed-strike builders for the six allowed templates.
 * Authored 28 Aug 2026.
 */

import { spreadOk } from "./paper";
import { packageMetrics } from "./payoff";
import type { Leg, OccQuote, Package, Right, Template } from "./types";

export function liquid(q: OccQuote): boolean {
  return spreadOk(q.bid, q.ask) && q.oi >= 200;
}

function sorted(quotes: OccQuote[], right: Right): OccQuote[] {
  return quotes.filter((q) => q.right === right && liquid(q)).sort((a, b) => a.strike - b.strike);
}

function nearest(quotes: OccQuote[], spot: number): OccQuote | null {
  if (!quotes.length) return null;
  return quotes.reduce((best, row) =>
    Math.abs(row.strike - spot) < Math.abs(best.strike - spot) ? row : best,
  );
}

function nOtm(quotes: OccQuote[], from: OccQuote, direction: 1 | -1, steps: number): OccQuote | null {
  const ordered =
    direction > 0
      ? quotes.filter((q) => q.strike > from.strike)
      : quotes.filter((q) => q.strike < from.strike).sort((a, b) => b.strike - a.strike);
  return ordered[steps - 1] ?? null;
}

function closestDelta(quotes: OccQuote[], target: number): OccQuote | null {
  const withD = quotes.filter((q) => q.delta != null);
  if (!withD.length) return null;
  return withD.reduce((best, row) =>
    Math.abs(Math.abs(row.delta!) - target) < Math.abs(Math.abs(best.delta!) - target) ? row : best,
  );
}

function asLeg(q: OccQuote, side: "buy" | "sell"): Leg {
  return { ...q, side };
}

function pack(
  underlying: string,
  expiration: string,
  dte: number,
  template: Template,
  legs: Leg[],
): Package | null {
  const pkg = packageMetrics(underlying, expiration, dte, template, legs);
  if (!pkg) return null;
  if (pkg.legs.some((l) => !liquid(l))) return null;
  return pkg;
}

export function buildTemplate(
  template: Template,
  quotes: OccQuote[],
  spot: number,
  underlying: string,
  expiration: string,
  dte: number,
  extraOtm = 0,
): Package | null {
  const puts = sorted(quotes, "put");
  const calls = sorted(quotes, "call");
  const atmPut = nearest(puts, spot);
  const atmCall = nearest(calls, spot);
  const steps = 2 + extraOtm;

  if (template === "bull_put" && atmPut) {
    const long = nOtm(puts, atmPut, -1, steps);
    if (!long) return null;
    return pack(underlying, expiration, dte, template, [asLeg(atmPut, "sell"), asLeg(long, "buy")]);
  }
  if (template === "bear_call" && atmCall) {
    const long = nOtm(calls, atmCall, 1, steps);
    if (!long) return null;
    return pack(underlying, expiration, dte, template, [asLeg(atmCall, "sell"), asLeg(long, "buy")]);
  }
  if (template === "bull_call" && atmCall) {
    const short = nOtm(calls, atmCall, 1, steps);
    if (!short) return null;
    return pack(underlying, expiration, dte, template, [asLeg(atmCall, "buy"), asLeg(short, "sell")]);
  }
  if (template === "bear_put" && atmPut) {
    const short = nOtm(puts, atmPut, -1, steps);
    if (!short) return null;
    return pack(underlying, expiration, dte, template, [asLeg(atmPut, "buy"), asLeg(short, "sell")]);
  }
  if (template === "iron_condor") {
    const otmPuts = puts.filter((p) => p.strike < spot);
    const otmCalls = calls.filter((c) => c.strike > spot);
    const shortPut = closestDelta(otmPuts, 0.25) ?? nOtm(puts, atmPut ?? puts[0]!, -1, steps);
    const shortCall = closestDelta(otmCalls, 0.25) ?? nOtm(calls, atmCall ?? calls[calls.length - 1]!, 1, steps);
    if (!shortPut || !shortCall) return null;
    const longPut = nOtm(puts, shortPut, -1, steps);
    const longCall = nOtm(calls, shortCall, 1, steps);
    if (!longPut || !longCall) return null;
    return pack(underlying, expiration, dte, template, [
      asLeg(shortPut, "sell"),
      asLeg(shortCall, "sell"),
      asLeg(longPut, "buy"),
      asLeg(longCall, "buy"),
    ]);
  }
  if (template === "iron_fly" && atmPut && atmCall) {
    const longPut = nOtm(puts, atmPut, -1, steps);
    const longCall = nOtm(calls, atmCall, 1, steps);
    if (!longPut || !longCall) return null;
    return pack(underlying, expiration, dte, template, [
      asLeg(atmPut, "sell"),
      asLeg(atmCall, "sell"),
      asLeg(longPut, "buy"),
      asLeg(longCall, "buy"),
    ]);
  }
  return null;
}

export const ALL_TEMPLATES: Template[] = [
  "bull_put",
  "bear_call",
  "bull_call",
  "bear_put",
  "iron_condor",
  "iron_fly",
];
