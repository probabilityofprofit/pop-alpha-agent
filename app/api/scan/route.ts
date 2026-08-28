import { runDeskScan } from "@/lib/run-scan";
import type { Template } from "@/governor/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATES: Template[] = [
  "bull_put",
  "bear_call",
  "bull_call",
  "bear_put",
  "iron_condor",
  "iron_fly",
];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    source?: "demo" | "paper";
    symbol?: string;
    expiration?: string;
    preferred?: string;
  };
  const source = body.source === "paper" ? "paper" : "demo";
  const preferred = TEMPLATES.includes(body.preferred as Template) ? [body.preferred as Template] : undefined;
  try {
    const scan = await runDeskScan({
      source,
      symbol: body.symbol,
      expiration: body.expiration,
      preferred,
    });
    return Response.json({ ok: true, scan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
