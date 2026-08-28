/** Black–Scholes (European). Authored 28 Aug 2026 for this agent. */

function cdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

export function bsPrice(
  spot: number,
  strike: number,
  years: number,
  rate: number,
  vol: number,
  right: "call" | "put",
): number {
  if (!(spot > 0) || !(strike > 0) || !(vol > 0)) return 0;
  if (!(years > 1 / 365 / 8)) {
    const intrinsic = right === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    return intrinsic;
  }
  const srt = vol * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * years) / srt;
  const d2 = d1 - srt;
  const df = Math.exp(-rate * years);
  if (right === "call") return spot * cdf(d1) - strike * df * cdf(d2);
  return strike * df * cdf(-d2) - spot * cdf(-d1);
}
