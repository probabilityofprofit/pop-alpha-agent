/** JSON shapes the Alpha Desk serves. Authored 28 Aug 2026. */

import type { PlaceOptionOrder } from "../governor/door";
import type { MixCounts } from "../governor/mix";
import type { TapeClassRow } from "../governor/tape";
import type { Decision } from "../governor/types";
import type { PaperAccount, PaperClock, PaperOrder, PaperPosition } from "./paper-broker";

export type LastScan = {
  at: string;
  source: "demo" | "paper";
  underlying: string;
  expiration: string;
  spot: number;
  equity: number;
  decision: Decision;
  mcp: PlaceOptionOrder | null;
  note?: string;
};

export type LedgerRow = Record<string, unknown> & { ts?: string; kind?: string };

export type LastLoop = {
  at: string;
  sessionYmd: string;
  isOpen: boolean;
  halt: boolean;
  lastFifteen: boolean;
  opensThisSession: number;
  stoppedThisSession?: string[];
  send?: boolean;
  skip?: string | null;
  pending: { kind: string; reason: string; sent?: boolean; error?: string } | null;
  note: string;
  thesis?: {
    skip: boolean;
    reason?: string;
    hint?: { underlying?: string; structure?: string; thesis?: string };
  };
  exits?: Array<{ underlying: string; reason: string; pnl: number }>;
};

export type LastTape = {
  at: string;
  kept: string[];
  alreadyOpen: string[];
  stoppedThisSession?: string[];
  side?: "up" | "down" | null;
  cluster?: string | null;
  sideSource?: "book" | "session" | null;
  rows: TapeClassRow[];
  decision?: "propose" | "no_trade";
  winner?: string;
  thesis?: { skip: boolean; reason?: string; underlying?: string; structure?: string };
};

export type DeskCapacity = {
  bookUsd: number;
  bookCapUsd: number;
  mix: MixCounts;
  names: string[];
};

export type DeskPayload = {
  paperReady: boolean;
  halt: boolean;
  clock: PaperClock | null;
  account: PaperAccount | null;
  positions: PaperPosition[];
  orders: PaperOrder[];
  ledger: LedgerRow[];
  lastScan: LastScan | null;
  lastLoop: LastLoop | null;
  lastTape: LastTape | null;
  capacity: DeskCapacity;
  loopSend: boolean;
  testBook: string;
  error?: string;
};

export type ChainRow = {
  occ: string;
  right: "call" | "put";
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  iv: number | null;
  delta: number | null;
};
