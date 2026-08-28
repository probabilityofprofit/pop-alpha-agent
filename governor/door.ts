/** MCP place_option_order payload. Authored 28 Aug 2026. The model never calls this. */

import type { Package } from "./types";

export type McpLeg = {
  symbol: string;
  ratio_qty: string;
  side: "buy" | "sell";
  position_intent: "buy_to_open" | "sell_to_open" | "buy_to_close" | "sell_to_close";
};

export type PlaceOptionOrder = {
  qty: string;
  type: "limit";
  time_in_force: "day";
  order_class: "mleg";
  limit_price: string;
  client_order_id: string;
  legs: McpLeg[];
};

export function openMleg(pkg: Package, qty: number, limit: number, clientOrderId: string): PlaceOptionOrder {
  const signed = pkg.credit ? -Math.abs(limit) : Math.abs(limit);
  return {
    qty: String(qty),
    type: "limit",
    time_in_force: "day",
    order_class: "mleg",
    limit_price: signed.toFixed(2),
    client_order_id: clientOrderId,
    legs: pkg.legs.map((leg) => ({
      symbol: leg.occ,
      ratio_qty: "1",
      side: leg.side,
      position_intent: leg.side === "sell" ? "sell_to_open" : "buy_to_open",
    })),
  };
}

export function closeMleg(pkg: Package, qty: number, limit: number, clientOrderId: string): PlaceOptionOrder {
  return {
    qty: String(qty),
    type: "limit",
    time_in_force: "day",
    order_class: "mleg",
    limit_price: limit.toFixed(2),
    client_order_id: clientOrderId,
    legs: pkg.legs.map((leg) => ({
      symbol: leg.occ,
      ratio_qty: "1",
      side: leg.side === "sell" ? "buy" : "sell",
      position_intent: leg.side === "sell" ? "buy_to_close" : "sell_to_close",
    })),
  };
}

/** Guard the unattended door. The model never calls this. */
export function assertSendablePlace(order: PlaceOptionOrder): void {
  if (order.order_class !== "mleg") throw new Error("Door only sends mleg.");
  if (order.type !== "limit") throw new Error("Door only sends limit orders.");
  if (order.time_in_force !== "day") throw new Error("Door only sends DAY.");
  if (!order.client_order_id.startsWith("pop-alpha-")) throw new Error("client_order_id must be pop-alpha-*.");
  const qty = Number(order.qty);
  if (!Number.isInteger(qty) || qty < 1) throw new Error("qty must be an integer >= 1.");
  if (order.legs.length < 2 || order.legs.length > 4) throw new Error("mleg must have 2–4 legs.");
  for (const leg of order.legs) {
    if (!leg.symbol || !leg.ratio_qty || !leg.side || !leg.position_intent) {
      throw new Error("Each leg needs symbol, ratio_qty, side, position_intent.");
    }
  }
}
