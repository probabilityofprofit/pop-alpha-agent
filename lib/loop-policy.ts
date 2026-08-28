/** Pure loop decisions. Authored 28 Aug 2026. No broker I/O. */

/** Official week: 5 new opens / session so 1% tickets can fill a 10% book. */
export const SESSION_OPEN_CAP = 5;
/** Defined-risk |maxLoss|×qty of open packages, as a fraction of equity. */
export const BOOK_CAP = 0.1;
/** Halt new risk at this equity. Same hole as the 10% book on a $100k start. */
export const EQUITY_FLOOR = 90_000;
/** Fat-finger ceiling when LOOP_MAX_QTY is unset. Does not replace 1% sizing. */
export const DEFAULT_MAX_QTY = 12;

export function loopSendEnabled(sendFlag: string | undefined = process.env.LOOP_SEND): boolean {
  return sendFlag === "true";
}

export function capQty(qty: number, maxRaw: string | undefined = process.env.LOOP_MAX_QTY): number {
  const source = maxRaw == null || maxRaw.trim() === "" ? String(DEFAULT_MAX_QTY) : maxRaw;
  const max = Number(source);
  if (!Number.isInteger(max) || max < 1) return qty;
  return Math.min(qty, max);
}

const TERMINAL = new Set(["filled", "canceled", "cancelled", "expired", "rejected", "done_for_day"]);

export type WorkingOrder = { id: string; status: string; client_order_id?: string };

export function workingDayOrders<T extends WorkingOrder>(orders: T[]): T[] {
  return orders.filter((o) => Boolean(o.id) && !TERMINAL.has(o.status));
}

export function skippedScanReason(input: {
  isOpen: boolean;
  allowNewRisk: boolean;
  lastFifteen: boolean;
  scanDue: boolean;
  sessionCapped: boolean;
  halt: boolean;
  hasPending: boolean;
}): string | null {
  if (input.hasPending) return "Exit or cancel owns this tick.";
  if (!input.scanDue) {
    if (!input.isOpen) return "Cash session closed.";
    if (input.halt) return "Halt file or equity floor.";
    if (!input.allowNewRisk || input.lastFifteen) return "New risk closed for this clock.";
    return "Scan not due.";
  }
  if (input.halt) return "Halt file or equity floor.";
  if (input.sessionCapped) return `Session cap: ${SESSION_OPEN_CAP} new opens.`;
  return null;
}

export const SCAN_END_CANCEL = "Scan end. Cancel unfilled DAY opens.";
export const LAST_FIFTEEN_CANCEL = "Last 15 minutes of RTH. Cancel working DAY opens.";

export function cancelPayload(orderIds: string[]): { order_id: string }[] {
  return orderIds.map((order_id) => ({ order_id }));
}

export type FillCandidate = {
  id: string;
  client_order_id?: string;
  status: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
  symbol?: string;
};

export function fillsToLog<T extends FillCandidate>(orders: T[], loggedIds: Iterable<string>): T[] {
  const seen = new Set(loggedIds);
  return orders.filter((o) => {
    if (seen.has(o.id)) return false;
    if (!o.client_order_id?.startsWith("pop-alpha-")) return false;
    return o.status === "filled" || Number(o.filled_qty) > 0;
  });
}

export function recordCloseFailure(
  attempts: Record<string, number>,
  underlying: string,
): { attempts: Record<string, number>; legwise: boolean } {
  const n = (attempts[underlying] ?? 0) + 1;
  return { attempts: { ...attempts, [underlying]: n }, legwise: n >= 2 };
}

export function clearCloseAttempts(
  attempts: Record<string, number>,
  underlying: string,
): Record<string, number> {
  if (!(underlying in attempts)) return attempts;
  const next = { ...attempts };
  delete next[underlying];
  return next;
}

export function uniqueIds(ids: string[], already: Iterable<string>): string[] {
  const seen = new Set(already);
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
