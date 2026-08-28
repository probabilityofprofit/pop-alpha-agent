import { loadLastScan } from "@/lib/last-scan";
import { getAccount, getClock, getOrders, getPositions, haltPresent, paperKeysReady } from "@/lib/paper-broker";
import { readLedger, readTestBook } from "@/lib/read-ledger";
import type { DeskPayload } from "@/lib/desk-types";

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
    testBook: readTestBook(),
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
    payload.halt = payload.halt || Number(account.equity) <= 95_000;
  } catch (err) {
    payload.error = err instanceof Error ? err.message : "Paper read failed.";
  }

  return Response.json(payload);
}
