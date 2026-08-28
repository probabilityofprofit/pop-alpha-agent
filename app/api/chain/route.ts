import { parseOcc } from "@/lib/occ";
import { getOptionChain, getStockSpot, paperKeysReady } from "@/lib/paper-broker";
import { tenorBounds } from "@/governor/calendar";
import type { ChainRow } from "@/lib/desk-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!paperKeysReady()) {
    return Response.json({ ok: false, error: "Paper keys are not set.", rows: [], spot: null }, { status: 400 });
  }
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "SPY").toUpperCase();
  const expiration = url.searchParams.get("expiration") ?? undefined;
  const asOf = new Date();
  const bounds = tenorBounds(asOf);
  try {
    const [chain, spot] = await Promise.all([
      getOptionChain({
        underlying: symbol,
        expiration,
        expirationGte: expiration ? undefined : bounds.gte,
        expirationLte: expiration ? undefined : bounds.lte,
        limit: 500,
      }),
      getStockSpot(symbol),
    ]);
    const rows: ChainRow[] = [];
    for (const [occ, snap] of Object.entries(chain.snapshots)) {
      const parsed = parseOcc(occ);
      if (!parsed) continue;
      rows.push({
        occ,
        right: parsed.right,
        strike: parsed.strike,
        expiration: parsed.expiration,
        bid: snap.latestQuote?.bp ?? 0,
        ask: snap.latestQuote?.ap ?? 0,
        iv: snap.impliedVolatility ?? null,
        delta: snap.greeks?.delta ?? null,
      });
    }
    rows.sort((a, b) => a.expiration.localeCompare(b.expiration) || a.strike - b.strike);
    return Response.json({ ok: true, symbol, spot, rows: rows.slice(0, 240) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chain read failed.";
    return Response.json({ ok: false, error: message, rows: [], spot: null }, { status: 500 });
  }
}
