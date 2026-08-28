/**
 * Defined-risk put credit: short near ATM, long two listed strikes lower.
 * Authored 28 Aug 2026. Does not import the pre-existing terminal.
 */

export type ChainPut = {
  occ: string;
  strike: number;
  bid: number;
  ask: number;
  oi: number;
};

export function nearestStrike(puts: ChainPut[], spot: number): ChainPut | null {
  if (!puts.length) return null;
  return puts.reduce((best, row) =>
    Math.abs(row.strike - spot) < Math.abs(best.strike - spot) ? row : best,
  );
}

export function twoStepsOtmPut(puts: ChainPut[], short: ChainPut): ChainPut | null {
  const below = puts
    .filter((p) => p.strike < short.strike)
    .sort((a, b) => b.strike - a.strike);
  return below[1] ?? null;
}

export function bullPutCredit(puts: ChainPut[], spot: number): { short: ChainPut; long: ChainPut } | null {
  const atm = nearestStrike(puts, spot);
  if (!atm) return null;
  const long = twoStepsOtmPut(puts, atm);
  if (!long) return null;
  return { short: atm, long };
}
