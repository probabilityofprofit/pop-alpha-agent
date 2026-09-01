/**
 * Paper-only Alpaca reads for the Alpha Desk.
 * Authored 28 Aug 2026. GET only. Never places orders (MCP is the door).
 */

import { existsSync } from "node:fs";
import { assertPaperOnly } from "../governor/paper";
import { HALT_PATH } from "./paths";

export const PAPER_TRADING_ORIGIN = "https://paper-api.alpaca.markets";
export const DATA_ORIGIN = "https://data.alpaca.markets";

export type PaperClock = {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
};

export type PaperAccount = {
  id: string;
  account_number: string;
  status: string;
  equity: string;
  cash: string;
  last_equity: string;
  options_trading_level: number | null;
};

export type PaperPosition = {
  symbol: string;
  asset_class: string;
  side: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
};

export type PaperOrder = {
  id: string;
  client_order_id: string;
  status: string;
  order_class: string;
  qty: string;
  filled_qty: string;
  limit_price: string | null;
  filled_avg_price: string | null;
  submitted_at: string;
  filled_at?: string | null;
  symbol: string;
  legs: Array<{ symbol: string; side: string; ratio_qty?: string }> | null;
};

type OptionSnapshot = {
  impliedVolatility?: number;
  greeks?: { delta?: number };
  latestQuote?: { bp?: number; ap?: number };
  latestTrade?: { s?: number; p?: number };
  dailyBar?: { v?: number };
};

export type ChainPayload = {
  underlying: string;
  expiration: string | null;
  spot: number | null;
  snapshots: Record<string, OptionSnapshot>;
};

export function assertPaperTradingUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.origin !== PAPER_TRADING_ORIGIN) {
    throw new Error("Trading reads must use paper-api.alpaca.markets.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Trading URL must not carry credentials.");
  }
}

export function assertDataUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.origin !== DATA_ORIGIN) {
    throw new Error("Market data reads must use data.alpaca.markets.");
  }
}

export function haltPresent(): boolean {
  return existsSync(HALT_PATH);
}

export function paperKeysReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ALPACA_PAPER_API_KEY && env.ALPACA_PAPER_SECRET_KEY && env.ALPACA_PAPER_TRADE === "true");
}

function headers(): HeadersInit {
  assertPaperOnly();
  const key = process.env.ALPACA_PAPER_API_KEY;
  const secret = process.env.ALPACA_PAPER_SECRET_KEY;
  if (!key || !secret) throw new Error("Paper keys are not set.");
  return {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    Accept: "application/json",
  };
}

async function getJson<T>(url: string, kind: "paper" | "data"): Promise<T> {
  if (kind === "paper") assertPaperTradingUrl(url);
  else assertDataUrl(url);
  const res = await fetch(url, { method: "GET", headers: headers(), cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${kind} GET ${res.status}: ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

export async function getClock(): Promise<PaperClock> {
  return getJson<PaperClock>(`${PAPER_TRADING_ORIGIN}/v2/clock`, "paper");
}

export async function getAccount(): Promise<PaperAccount> {
  return getJson<PaperAccount>(`${PAPER_TRADING_ORIGIN}/v2/account`, "paper");
}

export async function getPositions(): Promise<PaperPosition[]> {
  return getJson<PaperPosition[]>(`${PAPER_TRADING_ORIGIN}/v2/positions`, "paper");
}

export async function getOrders(): Promise<PaperOrder[]> {
  const url = `${PAPER_TRADING_ORIGIN}/v2/orders?status=all&limit=50&nested=true&direction=desc`;
  return getJson<PaperOrder[]>(url, "paper");
}

export async function getStockSpot(symbol: string, feed = process.env.ALPACA_DATA_FEED || "iex"): Promise<number> {
  const url = `${DATA_ORIGIN}/v2/stocks/${encodeURIComponent(symbol)}/snapshot?feed=${encodeURIComponent(feed)}`;
  const snap = await getJson<{
    latestTrade?: { p?: number };
    latestQuote?: { ap?: number; bp?: number };
    dailyBar?: { c?: number };
  }>(url, "data");
  const mid =
    snap.latestQuote?.bp && snap.latestQuote?.ap ? (snap.latestQuote.bp + snap.latestQuote.ap) / 2 : null;
  const px = snap.latestTrade?.p ?? mid ?? snap.dailyBar?.c;
  if (!(px && px > 0)) throw new Error(`No spot for ${symbol}.`);
  return px;
}

export async function getOptionChain(params: {
  underlying: string;
  expirationGte?: string;
  expirationLte?: string;
  expiration?: string;
  limit?: number;
}): Promise<ChainPayload> {
  const feed = process.env.ALPACA_OPTIONS_FEED || "indicative";
  const snapshots: Record<string, OptionSnapshot> = {};
  let page: string | null = null;
  let pages = 0;
  while (pages < 4) {
    const q = new URLSearchParams();
    q.set("feed", feed);
    q.set("limit", String(params.limit ?? 1000));
    if (params.expiration) q.set("expiration_date", params.expiration);
    if (params.expirationGte) q.set("expiration_date_gte", params.expirationGte);
    if (params.expirationLte) q.set("expiration_date_lte", params.expirationLte);
    if (page) q.set("page_token", page);
    const url = `${DATA_ORIGIN}/v1beta1/options/snapshots/${encodeURIComponent(params.underlying)}?${q}`;
    const body = await getJson<{ snapshots: Record<string, OptionSnapshot>; next_page_token: string | null }>(
      url,
      "data",
    );
    Object.assign(snapshots, body.snapshots ?? {});
    page = body.next_page_token;
    pages += 1;
    if (!page) break;
  }
  return {
    underlying: params.underlying,
    expiration: params.expiration ?? null,
    spot: null,
    snapshots,
  };
}

export async function getMostActives(): Promise<Array<{ symbol: string; volume: number }>> {
  const url = `${DATA_ORIGIN}/v1beta1/screener/stocks/most-actives?by=volume&top=30`;
  const body = await getJson<{ most_actives?: Array<{ symbol: string; volume: number }> }>(url, "data");
  return body.most_actives ?? [];
}

export async function getStockMovers(): Promise<Array<{ symbol: string; price?: number }>> {
  const url = `${DATA_ORIGIN}/v1beta1/screener/stocks/movers?top=10`;
  const body = await getJson<{
    gainers?: Array<{ symbol: string; price?: number }>;
    losers?: Array<{ symbol: string; price?: number }>;
  }>(url, "data");
  return [...(body.gainers ?? []), ...(body.losers ?? [])];
}

export async function getStockSnapshots(symbols: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(symbols.filter(Boolean))];
  if (!unique.length) return {};
  const feed = process.env.ALPACA_DATA_FEED || "iex";
  const url = `${DATA_ORIGIN}/v2/stocks/snapshots?symbols=${encodeURIComponent(unique.join(","))}&feed=${encodeURIComponent(feed)}`;
  const body = await getJson<
    Record<string, { latestTrade?: { p?: number }; latestQuote?: { ap?: number; bp?: number }; dailyBar?: { c?: number } }> & {
      snapshots?: Record<string, { latestTrade?: { p?: number }; latestQuote?: { ap?: number; bp?: number }; dailyBar?: { c?: number } }>;
    }
  >(url, "data");
  const table = body.snapshots ?? body;
  const out: Record<string, number> = {};
  for (const [sym, snap] of Object.entries(table ?? {})) {
    if (!snap || typeof snap !== "object" || Array.isArray(snap)) continue;
    if (!("latestTrade" in snap || "latestQuote" in snap || "dailyBar" in snap)) continue;
    const mid =
      snap.latestQuote?.bp && snap.latestQuote?.ap ? (snap.latestQuote.bp + snap.latestQuote.ap) / 2 : null;
    const px = snap.latestTrade?.p ?? mid ?? snap.dailyBar?.c;
    if (px && px > 0) out[sym] = px;
  }
  return out;
}

export async function getOptionSnapshots(symbols: string[]): Promise<Record<string, OptionSnapshot>> {
  const unique = [...new Set(symbols.filter(Boolean))].slice(0, 100);
  if (!unique.length) return {};
  const feed = process.env.ALPACA_OPTIONS_FEED || "indicative";
  const url = `${DATA_ORIGIN}/v1beta1/options/snapshots?symbols=${encodeURIComponent(unique.join(","))}&feed=${encodeURIComponent(feed)}`;
  const body = await getJson<{ snapshots?: Record<string, OptionSnapshot> }>(url, "data");
  return body.snapshots ?? {};
}

export async function getOpenOrders(): Promise<PaperOrder[]> {
  const url = `${PAPER_TRADING_ORIGIN}/v2/orders?status=open&nested=true&limit=50`;
  return getJson<PaperOrder[]>(url, "paper");
}
