/** Paper-only process guards. Authored 28 Aug 2026. */

const LIVE_KEYS = ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"] as const;

export function assertPaperOnly(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of LIVE_KEYS) {
    if (env[name]) {
      throw new Error(`${name} is set. This agent is paper-only.`);
    }
  }
  if (env.ALPACA_PAPER_TRADE !== "true") {
    throw new Error("ALPACA_PAPER_TRADE must be true.");
  }
}

export function sizeQty(equity: number, maxLossAbs: number): number {
  const cap = 0.01 * equity;
  if (!(maxLossAbs > 0) || !(cap > 0)) return 0;
  return Math.floor(cap / maxLossAbs);
}

export function spreadOk(bid: number, ask: number): boolean {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return false;
  const mid = (bid + ask) / 2;
  if (mid < 0.15) return false;
  const width = ask - bid;
  return width <= Math.max(0.2, 0.1 * mid);
}

/** Join NBBO: credit limit is net bid (short bid − long ask). */
export function creditLimit(shortBid: number, longAsk: number): number {
  return Math.round((shortBid - longAsk) * 100) / 100;
}

export function putCreditMaxLoss(widthPoints: number, credit: number): number {
  return (widthPoints - credit) * 100;
}
