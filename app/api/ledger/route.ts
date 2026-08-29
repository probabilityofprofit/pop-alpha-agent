import { LEDGER_KINDS } from "@/governor/ledger";
import { readLedger } from "@/lib/read-ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ kinds: LEDGER_KINDS, rows: readLedger(500) });
}
