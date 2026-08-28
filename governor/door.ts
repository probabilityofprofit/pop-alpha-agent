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
