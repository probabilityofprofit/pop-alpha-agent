/** Shared types for the in-window governor. Authored 28 Aug 2026. */

export type Right = "call" | "put";
export type Side = "buy" | "sell";
export type Template =
  | "bull_put"
  | "bear_call"
  | "bull_call"
  | "bear_put"
  | "iron_condor"
  | "iron_fly";

export type OccQuote = {
  occ: string;
  right: Right;
  strike: number;
  bid: number;
  ask: number;
  oi: number;
  iv: number | null;
  delta: number | null;
  volume: number;
};

export type Leg = OccQuote & { side: Side };

export type Package = {
  underlying: string;
  expiration: string;
  dte: number;
  template: Template;
  legs: Leg[];
  credit: boolean;
  /** Net premium in points (positive = credit received, or debit paid). */
  netPoints: number;
  maxProfit: number;
  maxLoss: number;
};

export type HoldMap = {
  popAtExpiration: number;
  meanPnl: number;
  /** Share of paths with mark P&L > 0 on the Friday / manage-by day. */
  popAtManageBy: number;
  meanPnlAtManageBy: number;
  /** map[day][pct] = share of paths that hit that % of max profit by that day */
  cells: Record<number, Record<number, number>>;
};

export type Decision =
  | {
      action: "propose";
      package: Package;
      qty: number;
      limit: number;
      map: HoldMap;
      manageByDays: number;
    }
  | { action: "no_trade"; reason: string };
