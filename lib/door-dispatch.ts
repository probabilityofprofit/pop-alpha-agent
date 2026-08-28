/** Send pending MCP-shaped payloads when LOOP_SEND=true. Authored 28 Aug 2026. */

import { appendLedger } from "../governor/ledger";
import type { PlaceOptionOrder } from "../governor/door";
import { clearCloseAttempts, loopSendEnabled, recordCloseFailure, uniqueIds } from "./loop-policy";
import { cancelOrderById, closePosition, placeOptionOrder, writeHalt } from "./paper-door";
import { LEDGER_PATH } from "./paths";

export type DoorKind = "open" | "close" | "cancel";

export type DoorPending = {
  kind: DoorKind;
  reason: string;
  mcp?: unknown;
  orderId?: string;
  orderIds?: string[];
  occs?: string[];
  underlying?: string;
  sent?: boolean;
  error?: string;
};

export type DoorPersist = {
  loggedFillIds: string[];
  loggedCancelIds: string[];
  closeAttempts: Record<string, number>;
};

function isPlace(mcp: unknown): mcp is PlaceOptionOrder {
  if (!mcp || typeof mcp !== "object") return false;
  const row = mcp as PlaceOptionOrder;
  return row.order_class === "mleg" && Array.isArray(row.legs);
}

export async function dispatchPending(
  pending: DoorPending | null,
  asOf: Date,
  persist: DoorPersist,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ pending: DoorPending | null; persist: DoorPersist; note: string }> {
  if (!pending) {
    return { pending, persist, note: "No door payload this tick." };
  }
  if (!loopSendEnabled(env.LOOP_SEND)) {
    let next = persist;
    if (pending.kind === "cancel") {
      const ids = pending.orderIds?.length ? pending.orderIds : pending.orderId ? [pending.orderId] : [];
      const fresh = uniqueIds(ids, persist.loggedCancelIds);
      for (const orderId of fresh) {
        appendLedger(LEDGER_PATH, {
          ts: asOf.toISOString(),
          kind: "cancel",
          orderId,
          reason: pending.reason,
          sent: false,
        });
      }
      next = { ...persist, loggedCancelIds: [...persist.loggedCancelIds, ...fresh] };
    }
    return {
      pending,
      persist: next,
      note: `MCP ${pending.kind} ready. LOOP_SEND is off. This process does not send it.`,
    };
  }

  const ts = asOf.toISOString();
  try {
    if (pending.kind === "cancel") {
      const ids = pending.orderIds?.length ? pending.orderIds : pending.orderId ? [pending.orderId] : [];
      const fresh = uniqueIds(ids, persist.loggedCancelIds);
      for (const orderId of ids) {
        await cancelOrderById(orderId);
      }
      for (const orderId of fresh) {
        appendLedger(LEDGER_PATH, { ts, kind: "cancel", orderId, reason: pending.reason, sent: true });
      }
      return {
        pending: { ...pending, sent: true },
        persist: { ...persist, loggedCancelIds: [...persist.loggedCancelIds, ...fresh] },
        note: `Door sent cancel (${ids.length}).`,
      };
    }

    if (pending.kind === "open" || pending.kind === "close") {
      if (!isPlace(pending.mcp)) throw new Error("Pending MCP payload is not a mleg place.");
      const order = await placeOptionOrder(pending.mcp);
      appendLedger(LEDGER_PATH, {
        ts,
        kind: "order",
        orderId: order.id,
        clientOrderId: pending.mcp.client_order_id,
        door: pending.kind,
        sent: true,
      });
      const closeAttempts =
        pending.kind === "close" && pending.underlying
          ? clearCloseAttempts(persist.closeAttempts, pending.underlying)
          : persist.closeAttempts;
      return {
        pending: { ...pending, sent: true, orderId: order.id },
        persist: { ...persist, closeAttempts },
        note: `Door sent ${pending.kind} ${order.id}.`,
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (pending.kind === "close" && pending.underlying) {
      const failed = recordCloseFailure(persist.closeAttempts, pending.underlying);
      if (failed.legwise && pending.occs?.length) {
        const leftover: string[] = [];
        for (const occ of pending.occs) {
          try {
            await closePosition(occ);
            appendLedger(LEDGER_PATH, { ts, kind: "order", door: "legwiseClose", occ, sent: true });
          } catch {
            leftover.push(occ);
          }
        }
        if (leftover.length) {
          writeHalt(`Leftover after two mleg closes and close_position: ${leftover.join(",")}`);
          appendLedger(LEDGER_PATH, {
            ts,
            kind: "halt",
            reason: "Leftover OCC after close_position.",
            leftover,
          });
        }
        return {
          pending: { ...pending, error, sent: leftover.length === 0 },
          persist: { ...persist, closeAttempts: failed.attempts },
          note: leftover.length
            ? `Close fallback wrote HALT. leftover ${leftover.join(",")}`
            : "Door used close_position after two mleg rejects.",
        };
      }
      return {
        pending: { ...pending, error },
        persist: { ...persist, closeAttempts: failed.attempts },
        note: `Close send failed (${failed.attempts[pending.underlying]}/2). ${error}`,
      };
    }
    return {
      pending: { ...pending, error },
      persist,
      note: `Door send failed. ${error}`,
    };
  }

  return { pending, persist, note: `MCP ${pending.kind} ready.` };
}
