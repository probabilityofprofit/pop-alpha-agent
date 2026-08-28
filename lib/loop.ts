/** One RTH tick: 60s marks, 15m scan. Authored 28 Aug 2026. Never REST-places. */

import { allowNewRisk, dteFrom, lastFifteenMinutesPdt, pickTenors, tenorBounds, ymd } from "../governor/calendar";
import { closeMleg } from "../governor/door";
import { appendLedger } from "../governor/ledger";
import { cell } from "../governor/map";
import { closeJoinLimit } from "../governor/payoff";
import { keepName } from "../governor/tape";
import type { Decision, Template } from "../governor/types";
import { markBook, shouldExit } from "./closer";
import type { LastScan } from "./desk-types";
import { saveLastScan } from "./last-scan";
import { booksFromPositions, openUnderlyings, type OpenBook } from "./packages-from-positions";
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
import { mcpPayload, scanExpiry } from "../governor/cycle";
import { expirationsInSnapshots, quotesFromSnapshots } from "./quotes-from-chain";
import { fetchThesis, type ThesisResult } from "./thesis";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SCAN_EVERY_MS = 15 * 60 * 1000;
export const EXIT_EVERY_MS = 60 * 1000;
export const SCAN_WALL_MS = 4 * 60 * 1000;
export const SESSION_OPEN_CAP = 3;
export const BOOK_CAP = 0.05;

export type DoorKind = "open" | "close" | "cancel";

export type LoopTick = {
  at: string;
  sessionYmd: string;
  isOpen: boolean;
  halt: boolean;
  lastFifteen: boolean;
  opensThisSession: number;
  thesis: ThesisResult;
  exits: Array<{ underlying: string; reason: string; pnl: number }>;
  scan?: LastScan;
  pending: {
    kind: DoorKind;
    reason: string;
    mcp?: unknown;
    orderId?: string;
  } | null;
  note: string;
};

function cycleId(asOf: Date): string {
  return asOf.toISOString().replace(/[:.]/g, "");
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

function bookUsd(books: OpenBook[]): number {
  return books.reduce((s, b) => s + b.pkg.maxLoss * b.qty, 0);
}

function betterPropose(a: Decision, b: Decision): Decision {
  if (a.action !== "propose") return b;
  if (b.action !== "propose") return a;
  const ac = cell(a.map, a.manageByDays, 50);
  const bc = cell(b.map, b.manageByDays, 50);
  if (bc !== ac) return bc > ac ? b : a;
  return a.package.dte <= b.package.dte ? a : b;
}

async function buildTape(already: Set<string>): Promise<string[]> {
  const [actives, movers] = await Promise.all([getMostActives(), getStockMovers()]);
  const symbols = [
    ...actives.map((a) => a.symbol),
    ...movers.map((m) => m.symbol),
    "SPY",
    "QQQ",
  ];
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
    });
    best = betterPropose(best, decision);
  }
  return best;
}

async function runExits(asOf: Date): Promise<{
  exits: LoopTick["exits"];
  pending: LoopTick["pending"];
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
  let pending: LoopTick["pending"] = null;

  if (lastFifteenMinutesPdt(asOf) && openOrders.length) {
    const first = openOrders[0]!;
    pending = {
      kind: "cancel",
      reason: "Last 15 minutes of RTH. Cancel working DAY opens.",
      orderId: first.id,
      mcp: { order_id: first.id },
    };
    appendLedger(LEDGER_PATH, {
      ts: asOf.toISOString(),
      kind: "cancel",
      orderId: first.id,
      reason: pending.reason,
    });
  }

  for (const book of books) {
    const mark = markBook(book.pkg, book.qty, book.entryNet);
    appendLedger(LEDGER_PATH, {
      ts: asOf.toISOString(),
      kind: "mark",
      underlying: book.pkg.underlying,
      pnl: mark.pnl,
      take: mark.take,
      stop: mark.stop,
    });
    if (!shouldExit(mark) || pending) continue;
    const reason = mark.take ? "Take 50% of max profit." : "Stop 50% of defined risk.";
    const limit = closeJoinLimit(book.pkg);
    const mcp = closeMleg(book.pkg, book.qty, limit, `pop-alpha-x-${cycleId(asOf)}`);
    pending = { kind: "close", reason, mcp };
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

export async function runScanCycle(asOf: Date, books: OpenBook[], openOrders: PaperOrder[]): Promise<{
  scan: LastScan;
  thesis: ThesisResult;
  pending: LoopTick["pending"];
}> {
  const id = cycleId(asOf);
  const [clock, account] = await Promise.all([getClock(), getAccount()]);
  const equity = Number(account.equity);
  const halt = haltPresent() || equity <= 95_000;
  const already = openUnderlyings(books);
  const tape = await buildTape(already);
  const thesis = await fetchThesis(tape);
  appendLedger(LEDGER_PATH, {
    ts: asOf.toISOString(),
    kind: "cycle",
    cycleId: id,
    modelSkip: thesis.skip,
    reason: thesis.skip ? thesis.reason : thesis.hint.thesis,
    tape: tape.slice(0, 15),
  });

  const no: LastScan = {
    at: asOf.toISOString(),
    source: "paper",
    underlying: tape[0] ?? "",
    expiration: "",
    spot: 0,
    equity,
    decision: { action: "no_trade", reason: "Scan skipped." },
    mcp: null,
  };

  if (!clock.is_open) {
    no.decision = { action: "no_trade", reason: "Cash session closed." };
    saveLastScan(no);
    return { scan: no, thesis, pending: null };
  }
  if (!allowNewRisk(asOf) || lastFifteenMinutesPdt(asOf)) {
    no.decision = { action: "no_trade", reason: "New risk closed for this clock." };
    saveLastScan(no);
    return { scan: no, thesis, pending: null };
  }
  if (halt) {
    no.decision = { action: "no_trade", reason: "Halt file or equity floor." };
    saveLastScan(no);
    return { scan: no, thesis, pending: null };
  }
  if (openOrders.length) {
    no.decision = { action: "no_trade", reason: "A working DAY open is already live." };
    saveLastScan(no);
    return { scan: no, thesis, pending: null };
  }

  const hinted = !thesis.skip ? thesis.hint.underlying : null;
  const ordered = hinted && tape.includes(hinted) ? [hinted, ...tape.filter((s) => s !== hinted)] : tape;
  const deadline = Date.now() + SCAN_WALL_MS;
  let best: Decision = { action: "no_trade", reason: "No tenor/template cleared the hold map." };
  let bestSpot = 0;
  for (const symbol of ordered) {
    if (Date.now() > deadline) break;
    if (already.has(symbol)) continue;
    const preferred =
      !thesis.skip && thesis.hint.underlying === symbol ? thesis.preferred : undefined;
    const decision = await scoreName({
      symbol,
      asOf,
      equity,
      isOpen: true,
      halt: false,
      cycleId: id,
      preferred,
    });
    if (decision.action === "propose") {
      const next = betterPropose(best, decision);
      if (next === decision) bestSpot = 0;
      best = next;
    }
  }

  if (best.action === "propose") {
    const extra = bookUsd(books) + best.package.maxLoss * best.qty;
    if (extra > BOOK_CAP * equity) {
      best = { action: "no_trade", reason: "Book cap 5% of equity." };
    }
  }

  const scan: LastScan = {
    at: asOf.toISOString(),
    source: "paper",
    underlying: best.action === "propose" ? best.package.underlying : ordered[0] ?? "",
    expiration: best.action === "propose" ? best.package.expiration : "",
    spot: bestSpot,
    equity,
    decision: best,
    mcp: mcpPayload(best, id),
    note: thesis.skip ? thesis.reason : `Thesis ${thesis.hint.underlying} ${thesis.hint.structure}. MCP is not sent.`,
  };
  saveLastScan(scan);
  const pending =
    best.action === "propose" && scan.mcp
      ? { kind: "open" as const, reason: "Governor propose. Place via MCP only.", mcp: scan.mcp }
      : null;
  return { scan, thesis, pending };
}

export async function tick(opts: { forceScan?: boolean; lastScanAt?: number } = {}): Promise<LoopTick> {
  const asOf = new Date();
  const sessionYmd = ymd(asOf);
  const [clock, account, orders] = await Promise.all([getClock(), getAccount(), getOrders()]);
  const halt = haltPresent() || Number(account.equity) <= 95_000;
  const lastFifteen = lastFifteenMinutesPdt(asOf);
  const opensThisSession = sessionOpens(orders, sessionYmd);
  const exitRun = await runExits(asOf);

  let thesis: ThesisResult = { skip: true, reason: "modelSkip: scan not due." };
  let scan: LastScan | undefined;
  let pending = exitRun.pending;

  const scanDue =
    opts.forceScan ||
    (clock.is_open &&
      allowNewRisk(asOf) &&
      !lastFifteen &&
      (opts.lastScanAt == null || asOf.getTime() - opts.lastScanAt >= SCAN_EVERY_MS));

  if (!pending && scanDue && opensThisSession < SESSION_OPEN_CAP) {
    const scanned = await runScanCycle(asOf, exitRun.books, exitRun.openOrders);
    thesis = scanned.thesis;
    scan = scanned.scan;
    pending = scanned.pending;
  } else if (scanDue && opensThisSession >= SESSION_OPEN_CAP) {
    thesis = { skip: true, reason: "modelSkip: session open cap (3)." };
    appendLedger(LEDGER_PATH, {
      ts: asOf.toISOString(),
      kind: "cycle",
      decision: "no_trade",
      reason: "Session cap: three new opens.",
    });
  }

  const tickRow: LoopTick = {
    at: asOf.toISOString(),
    sessionYmd,
    isOpen: clock.is_open,
    halt,
    lastFifteen,
    opensThisSession,
    thesis,
    exits: exitRun.exits,
    scan,
    pending,
    note: pending
      ? `MCP ${pending.kind} ready. This process does not send it.`
      : "No door payload this tick.",
  };
  saveStatus(tickRow);
  return tickRow;
}
