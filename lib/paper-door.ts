/**
 * Non-model paper door. Same payload as MCP place_option_order / cancel / close.
 * Authored 28 Aug 2026. The model never calls this. LOOP_SEND=true required.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { assertSendablePlace, type PlaceOptionOrder } from "../governor/door";
import { assertPaperOnly } from "../governor/paper";
import { loopSendEnabled } from "./loop-policy";
import { assertPaperTradingUrl, PAPER_TRADING_ORIGIN, type PaperOrder } from "./paper-broker";
import { HALT_PATH } from "./paths";

function assertSendAllowed(): void {
  assertPaperOnly();
  if (!loopSendEnabled()) throw new Error("LOOP_SEND must be true to send.");
}

function headers(): HeadersInit {
  assertSendAllowed();
  const key = process.env.ALPACA_PAPER_API_KEY;
  const secret = process.env.ALPACA_PAPER_SECRET_KEY;
  if (!key || !secret) throw new Error("Paper keys are not set.");
  return {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function paperFetch(url: string, init: RequestInit): Promise<Response> {
  assertPaperTradingUrl(url);
  const res = await fetch(url, { ...init, headers: headers(), cache: "no-store" });
  return res;
}

export async function placeOptionOrder(payload: PlaceOptionOrder): Promise<PaperOrder> {
  assertSendablePlace(payload);
  const url = `${PAPER_TRADING_ORIGIN}/v2/orders`;
  const res = await paperFetch(url, { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`paper POST order ${res.status}: ${text.slice(0, 240)}`);
  }
  return (await res.json()) as PaperOrder;
}

export async function cancelOrderById(orderId: string): Promise<void> {
  if (!orderId.trim()) throw new Error("order_id is required.");
  const url = `${PAPER_TRADING_ORIGIN}/v2/orders/${encodeURIComponent(orderId)}`;
  const res = await paperFetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`paper DELETE order ${res.status}: ${text.slice(0, 240)}`);
  }
}

export async function closePosition(symbol: string): Promise<void> {
  if (!symbol.trim()) throw new Error("symbol is required.");
  const url = `${PAPER_TRADING_ORIGIN}/v2/positions/${encodeURIComponent(symbol)}`;
  const res = await paperFetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`paper DELETE position ${res.status}: ${text.slice(0, 240)}`);
  }
}

export function writeHalt(reason: string, path = HALT_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${reason}\n${new Date().toISOString()}\n`, "utf8");
}
