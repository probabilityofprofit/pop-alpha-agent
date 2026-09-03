/** Pure loop decisions. Authored 28 Aug 2026. No broker I/O. */

import { ymd } from "../governor/calendar";

/** Tue 1 Sep: 10% book. From Wed 2 Sep: 15% (~fifteen 1% tickets). */
export const BOOK_EXPAND_YMD = "2026-09-02";
/** From Thu 3 Sep: 20% (~twenty 1% tickets). */
export const BOOK_EXPAND_THU_YMD = "2026-09-03";
/** Tuesday concurrent money brake (~ten packages). */
export const BOOK_CAP = 0.1;
/** Wednesday concurrent money brake (~fifteen packages). */
export const BOOK_CAP_EXPANDED = 0.15;
/** Thursday concurrent money brake (~twenty packages). */
export const BOOK_CAP_THURSDAY = 0.2;
/** Halt paired with the 10% book on a $100k start. */
export const EQUITY_FLOOR = 90_000;
/** Halt paired with the 15% book on a $100k start. */
export const EQUITY_FLOOR_EXPANDED = 85_000;
/** Halt paired with the 20% book on a $100k start. */
export const EQUITY_FLOOR_THURSDAY = 80_000;

export function bookCap(asOf: Date = new Date()): number {
  const day = ymd(asOf);
  if (day >= BOOK_EXPAND_THU_YMD) return BOOK_CAP_THURSDAY;
  if (day >= BOOK_EXPAND_YMD) return BOOK_CAP_EXPANDED;
  return BOOK_CAP;
}

export function equityFloor(asOf: Date = new Date()): number {
  const day = ymd(asOf);
  if (day >= BOOK_EXPAND_THU_YMD) return EQUITY_FLOOR_THURSDAY;
  if (day >= BOOK_EXPAND_YMD) return EQUITY_FLOOR_EXPANDED;
  return EQUITY_FLOOR;
}

/** Fat-finger ceiling when LOOP_MAX_QTY is unset. Does not replace 1% sizing. */
export const DEFAULT_MAX_QTY = 12;
/** Rest-of-session tape interval. */
export const SCAN_EVERY_MS = 15 * 60 * 1000;
/** First cash hour: catch the open print after overnight/weekend. */
export const OPEN_SCAN_EVERY_MS = Math.round(2.5 * 60 * 1000);
const CASH_OPEN_MINUTES_ET = 9 * 60 + 30;
const OPEN_SCAN_END_MINUTES_ET = 10 * 60 + 30;

function etMinutes(asOf: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(asOf);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** 9:30–10:30 a.m. ET. Faster tape so Monday’s open is not a single 15m shot. */
export function inOpeningScanWindow(asOf: Date): boolean {
  const mins = etMinutes(asOf);
  return mins >= CASH_OPEN_MINUTES_ET && mins < OPEN_SCAN_END_MINUTES_ET;
}

export function scanIntervalMs(asOf: Date): number {
  return inOpeningScanWindow(asOf) ? OPEN_SCAN_EVERY_MS : SCAN_EVERY_MS;
}

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

export type WorkingOrder = {
  id: string;
  status: string;
  client_order_id?: string;
  limit_price?: string | null;
  legs?: Array<{ symbol: string }> | null;
};

export function workingDayOrders<T extends WorkingOrder>(orders: T[]): T[] {
  return orders.filter((o) => Boolean(o.id) && !TERMINAL.has(o.status));
}

export function workingGovernorOpens<T extends WorkingOrder>(orders: T[]): T[] {
  return workingDayOrders(orders).filter((o) => isGovernorOpenId(o.client_order_id));
}

export function workingGovernorCloses<T extends WorkingOrder>(orders: T[]): T[] {
  return workingDayOrders(orders).filter((o) => isGovernorCloseId(o.client_order_id));
}

/** Working close cannot join current NBBO. Must be willing to pay at least `join`. */
export function closeLimitStale(workingLimit: number, join: number): boolean {
  if (!Number.isFinite(workingLimit) || !Number.isFinite(join)) return true;
  return workingLimit + 1e-9 < join;
}

export const STALE_CLOSE_CANCEL = "Stale close. Join moved through the working limit.";
export const MARK_GONE_CLOSE_CANCEL = "Mark no longer take/stop. Cancel working close.";

export type ClosePlan =
  | { kind: "place" }
  | { kind: "wait" }
  | { kind: "skip" }
  | { kind: "cancel"; orderId: string; reason: string };

/** One working close per package. Replace if join walked through the limit. Never restack. */
export function nextClosePlan(input: {
  occs: readonly string[];
  join: number;
  shouldExit: boolean;
  quotesLive: boolean;
  orders: WorkingOrder[];
}): ClosePlan {
  const want = new Set(input.occs);
  const overlapping = workingDayOrders(input.orders).filter((o) =>
    (o.legs ?? []).some((leg) => want.has(leg.symbol)),
  );
  const workingClose = overlapping.find((o) => !isGovernorOpenId(o.client_order_id));
  if (workingClose) {
    if (!input.quotesLive) return { kind: "wait" };
    if (!input.shouldExit) {
      return { kind: "cancel", orderId: workingClose.id, reason: MARK_GONE_CLOSE_CANCEL };
    }
    if (closeLimitStale(Number(workingClose.limit_price), input.join)) {
      return { kind: "cancel", orderId: workingClose.id, reason: STALE_CLOSE_CANCEL };
    }
    return { kind: "wait" };
  }
  if (overlapping.length) return { kind: "wait" };
  if (!input.shouldExit || !input.quotesLive || !Number.isFinite(input.join)) return { kind: "skip" };
  return { kind: "place" };
}

export function isQtyLockedCloseError(error: string): boolean {
  const t = error.toLowerCase();
  return (
    t.includes("insufficient qty") ||
    t.includes("qty available") ||
    t.includes("held for orders") ||
    t.includes("insufficient available")
  );
}

export function skippedScanReason(input: {
  isOpen: boolean;
  allowNewRisk: boolean;
  lastFifteen: boolean;
  scanDue: boolean;
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

/** Opens use `pop-alpha-<iso>`. Closes use `pop-alpha-x-<iso>`. */
export function isGovernorOpenId(clientOrderId?: string): boolean {
  if (!clientOrderId?.startsWith("pop-alpha-")) return false;
  return !clientOrderId.startsWith("pop-alpha-x");
}

export function isGovernorCloseId(clientOrderId?: string): boolean {
  return Boolean(clientOrderId?.startsWith("pop-alpha-x"));
}

export type SessionOpenOrder = {
  order_class?: string;
  filled_qty?: string;
  status?: string;
  client_order_id?: string;
  submitted_at?: string;
};

export function countSessionOpens(orders: SessionOpenOrder[], sessionYmd: string): number {
  let n = 0;
  for (const o of orders) {
    if (o.order_class !== "mleg") continue;
    const filled = Number(o.filled_qty) > 0 || o.status === "filled";
    if (!filled) continue;
    if (!isGovernorOpenId(o.client_order_id)) continue;
    const day = o.submitted_at ? ymd(new Date(o.submitted_at)) : "";
    if (day === sessionYmd) n += 1;
  }
  return n;
}

export function sessionStoppedNames(
  rows: Array<{ ts?: string; kind?: string; underlying?: string; reason?: string }>,
  sessionYmd: string,
): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "exit" || !row.underlying || !row.ts) continue;
    if (ymd(new Date(row.ts)) !== sessionYmd) continue;
    if (typeof row.reason === "string" && row.reason.startsWith("Stop ")) names.add(row.underlying);
  }
  return [...names];
}

export type OpenFillOrder = {
  client_order_id?: string;
  status?: string;
  filled_qty?: string;
  filled_at?: string | null;
  submitted_at?: string;
  legs?: Array<{ symbol: string }> | null;
};

export function packageOpenedAt(occs: Iterable<string>, orders: OpenFillOrder[]): Date | null {
  const want = new Set(occs);
  let latest = 0;
  for (const o of orders) {
    if (!isGovernorOpenId(o.client_order_id)) continue;
    if (!(Number(o.filled_qty) > 0 || o.status === "filled")) continue;
    if (!(o.legs ?? []).some((leg) => want.has(leg.symbol))) continue;
    const raw = o.filled_at || o.submitted_at;
    const t = raw ? Date.parse(raw) : 0;
    if (t > latest) latest = t;
  }
  return latest ? new Date(latest) : null;
}

export const STOPPED_REENTRY_CANCEL = "Stopped this session. Cancel re-entry.";
