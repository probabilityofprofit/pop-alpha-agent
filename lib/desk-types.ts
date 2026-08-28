/** JSON shapes the Alpha Desk serves. Authored 28 Aug 2026. */

import type { PlaceOptionOrder } from "../governor/door";
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
  pending: { kind: string; reason: string } | null;
  note: string;
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
