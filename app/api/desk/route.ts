import { deskCapacity } from "@/lib/desk-capacity";
import type { DeskPayload } from "@/lib/desk-types";
import { loadLastScan } from "@/lib/last-scan";
import { loadLastTape } from "@/lib/last-tape";
import { equityFloor, loopSendEnabled } from "@/lib/loop-policy";
import { loadLoopStatus } from "@/lib/loop-status";
import { getAccount, getClock, getOrders, getPositions, haltPresent, paperKeysReady } from "@/lib/paper-broker";
import { readLedger, readTestBook } from "@/lib/read-ledger";
import { loadThursdayBook, maybeCaptureThursdayBook } from "@/lib/thursday-book";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const payload: DeskPayload = {
    paperReady: paperKeysReady(),
    halt: haltPresent(),
    clock: null,
    account: null,
    positions: [],
    orders: [],
    ledger: readLedger(),
    lastScan: loadLastScan(),
    lastLoop: loadLoopStatus(),
    lastTape: loadLastTape(),
    capacity: deskCapacity([], [], 0),
    loopSend: loopSendEnabled(),
    testBook: readTestBook(),
    thursdayBook: loadThursdayBook(),
  };

  if (!payload.paperReady) {
    return Response.json(payload);
  }

  try {
    const [clock, account, positions, orders] = await Promise.all([
      getClock(),
      getAccount(),
      getPositions(),
      getOrders(),
    ]);
    payload.clock = clock;
    payload.account = account;
    payload.positions = positions;
    payload.orders = orders;
    payload.capacity = deskCapacity(positions, orders, Number(account.equity));
    payload.halt = payload.halt || Number(account.equity) <= equityFloor();
    payload.thursdayBook = maybeCaptureThursdayBook(account, positions) ?? payload.thursdayBook;
  } catch (err) {
    payload.error = err instanceof Error ? err.message : "Paper read failed.";
  }

  return Response.json(payload);
}
