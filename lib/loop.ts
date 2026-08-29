/** One RTH tick: 60s marks, 2.5m scan in the opening hour, 15m after. Authored 28 Aug 2026. */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { allowNewRisk, dteFrom, lastFifteenMinutesPdt, pickTenors, tenorBounds, ymd } from "../governor/calendar";
import { closeMleg } from "../governor/door";
import { appendLedger, cycleDecision } from "../governor/ledger";
import { comparePropose } from "../governor/pick";
import { closeJoinLimit } from "../governor/payoff";
import { keepName } from "../governor/tape";
import type { Decision, Template } from "../governor/types";
import { mcpPayload, scanExpiry } from "../governor/cycle";
import { ALL_TEMPLATES } from "../governor/strikes";
import { MIX_CAP_REASON, allowedTemplates, mixAllows, mixCounts } from "../governor/mix";
import { markBook, shouldExit } from "./closer";
import type { LastScan } from "./desk-types";
import { dispatchPending, type DoorPending, type DoorPersist } from "./door-dispatch";
import { saveLastScan } from "./last-scan";
import {
  BOOK_CAP,
  EQUITY_FLOOR,
  LAST_FIFTEEN_CANCEL,
  SCAN_END_CANCEL,
  SESSION_OPEN_CAP,
  cancelPayload,
  capQty,
  fillsToLog,
  scanIntervalMs,
  skippedScanReason,
  workingDayOrders,
} from "./loop-policy";
import { booksFromPositions, openUnderlyings, templateFromWorkingLegs, type OpenBook } from "./packages-from-positions";
import { writeHalt } from "./paper-door";
import {
  getAccount,
  getClock,
  getMostActives,
  getOpenOrders,
  getOptionChain,
  getOptionSnapshots,
  getOrders,
  getPositions,
  getStockMovers,
  getStockSnapshots,
  haltPresent,
  type PaperOrder,
} from "./paper-broker";
import { LEDGER_PATH, LOOP_STATUS_PATH } from "./paths";
import { expirationsInSnapshots, quotesFromSnapshots } from "./quotes-from-chain";
import { fetchThesis, type ThesisResult } from "./thesis";

export const EXIT_EVERY_MS = 60 * 1000;
export const SCAN_WALL_MS = 4 * 60 * 1000;
export { BOOK_CAP, EQUITY_FLOOR, SCAN_EVERY_MS, SESSION_OPEN_CAP } from "./loop-policy";

export type { DoorKind, DoorPending } from "./door-dispatch";

export type LoopTick = {
  at: string;
  sessionYmd: string;
  isOpen: boolean;
  halt: boolean;
  lastFifteen: boolean;
  opensThisSession: number;
  thesis: ThesisResult;
  skip: string | null;
  exits: Array<{ underlying: string; reason: string; pnl: number }>;
  scan?: LastScan;
  pending: DoorPending | null;
  note: string;
  loggedFillIds: string[];
  loggedCancelIds: string[];
  closeAttempts: Record<string, number>;
};

function cycleId(asOf: Date): string {
  return asOf.toISOString().replace(/[:.]/g, "");
}

function loadPersist(): DoorPersist {
  try {
    const row = JSON.parse(readFileSync(LOOP_STATUS_PATH, "utf8")) as Partial<DoorPersist>;
    return {
      loggedFillIds: Array.isArray(row.loggedFillIds) ? row.loggedFillIds : [],
      loggedCancelIds: Array.isArray(row.loggedCancelIds) ? row.loggedCancelIds : [],
      closeAttempts:
        row.closeAttempts && typeof row.closeAttempts === "object" && !Array.isArray(row.closeAttempts)
          ? row.closeAttempts
          : {},
    };
  } catch {
    return { loggedFillIds: [], loggedCancelIds: [], closeAttempts: {} };
  }
}

function saveStatus(tick: LoopTick): void {
  mkdirSync(dirname(LOOP_STATUS_PATH), { recursive: true });
  writeFileSync(LOOP_STATUS_PATH, `${JSON.stringify(tick, null, 2)}\n`, "utf8");
}

function sessionOpens(orders: PaperOrder[], sessionYmd: string): number {
  let n = 0;
  for (const o of orders) {
    if (o.order_class !== "mleg") continue;
    const filled = Number(o.filled_qty) > 0 || o.status === "filled";
    if (!filled) continue;
    if (!o.client_order_id?.startsWith("pop-alpha-")) continue;
    const day = o.submitted_at ? ymd(new Date(o.submitted_at)) : "";
    if (day === sessionYmd) n += 1;
  }
  return n;
}

function bookTemplates(books: OpenBook[], openOrders: PaperOrder[]): Template[] {
  const out = books.map((b) => b.pkg.template);
  for (const order of workingDayOrders(openOrders)) {
    const template = templateFromWorkingLegs(order.legs);
    if (template) out.push(template);
  }
  return out;
}

function bookUsd(books: OpenBook[]): number {
  return books.reduce((s, b) => s + b.pkg.maxLoss * b.qty, 0);
}

function betterPropose(a: Decision, b: Decision): Decision {
  if (a.action !== "propose") return b;
  if (b.action !== "propose") return a;
  return comparePropose(a, b) <= 0 ? a : b;
}

function logCycle(
  asOf: Date,
  id: string,
  scope: "final" | "idle",
  decision: Decision,
  thesis: ThesisResult,
  tape: string[] = [],
): void {
  const reason =
    decision.action === "no_trade"
      ? decision.reason
      : thesis.skip
        ? thesis.reason
        : (thesis.hint.thesis ?? "Governor propose.");
  appendLedger(
    LEDGER_PATH,
    cycleDecision({
      ts: asOf.toISOString(),
      cycleId: id,
      scope,
      decision: decision.action,
      reason,
      modelSkip: thesis.skip,
      tape: tape.slice(0, 15),
      underlying: decision.action === "propose" ? decision.package.underlying : undefined,
      template: decision.action === "propose" ? decision.package.template : undefined,
      qty: decision.action === "propose" ? decision.qty : undefined,
      limit: decision.action === "propose" ? decision.limit : undefined,
    }),
  );
}

async function buildTape(already: Set<string>): Promise<string[]> {
  const [actives, movers] = await Promise.all([getMostActives(), getStockMovers()]);
  const symbols = [...actives.map((a) => a.symbol), ...movers.map((m) => m.symbol), "SPY", "QQQ"];
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const spots = await getStockSnapshots(unique);
  const names = unique.map((symbol) => ({
    symbol,
    last: spots[symbol] ?? 0,
    optionVolume: actives.find((a) => a.symbol === symbol)?.volume ?? 0,
    shortOi: 500,
  }));
  const kept = names.filter((n) => keepName(n, already) && n.last >= 10);
  const cap = Math.max(1, Number(process.env.LOOP_MAX_NAMES) || 15);
  kept.sort((a, b) => (b.optionVolume ?? 0) - (a.optionVolume ?? 0));
  const out: string[] = [];
  for (const n of kept) {
    if (out.length >= cap) break;
    out.push(n.symbol);
  }
  for (const back of ["SPY", "QQQ"]) {
    if (!already.has(back) && !out.includes(back) && (spots[back] ?? 0) >= 10) out.push(back);
  }
  return out;
}

async function scoreName(input: {
  symbol: string;
  asOf: Date;
  equity: number;
  isOpen: boolean;
  halt: boolean;
  cycleId: string;
  preferred?: Template[];
  allowedTemplates?: Template[];
}): Promise<Decision> {
  const bounds = tenorBounds(input.asOf);
  const [chain, spots] = await Promise.all([
    getOptionChain({
      underlying: input.symbol,
      expirationGte: bounds.gte,
      expirationLte: bounds.lte,
    }),
    getStockSnapshots([input.symbol]),
  ]);
  const spot = spots[input.symbol];
  if (!(spot > 0)) return { action: "no_trade", reason: `No spot for ${input.symbol}.` };
  const expiries = pickTenors(
    expirationsInSnapshots(chain.snapshots).map((expiration) => ({
      expiration,
      dte: dteFrom(expiration, input.asOf),
    })),
  );
  let best: Decision = { action: "no_trade", reason: "No tenor/template cleared the hold map." };
  for (const row of expiries) {
    const quotes = quotesFromSnapshots(chain.snapshots, row.expiration);
    const decision = scanExpiry({
      underlying: input.symbol,
      expiration: row.expiration,
      dte: row.dte,
      spot,
      equity: input.equity,
      quotes,
      asOf: input.asOf,
      isOpen: input.isOpen,
      halt: input.halt,
      cycleId: input.cycleId,
      ledgerPath: LEDGER_PATH,
      preferred: input.preferred,
      allowedTemplates: input.allowedTemplates,
    });
    best = betterPropose(best, decision);
  }
  return best;
}

async function runExits(asOf: Date): Promise<{
  exits: LoopTick["exits"];
  pending: DoorPending | null;
  books: OpenBook[];
  openOrders: PaperOrder[];
}> {
  const [positions, openOrders] = await Promise.all([getPositions(), getOpenOrders()]);
  const occs = positions.filter((p) => p.asset_class === "us_option").map((p) => p.symbol);
  const snaps = await getOptionSnapshots(occs);
  const quotes: Record<string, { bid: number; ask: number }> = {};
  for (const [occ, snap] of Object.entries(snaps)) {
    quotes[occ] = { bid: snap.latestQuote?.bp ?? 0, ask: snap.latestQuote?.ap ?? 0 };
  }
  const books = booksFromPositions(positions, quotes, asOf);
  const exits: LoopTick["exits"] = [];
  let pending: DoorPending | null = null;
  const working = workingDayOrders(openOrders);

  if (lastFifteenMinutesPdt(asOf) && working.length) {
    const ids = working.map((o) => o.id);
    pending = {
      kind: "cancel",
      reason: LAST_FIFTEEN_CANCEL,
      orderIds: ids,
      mcp: cancelPayload(ids),
    };
  }

  for (const book of books) {
    const mark = markBook(book.pkg, book.qty, book.entryNet);
    if (mark.take || mark.stop) {
      appendLedger(LEDGER_PATH, {
        ts: asOf.toISOString(),
        kind: "mark",
        underlying: book.pkg.underlying,
        pnl: mark.pnl,
        take: mark.take,
        stop: mark.stop,
      });
    }
    if (!shouldExit(mark) || pending) continue;
    const reason = mark.take ? "Take 50% of max profit." : "Stop 50% of defined risk.";
    const limit = closeJoinLimit(book.pkg);
    const mcp = closeMleg(book.pkg, book.qty, limit, `pop-alpha-x-${cycleId(asOf)}`);
    pending = {
      kind: "close",
      reason,
      mcp,
      underlying: book.pkg.underlying,
      occs: book.pkg.legs.map((leg) => leg.occ),
    };
    exits.push({ underlying: book.pkg.underlying, reason, pnl: mark.pnl });
    appendLedger(LEDGER_PATH, {
      ts: asOf.toISOString(),
      kind: "exit",
      underlying: book.pkg.underlying,
      reason,
      pnl: mark.pnl,
    });
  }

  return { exits, pending, books, openOrders };
}

export async function runScanCycle(
  asOf: Date,
  books: OpenBook[],
  openOrders: PaperOrder[],
): Promise<{
  scan: LastScan;
  thesis: ThesisResult;
  pending: DoorPending | null;
}> {
  const id = cycleId(asOf);
  const [clock, account] = await Promise.all([getClock(), getAccount()]);
  const equity = Number(account.equity);
  const halt = haltPresent() || equity <= EQUITY_FLOOR;
  const already = openUnderlyings(books);
  const tape = await buildTape(already);
  const thesis = await fetchThesis(tape);

  const finish = (decision: Decision, pending: DoorPending | null, bestSpot = 0) => {
    logCycle(asOf, id, "final", decision, thesis, tape);
    const scan: LastScan = {
      at: asOf.toISOString(),
      source: "paper",
      underlying: decision.action === "propose" ? decision.package.underlying : (tape[0] ?? ""),
      expiration: decision.action === "propose" ? decision.package.expiration : "",
      spot: bestSpot,
      equity,
      decision,
      mcp: mcpPayload(decision, id),
      note: thesis.skip ? thesis.reason : `Thesis ${thesis.hint.underlying} ${thesis.hint.structure}.`,
    };
    saveLastScan(scan);
    return { scan, thesis, pending };
  };

  if (!clock.is_open) {
    return finish({ action: "no_trade", reason: "Cash session closed." }, null);
  }
  if (!allowNewRisk(asOf) || lastFifteenMinutesPdt(asOf)) {
    return finish({ action: "no_trade", reason: "New risk closed for this clock." }, null);
  }
  if (halt) {
    return finish({ action: "no_trade", reason: "Halt file or equity floor." }, null);
  }
  if (workingDayOrders(openOrders).length) {
    return finish({ action: "no_trade", reason: "A working DAY open is already live." }, null);
  }

  const mix = mixCounts(bookTemplates(books, openOrders));
  const allowed = allowedTemplates(mix, ALL_TEMPLATES);
  if (!allowed.length) {
    return finish({ action: "no_trade", reason: MIX_CAP_REASON }, null);
  }

  const hinted = !thesis.skip ? thesis.hint.underlying : null;
  const ordered = hinted && tape.includes(hinted) ? [hinted, ...tape.filter((s) => s !== hinted)] : tape;
  const deadline = Date.now() + SCAN_WALL_MS;
  let best: Decision = { action: "no_trade", reason: "No tenor/template cleared the hold map." };
  let bestSpot = 0;
  for (const symbol of ordered) {
    if (Date.now() > deadline) break;
    if (already.has(symbol)) continue;
    const preferred = !thesis.skip && thesis.hint.underlying === symbol ? thesis.preferred : undefined;
    const decision = await scoreName({
      symbol,
      asOf,
      equity,
      isOpen: true,
      halt: false,
      cycleId: id,
      preferred,
      allowedTemplates: allowed,
    });
    if (decision.action === "propose") {
      const next = betterPropose(best, decision);
      if (next === decision) bestSpot = 0;
      best = next;
    }
  }

  if (best.action === "propose") {
    const qty = capQty(best.qty);
    if (qty !== best.qty) best = { ...best, qty };
    const extra = bookUsd(books) + best.package.maxLoss * best.qty;
    if (extra > BOOK_CAP * equity) {
      best = { action: "no_trade", reason: `Book cap ${Math.round(BOOK_CAP * 100)}% of equity.` };
    } else if (!mixAllows(mix, best.package.template)) {
      best = { action: "no_trade", reason: MIX_CAP_REASON };
    }
  }

  const pending: DoorPending | null =
    best.action === "propose"
      ? { kind: "open", reason: "Governor propose. Place via door only.", mcp: mcpPayload(best, id) }
      : null;
  return finish(best, pending, bestSpot);
}

export async function tick(opts: { forceScan?: boolean; lastScanAt?: number } = {}): Promise<LoopTick> {
  const asOf = new Date();
  const id = cycleId(asOf);
  const persist = loadPersist();
  const sessionYmd = ymd(asOf);
  const [clock, account, orders] = await Promise.all([getClock(), getAccount(), getOrders()]);
  const equity = Number(account.equity);
  if (equity <= EQUITY_FLOOR && !haltPresent()) {
    writeHalt("equity floor");
    appendLedger(LEDGER_PATH, { ts: asOf.toISOString(), kind: "halt", reason: "equity floor", equity });
  }
  const halt = haltPresent() || equity <= EQUITY_FLOOR;
  const lastFifteen = lastFifteenMinutesPdt(asOf);
  const opensThisSession = sessionOpens(orders, sessionYmd);

  for (const fill of fillsToLog(orders, persist.loggedFillIds)) {
    appendLedger(LEDGER_PATH, {
      ts: asOf.toISOString(),
      kind: "fill",
      orderId: fill.id,
      clientOrderId: fill.client_order_id,
      symbol: fill.symbol,
      filledQty: fill.filled_qty,
      avg: fill.filled_avg_price,
    });
    persist.loggedFillIds.push(fill.id);
  }

  const exitRun = await runExits(asOf);
  let thesis: ThesisResult = { skip: true, reason: "modelSkip: scan not due." };
  let scan: LastScan | undefined;
  let pending = exitRun.pending;

  const scanDue =
    opts.forceScan ||
    (clock.is_open &&
      allowNewRisk(asOf) &&
      !lastFifteen &&
      (opts.lastScanAt == null || asOf.getTime() - opts.lastScanAt >= scanIntervalMs(asOf)));

  const idle = skippedScanReason({
    isOpen: clock.is_open,
    allowNewRisk: allowNewRisk(asOf),
    lastFifteen,
    scanDue,
    sessionCapped: opensThisSession >= SESSION_OPEN_CAP,
    halt,
    hasPending: Boolean(pending),
  });

  if (idle) {
    thesis = { skip: true, reason: idle };
    logCycle(asOf, id, "idle", { action: "no_trade", reason: idle }, thesis);
  } else {
    const working = workingDayOrders(exitRun.openOrders);
    if (working.length) {
      pending = {
        kind: "cancel",
        reason: SCAN_END_CANCEL,
        orderIds: working.map((o) => o.id),
        mcp: cancelPayload(working.map((o) => o.id)),
      };
      logCycle(asOf, id, "final", { action: "no_trade", reason: SCAN_END_CANCEL }, thesis);
    } else {
      const scanned = await runScanCycle(asOf, exitRun.books, exitRun.openOrders);
      thesis = scanned.thesis;
      scan = scanned.scan;
      pending = scanned.pending;
    }
  }

  const dispatched = await dispatchPending(pending, asOf, persist);
  const tickRow: LoopTick = {
    at: asOf.toISOString(),
    sessionYmd,
    isOpen: clock.is_open,
    halt,
    lastFifteen,
    opensThisSession,
    thesis,
    skip:
      idle ??
      (scan?.decision.action === "no_trade" ? scan.decision.reason : null),
    exits: exitRun.exits,
    scan,
    pending: dispatched.pending,
    note: dispatched.note,
    loggedFillIds: dispatched.persist.loggedFillIds,
    loggedCancelIds: dispatched.persist.loggedCancelIds,
    closeAttempts: dispatched.persist.closeAttempts,
  };
  saveStatus(tickRow);
  return tickRow;
}
