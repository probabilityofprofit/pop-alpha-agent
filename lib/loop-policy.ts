/** Pure loop decisions. Authored 28 Aug 2026. No broker I/O. */

import { ymd } from "../governor/calendar";

/** Official week: 5 new opens / cash session. Mix 4/4/4 lets a second day stack on the first; 10% book is the money cap. */
export const SESSION_OPEN_CAP = 5;
/** Defined-risk |maxLoss|×qty of open packages, as a fraction of equity. */
export const BOOK_CAP = 0.1;
/** Halt new risk at this equity. Same hole as the 10% book on a $100k start. */
export const EQUITY_FLOOR = 90_000;
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

/** Opens use `pop-alpha-<iso>`. Closes use `pop-alpha-x-<iso>`. */
export function isGovernorOpenId(clientOrderId?: string): boolean {
  if (!clientOrderId?.startsWith("pop-alpha-")) return false;
  return !clientOrderId.startsWith("pop-alpha-x");
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
