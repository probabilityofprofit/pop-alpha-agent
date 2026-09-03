/** One RTH tick: 60s marks, 2.5m scan in the opening hour, 15m after. Authored 28 Aug 2026. */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { allowNewRisk, dteFrom, lastFifteenMinutesPdt, pickTenors, tenorBounds, ymd } from "../governor/calendar";
import { closeMleg } from "../governor/door";
import { appendLedger, cycleDecision } from "../governor/ledger";
import { comparePropose } from "../governor/pick";
import { closeJoinLimit, closeQuotesLive } from "../governor/payoff";
import {
  classifyOneWayTape,
  classifyTape,
  clusterMates,
  majorityAnchors,
  majoritySide,
  oneWayTape,
  type BookRow,
  type TapeClass,
} from "../governor/tape";
import type { Decision, Template } from "../governor/types";
import { mcpPayload, scanExpiry } from "../governor/cycle";
import { ALL_TEMPLATES } from "../governor/strikes";
import { allowedTemplates, mixAllows, mixCap, mixCapReason, mixCounts, sideTemplates } from "../governor/mix";
import { markBook, applyStopHold, heldMs, shouldExit } from "./closer";
import { afterContestSnapshot, CONTEST_FLATTEN_REASON, loadThursdayBook, maybeCaptureThursdayBook } from "./thursday-book";
import type { LastScan } from "./desk-types";
import { dispatchPending, type DoorPending, type DoorPersist } from "./door-dispatch";
import { saveLastScan } from "./last-scan";
import { saveLastTape } from "./last-tape";
import {
  LAST_FIFTEEN_CANCEL,
  SCAN_END_CANCEL,
  STOPPED_REENTRY_CANCEL,
  bookCap,
  cancelPayload,
  capQty,
  countSessionOpens,
  equityFloor,
  isGovernorOpenId,
  loopSendEnabled,
  fillsToLog,
  nextClosePlan,
  packageOpenedAt,
  scanIntervalMs,
  sessionStoppedNames,
  skippedScanReason,
  workingGovernorOpens,
} from "./loop-policy";
import { booksFromPositions, openUnderlyings, templateFromWorkingLegs, type OpenBook } from "./packages-from-positions";
import { parseOcc } from "./occ";
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
  getStockMarks,
  getStockMovers,
  getStockSnapshots,
  haltPresent,
  type PaperOrder,
} from "./paper-broker";
import { LEDGER_PATH, LOOP_STATUS_PATH } from "./paths";
import { expirationsInSnapshots, quotesFromSnapshots } from "./quotes-from-chain";
import { readLedgerAll } from "./read-ledger";
import { fetchThesis, type ThesisResult } from "./thesis";

export const EXIT_EVERY_MS = 60 * 1000;
export const SCAN_WALL_MS = 4 * 60 * 1000;
export { BOOK_CAP, EQUITY_FLOOR, SCAN_EVERY_MS, bookCap, equityFloor } from "./loop-policy";

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
  send: boolean;
  pending: DoorPending | null;
  note: string;
  loggedFillIds: string[];
  loggedCancelIds: string[];
  closeAttempts: Record<string, number>;
  stoppedThisSession: string[];
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

function orderRoot(order: PaperOrder): string | null {
  for (const leg of order.legs ?? []) {
    const parsed = parseOcc(leg.symbol);
    if (parsed) return parsed.root;
  }
  return null;
}

function justOpenedOccs(fills: Array<{ id: string; client_order_id?: string }>, orders: PaperOrder[]): Set<string> {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const occs = new Set<string>();
  for (const fill of fills) {
    if (!isGovernorOpenId(fill.client_order_id)) continue;
    for (const leg of byId.get(fill.id)?.legs ?? []) occs.add(leg.symbol);
  }
  return occs;
}

function bookTemplates(books: OpenBook[], openOrders: PaperOrder[]): Template[] {
  const out = books.map((b) => b.pkg.template);
  for (const order of workingGovernorOpens(openOrders)) {
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

function bookRows(books: OpenBook[], openOrders: PaperOrder[]): BookRow[] {
  const out: BookRow[] = books.map((b) => ({ symbol: b.pkg.underlying, template: b.pkg.template, pnl: b.pnl }));
  for (const order of workingGovernorOpens(openOrders)) {
    const template = templateFromWorkingLegs(order.legs);
    const root = orderRoot(order);
    if (template && root) out.push({ symbol: root, template, pnl: 0 });
  }
  return out;
}

async function buildTape(
  already: Set<string>,
  stopped: ReadonlySet<string> = new Set(),
  asOf: Date = new Date(),
  book: BookRow[] = [],
): Promise<TapeClass> {
  const oneWay = oneWayTape(asOf);
  const side = majoritySide(book);
  const mates = side ? clusterMates(majorityAnchors(book, side)) : [];
  const [actives, movers] = await Promise.all([getMostActives(), getStockMovers(oneWay ? 20 : 10)]);
  const symbols = [
    ...actives.map((a) => a.symbol),
    ...movers.map((m) => m.symbol),
    ...mates,
    "SPY",
    "QQQ",
  ];
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const marks = await getStockMarks(unique);
  const names = unique.map((symbol) => {
    const mover = movers.find((m) => m.symbol.toUpperCase() === symbol);
    return {
      symbol,
      last: marks[symbol]?.last ?? mover?.price ?? 0,
      changePct: marks[symbol]?.changePct ?? mover?.changePct,
      optionVolume: actives.find((a) => a.symbol.toUpperCase() === symbol)?.volume ?? 0,
      shortOi: 500,
    };
  });
  const cap = Math.max(1, Number(process.env.LOOP_MAX_NAMES) || 15);
  return oneWay ? classifyOneWayTape(names, already, cap, stopped, book) : classifyTape(names, already, cap, stopped);
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

async function runExits(
  asOf: Date,
  orders: PaperOrder[],
  freshOpenOccs: Set<string>,
): Promise<{
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
  const contestFlatten = afterContestSnapshot(asOf);

  for (const book of books) {
    const openedAt = book.pkg.legs.some((leg) => freshOpenOccs.has(leg.occ))
      ? asOf
      : packageOpenedAt(
          book.pkg.legs.map((leg) => leg.occ),
          orders,
        );
    const mark = applyStopHold(markBook(book.pkg, book.qty, book.entryNet), heldMs(asOf, openedAt));
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
    const occList = book.pkg.legs.map((leg) => leg.occ);
    const join = closeJoinLimit(book.pkg);
    const plan = nextClosePlan({
      occs: occList,
      join,
      shouldExit: contestFlatten || shouldExit(mark),
      quotesLive: closeQuotesLive(book.pkg),
      orders: openOrders,
    });
    if (plan.kind === "wait" || plan.kind === "skip" || pending) continue;
    if (plan.kind === "cancel") {
      pending = {
        kind: "cancel",
        reason: plan.reason,
        orderIds: [plan.orderId],
        mcp: cancelPayload([plan.orderId]),
      };
      continue;
    }
    const reason = contestFlatten
      ? CONTEST_FLATTEN_REASON
      : mark.take
        ? "Take 50% of max profit."
        : "Stop 50% of defined risk.";
    const mcp = closeMleg(book.pkg, book.qty, join, `pop-alpha-x-${cycleId(asOf)}`);
    pending = {
      kind: "close",
      reason,
      mcp,
      underlying: book.pkg.underlying,
      occs: occList,
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

  if (!pending && lastFifteenMinutesPdt(asOf)) {
    const opens = workingGovernorOpens(openOrders);
    if (opens.length) {
      const ids = opens.map((o) => o.id);
      pending = {
        kind: "cancel",
        reason: LAST_FIFTEEN_CANCEL,
        orderIds: ids,
        mcp: cancelPayload(ids),
      };
    }
  }

  return { exits, pending, books, openOrders };
}

export async function runScanCycle(
  asOf: Date,
  books: OpenBook[],
  openOrders: PaperOrder[],
  stopped: ReadonlySet<string> = new Set(),
): Promise<{
  scan: LastScan;
  thesis: ThesisResult;
  pending: DoorPending | null;
}> {
  const id = cycleId(asOf);
  const [clock, account] = await Promise.all([getClock(), getAccount()]);
  const equity = Number(account.equity);
  const floor = equityFloor(asOf);
  const cap = bookCap(asOf);
  const mixLimit = mixCap(asOf);
  const mixReason = mixCapReason(asOf);
  const halt = haltPresent() || equity <= floor;
  const already = openUnderlyings(books);
  const book = bookRows(books, openOrders);
  const tape = await buildTape(already, stopped, asOf, book);
  const thesis = await fetchThesis(tape.kept, process.env, {
    side: tape.side ?? undefined,
    cluster: tape.cluster ?? undefined,
    sideSource: tape.sideSource ?? undefined,
  });

  const finish = (decision: Decision, pending: DoorPending | null, bestSpot = 0) => {
    logCycle(asOf, id, "final", decision, thesis, tape.kept);
    saveLastTape({
      at: asOf.toISOString(),
      kept: tape.kept,
      alreadyOpen: [...already],
      stoppedThisSession: [...stopped],
      side: tape.side ?? undefined,
      cluster: tape.cluster ?? undefined,
      sideSource: tape.sideSource ?? undefined,
      rows: tape.rows,
      decision: decision.action,
      winner: decision.action === "propose" ? decision.package.underlying : undefined,
      thesis: thesis.skip
        ? { skip: true, reason: thesis.reason }
        : { skip: false, underlying: thesis.hint.underlying, structure: thesis.hint.structure, reason: thesis.hint.thesis },
    });
    const scan: LastScan = {
      at: asOf.toISOString(),
      source: "paper",
      underlying: decision.action === "propose" ? decision.package.underlying : (tape.kept[0] ?? ""),
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
  if (workingGovernorOpens(openOrders).length) {
    return finish({ action: "no_trade", reason: "A working DAY open is already live." }, null);
  }
  if (oneWayTape(asOf) && !tape.side) {
    return finish(
      { action: "no_trade", reason: book.length ? "No profitable side to follow." : "No one-way cluster." },
      null,
    );
  }

  const mix = mixCounts(bookTemplates(books, openOrders));
  const universe = tape.side ? sideTemplates(tape.side) : ALL_TEMPLATES;
  const allowed = allowedTemplates(mix, universe, mixLimit);
  if (!allowed.length) {
    return finish({ action: "no_trade", reason: mixReason }, null);
  }

  const hinted = !thesis.skip ? thesis.hint.underlying : null;
  const ordered =
    hinted && tape.kept.includes(hinted) ? [hinted, ...tape.kept.filter((s) => s !== hinted)] : tape.kept;
  const deadline = Date.now() + SCAN_WALL_MS;
  let best: Decision = { action: "no_trade", reason: "No tenor/template cleared the hold map." };
  let bestSpot = 0;
  for (const symbol of ordered) {
    if (Date.now() > deadline) break;
    if (already.has(symbol) || stopped.has(symbol)) continue;
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
    if (extra > cap * equity) {
      best = { action: "no_trade", reason: `Book cap ${Math.round(cap * 100)}% of equity.` };
    } else if (!mixAllows(mix, best.package.template, mixLimit)) {
      best = { action: "no_trade", reason: mixReason };
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
  if (!loadThursdayBook()) {
    maybeCaptureThursdayBook(account, await getPositions(), asOf);
  }
  const equity = Number(account.equity);
  const floor = equityFloor(asOf);
  if (equity <= floor && !haltPresent()) {
    writeHalt("equity floor");
    appendLedger(LEDGER_PATH, { ts: asOf.toISOString(), kind: "halt", reason: "equity floor", equity });
  }
  const halt = haltPresent() || equity <= floor;
  const lastFifteen = lastFifteenMinutesPdt(asOf);
  const opensThisSession = countSessionOpens(orders, sessionYmd);
  const newFills = fillsToLog(orders, persist.loggedFillIds);
  const freshOpenOccs = justOpenedOccs(newFills, orders);

  for (const fill of newFills) {
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

  const exitRun = await runExits(asOf, orders, freshOpenOccs);
  const stoppedThisSession = [
    ...new Set([
      ...sessionStoppedNames(readLedgerAll(), sessionYmd),
      ...exitRun.exits.filter((e) => e.reason.startsWith("Stop ")).map((e) => e.underlying),
    ]),
  ];
  const stopped = new Set(stoppedThisSession);
  let thesis: ThesisResult = { skip: true, reason: "modelSkip: scan not due." };
  let scan: LastScan | undefined;
  let pending = exitRun.pending;

  if (!pending) {
    const reentry = workingGovernorOpens(exitRun.openOrders).filter((o) => {
      const root = orderRoot(o);
      return root != null && stopped.has(root);
    });
    if (reentry.length) {
      pending = {
        kind: "cancel",
        reason: STOPPED_REENTRY_CANCEL,
        orderIds: reentry.map((o) => o.id),
        mcp: cancelPayload(reentry.map((o) => o.id)),
      };
    }
  }

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
    halt,
    hasPending: Boolean(pending),
  });

  if (idle) {
    thesis = { skip: true, reason: idle };
    logCycle(asOf, id, "idle", { action: "no_trade", reason: idle }, thesis);
  } else {
    const workingOpens = workingGovernorOpens(exitRun.openOrders);
    if (workingOpens.length) {
      pending = {
        kind: "cancel",
        reason: SCAN_END_CANCEL,
        orderIds: workingOpens.map((o) => o.id),
        mcp: cancelPayload(workingOpens.map((o) => o.id)),
      };
      logCycle(asOf, id, "final", { action: "no_trade", reason: SCAN_END_CANCEL }, thesis);
    } else {
      const scanned = await runScanCycle(asOf, exitRun.books, exitRun.openOrders, stopped);
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
    send: loopSendEnabled(),
    pending: dispatched.pending,
    note: dispatched.note,
    loggedFillIds: dispatched.persist.loggedFillIds,
    loggedCancelIds: dispatched.persist.loggedCancelIds,
    closeAttempts: dispatched.persist.closeAttempts,
    stoppedThisSession,
  };
  saveStatus(tickRow);
  return tickRow;
}
